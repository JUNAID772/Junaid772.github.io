// Offers, Help centre and 404 pages.
import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { Icon, I, Skeleton, EmptyState, ErrorNote, usePageTitle, Tip } from '../components/ui'
import { useApp } from '../lib/state'


export function OffersPage() {
  usePageTitle('/offers')
  const { user, toast } = useApp()
  const [coupons, setCoupons] = useState<any[] | null>(null)
  const [err, setErr] = useState('')
  const load = () => { setErr(''); api<{ buses: any[] }>('/api/search?from=Bengaluru&to=Chennai&date=' + new Date(Date.now() + 864e5 * 3).toISOString().slice(0, 10)).catch(() => undefined); api<any[]>('/api/me/coupons').then((d) => setCoupons(Array.isArray(d) ? d : (d as any).coupons || [])).catch((e) => { setErr(e.status === 401 ? '' : e.message); setCoupons([]) }) }
  useEffect(load, [user])

  // Public promo cards (static demo content, clearly labelled)
  const promos = [
    { code: 'SAFAR100', title: 'Flat ₹100 off', body: 'On any booking over ₹499. Valid on all demo routes.', tint: 'from-brand-500 to-brand-700', icon: I.ticket },
    { code: 'NEWTRIP20', title: '20% off your first trip', body: 'Up to ₹150 off for new travellers. Min fare ₹300.', tint: 'from-emerald-500 to-teal-700', icon: I.star },
    { code: 'WEEKEND15', title: 'Weekend getaway sale', body: '15% off up to ₹120 on weekend departures.', tint: 'from-orange-500 to-rose-600', icon: I.sun },
  ]

  return (
    <div className="space-y-8 animate-fadeUp">
      <div className="rounded-3xl bg-gradient-to-br from-brand-600 via-brand-700 to-indigo-800 p-8 text-white shadow-lift sm:p-10">
        <h1 className="text-3xl font-extrabold tracking-tight">Offers & coupons</h1>
        <p className="mt-2 max-w-xl text-brand-100">Save on your next bus journey. All offers below are part of the SafarGo demo inventory — coupon codes work against sandbox bookings.</p>
      </div>

      <section aria-label="Promotions" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {promos.map((p) => (
          <div key={p.code} className="card overflow-hidden transition-transform hover:-translate-y-0.5">
            <div className={`bg-gradient-to-r ${p.tint} flex items-center justify-between p-5 text-white`}>
              <div><Icon d={p.icon} size={22} /><h3 className="mt-2 text-lg font-bold">{p.title}</h3></div>
            </div>
            <div className="space-y-3 p-5">
              <p className="text-sm text-slate-600 dark:text-slate-300">{p.body}</p>
              <div className="flex items-center justify-between gap-2">
                <code className="rounded-lg border border-dashed border-brand-400 bg-brand-50 px-3 py-1.5 text-sm font-bold tracking-wider text-brand-700 dark:bg-brand-900/30 dark:text-brand-300">{p.code}</code>
                <Tip label="Copied! Paste it at checkout.">
                  <button className="btn-outline !py-1.5 text-xs" onClick={() => { navigator.clipboard?.writeText(p.code).catch(() => undefined); toast('success', `Coupon ${p.code} copied — apply it at checkout.`) }}>
                    <Icon d={I.copy} size={13} /> Copy code
                  </button>
                </Tip>
              </div>
            </div>
          </div>
        ))}
      </section>

      <section aria-label="Your coupon wallet">
        <h2 className="mb-3 text-xl font-bold">My coupon wallet</h2>
        {!user ? (
          <EmptyState icon={I.gift} title="Sign in to see personalised coupons" hint="Your wallet shows coupons you’ve claimed, referral rewards and travel credits." action={<Link to="/login?next=/offers" className="btn-primary">Sign in</Link>} />
        ) : err ? <ErrorNote msg={err} onRetry={load} /> : coupons === null ? (
          <div className="grid gap-3 sm:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28" />)}</div>
        ) : coupons.length === 0 ? (
          <EmptyState icon={I.gift} title="No coupons yet" hint="Bookings earn loyalty points, and referral rewards appear here once configured by the demo backend." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {coupons.map((c: any) => (
              <div key={c.code} className="card flex items-center justify-between p-4">
                <div>
                  <div className="font-bold">{c.code}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">{c.description}</div>
                  {c.valid_till && <div className="mt-1 text-[11px] text-slate-400">Valid till {new Date(c.valid_till).toLocaleDateString('en-IN')}</div>}
                </div>
                <Tip label="Apply at checkout"><span className="rounded-lg bg-brand-50 px-2 py-1 text-xs font-bold text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">Use</span></Tip>
              </div>
            ))}
          </div>
        )}
      </section>

      <p className="text-xs text-slate-400">Demo note: discounts are calculated by the local sandbox backend at checkout. No real money is involved.</p>
    </div>
  )
}

const FAQS: Array<[string, string]> = [
  ['How do I cancel a booking and get a refund?', 'Open My bookings → the booking → Cancel. The operator-specific cancellation policy and refund estimate are shown before you confirm. Refunds are processed to the original payment method by the sandbox gateway; status is visible in the booking details.'],
  ['When are refunds credited?', 'Refund timelines depend on the configured policy and payment provider. In this demo, the sandbox adapter marks refunds as processed instantly so you can see the full flow; with a live gateway, typical bank credit times are 5–7 working days.'],
  ['Are my payments safe?', 'Card details and UPI PINs are never stored on our servers. Payments go through a gateway integration (Razorpay/Cashfree compatible interface) and every success is verified server-side via signed webhooks before a booking is confirmed.'],
  ['Can I choose my seats?', 'Yes. Our seat map shows the actual layout of each bus, including upper/lower berths for sleepers, ladies-reserved seats where applicable, and per-seat pricing. Seats are held briefly while you complete checkout; the server prevents double booking.'],
  ['Is live bus tracking available?', 'Only where the operator supports it. Verified operators with tracking show a “Live tracking” badge; the trip page then shows simulated GPS updates from the demo feed, always labelled with its last-updated time. We never fabricate locations for unsupported buses.'],
  ['Which documents do I carry while travelling?', 'A valid government photo ID and the ticket (digital or downloaded PDF). Boarding-point addresses are printed on the ticket.'],
  ['Do you support Hindi and other Indian languages?', 'English and हिन्दी are available from the header language switch. The UI is built i18n-first so Kannada, Tamil, Telugu, Malayalam and Marathi can be added without redesign.'],
  ['How do coupons and travel credits work?', 'Apply a coupon code at checkout — eligibility (min fare, per-user limits, validity) is validated on the server. Travel credit from refunds or loyalty can also be applied to the final total.'],
]

export function HelpPage() {
  usePageTitle('/help')
  const { user, toast } = useApp()
  const [open, setOpen] = useState<number | null>(0)
  const [tickets, setTickets] = useState<any[] | null>(null)
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [formErr, setFormErr] = useState('')

  const loadTickets = () => api<any[]>('/api/support/tickets').then((d) => setTickets(Array.isArray(d) ? d : (d as any).tickets || [])).catch(() => setTickets([]))
  useEffect(() => { if (user) loadTickets() }, [user])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setFormErr('')
    if (subject.trim().length < 5) return setFormErr('Please give the ticket a clear subject (at least 5 characters).')
    if (message.trim().length < 15) return setFormErr('Please describe the issue in at least 15 characters.')
    setBusy(true)
    try { await api('/api/support/tickets', { method: 'POST', body: { subject: subject.trim(), message: message.trim() } }); setSubject(''); setMessage(''); toast('success', 'Support ticket created — we’ll respond in your ticket history.'); loadTickets() }
    catch (er: any) { setFormErr(er.message) } finally { setBusy(false) }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-10 animate-fadeUp">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Help centre</h1>
        <p className="mt-2 text-slate-500 dark:text-slate-400">Answers about booking, cancellation, refunds, payments and safety.</p>
      </div>

      <section id="faq" aria-label="Frequently asked questions" className="space-y-2">
        <h2 className="text-xl font-bold">Frequently asked questions</h2>
        {FAQS.map(([q, a], i) => (
          <div key={q} className="card overflow-hidden">
            <button aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)} className="flex w-full items-center justify-between gap-3 p-4 text-left font-semibold hover:bg-slate-50 dark:hover:bg-slate-800/60">
              {q}<Icon d={I.chevD} size={16} className={`shrink-0 transition-transform ${open === i ? 'rotate-180' : ''}`} />
            </button>
            {open === i && <p className="border-t border-slate-100 p-4 text-sm leading-relaxed text-slate-600 dark:border-slate-700/60 dark:text-slate-300 animate-fadeUp">{a}</p>}
          </div>
        ))}
      </section>

      <section id="support" aria-label="Contact support" className="card p-6">
        <h2 className="text-xl font-bold">Raise a support ticket</h2>
        {user ? (
          <>
            <form onSubmit={submit} className="mt-4 space-y-3">
              <label className="block text-sm font-semibold">Subject
                <input className="input mt-1" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Refund not received for SG-XXXX" maxLength={120} />
              </label>
              <label className="block text-sm font-semibold">Describe the issue
                <textarea className="input mt-1 min-h-28" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Include your booking ID and what happened…" maxLength={2000} />
              </label>
              {formErr && <ErrorNote msg={formErr} />}
              <button className="btn-primary" disabled={busy}>{busy ? 'Submitting…' : 'Submit ticket'}</button>
            </form>
            <div className="mt-6">
              <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">My tickets</h3>
              {tickets === null ? <Skeleton className="h-16" /> : tickets.length === 0 ? <p className="text-sm text-slate-500">No tickets yet.</p> : (
                <ul className="space-y-2">
                  {tickets.map((t: any) => (
                    <li key={t.id} className="rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-700">
                      <div className="flex items-center justify-between gap-2"><b>{t.subject}</b>
                        <span className={`badge ${t.status === 'resolved' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : t.status === 'open' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}>{t.status}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500 line-clamp-2">{t.message}</p>
                      {t.reply && <p className="mt-2 rounded-lg bg-brand-50 p-2 text-xs text-brand-800 dark:bg-brand-900/30 dark:text-brand-200"><b>Support:</b> {t.reply}</p>}
                      <p className="mt-1 text-[11px] text-slate-400">Opened {new Date(t.created_at).toLocaleString('en-IN')}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        ) : (
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
            Please <Link className="link font-bold" to="/login?next=/help">sign in</Link> to raise and track support tickets.
          </p>
        )}
      </section>

      <section aria-label="Travel policies" className="card p-6">
        <h2 className="text-xl font-bold">Travel & cancellation policies</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-600 dark:text-slate-300">
          <li>Each operator publishes its own cancellation policy; the exact terms and refund slabs are shown on the bus card and again before you confirm a cancellation.</li>
          <li>Refund amounts are computed by the configured policy rules and initiated to the original payment method — they are never estimated manually by staff in this product.</li>
          <li>Boarding points close typically 10 minutes before departure (operator-dependent; shown on your ticket).</li>
          <li>Ladies-reserved seating appears only on buses where the operator has enabled it.</li>
        </ul>
      </section>

      <section aria-label="Emergency contacts" className="rounded-2xl border border-dashed border-slate-300 p-5 text-sm dark:border-slate-600">
        <h3 className="font-bold">Need urgent help?</h3>
        <p className="mt-1 text-slate-600 dark:text-slate-300">This is a demo product, so the helpline number below is not monitored: <b>1800-XXX-XXXX</b>. For real emergencies, dial <b>112</b> (All-India Emergency Response Support Vehicle), which is a publicly verified national number.</p>
      </section>
    </div>
  )
}

export function NotFound() {
  usePageTitle('/404')
  return (
    <div className="py-16">
      <EmptyState icon={I.mapPinLive} title="Wrong stop, maybe?" hint="The page you’re looking for doesn’t exist. Head back home and search for your route."
        action={<Link to="/" className="btn-primary">Back to home</Link>} />
    </div>
  )
}
