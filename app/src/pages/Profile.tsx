// /me — bookings, saved passengers, coupon wallet, notifications, settings.
import React, { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import { Icon, I, Skeleton, EmptyState, ErrorNote, useConfirm, Tip, ThemeToggle } from '../components/ui'
import { useApp } from '../lib/state'
import { inr, fmtDateLong, fmtDur, t } from '../lib/i18n'

const STATUS_STYLE: Record<string, string> = {
  pending_payment: 'badge-amber', confirmed: 'badge-green', cancelled: 'badge-slate', refunded: 'badge-blue',
}

export default function Profile() {
  const { user, setUser, toast, a11y, toggleA11y, lang } = useApp()
  const [sp, setSp] = useSearchParams()
  const tab = sp.get('tab') || 'bookings'
  const nav = useNavigate()
  const { confirm, confirmNode } = useConfirm()

  if (!user) {
    return <div className="mx-auto max-w-md"><EmptyState icon={I.users} title="Sign in to see your trips" hint="Track bookings, download tickets, save passengers and manage alerts." action={<Link to="/login?next=/me" className="btn-primary">Sign in</Link>} /></div>
  }

  const tabs = [['bookings', I.ticket, t('myBookings', lang)], ['saved', I.users, 'Passengers'], ['coupons', I.gift, 'Coupon wallet'], ['alerts', I.bell, 'Alerts'], ['settings', I.shield, 'Settings']] as const

  return (
    <div className="mx-auto max-w-5xl">
      {confirmNode}
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-xl font-extrabold text-white">{(user.name || '?')[0].toUpperCase()}</span>
        <div className="mr-auto">
          <h1 className="text-xl font-extrabold sm:text-2xl">Namaste, {user.name.split(' ')[0]} 👋</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">{user.phone || user.email} · 🏅 {user.loyalty_points} loyalty pts · ₹{Math.floor((user.travel_credit_paise || 0) / 100)} travel credit</p>
        </div>
        {(user.role === 'admin' || user.role === 'support') && <Link to="/admin" className="btn-outline"><Icon d={I.shield} size={16} />Admin</Link>}
        {user.role === 'operator' && <Link to="/operator" className="btn-outline"><Icon d={I.bus} size={16} />Operator portal</Link>}
      </div>

      <div role="tablist" aria-label="Profile sections" className="mb-5 flex gap-1 overflow-x-auto border-b border-slate-200 pb-px dark:border-slate-700/60">
        {tabs.map(([id, ic, lab]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setSp({ tab: id })}
            className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors ${tab === id ? 'border-brand-600 text-brand-700 dark:text-brand-300' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
            <Icon d={ic} size={15} />{lab}
          </button>
        ))}
      </div>

      {tab === 'bookings' && <Bookings onNotify={(m: string) => toast('success', m)} confirm={confirm} />}
      {tab === 'saved' && <SavedPassengers />}
      {tab === 'coupons' && <Coupons />}
      {tab === 'alerts' && <Alerts />}
      {tab === 'settings' && <Settings user={user} setUser={setUser} toast={toast} confirm={confirm} a11y={a11y} toggleA11y={toggleA11y} goHome={() => nav('/')} />}
    </div>
  )
}

// ---------------- Bookings ----------------
function Bookings({ onNotify, confirm }: any) {
  const [rows, setRows] = useState<any[] | null>(null)
  const [err, setErr] = useState('')
  const load = () => api<any[]>('/api/me/bookings').then(setRows).catch((e) => setErr(e.message))
  useEffect(() => { load() }, [])
  const cancel = async (id: number) => {
    // fetch quote first so the user sees refund amount BEFORE confirming
    try {
      const q = await api<any>(`/api/bookings/${id}/cancel-quote`)
      const yes = await confirm('Cancel this booking?', `${q.policy.label}\n\nRefund: ${inr(q.refundPaise)} (deduction ${inr(q.deductionPaise)}). Refunds land in 3–5 working days.`)
      if (!yes) return
      const r = await api<any>(`/api/bookings/${id}/cancel`, { method: 'POST', body: {} })
      onNotify(`Cancelled. Refund of ${inr(r.refundPaise)} initiated.`)
      load()
    } catch (e: any) { onNotify?.(e); alert(e.message) }
  }
  if (err) return <ErrorNote msg={err} onRetry={load} />
  if (!rows) return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
  if (!rows.length) return <EmptyState icon={I.ticket} title="No bookings yet" hint="Your confirmed trips will show up here with tickets, live tracking and cancellation." action={<Link to="/" className="btn-primary">Find a bus</Link>} />
  return (
    <ul className="space-y-3">
      {rows.map((b) => (
        <li key={b.id} className="card p-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <b className="truncate">{b.source} → {b.dest}</b>
                <span className={STATUS_STYLE[b.status] || 'badge-slate'}>{b.status.replace('_', ' ')}</span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{b.operator} · {b.bus_type} · {fmtDateLong(b.depart_date)} {b.depart_time} · PNR <code className="font-mono">{b.pnr}</code></p>
            </div>
            <div className="text-right text-sm font-bold">{inr(b.total_paise)}{b.refund_paise > 0 && <div className="text-xs font-normal text-emerald-600">refund {inr(b.refund_paise)}</div>}</div>
            <div className="flex w-full gap-2 sm:w-auto">
              {b.status === 'pending_payment' && <Link to={`/pay/${b.id}`} className="btn-accent !py-2 text-xs">Pay now</Link>}
              {b.status === 'confirmed' && <>
                <Link to={`/trip/${b.id}`} className="btn-outline !py-2 text-xs"><Icon d={I.mapPinLive} size={13} />Track trip</Link>
                <button className="btn-outline !py-2 text-xs !text-rose-600" onClick={() => cancel(b.id)}>Cancel</button>
              </>}
              {(b.status === 'confirmed' || b.status === 'refunded' || b.status === 'cancelled') && <Link to={`/booking/${b.id}`} className="btn-ghost !py-2 text-xs">Details</Link>}
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}

// ---------------- Booking detail + review ----------------
export function BookingDetail() {
  const id = window.location.pathname.split('/')[2]
  const { toast, user } = useApp()
  const [b, setB] = useState<any | null>(null)
  const [err, setErr] = useState('')
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const load = useCallback(() => { if (user) api<any>(`/api/bookings/${id}`).then(setB).catch((e) => setErr(e.message)) }, [id, user])
  useEffect(() => { load() }, [load])
  if (!user) return <EmptyState icon={I.users} title="Sign in to view this booking" action={<Link to={`/login?next=/booking/${id}`} className="btn-primary">Sign in</Link>} />
  if (err) return <ErrorNote msg={err} />
  if (!b) return <Skeleton className="h-96" />
  const sc = b.schedule, bk = b.booking
  const completed = new Date(`${sc.depart_date}T${sc.depart_time}:00+05:30`).getTime() + sc.duration_min * 60000 < Date.now()
  const alreadyReviewed = !!b.review_exists
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h1 className="text-xl font-extrabold">{sc.source_city} → {sc.dest_city}</h1>
            <p className="text-sm text-slate-500">{sc.operator} · {sc.bus_name} ({sc.bus_type}) · PNR <code className="font-mono">{bk.pnr}</code></p></div>
          <span className={STATUS_STYLE[bk.status] || 'badge-slate'}>{bk.status.replace('_', ' ')}</span>
        </div>
        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <p><b>Depart:</b> {fmtDateLong(sc.depart_date)} {sc.depart_time} · {fmtDur(sc.duration_min)}</p>
          <p><b>Boarding:</b> {b.boarding?.name}</p>
          <p><b>Drop:</b> {b.dropping?.name}</p>
          <p><b>Total paid:</b> {inr(bk.total_paise)}{bk.discount_paise ? ` (coupon -${inr(bk.discount_paise)})` : ''}</p>
        </div>
        <table className="mt-4 w-full text-sm">
          <thead><tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400 dark:border-slate-700"><th className="py-2">Seat</th><th>Passenger</th><th>Age</th><th className="text-right">Gender</th></tr></thead>
          <tbody>{b.passengers.map((p: any) => <tr key={p.id} className="border-b border-dashed border-slate-100 dark:border-slate-700/60"><td className="py-2 font-bold">{p.seat_no}</td><td>{p.name}</td><td>{p.age}</td><td className="text-right capitalize">{p.gender}</td></tr>)}</tbody>
        </table>
        <div className="mt-4 flex flex-wrap gap-2">
          {bk.status === 'confirmed' && <button className="btn-primary !py-2" onClick={() => window.open(`/api/bookings/${bk.id}/ticket`, '_blank')}><Icon d={I.download} size={15} />E-ticket</button>}
          {bk.status === 'confirmed' && <Link to={`/trip/${bk.id}`} className="btn-outline !py-2">Live tracking</Link>}
          {['payments'].length > 0 && b.payments?.length > 0 && (
            <div className="w-full text-xs text-slate-400">Payment: {b.payments[0].method} via {b.payments[0].gateway}{b.payments[0].payment_id ? ` · ${b.payments[0].payment_id}` : ''} · status {b.payments[0].status}{b.payments[0].failure_reason ? ` (${b.payments[0].failure_reason})` : ''}</div>
          )}
          {b.refunds?.length > 0 && <div className="w-full text-xs text-emerald-600">Refund {inr(b.refunds[0].amount_paise)} · UTR {b.refunds[0].utr} · {b.refunds[0].status}</div>}
        </div>
      </div>
      {completed && bk.status === 'confirmed' && !alreadyReviewed && (
        <div className="card p-6">
          <h2 className="mb-2 font-bold">Rate this journey</h2>
          <div className="flex gap-1" role="radiogroup" aria-label="Rating 1 to 5 stars">
            {[1, 2, 3, 4, 5].map((v) => (
              <button key={v} role="radio" aria-checked={rating === v} aria-label={`${v} star${v > 1 ? 's' : ''}`} onClick={() => setRating(v)}
                className={`text-2xl transition-transform hover:scale-110 ${v <= rating ? 'text-amber-400' : 'text-slate-300 dark:text-slate-600'}`}><Icon d={I.star} size={24} className={v <= rating ? 'fill-current' : ''} /></button>
            ))}
          </div>
          <textarea className="input mt-3" rows={3} placeholder="How was punctuality, cleanliness, driver behaviour?" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={600} />
          <button className="btn-primary mt-3" disabled={!rating} onClick={async () => {
            try { await api('/api/reviews', { method: 'POST', body: { bookingId: Number(id), rating, comment } }); toast('success', 'Thanks for reviewing — it helps other travellers.'); load() } catch (e: any) { toast('error', e.message) }
          }}>Submit review</button>
          <p className="mt-2 text-[11px] text-slate-400">Reviews are only allowed after the trip completes, once per booking.</p>
        </div>
      )}
    </div>
  )
}

// ---------------- Live trip page ----------------
export function LiveTrip() {
  const id = window.location.pathname.split('/')[2]
  const { user } = useApp()
  const [data, setData] = useState<any | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    if (!user) return
    let alive = true
    const tick = () => api<any>(`/api/tracking/${id}`).then((d) => alive && setData(d)).catch((e) => alive && setErr(e.message))
    tick()
    const iv = setInterval(tick, 5000)
    return () => { alive = false; clearInterval(iv) }
  }, [id, user])
  if (!user) return <EmptyState icon={I.users} title="Sign in to track your trip" action={<Link to={`/login?next=/trip/${id}`} className="btn-primary">Sign in</Link>} />
  if (err) return <ErrorNote msg={err} />
  if (!data) return <Skeleton className="h-80" />
  if (!data.available) return <EmptyState icon={I.mapPinLive} title="Tracking unavailable" hint={data.message} />
  const pct = data.phase === 'running' ? undefined : data.phase === 'completed' ? 100 : 0
  return (
    <div className="mx-auto max-w-2xl">
      <div className="card p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-extrabold">Live trip</h1>
          <span className="badge-amber"><Icon d={I.info} size={12} />DEMO GPS — simulated position</span>
        </div>
        <div className="relative my-8 h-2 rounded-full bg-slate-200 dark:bg-slate-700">
          {data.phase === 'running' && <ProgressBar frac={fracOf(data.etaLabel)} />}
          {data.phase === 'completed' && <div className="absolute inset-0 rounded-full bg-emerald-500" />}
          {data.phase === 'scheduled' && <div className="absolute inset-0 rounded-full bg-slate-200 dark:bg-slate-700" />}
          <span className="absolute -top-1 left-0 h-4 w-4 rounded-full border-2 border-white bg-brand-600 shadow" aria-hidden="true" />
          <span className="absolute -top-1 right-0 h-4 w-4 rounded-full border-2 border-white bg-accent-500 shadow" aria-hidden="true" />
        </div>
        <div className="space-y-2 text-sm">
          <p className="flex items-center gap-2"><Icon d={I.bus} size={16} className="text-brand-600 dark:text-brand-300" /><b>{data.etaLabel}</b></p>
          {data.nextStop && <p className="flex items-center gap-2"><Icon d={I.pin} size={16} className="text-accent-600" />Next stop area: <b>{data.nextStop}</b></p>}
          {data.position && <p className="text-xs text-slate-400">Simulated coordinates: {data.position.lat.toFixed(3)}, {data.position.lng.toFixed(3)} · updated {new Date(data.updatedAt).toLocaleTimeString('en-IN')}</p>}
          {data.phase === 'scheduled' && <p className="text-xs text-slate-400">Position starts streaming 30 minutes before departure.</p>}
        </div>
      </div>
    </div>
  )
}
function fracOf(eta: string) { const m = /Approx\. (\d+) min/.exec(eta || ''); return m ? Math.max(0.04, 1 - Number(m[1]) / 600) : 0.5 }
function ProgressBar({ frac }: { frac: number }) {
  const [w, setW] = useState(0)
  useEffect(() => { const iv = setInterval(() => setW((x) => Math.min(frac + 0.02, x + 0.01)), 5000); setW(frac); return () => clearInterval(iv) }, [frac])
  return <div className="absolute inset-y-0 left-0 rounded-full bg-brand-600 transition-all duration-1000" style={{ width: `${w * 100}%` }} />
}

// ---------------- Saved passengers ----------------
function SavedPassengers() {
  const { toast } = useApp()
  const [rows, setRows] = useState<any[]>([])
  const [f, setF] = useState({ name: '', age: '', gender: '', phone: '', consent: false })
  const [err, setErr] = useState('')
  const load = () => api<any[]>('/api/me/saved-passengers').then(setRows).catch(() => undefined)
  useEffect(() => { load() }, [])
  const add = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('')
    if (f.name.trim().length < 3) return setErr('Enter the passenger’s full name.')
    if (!Number.isInteger(Number(f.age)) || Number(f.age) < 1 || Number(f.age) > 120) return setErr('Age must be between 1 and 120.')
    if (!f.consent) return setErr('You must confirm you have their consent to store these details.')
    try { await api('/api/me/saved-passengers', { method: 'POST', body: f }); toast('success', `${f.name} saved for faster checkouts.`); setF({ name: '', age: '', gender: '', phone: '', consent: false }); load() }
    catch (er: any) { setErr(er.message) }
  }
  return (
    <div className="grid gap-5 md:grid-cols-[1fr_320px]">
      <div>
        {rows.length === 0 ? <EmptyState icon={I.users} title="No saved passengers" hint="Save family members once, autofill them at checkout later." /> : (
          <ul className="space-y-2">
            {rows.map((p) => (
              <li key={p.id} className="card flex items-center gap-3 p-4">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-100 font-bold text-brand-700 dark:bg-brand-900/50 dark:text-brand-300">{p.name[0]}</span>
                <div className="min-w-0 flex-1"><b className="block truncate">{p.name}</b><span className="text-xs text-slate-500">{p.age} yrs · {p.gender}{p.phone ? ` · ${p.phone}` : ''}</span></div>
                <Tip label="Remove passenger"><button className="btn-ghost !px-2 text-rose-600" aria-label={`Delete saved passenger ${p.name}`} onClick={async () => { await api(`/api/me/saved-passengers/${p.id}`, { method: 'DELETE', body: {} }); toast('info', `${p.name} removed.`); load() }}><Icon d={I.trash} size={16} /></button></Tip>
              </li>
            ))}
          </ul>
        )}
      </div>
      <form onSubmit={add} className="card h-max p-5">
        <h2 className="mb-3 font-bold">Add passenger</h2>
        {err && <p role="alert" className="mb-3 rounded-lg bg-rose-50 p-2 text-xs text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">{err}</p>}
        <label className="label">Name</label><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div><label className="label">Age</label><input inputMode="numeric" className="input" value={f.age} onChange={(e) => setF({ ...f, age: e.target.value.replace(/\D/g, '') })} /></div>
          <div><label className="label">Gender</label><select className="input" value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value })}><option value="">—</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option></select></div>
        </div>
        <label className="label mt-3">Phone (optional)</label><input className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        <label className="mt-3 flex items-start gap-2 text-xs"><input type="checkbox" checked={f.consent} onChange={(e) => setF({ ...f, consent: e.target.checked })} className="mt-0.5 accent-brand-600" />The passenger has consented to us storing these details (required by DPDP Act).</label>
        <button className="btn-primary mt-4 w-full">Save passenger</button>
      </form>
    </div>
  )
}

// ---------------- Coupons ----------------
function Coupons() {
  const [rows, setRows] = useState<any[] | null>(null)
  useEffect(() => { api<any[]>('/api/me/coupons').then(setRows).catch(() => setRows([])) }, [])
  if (!rows) return <div className="grid gap-3 sm:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32" />)}</div>
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {rows.map((c) => (
        <div key={c.code} className="card border-dashed p-5">
          <div className="text-xl font-extrabold text-brand-700 dark:text-brand-300">{c.kind === 'flat' ? `${inr(c.value_paise)} off` : `${c.value_paise}% off`}</div>
          <p className="mt-1 text-sm">{c.description}</p>
          <p className="mt-2 text-xs text-slate-400">Min fare {inr(c.min_fare_paise)}{c.max_discount_paise ? ` · cap ${inr(c.max_discount_paise)}` : ''} · till {fmtDateLong(c.valid_till.slice(0, 10))}</p>
          <code className="mt-2 block rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-center font-bold tracking-wider dark:border-slate-700 dark:bg-slate-900">{c.code}</code>
        </div>
      ))}
      {!rows.length && <EmptyState icon={I.gift} title="Coupon wallet is empty" hint="New demo coupons drop every weekend. Check the offers page." />}
    </div>
  )
}

// ---------------- Notifications ----------------
function Alerts() {
  const { toast } = useApp()
  const [rows, setRows] = useState<any[] | null>(null)
  const load = () => api<any[]>('/api/me/notifications').then(setRows).catch(() => setRows([]))
  useEffect(() => { load() }, [])
  if (!rows) return <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
  return (
    <div>
      {rows.length > 0 && <button className="btn-outline mb-3 !py-2 text-xs" onClick={async () => { await api('/api/me/notifications/read-all', { method: 'POST', body: {} }); toast('info', 'All alerts marked read.'); load() }}>Mark all read</button>}
      {rows.length === 0 ? <EmptyState icon={I.bell} title="No alerts yet" hint="Booking confirmations, refund updates and support replies land here." /> : (
        <ul className="space-y-2">
          {rows.map((n) => (
            <li key={n.id} className={`card flex gap-3 p-4 ${n.read ? 'opacity-70' : 'border-l-4 border-l-brand-500'}`}>
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300"><Icon d={n.type === 'refund_update' ? I.wallet : n.type === 'support_ack' ? I.chat : I.bell} size={16} /></span>
              <div className="min-w-0 flex-1"><b className="text-sm">{n.title}</b><p className="text-xs text-slate-500 dark:text-slate-400">{n.body}</p>
                <p className="mt-1 text-[10px] text-slate-400">{new Date(n.created_at).toLocaleString('en-IN')}</p></div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ---------------- Settings ----------------
function Settings({ user, setUser, toast, confirm, a11y, toggleA11y, goHome }: any) {
  const [name, setName] = useState(user.name)
  const [prefs, setPrefs] = useState(JSON.parse(user.notif_prefs || '{"sms":true,"email":true,"whatsapp":false}'))
  const [pwOld, setPwOld] = useState(''); const [pwNew, setPwNew] = useState('')
  const save = async () => {
    try { const r = await api<any>('/api/me', { method: 'PATCH', body: { name, notifPrefs: prefs } }); setUser(r.user); toast('success', 'Profile updated.') } catch (e: any) { toast('error', e.message) }
  }
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <section className="card p-5">
        <h2 className="mb-3 font-bold">Profile</h2>
        <label className="label">Display name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="mt-4 space-y-1.5 text-sm">
          {(['sms', 'email', 'whatsapp'] as const).map((k) => (
            <label key={k} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-700">
              <span className="capitalize">Journey alerts via {k === 'whatsapp' ? 'WhatsApp (demo)' : k}</span>
              <input type="checkbox" checked={!!prefs[k]} onChange={(e) => setPrefs({ ...prefs, [k]: e.target.checked })} className="h-4 w-4 accent-brand-600" />
            </label>
          ))}
        </div>
        <button className="btn-primary mt-4" onClick={save}>Save changes</button>
      </section>
      <section className="card p-5">
        <h2 className="mb-3 font-bold">Accessibility & appearance</h2>
        <label className="flex items-center justify-between py-2 text-sm"><span>Reduce motion (animations)</span><input type="checkbox" checked={a11y.reduceMotion} onChange={() => toggleA11y('reduceMotion')} className="h-4 w-4 accent-brand-600" /></label>
        <label className="flex items-center justify-between py-2 text-sm"><span>High contrast mode</span><input type="checkbox" checked={a11y.highContrast} onChange={() => toggleA11y('highContrast')} className="h-4 w-4 accent-brand-600" /></label>
        <div className="mt-2"><ThemeToggle /></div>
        <h2 className="mb-2 mt-6 font-bold text-rose-600">Danger zone</h2>
        <p className="text-xs text-slate-500">Deleting your account anonymises past bookings and erases saved passengers, routes and preferences (DPDP-style data deletion).</p>
        <button className="btn-outline mt-3 !border-rose-300 !text-rose-600" onClick={async () => {
          if (await confirm('Delete account?', 'This removes your profile and personal data permanently. Confirmed bookings stay on file anonymously for operator records.')) {
            await api('/api/me', { method: 'DELETE', body: {} }); setUser(null); toast('info', 'Account deleted. Safe travels!'); goHome()
          }
        }}>Delete my account</button>
      </section>
    </div>
  )
}
