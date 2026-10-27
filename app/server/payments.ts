import crypto from 'node:crypto'
import { db, nowISO, audit } from './db'

export interface PaymentAdapter {
  name: string
  sandbox: boolean
  createOrder(bookingId: number, amountPaise: number, method: string): { orderId: string; clientSecret?: string; qr?: string; upiLink?: string }
  // Returns verified capture result. Must be called with a valid signature/webhook body.
  verifyAndCapture(orderId: string, payload: Record<string, unknown>, signature?: string): { ok: boolean; paymentId?: string; method?: string; reason?: string }
}

/**
 * DEMO PAYMENT ADAPTER — clearly labelled sandbox. No real money moves.
 * Mimics a Razorpay-style flow: order -> client "payment" -> signed webhook
 * callback (HMAC-SHA256 with the configured secret) -> server verifies the
 * signature before marking anything as paid. Swap for the official razorpay
 * SDK by implementing this same interface and setting PAY_PROVIDER=razorpay.
 */
class DemoPaymentAdapter implements PaymentAdapter {
  name = 'demo-sandbox'
  sandbox = true
  private secret() { return process.env.JWT_SECRET || 'dev-only-secret-change-me' }

  createOrder(bookingId: number, amountPaise: number, method: string) {
    const orderId = `order_demo_${crypto.randomBytes(10).toString('hex')}`
    db.prepare('INSERT INTO payments (booking_id,gateway,order_id,amount_paise,method,status) VALUES (?,?,?,?,?,?)')
      .run(bookingId, this.name, orderId, amountPaise, method, 'created')
    const qr = method === 'upi_qr' ? `SAFARGO:${orderId}:${amountPaise}` : undefined
    return { orderId, qr, upiLink: method === 'upi_intent' ? `upi://pay?pa=safargo.demo@ybl&pn=SafarGoSandbox&am=${(amountPaise / 100).toFixed(2)}&tn=Booking` : undefined }
  }

  sign(orderId: string, paymentId: string) {
    return crypto.createHmac('sha256', this.secret()).update(`${orderId}|${paymentId}`).digest('hex')
  }

  verifyAndCapture(orderId: string, payload: Record<string, unknown>, signature?: string) {
    const payment = db.prepare('SELECT * FROM payments WHERE order_id=?').get(orderId) as any
    if (!payment) return { ok: false, reason: 'Unknown order' }
    const paymentId = String(payload.payment_id || '')
    const expected = this.sign(orderId, paymentId)
    if (!signature || signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      db.prepare('INSERT INTO payment_events (payment_id,event,payload) VALUES (?,?,?)')
        .run(payment.id, 'signature_invalid', JSON.stringify(payload))
      return { ok: false, reason: 'Webhook signature verification failed' }
    }
    // Idempotent: repeated notifications for an already-captured payment succeed without re-processing.
    if (payment.status === 'captured') return { ok: true, paymentId: payment.payment_id || paymentId, method: payment.method }
    const status = String(payload.status || 'captured')
    if (status === 'failed') {
      db.prepare('UPDATE payments SET status=?, failure_reason=?, updated_at=? WHERE id=?').run('failed', String(payload.reason || 'insufficient_funds'), nowISO(), payment.id)
      db.prepare('INSERT INTO payment_events (payment_id,event,payload) VALUES (?,?,?)').run(payment.id, 'payment.failed', JSON.stringify(payload))
      return { ok: false, reason: 'Payment failed at gateway' }
    }
    if (status === 'cancelled') {
      db.prepare('UPDATE payments SET status=?, updated_at=? WHERE id=?').run('cancelled', nowISO(), payment.id)
      db.prepare('INSERT INTO payment_events (payment_id,event,payload) VALUES (?,?,?)').run(payment.id, 'payment.cancelled', JSON.stringify(payload))
      return { ok: false, reason: 'Payment cancelled' }
    }
    db.prepare('UPDATE payments SET status=?, payment_id=?, signature_verified=1, updated_at=? WHERE id=?')
      .run('captured', paymentId, nowISO(), payment.id)
    db.prepare('INSERT INTO payment_events (payment_id,event,payload) VALUES (?,?,?)').run(payment.id, 'payment.captured', JSON.stringify(payload))
    audit(null, 'payment_captured', 'payments', payment.id, `order ${orderId} via ${payment.method}`)
    return { ok: true, paymentId, method: payment.method }
  }
}

class UnconfiguredRazorpayAdapter implements PaymentAdapter {
  name = 'razorpay'
  sandbox = true
  createOrder(): never { throw new Error('RAZORPAY_KEY_ID/SECRET not configured. Set PAY_PROVIDER=demo or add real keys.') }
  verifyAndCapture(): never { throw new Error('RAZORPAY provider not configured.') }
}

export const payProvider: PaymentAdapter =
  process.env.PAY_PROVIDER === 'razorpay' && process.env.RAZORPAY_KEY_ID
    ? new UnconfiguredRazorpayAdapter() // replace with official SDK implementation when keys are provided
    : new DemoPaymentAdapter()

/** Server-side confirmation: only ever called after signature-verified capture. */
export function confirmBookingAfterPayment(orderId: string) {
  const payment = db.prepare('SELECT * FROM payments WHERE order_id=?').get(orderId) as any
  if (!payment || payment.status !== 'captured') return null
  const booking = db.prepare(`SELECT b.*, s.depart_date, s.depart_time FROM bookings b JOIN schedules s ON s.id=b.schedule_id WHERE b.id=?`).get(payment.booking_id) as any
  if (!booking) return null
  if (booking.status !== 'pending_payment') return booking // idempotent
  const txn = db.transaction(() => {
    db.prepare(`UPDATE bookings SET status='confirmed' WHERE id=? AND status='pending_payment'`).run(booking.id)
    const pts = Math.floor(booking.total_paise / 10000) // 1 point per ₹10
    if (booking.user_id) db.prepare('UPDATE users SET loyalty_points=loyalty_points+? WHERE id=?').run(pts, booking.user_id)
    notifyUser(booking.user_id, 'booking_confirmation', 'Booking confirmed 🎉',
      `Your SafarGo ticket ${booking.pnr} is confirmed. Seats booked, e-ticket ready to download.`)
    notifyUser(booking.user_id, 'payment_success', 'Payment received',
      `We received ₹${(booking.total_paise / 100).toLocaleString('en-IN')} for booking ${booking.pnr}.`)
  })
  txn()
  audit(null, 'booking_confirmed', 'bookings', booking.id, `via ${orderId}`)
  return db.prepare('SELECT * FROM bookings WHERE id=?').get(booking.id)
}

export function notifyUser(userId: number | null, template: string, title: string, body: string, channel: 'inapp' | 'email' | 'sms' = 'inapp') {
  if (!userId) return
  const user = db.prepare('SELECT notif_prefs FROM users WHERE id=?').get(userId) as any
  try {
    const prefs = JSON.parse(user?.notif_prefs || '{}')
    if (prefs[template] === false) return // user opted out
  } catch { /* defaults on */ }
  db.prepare('INSERT INTO notifications (user_id,channel,template,title,body) VALUES (?,?,?,?,?)').run(userId, channel, template, title, body)
  if (process.env.EMAIL_PROVIDER === 'console' && channel === 'email') console.log(`[EMAIL ADAPTER — demo] to user#${userId}: ${title}`)
  if (process.env.SMS_PROVIDER === 'console' && channel === 'sms') console.log(`[SMS ADAPTER — demo] to user#${userId}: ${title}`)
}
