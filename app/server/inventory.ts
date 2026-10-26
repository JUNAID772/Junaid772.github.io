import { db, migrate, nowISO, audit } from './db'

export function releaseExpiredHolds() {
  const now = nowISO()
  const expired = db.prepare('SELECT * FROM seat_holds WHERE expires_at <= ?').all(now) as any[]
  for (const h of expired) {
    // Only release if the seat is not part of a confirmed booking.
    const booked = db.prepare(`SELECT 1 FROM passengers p JOIN bookings b ON b.id=p.booking_id
      WHERE p.seat_id=? AND b.status='confirmed'`).get(h.seat_id)
    if (!booked) db.prepare(`UPDATE seats SET status='available' WHERE id=? AND status='held'`).run(h.seat_id)
    db.prepare('DELETE FROM seat_holds WHERE id=?').run(h.id)
  }
  return expired.length
}

export type HoldResult = { ok: boolean; holdToken?: string; expiresAt?: string; unavailable?: string[]; error?: string }

/**
 * Concurrency-safe seat hold. All statements run inside a single IMMEDIATE
 * transaction; a seat is only held when an UPDATE that requires
 * status='available' actually changes the row, so two users can never both
 * hold/book the same seat.
 */
export function holdSeats(scheduleId: number, seatNos: string[], userId: number | null): HoldResult {
  releaseExpiredHolds()
  const txn = db.transaction((): HoldResult => {
    const token = `hold_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
    const expiresAt = new Date(Date.now() + 8 * 60 * 1000).toISOString() // 8-minute hold
    const held: number[] = []
    for (const no of seatNos) {
      const seat = db.prepare('SELECT * FROM seats WHERE schedule_id=? AND seat_no=?').get(scheduleId, no) as any
      if (!seat) return { ok: false, error: `Seat ${no} does not exist on this bus.` }
      const upd = db.prepare(`UPDATE seats SET status='held' WHERE id=? AND status='available'`).run(seat.id)
      if (upd.changes !== 1) {
        // roll back holds taken in this call
        for (const id of held) db.prepare(`UPDATE seats SET status='available' WHERE id=? AND status='held'`).run(id)
        return { ok: false, unavailable: [no], error: `Seat ${no} just became unavailable. Please choose another seat.` }
      }
      db.prepare('INSERT INTO seat_holds (schedule_id, seat_id, user_id, hold_token, expires_at) VALUES (?,?,?,?,?)')
        .run(scheduleId, seat.id, userId, token, expiresAt)
      held.push(seat.id)
    }
    return { ok: true, holdToken: token, expiresAt }
  })
  return txn.immediate()
}

export function validateHold(scheduleId: number, seatNos: string[], holdToken: string): { ok: boolean; error?: string } {
  releaseExpiredHolds()
  for (const no of seatNos) {
    const row = db.prepare(`SELECT s.status, h.expires_at FROM seats s
      JOIN seat_holds h ON h.seat_id=s.id AND h.hold_token=?
      WHERE s.schedule_id=? AND s.seat_no=?`).get(holdToken, scheduleId, no) as any
    if (!row || row.status !== 'held') return { ok: false, error: `Your hold on seat ${no} has expired or was released. Please reselect seats.` }
  }
  return { ok: true }
}

export function bookSeats(scheduleId: number, seatNos: string[], holdToken: string) {
  const txn = db.transaction(() => {
    for (const no of seatNos) {
      const seat = db.prepare('SELECT * FROM seats WHERE schedule_id=? AND seat_no=?').get(scheduleId, no) as any
      // A pending-payment booking already owns this seat (e.g. user retried checkout): allow it.
      const ownedByPending = seat && db.prepare(`SELECT 1 FROM passengers p JOIN bookings b ON b.id=p.booking_id
        WHERE p.seat_id=? AND b.status='pending_payment'`).get(seat.id)
      const upd = ownedByPending
        ? db.prepare(`UPDATE seats SET status='booked' WHERE id=? AND status IN ('held','booked')`).run(seat.id)
        : db.prepare(`UPDATE seats SET status='booked' WHERE id=? AND status='held'`).run(seat.id)
      if (upd.changes !== 1) throw new Error(`Seat ${no} is no longer available.`)
    }
    db.prepare('DELETE FROM seat_holds WHERE hold_token=?').run(holdToken)
  })
  txn.immediate()
}

export function releaseHold(holdToken: string) {
  const holds = db.prepare('SELECT * FROM seat_holds WHERE hold_token=?').all(holdToken) as any[]
  for (const h of holds) db.prepare(`UPDATE seats SET status='available' WHERE id=? AND status='held'`).run(h.seat_id)
  db.prepare('DELETE FROM seat_holds WHERE hold_token=?').run(holdToken)
  if (holds.length) audit(null, 'seat_hold_released', 'seat_holds', holdToken, `${holds.length} seats`)
}

// Release seats of a cancelled booking (unless other active bookings hold them — they don't by design).
export function freeBookingSeats(bookingId: number) {
  const seats = db.prepare('SELECT seat_id FROM passengers WHERE booking_id=?').all(bookingId) as Array<{ seat_id: number }>
  for (const s of seats) db.prepare(`UPDATE seats SET status='available' WHERE id=? AND status='booked'`).run(s.seat_id)
}

setInterval(() => {
  try { releaseExpiredHolds() } catch { /* ignore */ }
}, 30_000)

if (process.argv[1]?.endsWith('inventory.ts')) console.log('inventory module loaded', nowISO(), !!migrate)
