// /confirmation/:bookingId — success screen + e-ticket actions.
import React, { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import { Icon, I, Skeleton } from '../components/ui'
import { useApp } from '../lib/state'
import { inr, fmtDateLong, fmtDur } from '../lib/i18n'

export default function Confirmation() {
  const { id } = useParams()
  const { user, toast } = useApp()
  const [b, setB] = useState<any | null>(null)
  const [err, setErr] = useState('')

  const load = () => api<any>(`/api/bookings/${id}`).then(setB).catch((e) => setErr(e.message))
  useEffect(() => { if (user) load(); else setErr('guest') }, [id, user])

  if (err === 'guest') {
    return <div className="mx-auto max-w-md text-center">
      <div className="card p-8">
        <div className="animate-pop mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40"><Icon d={I.check} size={32} /></div>
        <h1 className="mt-4 text-xl font-extrabold">Payment received — booking confirmed!</h1>
        <p className="mt-2 text-sm text-slate-500">Your seats are locked in. Guest bookings aren’t linked to an account yet — sign in or register to save this trip to My bookings, get live tracking and travel alerts.</p>
        <div className="mt-5 flex justify-center gap-3"><Link to="/login" className="btn-primary">Sign in to view ticket</Link><Link to="/" className="btn-outline">Book another</Link></div>
      </div>
    </div>
  }
  if (err) return <div className="mx-auto max-w-md"><div className="card p-6 text-sm text-rose-600">{err}</div></div>
  if (!b) return <div className="mx-auto max-w-lg space-y-4"><Skeleton className="h-24" /><Skeleton className="h-64" /></div>

  const bk = b.booking, sc = b.schedule
  return (
    <div className="mx-auto max-w-2xl">
      <div className="card overflow-hidden">
        <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 p-6 text-center text-white">
          <div className="animate-pop mx-auto grid h-14 w-14 place-items-center rounded-full bg-white/20 backdrop-blur"><Icon d={I.check} size={30} /></div>
          <h1 className="mt-3 text-2xl font-extrabold">Booking confirmed 🎉</h1>
          <p className="text-sm text-white/85">PNR <b className="font-mono">{bk.pnr}</b> · {bk.passengers?.length || b.passengers.length} seat(s) paid {inr(bk.total_paise)}</p>
        </div>
        <div className="space-y-4 p-6">
          <div className="flex items-center justify-between rounded-xl bg-slate-50 p-4 dark:bg-slate-900/50">
            <div>
              <div className="font-extrabold">{sc.source_city} → {sc.dest_city}</div>
              <div className="text-xs text-slate-500">{sc.operator} · {sc.bus_name} ({sc.bus_type})</div>
            </div>
            <div className="text-right text-sm font-bold">{fmtDateLong(sc.depart_date)}<div className="text-xs font-normal text-slate-500">{sc.depart_time} · {fmtDur(sc.duration_min)}</div></div>
          </div>

          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400 dark:border-slate-700"><th className="py-2">Seat</th><th>Passenger</th><th className="text-right">Age</th></tr></thead>
            <tbody>{b.passengers.map((p: any) => (
              <tr key={p.id} className="border-b border-dashed border-slate-100 dark:border-slate-700/60"><td className="py-2 font-bold">{p.seat_no}</td><td>{p.name}</td><td className="text-right">{p.age}</td></tr>
            ))}</tbody>
          </table>

          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <p className="flex items-center gap-2"><Icon d={I.pin} size={15} className="text-brand-600 dark:text-brand-300" />Boarding: <b>{b.boarding?.name}</b></p>
            <p className="flex items-center gap-2"><Icon d={I.pin} size={15} className="text-accent-600" />Drop: <b>{b.dropping?.name}</b></p>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-800 dark:border-amber-800/60 dark:bg-amber-900/30 dark:text-amber-200">
            <b>Reach the boarding point 15 minutes early.</b> Carry a government photo ID matching the passenger name. Cancellation as per operator policy: {sc.cancellation_policy || 'see help centre.'}
          </div>

          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" onClick={() => window.open(`/api/bookings/${bk.id}/ticket`, '_blank')}><Icon d={I.download} size={16} />Download / print e-ticket</button>
            <Link to="/me" className="btn-outline"><Icon d={I.ticket} size={16} />My bookings</Link>
            <Link to="/" className="btn-outline">Book return trip</Link>
            <button className="btn-ghost" onClick={() => navigator.clipboard?.writeText(bk.pnr).then(() => toast('success', 'PNR copied.'))}><Icon d={I.copy} size={15} />Copy PNR</button>
          </div>
          {!user && <p className="text-[11px] text-slate-400">Tip: create an account with this mobile number to see this booking under My bookings.</p>}
        </div>
      </div>
    </div>
  )
}
