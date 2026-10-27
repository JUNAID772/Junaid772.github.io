// /seat/:id — interactive seat map, boarding/drop selection, 8-min hold countdown.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import { Icon, I, Skeleton, ErrorNote, Tip, useConfirm } from '../components/ui'
import { useApp } from '../lib/state'
import { inr, fmtDur, fmtDateLong } from '../lib/i18n'

type Seat = { seat_no: string; deck: 'lower' | 'upper'; kind: 'regular' | 'ladies'; price_paise: number; status: 'available' | 'held' | 'booked' }
type Stop = { id: number; kind: 'boarding' | 'dropping'; name: string; time_offset_min: number }
type Sched = any

export default function SeatSelect() {
  const { id } = useParams()
  const [sp] = useSearchParams()
  const nav = useNavigate()
  const { toast, user } = useApp()
  const { confirm, confirmNode } = useConfirm()

  const [data, setData] = useState<{ schedule: Sched; seats: Seat[]; stops: Stop[] } | null>(null)
  const [loadErr, setLoadErr] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [hold, setHold] = useState<{ token: string; expiresAt: string } | null>(null)
  const [secsLeft, setSecsLeft] = useState(0)
  const [busy, setBusy] = useState(false)
  const [boarding, setBoarding] = useState<number | null>(null)
  const [dropping, setDropping] = useState<number | null>(null)
  const [fare, setFare] = useState<{ base: number; fee: number; total: number } | null>(null)
  const timerRef = useRef<number | null>(null)

  const load = useCallback(async () => {
    setLoadErr('')
    try {
      const d = await api<any>(`/api/schedules/${id}`)
      setData(d)
      // restore server truth about held seats of a previous attempt is intentionally not done — fresh page = fresh selection
    } catch (e: any) { setLoadErr(e.message) }
  }, [id])
  useEffect(() => { load() }, [load])

  // Live refresh of seat statuses every 20s while no hold is active (real-time availability when backend supports it)
  useEffect(() => {
    if (hold) return
    const iv = window.setInterval(() => {
      api<any>(`/api/schedules/${id}`).then((d) => {
        setData((prev) => prev ? { ...prev, seats: d.seats } : prev)
        setSelected((sel) => {
          const stillOk = sel.filter((no) => d.seats.find((s: Seat) => s.seat_no === no && s.status === 'available'))
          if (stillOk.length !== sel.length) toast('info', 'Some seats were just taken by other travellers — your selection was updated.')
          return stillOk
        })
      }).catch(() => undefined)
    }, 20_000)
    return () => clearInterval(iv)
  }, [hold, id, toast])

  // Hold countdown
  useEffect(() => {
    if (!hold) return
    const tick = () => {
      const left = Math.max(0, Math.floor((new Date(hold.expiresAt).getTime() - Date.now()) / 1000))
      setSecsLeft(left)
      if (left === 0) { setHold(null); setSelected([]); toast('error', 'Your seat hold expired. Seats are back on sale — please reselect.') }
    }
    tick()
    timerRef.current = window.setInterval(tick, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [hold])

  // Fare quote whenever selection changes (server-side single source of truth)
  useEffect(() => {
    if (!selected.length) { setFare(null); return }
    api<any>('/api/quote', { method: 'POST', body: { scheduleId: Number(id), seats: selected } })
      .then(setFare).catch((e) => { toast('error', e.message) })
  }, [selected, id, toast])

  const toggleSeat = async (s: Seat) => {
    if (s.status !== 'available' && !selected.includes(s.seat_no)) {
      toast('info', s.status === 'booked' ? `Seat ${s.seat_no} is already sold.` : `Seat ${s.seat_no} is temporarily held by another traveller.`)
      return
    }
    if (selected.includes(s.seat_no)) {
      const next = selected.filter((x) => x !== s.seat_no)
      setSelected(next)
      if (hold && !next.length) { api(`/api/hold/${hold.token}`, { method: 'DELETE', body: {} }).catch(() => undefined); setHold(null) }
      else if (hold) { // re-hold with new set
        try { const r = await api<any>('/api/hold', { method: 'POST', body: { scheduleId: Number(id), seats: next } }); setHold({ token: r.holdToken, expiresAt: r.expiresAt }) }
        catch (e: any) { toast('error', e.message) }
      }
      return
    }
    if (selected.length >= 6) { toast('info', 'A single booking can hold up to 6 seats.'); return }
    const next = [...selected, s.seat_no]
    setSelected(next)
    if (user || true) {
      try {
        const r = await api<any>('/api/hold', { method: 'POST', body: { scheduleId: Number(id), seats: next } })
        setHold({ token: r.holdToken, expiresAt: r.expiresAt })
        if (!user) toast('info', 'Seats held for 8 minutes. Sign in at checkout to keep your booking linked to your account.')
      } catch (e: any) {
        setSelected(selected) // revert
        if (e.data?.unavailable) {
          setData((prev) => prev ? { ...prev, seats: prev.seats.map((x) => e.data.unavailable.includes(x.seat_no) ? { ...x, status: 'booked' } : x) } : prev)
        }
        toast('error', e.message)
      }
    }
  }

  const releaseHold = async () => {
    if (hold && await confirm('Release seat hold?', 'The selected seats will go back on sale immediately.')) {
      api(`/api/hold/${hold.token}`, { method: 'DELETE', body: {} }).catch(() => undefined)
      setHold(null); setSelected([])
    }
  }
  const refreshHold = async () => {
    if (!hold) return
    try { const r = await api<any>(`/api/hold/${hold.token}/refresh`, { method: 'POST', body: {} }); setHold({ ...hold, expiresAt: r.expiresAt }); toast('success', 'Hold extended by 8 minutes.') }
    catch (e: any) { toast('error', e.message); setHold(null); setSelected([]) }
  }

  const proceed = () => {
    if (!selected.length) { toast('error', 'Pick at least one seat to continue.'); return }
    if (!boarding || !dropping) { toast('error', 'Choose both a boarding point and a drop point.'); return }
    sessionStorage.setItem('sg_checkout', JSON.stringify({
      scheduleId: Number(id), seats: selected, holdToken: hold?.token, boardingStopId: boarding, droppingStopId: dropping,
      from: sp.get('from'), to: sp.get('to'), date: sp.get('date'),
    }))
    nav(`/checkout`)
  }

  if (loadErr) return <ErrorNote msg={loadErr} onRetry={load} />
  if (!data) return <div className="space-y-4"><Skeleton className="h-8 w-72" /><Skeleton className="h-96" /></div>

  const s = data.schedule
  const seatByNo = (no: string) => data.seats.find((x) => x.seat_no === no)
  const layout = JSON.parse(s.layout || '{"type":"seater"}')
  const lower = data.seats.filter((x) => x.deck === 'lower')
  const upper = data.seats.filter((x) => x.deck === 'upper')
  const boardStops = data.stops.filter((x) => x.kind === 'boarding')
  const dropStops = data.stops.filter((x) => x.kind === 'dropping')

  // Build grid rows from pattern in layout (fallback: sequential pairs)
  const renderDeck = (deckSeats: Seat[], pattern: string[]) => {
    const cellsPerRow = pattern.length
    const rows: Seat[][] = []
    let i = 0
    while (i < deckSeats.length) { rows.push(deckSeats.slice(i, i + countSeats(pattern))); i += countSeats(pattern) }
    return rows.map((row, ri) => (
      <div key={ri} className="flex items-center gap-1.5">
        {pattern.map((cell, ci) => {
          if (cell === 'AISLE') return <div key={ci} className="seat-aisle" aria-hidden="true" />
          // find seat index within row: order of non-aisle cells
          const idxInRow = pattern.slice(0, ci + 1).filter((c) => c !== 'AISLE').length - 1
          const st = row[idxInRow]
          if (!st) return <div key={ci} className="seat seat-aisle opacity-0" aria-hidden="true" />
          const isSel = selected.includes(st.seat_no)
          const cls = isSel ? 'seat-selected' : st.status === 'booked' ? 'seat-booked' : st.status === 'held' ? 'seat-held' : st.kind === 'ladies' ? 'seat-ladies' : 'seat-available'
          const label = `${st.seat_no} ${st.deck} ${st.kind === 'ladies' ? 'ladies reserved' : ''} ${st.status}, ${inr(st.price_paise)}`
          return (
            <button key={ci} onClick={() => toggleSeat(st)} aria-label={label} aria-pressed={isSel} title={label}
              className={`seat ${cls}`}>
              {st.seat_no}{cell.startsWith('W') && <span className="absolute text-[8px]" aria-hidden="true" />}
            </button>
          )
        })}
      </div>
    ))
  }
  function countSeats(pattern: string[]) { return pattern.filter((c) => c !== 'AISLE').length }

  const seaterPattern = ['W', 'S', 'A', 'IS', 'IS', 'A', 'S', 'W']

  return (
    <div className="mx-auto max-w-5xl">
      {confirmNode}
      {/* Trip header */}
      <div className="card mb-5 p-5">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <button className="btn-ghost !px-2" onClick={() => nav(-1)} aria-label="Back to results"><Icon d={I.arrowL} size={18} /></button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-extrabold">{s.operator} · {s.bus_name}</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">{s.bus_type} · {s.source_city} → {s.dest_city} · {fmtDateLong(sp.get('date') || s.depart_date)}</p>
          </div>
          <div className="flex items-center gap-4 text-sm font-bold">
            <span>{s.depart_time} <span className="font-normal text-slate-400">dep</span></span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500 dark:bg-slate-800">{fmtDur(s.duration_min)}</span>
            <span>{arrOf(s.depart_time, s.duration_min)} <span className="font-normal text-slate-400">arr</span></span>
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        {/* Seat map */}
        <section className="card p-5" aria-label="Seat selection">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-extrabold">Choose your seats</h2>
            {hold && (
              <div className="flex items-center gap-2 text-xs font-bold" role="timer" aria-live="polite">
                <span className={`chip ${secsLeft < 60 ? 'badge-red' : 'badge-amber'}`}><Icon d={I.clock} size={12} />Hold expires in {Math.floor(secsLeft / 60)}:{String(secsLeft % 60).padStart(2, '0')}</span>
                <Tip label="Extend hold by 8 minutes"><button className="btn-ghost !px-2 !py-1" onClick={refreshHold} aria-label="Refresh seat hold"><Icon d={I.refresh} size={14} /></button></Tip>
                <Tip label="Release all held seats"><button className="btn-ghost !px-2 !py-1 text-rose-600" onClick={releaseHold} aria-label="Release seat hold"><Icon d={I.trash} size={14} /></button></Tip>
              </div>
            )}
          </div>

          {/* Legend */}
          <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-500 dark:text-slate-400" aria-label="Seat legend">
            <span className="flex items-center gap-1.5"><span className="seat seat-available !h-5 !w-5 !rounded-md" />Available</span>
            <span className="flex items-center gap-1.5"><span className="seat seat-selected !h-5 !w-5 !rounded-md" />Selected</span>
            <span className="flex items-center gap-1.5"><span className="seat seat-booked !h-5 !w-5 !rounded-md" />Sold</span>
            <span className="flex items-center gap-1.5"><span className="seat seat-held !h-5 !w-5 !rounded-md" />Held by others</span>
            <span className="flex items-center gap-1.5"><span className="seat seat-ladies !h-5 !w-5 !rounded-md" />Ladies reserved</span>
            <span className="flex items-center gap-1.5"><Icon d={I.eye} size={13} />W = window · aisle shown as gap</span>
          </div>

          <div className="overflow-x-auto pb-2">
            <div className="mx-auto w-max space-y-6 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-700 dark:bg-slate-900/40">
              <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wide text-slate-400"><span>🚌 Front · driver</span><span>{selected.length}/6 seats</span></div>
              {layout.type === 'sleeper' ? (
                <>
                  <div><h3 className="mb-2 text-xs font-bold text-slate-500 dark:text-slate-400">Lower deck</h3><div className="space-y-1.5">{renderDeck(lower, layout.lowerPattern || seaterPattern)}</div></div>
                  <div className="border-t border-dashed border-slate-300 dark:border-slate-700" />
                  <div><h3 className="mb-2 text-xs font-bold text-slate-500 dark:text-slate-400">Upper deck</h3><div className="space-y-1.5">{renderDeck(upper, layout.upperPattern || seaterPattern)}</div></div>
                </>
              ) : (
                <div><div className="space-y-1.5">{renderDeck(lower, seaterPattern)}</div></div>
              )}
            </div>
          </div>

          <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
            Seat prices vary by berth & position (window berths may cost more). Ladies-reserved berths require a female passenger as per operator policy.
            Seats are only reserved after the server confirms an 8-minute hold — never before.
          </p>
        </section>

        {/* Right rail */}
        <aside className="space-y-4">
          <div className="card p-5">
            <h3 className="mb-3 font-bold">Boarding point</h3>
            <div className="space-y-2">
              {boardStops.map((st) => (
                <label key={st.id} className={`flex cursor-pointer items-start gap-2 rounded-xl border p-3 text-sm transition-colors ${boarding === st.id ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/30' : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'}`}>
                  <input type="radio" name="boarding" className="mt-0.5 accent-brand-600" checked={boarding === st.id} onChange={() => setBoarding(st.id)} />
                  <span><b>{st.name}</b><span className="block text-xs text-slate-500">+{st.time_offset_min} min after departure</span></span>
                </label>
              ))}
              {!boardStops.length && <p className="text-xs text-slate-400">Operator hasn’t published boarding points for this trip.</p>}
            </div>
            <h3 className="mb-3 mt-5 font-bold">Drop point</h3>
            <div className="space-y-2">
              {dropStops.map((st) => (
                <label key={st.id} className={`flex cursor-pointer items-start gap-2 rounded-xl border p-3 text-sm transition-colors ${dropping === st.id ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/30' : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'}`}>
                  <input type="radio" name="dropping" className="mt-0.5 accent-brand-600" checked={dropping === st.id} onChange={() => setDropping(st.id)} />
                  <span><b>{st.name}</b></span>
                </label>
              ))}
              {!dropStops.length && <p className="text-xs text-slate-400">No drop points listed.</p>}
            </div>
          </div>

          {/* Price summary */}
          <div className="card sticky bottom-4 p-5" aria-live="polite">
            <h3 className="mb-3 font-bold">Fare summary</h3>
            {!selected.length ? <p className="text-sm text-slate-400">Select seats to see the live fare.</p> : !fare ? <Skeleton className="h-20" /> : (
              <div className="space-y-1.5 text-sm">
                {selected.map((no) => { const st = seatByNo(no); return st ? <div key={no} className="flex justify-between"><span>Seat {no} ({st.deck})</span><b>{inr(st.price_paise)}</b></div> : null })}
                <div className="flex justify-between border-t border-dashed pt-1.5 dark:border-slate-700"><span>Base fare</span><b>{inr(fare.base)}</b></div>
                <div className="flex justify-between text-slate-500"><span>Convenience fee + taxes</span><span>{inr(fare.fee)}</span></div>
                <div className="flex justify-between text-base font-extrabold"><span>Total payable</span><span className="text-emerald-600 dark:text-emerald-400">{inr(fare.total)}</span></div>
              </div>
            )}
            <button className="btn-primary btn-lg mt-4 w-full" onClick={proceed} disabled={!selected.length}>Continue · {selected.length ? inr(fare?.total ?? 0) : 'pick seats'}</button>
            <p className="mt-2 text-center text-[11px] text-slate-400">Coupon & travel credit applied at the next step.</p>
          </div>
        </aside>
      </div>
    </div>
  )
}

function arrOf(depart: string, dur: number) {
  const [h, m] = depart.split(':').map(Number)
  const t = new Date(); t.setUTCHours(h, m, 0, 0); t.setUTCMinutes(t.getUTCMinutes() + dur)
  return `${String(t.getUTCHours()).padStart(2, '0')}:${String(t.getUTCMinutes()).padStart(2, '0')}`
}
