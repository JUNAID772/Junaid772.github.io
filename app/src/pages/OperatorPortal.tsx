// /operator — schedule management + passenger manifest for the logged-in operator.
import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { Icon, I, Skeleton, EmptyState } from '../components/ui'
import { useApp } from '../lib/state'
import { inr, fmtDateLong } from '../lib/i18n'

export default function OperatorPortal() {
  const { user, toast } = useApp()
  const [data, setData] = useState<any | null>(null)
  const [err, setErr] = useState('')
  const [edit, setEdit] = useState<number | null>(null)
  const [manifest, setManifest] = useState<{ id: number; rows: any[] } | null>(null)
  const load = () => api<any>('/api/operator/overview').then(setData).catch((e) => setErr(e.message))
  useEffect(() => { if (user?.role === 'operator') load() }, [user])
  if (!user || user.role !== 'operator') {
    return <EmptyState icon={I.bus} title="Operator accounts only" hint="Sign in with the demo operator account (operator@safargo.example / demo1234) or ask an admin to assign the operator role." action={<Link to="/login?next=/operator" className="btn-primary">Sign in</Link>} />
  }
  if (err) return <p className="text-sm text-rose-600">{err}</p>
  if (!data) return <Skeleton className="h-96" />
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-extrabold">Operator portal</h1>
          <p className="text-sm text-slate-500">Inventory syncs to central booking search instantly. Revenue share settlement is out of demo scope.</p></div>
        <div className="card px-5 py-3 text-right"><p className="text-xs uppercase text-slate-400">Confirmed revenue</p><p className="text-xl font-extrabold text-emerald-600">{inr(data.revenuePaise || 0)}</p></div>
      </div>

      <h2 className="mb-2 font-bold">Upcoming schedules ({data.upcoming.length})</h2>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400 dark:border-slate-700">
            <th className="px-4 py-3">Route</th><th>Bus</th><th>Date & time</th><th>Fare</th><th>Occupancy</th><th className="px-4">Actions</th></tr></thead>
          <tbody>{data.upcoming.map((s: any) => (
            <tr key={s.id} className="border-b border-slate-100 last:border-0 dark:border-slate-700/50">
              <td className="px-4 py-3 font-semibold">{s.route}</td>
              <td>{s.bus_name}<div className="text-xs text-slate-400">{s.bus_type}</div></td>
              <td>{fmtDateLong(s.depart_date)} {s.depart_time}</td>
              <td>{edit === s.id ? <EditFare s={s} onDone={() => { setEdit(null); load() }} onError={(m) => toast('error', m)} /> : inr(s.fare_paise)}</td>
              <td><OccBar booked={s.booked} total={s.total} /></td>
              <td className="whitespace-nowrap px-4 py-2">
                <button className="btn-outline !py-1.5 text-xs" onClick={async () => {
                  try { const rows = await api<any[]>(`/api/operator/schedules/${s.id}/manifest`); setManifest({ id: s.id, rows }) } catch (e: any) { toast('error', e.message) }
                }}><Icon d={I.users} size={13} /> Manifest</button>
                <button className="btn-ghost !py-1.5 text-xs ml-1" onClick={() => setEdit(edit === s.id ? null : s.id)}>{edit === s.id ? 'Cancel' : 'Re-price'}</button>
              </td>
            </tr>
          ))}{!data.upcoming.length && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No upcoming schedules seeded for this operator.</td></tr>}</tbody>
        </table>
      </div>

      <h2 className="mb-2 mt-8 font-bold">Fleet ({data.buses.length} buses)</h2>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data.buses.map((b: any) => (
          <li key={b.id} className="card p-4"><b>{b.bus_name}</b><p className="text-xs text-slate-500">{b.bus_type} · reg {b.registration || '—'} · {Object.keys(JSON.parse(b.layout || '{}')).length ? '' : ''}{(JSON.parse(b.seats_layout || b.layout || '{}'), '')}</p>
            <p className="text-xs text-slate-500">{b.registration ? '' : ''}</p></li>
        ))}
      </ul>

      {manifest && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/50 p-4" onClick={() => setManifest(null)}>
          <div className="card max-h-[80vh] w-full max-w-lg overflow-auto p-5 animate-fadeUp" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Passenger manifest">
            <div className="mb-3 flex items-center justify-between"><h3 className="font-bold">Manifest · schedule #{manifest.id}</h3><button className="btn-ghost" onClick={() => setManifest(null)}><Icon d={I.x} /></button></div>
            {!manifest.rows.length ? <p className="text-sm text-slate-400">No confirmed passengers yet.</p> : (
              <table className="w-full text-sm"><thead><tr className="border-b text-left text-xs uppercase text-slate-400"><th className="py-2">Seat</th><th>Name</th><th>Age/Gender</th><th>PNR</th><th>Phone</th></tr></thead>
                <tbody>{manifest.rows.map((p: any, i: number) => <tr key={i} className="border-b border-dashed border-slate-100 dark:border-slate-700/60"><td className="py-2 font-bold">{p.seat_no}</td><td>{p.name}</td><td>{p.age}/{p.gender?.[0]}</td><td className="font-mono">{p.pnr}</td><td>{p.contact_phone}</td></tr>)}</tbody></table>
            )}
            <p className="mt-3 text-[11px] text-slate-400">Personal data shown here must be used only for journey operations per DPDP-style purpose limitation.</p>
          </div>
        </div>
      )}
    </div>
  )
}

function OccBar({ booked, total }: { booked: number; total: number }) {
  const pct = total ? Math.round((booked / total) * 100) : 0
  return <div className="flex items-center gap-2"><div className="h-2 w-20 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"><div className={`h-full ${pct > 80 ? 'bg-rose-500' : pct > 50 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} /></div><span className="text-xs text-slate-500">{booked}/{total}</span></div>
}

function EditFare({ s, onDone, onError }: { s: any; onDone: () => void; onError: (m: string) => void }) {
  const [val, setVal] = useState(String(Math.round(s.fare_paise / 100)))
  return (
    <form className="flex gap-1" onSubmit={async (e) => {
      e.preventDefault()
      try { const r = await api<any>(`/api/operator/schedules/${s.id}`, { method: 'PATCH', body: { farePaise: Math.round(Number(val) * 100) } }); alert(r.note); onDone() } catch (er: any) { onError(er.message) }
    }}>
      <input autoFocus inputMode="decimal" className="w-20 rounded-lg border border-slate-300 bg-transparent px-2 py-1 text-xs dark:border-slate-600" value={val} onChange={(e) => setVal(e.target.value)} />
      <button className="btn-primary !px-2 !py-1 text-xs">Save</button>
    </form>
  )
}
