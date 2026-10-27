// /checkout — passenger details, contact, coupon, T&C, then creates booking.
import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { Icon, I, Skeleton, ErrorNote, Tip } from '../components/ui'
import { useApp } from '../lib/state'
import { inr } from '../lib/i18n'

type Saved = { id: number; name: string; age: number; gender: string; phone: string | null }
type Pax = { name: string; age: string; gender: '' | 'male' | 'female' | 'other'; phone: string }

const GENDERS = [['', 'Gender'], ['male', 'Male'], ['female', 'Female'], ['other', 'Other']] as const

export default function Checkout() {
  const nav = useNavigate()
  const { toast, user } = useApp()
  const [ctxRaw] = useState(() => sessionStorage.getItem('sg_checkout'))
  const ctx = useMemo(() => { try { return JSON.parse(ctxRaw || '{}') } catch { return null } }, [ctxRaw])

  const [sched, setSched] = useState<any | null>(null)
  const [seatsInfo, setSeatsInfo] = useState<any[]>([])
  const [loadErr, setLoadErr] = useState('')
  const [pax, setPax] = useState<Pax[]>([])
  const [saved, setSaved] = useState<Saved[]>([])
  const [contactPhone, setContactPhone] = useState(user?.phone || '')
  const [contactEmail, setContactEmail] = useState(user?.email || '')
  const [coupon, setCoupon] = useState('')
  const [applied, setApplied] = useState<{ discount: number; message: string; total: number } | null>(null)
  const [quote, setQuote] = useState<any | null>(null)
  const [agree, setAgree] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!ctx?.scheduleId) { setLoadErr('Checkout session missing. Please search a bus and select seats first.'); return }
    api<any>(`/api/schedules/${ctx.scheduleId}`)
      .then((d) => {
        setSched(d)
        const sel = d.seats.filter((s: any) => ctx.seats.includes(s.seat_no))
        setSeatsInfo(sel)
        setPax(ctx.seats.map((no: string) => ({ name: '', age: '', gender: '' as const, phone: '' })))
      })
      .catch((e) => setLoadErr(e.message))
    if (user) api<Saved[]>('/api/me/saved-passengers').then(setSaved).catch(() => undefined)
    api<any>('/api/quote', { method: 'POST', body: { scheduleId: ctx.scheduleId, seats: ctx.seats } }).then(setQuote).catch((e) => setLoadErr(e.message))
  }, [ctx, user])

  // re-quote with coupon
  useEffect(() => {
    if (!ctx?.scheduleId || !quote) return
    if (!coupon.trim()) { setApplied(null); api<any>('/api/quote', { method: 'POST', body: { scheduleId: ctx.scheduleId, seats: ctx.seats } }).then(setQuote).catch(() => undefined); return }
    api<any>('/api/coupons/apply', { method: 'POST', body: { scheduleId: ctx.scheduleId, seats: ctx.seats, code: coupon.trim() } })
      .then((r) => { setApplied({ discount: r.discount, message: r.message, total: r.total }); toast('success', `Coupon applied: ${r.message}`) })
      .catch((e) => { setApplied(null); toast('error', e.message) })
  }, [coupon]) // eslint-disable-line

  const validate = () => {
    const err: Record<string, string> = {}
    pax.forEach((p, i) => {
      if (!p.name || p.name.trim().length < 3) err[`p${i}name`] = 'Full name (min 3 characters) required.'
      const age = Number(p.age)
      if (!Number.isInteger(age) || age < 1 || age > 120) err[`p${i}age`] = 'Age must be between 1 and 120.'
      if (!p.gender) err[`p${i}gender`] = 'Select gender — operators need it for ladies-seat & safety rules.'
      if (p.phone && !/^(\+91[- ]?)?[6-9]\d{9}$/.test(p.phone)) err[`p${i}phone`] = 'Invalid Indian mobile number.'
      // Ladies seat rule mirror
      const seat = seatsInfo[i]
      if (seat?.kind === 'ladies' && p.gender !== 'female') err[`p${i}gender`] = 'This berth is ladies-reserved — the passenger must be female.'
    })
    if (!/^(\+91[- ]?)?[6-9]\d{9}$/.test(contactPhone)) err.contactPhone = 'Enter a valid Indian mobile (+91 optional).'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(contactEmail)) err.contactEmail = 'We need a valid email for your ticket.'
    if (!agree) err.agree = 'Please accept the travel & cancellation terms to continue.'
    setErrors(err)
    return Object.keys(err).length === 0
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) { toast('error', 'Please fix the highlighted fields.'); return }
    setSubmitting(true)
    try {
      const r = await api<any>('/api/bookings', {
        method: 'POST',
        body: {
          scheduleId: ctx.scheduleId, seats: ctx.seats, boardingStopId: ctx.boardingStopId, droppingStopId: ctx.droppingStopId,
          passengers: pax, contactPhone, contactEmail, couponCode: applied ? coupon.trim() : undefined, holdToken: ctx.holdToken,
        },
      })
      sessionStorage.setItem('sg_last_booking', String(r.bookingId))
      nav(`/pay/${r.bookingId}`)
    } catch (er: any) {
      toast('error', er.message)
      if (er.status === 410) nav(`/seat/${ctx.scheduleId}?date=${ctx.date}&from=${ctx.from}&to=${ctx.to}`) // hold expired -> back to seats
    } finally { setSubmitting(false) }
  }

  if (loadErr) return <div className="mx-auto max-w-xl"><ErrorNote msg={loadErr} /><div className="mt-4 text-center"><button className="btn-primary" onClick={() => nav('/')}>Back to search</button></div></div>
  if (!sched || !quote) return <div className="mx-auto max-w-5xl space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-64" /></div>

  const total = applied ? applied.total : quote.total

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-1 text-2xl font-extrabold">Passenger & payment details</h1>
      <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">{sched.operator} · {sched.source_city} → {sched.dest_city} · {sched.depart_date} {sched.depart_time}</p>

      <form onSubmit={submit} noValidate className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          {/* Passengers */}
          <section className="card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-bold">Passengers ({pax.length})</h2>
              {user && saved.length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer font-semibold text-brand-600 dark:text-brand-300">Use saved passenger</summary>
                  <ul className="mt-2 space-y-1">
                    {saved.map((s) => (
                      <li key={s.id}><button type="button" className="link" onClick={() => {
                        setPax((ps) => ps.map((p, i) => i === 0 && !p.name ? { name: s.name, age: String(s.age), gender: (s.gender as any) || '', phone: s.phone || '' } : p))
                      }}>{s.name} · {s.age}y · {s.gender}</button></li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
            <div className="space-y-4">
              {pax.map((p, i) => {
                const seat = seatsInfo[i]
                return (
                  <fieldset key={i} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                    <legend className="px-1 text-xs font-bold text-slate-500">Seat {seat?.seat_no}{seat?.kind === 'ladies' && <span className="ml-2 chip bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300">Ladies reserved</span>}</legend>
                    <div className="grid gap-3 sm:grid-cols-4">
                      <div className="sm:col-span-2">
                        <label className="label" htmlFor={`nm${i}`}>Full name</label>
                        <input id={`nm${i}`} className={`input ${errors[`p${i}name`] ? '!border-rose-500' : ''}`} placeholder="As on government ID" value={p.name} onChange={(e) => setPax((ps) => ps.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
                        {errors[`p${i}name`] && <p role="alert" className="mt-1 text-xs text-rose-600">{errors[`p${i}name`]}</p>}
                      </div>
                      <div>
                        <label className="label" htmlFor={`ag${i}`}>Age</label>
                        <input id={`ag${i}`} inputMode="numeric" className={`input ${errors[`p${i}age`] ? '!border-rose-500' : ''}`} placeholder="Years" value={p.age} onChange={(e) => setPax((ps) => ps.map((x, j) => j === i ? { ...x, age: e.target.value.replace(/\D/g, '').slice(0, 3) } : x))} />
                        {errors[`p${i}age`] && <p role="alert" className="mt-1 text-xs text-rose-600">{errors[`p${i}age`]}</p>}
                      </div>
                      <div>
                        <label className="label" htmlFor={`gd${i}`}>Gender</label>
                        <select id={`gd${i}`} className={`input ${errors[`p${i}gender`] ? '!border-rose-500' : ''}`} value={p.gender} onChange={(e) => setPax((ps) => ps.map((x, j) => j === i ? { ...x, gender: e.target.value as any } : x))}>
                          {GENDERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                        {errors[`p${i}gender`] && <p role="alert" className="mt-1 text-xs text-rose-600">{errors[`p${i}gender`]}</p>}
                      </div>
                    </div>
                    <div className="mt-3">
                      <label className="label" htmlFor={`ph${i}`}>Mobile (optional)</label>
                      <input id={`ph${i}`} inputMode="tel" className={`input sm:max-w-64 ${errors[`p${i}phone`] ? '!border-rose-500' : ''}`} placeholder="+91 9xxxxxxxxx" value={p.phone} onChange={(e) => setPax((ps) => ps.map((x, j) => j === i ? { ...x, phone: e.target.value } : x))} />
                      {errors[`p${i}phone`] && <p role="alert" className="mt-1 text-xs text-rose-600">{errors[`p${i}phone`]}</p>}
                    </div>
                  </fieldset>
                )
              })}
            </div>
          </section>

          {/* Contact */}
          <section className="card p-5">
            <h2 className="mb-4 font-bold">Contact for ticket & updates</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="cph">Mobile</label>
                <input id="cph" inputMode="tel" className={`input ${errors.contactPhone ? '!border-rose-500' : ''}`} value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="+91 98765 43210" />
                {errors.contactPhone && <p role="alert" className="mt-1 text-xs text-rose-600">{errors.contactPhone}</p>}
              </div>
              <div>
                <label className="label" htmlFor="cem">Email</label>
                <input id="cem" type="email" className={`input ${errors.contactEmail ? '!border-rose-500' : ''}`} value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="you@example.in" />
                {errors.contactEmail && <p role="alert" className="mt-1 text-xs text-rose-600">{errors.contactEmail}</p>}
              </div>
            </div>
            {!user && <p className="mt-3 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">You’re booking as a guest. <button type="button" className="link font-bold" onClick={() => nav('/login?next=/checkout')}>Sign in</button> to track this trip in My bookings, save passengers and earn loyalty points.</p>}
          </section>

          {/* Terms */}
          <section className="card p-5">
            <label className="flex cursor-pointer items-start gap-3 text-sm">
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-4 w-4 accent-brand-600" />
              <span>I confirm passenger details are accurate, agree to the operator’s <Tip label="Refund tiers shown on the help page"><a href="/help#faq" target="_blank" rel="noreferrer" className="link">cancellation policy</a></Tip>, and consent to SMS/email journey alerts. <span className="text-rose-600">*</span>
                {errors.agree && <b role="alert" className="block text-xs text-rose-600">{errors.agree}</b>}
              </span>
            </label>
          </section>
        </div>

        {/* Right rail */}
        <aside className="space-y-4">
          <div className="card p-5">
            <h2 className="mb-3 font-bold">Coupon code</h2>
            <div className="flex gap-2">
              <input className="input uppercase" placeholder="SAFAR100" value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} aria-label="Coupon code" />
            </div>
            {applied && <p className="mt-2 rounded-lg bg-emerald-50 p-2 text-xs font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"><Icon d={I.check} size={12} className="inline" /> {applied.message} — you save {inr(applied.discount)}</p>}
            <p className="mt-2 text-[11px] text-slate-400">Demo codes: SAFAR100 · NEWTRIP20 · WEEKEND15</p>
          </div>

          <div className="card sticky top-20 p-5" aria-live="polite">
            <h2 className="mb-3 font-bold">Fare summary</h2>
            <div className="space-y-1.5 text-sm">
              {seatsInfo.map((st) => <div key={st.seat_no} className="flex justify-between"><span>Seat {st.seat_no} ({st.deck})</span><b>{inr(st.price_paise)}</b></div>)}
              <div className="flex justify-between border-t border-dashed pt-1.5 dark:border-slate-700"><span>Base fare</span><b>{inr(quote.base)}</b></div>
              <div className="flex justify-between text-slate-500"><span>Convenience fee + taxes</span><span>{inr(quote.fee)}</span></div>
              {(applied?.discount ?? 0) > 0 && <div className="flex justify-between text-emerald-600 dark:text-emerald-400"><span>Coupon {coupon}</span><b>-{inr(applied!.discount)}</b></div>}
              <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-extrabold dark:border-slate-700"><span>To pay</span><span className="text-emerald-600 dark:text-emerald-400">{inr(total)}</span></div>
            </div>
            <button type="submit" disabled={submitting} className="btn-accent btn-lg mt-4 w-full">
              {submitting ? 'Creating your booking…' : <>Proceed to pay {inr(total)}</>}
            </button>
            <p className="mt-2 text-center text-[11px] text-slate-400">Seats stay held while you pay. You are only charged after you confirm a payment method.</p>
          </div>
        </aside>
      </form>
    </div>
  )
}
