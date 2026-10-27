// /admin — stats, users, bookings, payments/refunds, coupons, operators, tickets, audit.
import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { Icon, I, Skeleton, EmptyState, Tip } from '../components/ui'
import { useApp } from '../lib/state'
import { inr } from '../lib/i18n'

const TABS = [['stats', 'Dashboard'], ['bookings', 'Bookings'], ['users', 'Users'], ['payments', 'Payments & refunds'], ['coupons', 'Coupons'], ['operators', 'Operators'], ['tickets', 'Support'], ['audit', 'Audit log']] as const

export default function Admin() {
  const { user, toast } = useApp()
  const [tab, setTab] = useState<string>('stats')
  if (!user || !['admin', 'support'].includes(user.role)) {
    return <EmptyState icon={I.shield} title="Admins only" hint="Sign in with an admin or support account (see the login page demo accounts) to open this dashboard." action={<Link to="/login?next=/admin" className="btn-primary">Sign in</Link>} />
  }
  return (
    <div>
      <h1 className="mb-1 text-2xl font-extrabold">Admin dashboard</h1>
      <p className="mb-5 text-sm text-slate-500">Signed in as {user.role}. Data is fictional demo inventory.</p>
      <div role="tablist" className="mb-5 flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-700/60">
        {TABS.map(([id, lab]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={`shrink-0 border-b-2 px-3 py-2.5 text-sm font-semibold ${tab === id ? 'border-brand-600 text-brand-700 dark:text-brand-300' : 'border-transparent text-slate-500'}`}>{lab}</button>
        ))}
      </div>
      {tab === 'stats' && <Stats />}
      {tab === 'bookings' && <Table endpoint="/api/admin/bookings" columns={['id', 'pnr', 'status', 'route', 'depart_date', 'total_paise', 'phone', 'created_at']} money={['total_paise']} />}
      {tab === 'users' && <Users />}
      {tab === 'payments' && <><Table endpoint="/api/admin/payments" columns={['id', 'order_id', 'payment_id', 'method', 'amount_paise', 'status', 'gateway']} money={['amount_paise']} /><div className="mt-6"><h2 className="mb-2 font-bold">Refunds</h2><Table endpoint="/api/admin/refunds" columns={['id', 'booking_id', 'amount_paise', 'status', 'utr', 'policy_snapshot']} money={['amount_paise']} /></div></>}
      {tab === 'coupons' && <CouponsAdmin />}
      {tab === 'operators' && <OperatorsAdmin />}
      {tab === 'tickets' && <Tickets />}
      {tab === 'audit' && <Table endpoint="/api/admin/audit" columns={['id', 'user_id', 'action', 'entity', 'entity_id', 'meta', 'created_at']} />}
    </div>
  )
}

function Stats() {
  const [s, setS] = useState<any>(null)
  useEffect(() => { api('/api/admin/stats').then(setS).catch(() => undefined) }, [])
  if (!s) return <div className="grid gap-3 sm:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
  const cards: Array<[string, React.ReactNode]> = [
    ['Total users', s.users], ['Bookings', s.bookings], ['Confirmed', s.confirmed], ['Pending payment', s.pendingPayments],
    ['Revenue captured', inr(s.revenuePaise || 0)], ['Refunded', inr(s.refundedPaise || 0)], ['Cancelled', s.cancelled], ['Open tickets', s.openTickets],
  ]
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map(([k, v]) => (
          <div key={k} className="card p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{k}</p><p className="mt-1 text-xl font-extrabold">{v ?? '—'}</p></div>
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="mb-3 font-bold">Top routes by bookings</h2>
          <ul className="space-y-2 text-sm">
            {(s.topRoutes || []).map((r: any) => <li key={r.route} className="flex items-center justify-between"><span>{r.route}</span><b>{r.bookings}</b></li>)}
            {!s.topRoutes?.length && <li className="text-slate-400">No bookings yet — make a test booking from the search flow.</li>}
          </ul>
        </div>
        <div className="card p-5">
          <h2 className="mb-3 font-bold">Operator performance</h2>
          <ul className="space-y-2 text-sm">
            {(s.operatorPerf || []).slice(0, 6).map((o: any) => (
              <li key={o.name} className="flex items-center justify-between"><span className="truncate">{o.name}{o.verified ? ' ✓' : ''}</span><b>{o.bookings} bookings · ★{Number(o.rating).toFixed(1)}</b></li>
            ))}
          </ul>
          <p className="mt-3 rounded-lg bg-slate-50 p-2 text-xs text-slate-500 dark:bg-slate-800">Search→booking conversion: <b>{s.conversion?.searches ?? 0} searches → {s.conversion?.bookings ?? 0} bookings ({s.conversion?.pct ?? 0}%)</b></p>
        </div>
      </div>
    </div>
  )
}

function Table({ endpoint, columns, money = [] }: { endpoint: string; columns: string[]; money?: string[] }) {
  const [rows, setRows] = useState<any[] | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => { api<any[]>(endpoint).then(setRows).catch((e) => { setErr(e.message); setRows([]) }) }, [endpoint])
  if (err) return <p className="text-sm text-rose-600">{err}</p>
  if (!rows) return <Skeleton className="h-64" />
  if (!rows.length) return <EmptyState icon={I.search} title="Nothing here yet" />
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400 dark:border-slate-700">{columns.map((c) => <th key={c} className="px-4 py-3">{c.replace(/_/g, ' ')}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => (
          <tr key={i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 dark:border-slate-700/50 dark:hover:bg-slate-800/50">
            {columns.map((c) => <td key={c} className="max-w-64 truncate px-4 py-3">{money.includes(c) ? inr(r[c] || 0) : String(r[c] ?? '')}</td>)}
          </tr>
        ))}</tbody>
      </table>
    </div>
  )
}

function Users() {
  const [rows, setRows] = useState<any[] | null>(null)
  const load = () => api<any[]>('/api/admin/users').then(setRows).catch(() => setRows([]))
  useEffect(() => { load() }, [])
  if (!rows) return <Skeleton className="h-64" />
  return (
    <div className="card overflow-x-auto"><table className="w-full text-sm">
      <thead><tr className="border-b text-left text-xs uppercase text-slate-400"><th className="px-4 py-3">Name</th><th>Phone</th><th>Email</th><th>Role</th><th>Loyalty</th><th className="px-4">Change role</th></tr></thead>
      <tbody>{rows.map((u) => (
        <tr key={u.id} className="border-b border-slate-100 dark:border-slate-700/50">
          <td className="px-4 py-3 font-semibold">{u.name}</td><td>{u.phone || '—'}</td><td>{u.email || '—'}</td>
          <td><span className="badge-slate">{u.role}</span></td><td>{u.loyalty_points}</td>
          <td className="px-4 py-2">
            <select className="rounded-lg border border-slate-200 bg-transparent px-2 py-1 text-xs dark:border-slate-700" value={u.role} disabled={u.id === 1}
              onChange={async (e) => { try { await api(`/api/admin/users/${u.id}/role`, { method: 'PATCH', body: { role: e.target.value } }); load() } catch (er: any) { alert(er.message) } }}>
              {['traveller', 'operator', 'support', 'admin'].map((r) => <option key={r}>{r}</option>)}
            </select>
          </td>
        </tr>
      ))}</tbody></table></div>
  )
}

function CouponsAdmin() {
  const { toast } = useApp()
  const [rows, setRows] = useState<any[]>([])
  const [f, setF] = useState({ code: '', description: '', kind: 'flat', value: '', minFare: '', maxDisc: '' })
  const load = () => api<any[]>('/api/admin/coupons').then(setRows).catch(() => undefined)
  useEffect(() => { load() }, [])
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div className="card overflow-x-auto"><table className="w-full text-sm">
        <thead><tr className="border-b text-left text-xs uppercase text-slate-400"><th className="px-4 py-3">Code</th><th>Type</th><th>Value</th><th>Used</th><th>Active</th></tr></thead>
        <tbody>{rows.map((c) => (
          <tr key={c.code} className="border-b border-slate-100 dark:border-slate-700/50">
            <td className="px-4 py-3 font-mono font-bold">{c.code}</td><td>{c.kind}</td>
            <td>{c.kind === 'flat' ? inr(c.value_paise) : `${c.value_paise}%`}</td><td>{c.used_count}{c.per_user_limit ? `/${c.per_user_limit * 1000}` : ''}</td>
            <td><button className={`chip ${c.active ? 'badge-green' : 'badge-red'}`} onClick={async () => { await api(`/api/admin/coupons/${c.code}`, { method: 'PATCH', body: { active: !c.active } }); load() }}>{c.active ? 'on' : 'off'}</button></td>
          </tr>
        ))}</tbody></table></div>
      <form className="card h-max space-y-3 p-5" onSubmit={async (e) => {
        e.preventDefault()
        try {
          await api('/api/admin/coupons', { method: 'POST', body: { code: f.code, description: f.description, kind: f.kind, valuePaise: f.kind === 'flat' ? Math.round(Number(f.value) * 100) : Number(f.value), minFarePaise: Math.round(Number(f.minFare || 0) * 100), maxDiscountPaise: f.maxDisc ? Math.round(Number(f.maxDisc) * 100) : undefined } })
          toast('success', `Coupon ${f.code.toUpperCase()} created.`); setF({ ...f, code: '', description: '', value: '' }); load()
        } catch (er: any) { toast('error', er.message) }
      }}>
        <h2 className="font-bold">New coupon</h2>
        <input className="input uppercase" placeholder="CODE" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} required minLength={4} />
        <input className="input" placeholder="Description" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} required />
        <select className="input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="flat">Flat ₹ off</option><option value="percent">Percent %</option></select>
        <input className="input" placeholder={f.kind === 'flat' ? 'Amount ₹' : 'Percent'} inputMode="decimal" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} required />
        <input className="input" placeholder="Min fare ₹ (default 199)" inputMode="decimal" value={f.minFare} onChange={(e) => setF({ ...f, minFare: e.target.value })} />
        <button className="btn-primary w-full">Create coupon</button>
      </form>
    </div>
  )
}

function OperatorsAdmin() {
  const { toast } = useApp()
  const [rows, setRows] = useState<any[]>([])
  const [f, setF] = useState({ name: '', phone: '', city: '' })
  const load = () => api<any[]>('/api/operators').then(setRows).catch(() => undefined)
  useEffect(() => { load() }, [])
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <ul className="grid gap-3 sm:grid-cols-2">
        {rows.map((o) => (
          <li key={o.id} className="card p-4">
            <div className="flex items-center justify-between"><b>{o.name}</b>
              <Tip label="Toggle verified badge"><button className={`chip ${o.verified ? 'badge-green' : 'badge-slate'}`} onClick={async () => { await api(`/api/admin/operators/${o.id}`, { method: 'PATCH', body: { verified: !o.verified } }); load() }}>✓ {o.verified ? 'Verified' : 'Unverified'}</button></Tip>
            </div>
            <p className="text-xs text-slate-500">{o.city} · {o.phone || 'no phone'} · rating {Number(o.rating).toFixed(1)} ({o.review_count})</p>
            <p className="mt-1 line-clamp-2 text-[11px] text-slate-400">{o.cancellation_policy}</p>
          </li>
        ))}
      </ul>
      <form className="card h-max space-y-3 p-5" onSubmit={async (e) => {
        e.preventDefault()
        try { await api('/api/admin/operators', { method: 'POST', body: f }); toast('success', `${f.name} onboarded.`); setF({ name: '', phone: '', city: '' }); load() } catch (er: any) { toast('error', er.message) }
      }}>
        <h2 className="font-bold">Onboard operator</h2>
        <input className="input" placeholder="Operator name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
        <input className="input" placeholder="Contact phone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        <input className="input" placeholder="HQ city" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} />
        <button className="btn-primary w-full">Add operator</button>
        <p className="text-[11px] text-slate-400">Buses/schedules for new operators can be seeded via server/seed.ts — kept out of this UI on purpose (demo scope).</p>
      </form>
    </div>
  )
}

function Tickets() {
  const { toast } = useApp()
  const [rows, setRows] = useState<any[]>([])
  const load = () => api<any[]>('/api/admin/tickets').then(setRows).catch(() => undefined)
  useEffect(() => { load() }, [])
  return (
    <ul className="space-y-3">
      {rows.map((tk) => (
        <li key={tk.id} className="card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <b>{tk.subject}</b><span className={`chip ${tk.status === 'open' ? 'badge-amber' : tk.status === 'resolved' ? 'badge-green' : 'badge-slate'}`}>{tk.status}</span>
            <span className="ml-auto text-xs text-slate-400">{tk.category} · booking #{tk.booking_id || '—'} · {new Date(tk.created_at).toLocaleString('en-IN')}</span>
          </div>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{tk.message}</p>
          {tk.agent_reply && <p className="mt-2 rounded-lg bg-emerald-50 p-2 text-xs text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"><b>Agent:</b> {tk.agent_reply}</p>}
          {tk.status !== 'resolved' && (
            <form className="mt-3 flex gap-2" onSubmit={async (e) => {
              e.preventDefault(); const el = (e.target as any).reply
              try { await api(`/api/admin/tickets/${tk.id}`, { method: 'PATCH', body: { status: 'resolved', reply: el.value } }); toast('success', 'Ticket resolved & traveller notified.'); load() } catch (er: any) { toast('error', er.message) }
            }}>
              <input name="reply" className="input" placeholder="Reply to traveller…" required minLength={5} />
              <button className="btn-primary shrink-0">Resolve</button>
            </form>
          )}
        </li>
      ))}
      {!rows.length && <EmptyState icon={I.chat} title="No support tickets" hint="Raise one from the help centre to see it here." />}
    </ul>
  )
}
