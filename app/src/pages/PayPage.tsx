// /pay/:bookingId — sandbox payment sheet (UPI intent/QR, card, netbanking, wallet, pay-later)
import React, { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import { Icon, I, Skeleton, ErrorNote } from '../components/ui'
import { inr } from '../lib/i18n'

const METHODS = [
  ['upi_intent', I.upi, 'UPI', 'Pay via any UPI app (simulated intent)'],
  ['upi_qr', I.qr, 'UPI QR', 'Scan a demo QR code'],
  ['card', I.card, 'Card', 'Credit / debit / prepaid card'],
  ['netbanking', I.bank, 'Net banking', 'All major Indian banks (demo list)'],
  ['wallet', I.wallet, 'Wallets', 'Paytm · PhonePe · Amazon Pay'],
  ['credit', I.clock, 'Pay later', 'Eligibility check (demo: always approved)'],
] as const

export default function PayPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const bookingId = Number(id)
  const [status, setStatus] = useState<any>(null)
  const [method, setMethod] = useState<string>('upi_intent')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [stage, setStage] = useState<'idle' | 'order' | 'sim' | 'captured' | 'failed'>('idle')
  const [upiApp, setUpiApp] = useState('PhonePe')
  const [card, setCard] = useState({ num: '', exp: '', cvv: '', name: '' })
  const [bank, setBank] = useState('HDFC Bank')
  const pollRef = useRef<number | null>(null)

  useEffect(() => {
    const tick = () => api<any>(`/api/bookings/${bookingId}/status`).then((s) => {
      setStatus(s)
      if (s.status === 'confirmed') { if (pollRef.current) clearInterval(pollRef.current); nav(`/confirmation/${bookingId}`) }
    }).catch(() => undefined)
    tick()
    pollRef.current = window.setInterval(tick, 2500)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [bookingId, nav])

  if (!status) return <div className="mx-auto max-w-md space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-72" /></div>
  if (status.status === 'confirmed') return null // navigating
  if (status.status !== 'pending_payment') return <div className="mx-auto max-w-md"><ErrorNote msg={`This booking is ${status.status}. Payment can’t continue.`} /></div>

  const pay = async (simulateFailure = false) => {
    setBusy(true); setErr(''); setStage('order')
    try {
      const order = await api<any>('/api/payments/order', { method: 'POST', body: { bookingId, method } })
      setStage('sim')
      await new Promise((r) => setTimeout(r, 900)) // gateway "handshake"
      const cb = await api<any>('/api/payments/sandbox-callback', {
        method: 'POST',
        body: { orderId: order.orderId, paymentId: `pay_demo_${Math.random().toString(36).slice(2, 10)}`, status: simulateFailure ? 'failed' : 'captured', reason: simulateFailure ? 'Insufficient funds (demo)' : undefined },
      })
      setStage(cb.bookingStatus === 'confirmed' ? 'captured' : 'failed')
      if (cb.bookingStatus === 'confirmed') {
        setTimeout(() => nav(`/confirmation/${bookingId}`), 700)
      }
    } catch (e: any) { setErr(e.message || 'Payment could not be completed.'); setStage('failed') }
    finally { setBusy(false) }
  }

  const validateMethod = () => {
    if (method === 'card') {
      const digits = card.num.replace(/\D/g, '')
      if (digits.length < 15) return 'Enter a valid 16-digit card number.'
      if (!/^\d{2}\/\d{2}$/.test(card.exp)) return 'Card expiry must be MM/YY.'
      if (!/^\d{3}$/.test(card.cvv)) return 'CVV must be 3 digits.'
      if (card.name.trim().length < 3) return 'Name on card is required.'
    }
    return null
  }

  return (
    <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-[1fr_300px]">
      <section className="card p-5 sm:p-6" aria-label="Payment methods">
        <div className="mb-1 flex items-center justify-between">
          <h1 className="text-xl font-extrabold">Complete your payment</h1>
          <span className="badge-amber"><Icon d={I.info} size={12} />Sandbox — no real money</span>
        </div>
        <p className="mb-5 text-sm text-slate-500 dark:text-slate-400">PNR <b className="font-mono">{status.pnr}</b> · Booking #{bookingId}</p>

        <div role="radiogroup" aria-label="Payment method" className="space-y-2">
          {METHODS.map(([val, ic, lab, desc]) => (
            <label key={val} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors ${method === val ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/30' : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'}`}>
              <input type="radio" name="pm" className="accent-brand-600" checked={method === val} onChange={() => { setMethod(val); setErr(''); setStage('idle') }} />
              <Icon d={ic} size={20} className="text-brand-600 dark:text-brand-300" />
              <span className="min-w-0"><b className="block text-sm">{lab}</b><span className="text-xs text-slate-500 dark:text-slate-400">{desc}</span></span>
            </label>
          ))}
        </div>

        {/* Method-specific mini-forms */}
        <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm dark:bg-slate-900/50">
          {method === 'upi_intent' && (
            <div>
              <label className="label" htmlFor="upiapp">Open UPI app (simulated)</label>
              <select id="upiapp" className="input max-w-60" value={upiApp} onChange={(e) => setUpiApp(e.target.value)}>
                {['PhonePe', 'Google Pay', 'Paytm', 'BHIM'].map((a) => <option key={a}>{a}</option>)}
              </select>
              <p className="mt-2 text-xs text-slate-400">In production this triggers the PSP’s checkout SDK with your VPA; here we simulate the approve/decline round-trip.</p>
            </div>
          )}
          {method === 'upi_qr' && (
            <div className="flex items-center gap-4">
              <svg viewBox="0 0 29 29" className="h-28 w-28 rounded-lg bg-white p-1.5 shadow-sm" role="img" aria-label="Demo UPI QR code">
                {Array.from({ length: 29 * 29 }).map((_, i) => {
                  const x = i % 29, y = Math.floor(i / 29)
                  const finder = (cx: number, cy: number) => x >= cx && x < cx + 7 && y >= cy && y < cy + 7 && (x === cx || x === cx + 6 || y === cy || y === cy + 6 || (x >= cx + 2 && x <= cx + 4 && y >= cy + 2 && y <= cy + 4))
                  const on = finder(0, 0) || finder(22, 0) || finder(0, 22) || ((x * 7 + y * 13 + ((x * y) % 5)) % 3 === 0)
                  return on ? <rect key={i} x={x} y={y} width="1" height="1" fill="#0f172a" /> : null
                })}
              </svg>
              <div><p className="font-semibold">safargo.demo@ybl</p><p className="text-xs text-slate-400">Any UPI app can “scan” this decorative QR — it encodes nothing real. Press Pay to simulate success.</p></div>
            </div>
          )}
          {method === 'card' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2"><label className="label">Card number</label>
                <input inputMode="numeric" className="input font-mono tracking-widest" placeholder="4111 1111 1111 1111" value={card.num}
                  onChange={(e) => setCard({ ...card, num: e.target.value.replace(/[^\d ]/g, '').replace(/(\d{4})(?=\d)/g, '$1 ').slice(0, 19) })} /></div>
              <div><label className="label">Expiry</label>
                <input className="input" placeholder="MM/YY" value={card.exp} onChange={(e) => { let v = e.target.value.replace(/[^\d]/g, '').slice(0, 4); if (v.length > 2) v = v.slice(0, 2) + '/' + v.slice(2); setCard({ ...card, exp: v }) }} /></div>
              <div><label className="label">CVV</label>
                <input type="password" inputMode="numeric" className="input" placeholder="•••" maxLength={3} value={card.cvv} onChange={(e) => setCard({ ...card, cvv: e.target.value.replace(/\D/g, '') })} /></div>
              <div className="sm:col-span-2"><label className="label">Name on card</label>
                <input className="input" value={card.name} onChange={(e) => setCard({ ...card, name: e.target.value })} /></div>
              <p className="text-xs text-slate-400 sm:col-span-2">Never stored — PCI scope stays with the PSP in production. Use test values, e.g. 4111 1111 1111 1111.</p>
            </div>
          )}
          {method === 'netbanking' && (
            <div><label className="label" htmlFor="bank">Select bank (demo)</label>
              <select id="bank" className="input max-w-72" value={bank} onChange={(e) => setBank(e.target.value)}>
                {['HDFC Bank', 'ICICI Bank', 'State Bank of India', 'Axis Bank', 'Kotak Mahindra'].map((b) => <option key={b}>{b}</option>)}
              </select>
              <p className="mt-2 text-xs text-slate-400">Simulated redirect & authentication round-trip.</p></div>
          )}
          {method === 'wallet' && <p className="text-xs text-slate-400">A wallet balance check runs at the PSP. Here we simulate an instant capture.</p>}
          {method === 'credit' && (
            <div><p className="text-sm">Pay-later eligibility: <span className="badge-green ml-1">Approved (demo)</span></p>
              <p className="mt-1 text-xs text-slate-400">First repayment instalment due in 15 days. In production this is a soft-credit-check flow via the lender partner.</p></div>
          )}
        </div>

        {err && <div className="mt-4"><ErrorNote msg={err} /></div>}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button className="btn-accent btn-lg flex-1" disabled={busy || stage === 'sim'} onClick={() => { const v = validateMethod(); if (v) { setErr(v); return } pay(false) }}>
            {busy ? 'Contacting gateway…' : stage === 'sim' ? `${upiApp} says yes…` : 'Pay now'}
          </button>
          <button className="btn-outline" disabled={busy} title="Simulate a declined payment to see failure handling" onClick={() => { const v = validateMethod(); if (v) { setErr(v); return } pay(true) }}>
            Simulate decline
          </button>
        </div>
        {(stage === 'sim' || stage === 'order') && (
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 p-3 text-sm dark:border-brand-800 dark:bg-brand-900/30" role="status">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" aria-hidden="true" />
            {stage === 'order' ? 'Creating secure order at gateway…' : 'Awaiting confirmation from payment provider…'}
          </div>
        )}
      </section>

      <aside className="space-y-4">
        <div className="card p-5">
          <h2 className="mb-2 font-bold">You’re paying</h2>
          <div className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400">{inr(status.amountPaise ?? 0)}</div>
          <ul className="mt-3 space-y-2 text-xs text-slate-500 dark:text-slate-400">
            <li className="flex gap-2"><Icon d={I.shield} size={14} className="shrink-0" />Signature-verified capture — the server only confirms bookings after validating the gateway HMAC.</li>
            <li className="flex gap-2"><Icon d={I.refresh} size={14} className="shrink-0" />If payment fails, your seats stay held for 8 more minutes so you can retry.</li>
            <li className="flex gap-2"><Icon d={I.bell} size={14} className="shrink-0" />Ticket, SMS & email alerts arrive right after capture.</li>
          </ul>
        </div>
        <div className="card p-5 text-sm">
          <p className="text-slate-500 dark:text-slate-400">Trouble?</p>
          <Link to="/help#support" className="link font-semibold">Contact support (demo) →</Link>
          <p className="mt-3 text-[11px] text-slate-400">Or wait — unpaid bookings auto-cancel and seats are released back to inventory.</p>
        </div>
      </aside>
    </div>
  )
}
