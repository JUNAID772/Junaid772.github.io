// /search — results list with filters, sorting, active chips, no-results state.
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import { Icon, I, Stars, BusCardSkeleton, EmptyState, ErrorNote, Tip } from '../components/ui'
import { SearchWidget } from '../components/SearchWidget'
import { useApp } from '../lib/state'
import { inr, fmtDur, fmtDateLong, addDays, todayIST } from '../lib/i18n'

const AMENITY_LABELS: Record<string, string> = {
  wifi: 'Wi-Fi', charging: 'Charging port', blanket: 'Blanket', water: 'Water bottle',
  entertainment: 'Entertainment', 'reading-light': 'Reading light', 'live-tracking': 'Live tracking', 'women-only-crew': 'Women crew',
}

type Bus = {
  schedule_id: number; depart_date?: string; operator: string; operator_id: number; verified: number; women_friendly: number
  bus_name: string; bus_type: string; depart_time: string; duration_min: number; fare_paise: number
  available_seats: number; min_fare_paise: number; op_rating: number; op_reviews: number
  free_cancellation: number; amenities: string; layout: string; cancellation_policy: string
  stops: Array<{ id: number; kind: string; name: string; time_offset_min: number }>
}

const TIME_SLOTS = [['Any time', 0, 24], ['Early morning (before 6)', 0, 6], ['Morning (6–12)', 6, 12], ['Afternoon (12–17)', 12, 17], ['Evening (17–21)', 17, 21], ['Night (after 21)', 21, 24]] as const

export default function Results() {
  const [sp] = useSearchParams()
  const nav = useNavigate()
  const { toast, user } = useApp()
  const from = sp.get('from') || '', to = sp.get('to') || '', date = sp.get('date') || '', pax = Number(sp.get('pax') || 1)
  const flexible = sp.get('flexible') === '1'
  const quick = sp.get('quick') === '1'
  const typeHint = sp.get('type') || ''

  const [buses, setBuses] = useState<Bus[] | null>(null)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [daysScanned, setDaysScanned] = useState<string[]>([])
  // Filters
  const [maxPrice, setMaxPrice] = useState<number | null>(null)
  const [slot, setSlot] = useState(0)
  const [acOnly, setAcOnly] = useState(false)
  const [sleeperOnly, setSleeperOnly] = useState(false)
  const [opsSel, setOpsSel] = useState<number[]>([])
  const [minRating, setMinRating] = useState(0)
  const [amenitiesSel, setAmenitiesSel] = useState<string[]>([])
  const [freeCancel, setFreeCancel] = useState(false)
  const [liveTrack, setLiveTrack] = useState(false)
  const [verifiedOnly, setVerifiedOnly] = useState(false)
  const [seatsAvail, setSeatsAvail] = useState(false)
  const [sort, setSort] = useState<'departure' | 'price' | 'duration' | 'rating'>('departure')
  const [filtersOpen, setFiltersOpen] = useState(false)

  const runSearch = useCallback(async () => {
    if (!from || !to || !date) return
    setBuses(null); setErr(''); setMsg('')
    try {
      const dates = flexible ? [addDays(date, -3), addDays(date, -2), addDays(date, -1), date, addDays(date, 1), addDays(date, 2), addDays(date, 3)] : [date]
      const results = await Promise.all(dates.map((d) => api<any>(`/api/search?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&date=${d}${user ? '&persist=1' : ''}`)))
      const merged: Bus[] = []
      const dayHits: string[] = []
      results.forEach((r, i) => {
        if (r.message) setMsg(r.message)
        for (const b of r.buses || []) merged.push({ ...b, depart_date: dates[i] })
        if ((r.buses || []).length) dayHits.push(dates[i])
      })
      setDaysScanned(dayHits)
      setBuses(merged)
      const prices = merged.map((b) => b.min_fare_paise)
      if (prices.length) setMaxPrice(Math.max(...prices))
    } catch (e: any) { setErr(e.message) ; setBuses([]) }
  }, [from, to, date, flexible, user])

  useEffect(() => { runSearch() }, [runSearch])

  const allOperators = useMemo(() => {
    const m = new Map<number, string>()
    ;(buses || []).forEach((b) => m.set(b.operator_id, b.operator))
    return [...m.entries()]
  }, [buses])

  const filtered = useMemo(() => {
    let list = (buses || []).filter((b) => b.available_seats >= pax)
    if (typeHint) list = list.filter((b) => b.bus_type.toLowerCase().includes(typeHint.toLowerCase()))
    if (maxPrice != null) list = list.filter((b) => b.min_fare_paise <= maxPrice)
    if (slot > 0) { const [, a, z] = TIME_SLOTS[slot]; const h = Number(b_departHour) ; void h; list = list.filter((b) => { const hh = Number(b.depart_time.slice(0, 2)); return hh >= a && hh < z }) }
    if (acOnly) list = list.filter((b) => /ac/i.test(b.bus_type) && !/non-ac/i.test(b.bus_type))
    if (sleeperOnly) list = list.filter((b) => /sleeper/i.test(b.bus_type))
    if (opsSel.length) list = list.filter((b) => opsSel.includes(b.operator_id))
    if (minRating) list = list.filter((b) => b.op_rating >= minRating)
    const am = (b: Bus) => JSON.parse(b.amenities || '[]') as string[]
    if (amenitiesSel.length) list = list.filter((b) => amenitiesSel.every((x) => am(b).includes(x)))
    if (freeCancel) list = list.filter((b) => b.free_cancellation)
    if (liveTrack) list = list.filter((b) => am(b).includes('live-tracking'))
    if (verifiedOnly) list = list.filter((b) => b.verified)
    if (seatsAvail) list = list.filter((b) => b.available_seats >= Math.max(pax, 4))
    const s = [...list]
    if (sort === 'price') s.sort((a, b) => a.min_fare_paise - b.min_fare_paise)
    if (sort === 'duration') s.sort((a, b) => a.duration_min - b.duration_min)
    if (sort === 'rating') s.sort((a, b) => b.op_rating - a.op_rating)
    if (sort === 'departure') s.sort((a, b) => (a.depart_date + a.depart_time).localeCompare(b.depart_date + b.depart_time))
    return s
    function b_departHour() { return 0 }
  }, [buses, maxPrice, slot, acOnly, sleeperOnly, opsSel, minRating, amenitiesSel, freeCancel, liveTrack, verifiedOnly, seatsAvail, sort, pax, typeHint])

  const clearAll = () => { setMaxPrice(null); setSlot(0); setAcOnly(false); setSleeperOnly(false); setOpsSel([]); setMinRating(0); setAmenitiesSel([]); setFreeCancel(false); setLiveTrack(false); setVerifiedOnly(false); setSeatsAvail(false) }

  const activeChips: Array<[string, () => void]> = []
  if (maxPrice != null && buses?.length && maxPrice < Math.max(...buses.map((b) => b.min_fare_paise))) activeChips.push([`≤ ${inr(maxPrice)}`, () => setMaxPrice(null)])
  if (slot > 0) activeChips.push([TIME_SLOTS[slot][0] as string, () => setSlot(0)])
  if (acOnly) activeChips.push(['AC only', () => setAcOnly(false)])
  if (sleeperOnly) activeChips.push(['Sleeper', () => setSleeperOnly(false)])
  opsSel.forEach((id) => activeChips.push([allOperators.find(([o]) => o === id)?.[1] || '', () => setOpsSel((s) => s.filter((x) => x !== id))]))
  if (minRating) activeChips.push([`${minRating}★+`, () => setMinRating(0)])
  amenitiesSel.forEach((a) => activeChips.push([AMENITY_LABELS[a], () => setAmenitiesSel((s) => s.filter((x) => x !== a))]))
  if (freeCancel) activeChips.push(['Free cancellation', () => setFreeCancel(false)])
  if (liveTrack) activeChips.push(['Live tracking', () => setLiveTrack(false)])
  if (verifiedOnly) activeChips.push(['Verified operators', () => setVerifiedOnly(false)])
  if (seatsAvail) activeChips.push(['4+ seats open', () => setSeatsAvail(false)])

  const FiltersPanel = (
    <div className="space-y-5 text-sm">
      <fieldset><legend className="label">Price (per seat)</legend>
        <input type="range" aria-label="Maximum price" min={buses?.length ? Math.min(...buses.map((b) => b.min_fare_paise)) : 0} max={buses?.length ? Math.max(...buses.map((b) => b.min_fare_paise)) : 100000} step={1000}
          value={maxPrice ?? (buses?.length ? Math.max(...buses.map((b) => b.min_fare_paise)) : 0)}
          onChange={(e) => setMaxPrice(Number(e.target.value))} className="w-full accent-brand-600" />
        <div className="mt-1 flex justify-between text-xs text-slate-500">{buses?.length ? <>Up to <b>{inr(maxPrice ?? 0)}</b></> : null}</div>
      </fieldset>
      <fieldset><legend className="label">Departure time</legend>
        <select className="input" value={slot} onChange={(e) => setSlot(Number(e.target.value))}>{TIME_SLOTS.map((s, i) => <option key={i} value={i}>{s[0]}</option>)}</select>
      </fieldset>
      <fieldset><legend className="label">Bus type</legend>
        <label className="flex items-center gap-2 py-1"><input type="checkbox" checked={acOnly} onChange={(e) => setAcOnly(e.target.checked)} className="accent-brand-600" />AC buses</label>
        <label className="flex items-center gap-2 py-1"><input type="checkbox" checked={sleeperOnly} onChange={(e) => setSleeperOnly(e.target.checked)} className="accent-brand-600" />Sleeper berths</label>
      </fieldset>
      <fieldset><legend className="label">Operators</legend>
        <div className="max-h-40 space-y-1 overflow-auto pr-1">{allOperators.map(([id, name]) => (
          <label key={id} className="flex items-center gap-2 py-0.5"><input type="checkbox" checked={opsSel.includes(id)} onChange={(e) => setOpsSel((s) => e.target.checked ? [...s, id] : s.filter((x) => x !== id))} className="accent-brand-600" />{name}</label>
        ))}{!allOperators.length && <p className="text-xs text-slate-400">No results yet.</p>}</div>
      </fieldset>
      <fieldset><legend className="label">Minimum rating</legend>
        <div className="flex gap-1.5">{[0, 3.5, 4, 4.5].map((v) => <button key={v} onClick={() => setMinRating(v)} className={`chip ${minRating === v ? 'badge-blue' : 'badge-slate'}`}>{v === 0 ? 'Any' : `${v}★+`}</button>)}</div>
      </fieldset>
      <fieldset><legend className="label">Amenities</legend>
        <div className="flex flex-wrap gap-1.5">{Object.entries(AMENITY_LABELS).map(([k, lab]) => (
          <button key={k} aria-pressed={amenitiesSel.includes(k)} onClick={() => setAmenitiesSel((s) => s.includes(k) ? s.filter((x) => x !== k) : [...s, k])}
            className={`chip ${amenitiesSel.includes(k) ? 'badge-blue' : 'badge-slate'}`}>{lab}</button>))}
        </div>
      </fieldset>
      <fieldset className="space-y-1">
        <legend className="label">More</legend>
        <label className="flex items-center gap-2"><input type="checkbox" checked={freeCancel} onChange={(e) => setFreeCancel(e.target.checked)} className="accent-brand-600" />Free cancellation</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={liveTrack} onChange={(e) => setLiveTrack(e.target.checked)} className="accent-brand-600" />Live tracking</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={verifiedOnly} onChange={(e) => setVerifiedOnly(e.target.checked)} className="accent-brand-600" />Verified operators</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={seatsAvail} onChange={(e) => setSeatsAvail(e.target.checked)} className="accent-brand-600" />At least 4 seats open</label>
      </fieldset>
      <button className="btn-outline w-full" onClick={clearAll}>Clear all filters</button>
    </div>
  )

  if (quick && !from) {
    return <div className="mx-auto max-w-4xl"><h1 className="mb-6 text-2xl font-extrabold">Where to next?</h1><SearchWidget /></div>
  }

  return (
    <div>
      <div className="mb-5"><SearchWidget initial={{ from, to, date, pax }} /></div>

      {/* Date strip when flexible */}
      {flexible && buses && (
        <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Alternative dates">
          {[-3, -2, -1, 0, 1, 2, 3].map((d) => {
            const dd = addDays(date, d)
            const has = daysScanned.includes(dd)
            return <Link key={dd} to={`/search?from=${from}&to=${to}&date=${dd}&pax=${pax}`} className={`chip ${dd === date ? 'badge-blue' : has ? 'badge-green' : 'badge-slate'}`}>{fmtDateLong(dd).slice(0, 6)}{has ? ` · buses` : ''}</Link>
          })}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <aside className="hidden lg:block" aria-label="Filters">
          <div className="card sticky top-20 max-h-[calc(100vh-6rem)] overflow-auto p-5">{FiltersPanel}</div>
        </aside>

        <section aria-label="Bus results">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h1 className="mr-auto text-lg font-extrabold sm:text-xl">
              {buses ? `${filtered.length} bus${filtered.length === 1 ? '' : 'es'} · ${from} → ${to}` : 'Searching buses…'}
            </h1>
            <button className="btn-outline lg:hidden !py-2" onClick={() => setFiltersOpen(true)}><Icon d={I.filter} size={15} />Filters{activeChips.length ? ` (${activeChips.length})` : ''}</button>
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-500"><Icon d={I.sort} size={15} />
              <select aria-label="Sort results" className="rounded-lg border border-slate-200 bg-transparent px-2 py-1.5 dark:border-slate-700" value={sort} onChange={(e) => setSort(e.target.value as any)}>
                <option value="departure">Departure (earliest)</option><option value="price">Lowest price</option><option value="duration">Shortest trip</option><option value="rating">Top rated</option>
              </select>
            </label>
          </div>

          {activeChips.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-1.5" aria-label="Active filters">
              {activeChips.map(([lab, clr], i) => (
                <button key={i} onClick={clr} className="chip badge-blue hover:bg-brand-100 dark:hover:bg-brand-900/60">{lab}<Icon d={I.x} size={12} /></button>
              ))}
              <button onClick={clearAll} className="link ml-1 text-xs font-semibold">Clear all</button>
            </div>
          )}

          {err && <div className="mb-4"><ErrorNote msg={err} onRetry={runSearch} /></div>}
          {msg && !buses?.length && <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800/60 dark:bg-amber-900/30 dark:text-amber-200">{msg}</div>}

          {!buses ? (
            <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <BusCardSkeleton key={i} />)}</div>
          ) : filtered.length === 0 ? (
            <EmptyState title="No buses match this search" hint={buses.length ? 'Try clearing some filters or checking nearby dates — the demo fleet is limited on purpose.' : 'This demo has sample routes between major Indian cities. Try Bengaluru → Chennai, Pune → Goa or Delhi → Jaipur.'}
              action={<div className="flex gap-2"><button className="btn-outline" onClick={clearAll}>Clear filters</button><Link to="/" className="btn-primary">Popular routes</Link></div>} />
          ) : (
            <ul className="space-y-3">
              {filtered.map((b) => <BusRow key={`${b.schedule_id}-${b.depart_date}`} b={b} pax={pax} onBook={() => nav(`/seat/${b.schedule_id}?date=${b.depart_date || date}&from=${from}&to=${to}`)} />)}
            </ul>
          )}
        </section>
      </div>

      {/* Mobile filter bottom sheet */}
      {filtersOpen && (
        <div className="fixed inset-0 z-[80] flex items-end bg-black/50 lg:hidden" onClick={() => setFiltersOpen(false)}>
          <div className="max-h-[80vh] w-full animate-sheetUp overflow-auto rounded-t-3xl bg-white p-5 pb-24 dark:bg-surface-cardDark" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Filters">
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-300 dark:bg-slate-600" aria-hidden="true" />
            <div className="mb-3 flex items-center justify-between"><h2 className="font-bold">Filters</h2><button className="btn-ghost" onClick={() => setFiltersOpen(false)}><Icon d={I.x} /></button></div>
            {FiltersPanel}
            <button className="btn-primary mt-4 w-full" onClick={() => setFiltersOpen(false)}>Show {filtered.length} results</button>
          </div>
        </div>
      )}
    </div>
  )
}

function arrival(depart: string, dur: number) {
  const [h, m] = depart.split(':').map(Number)
  const t = new Date(); t.setUTCHours(h, m, 0, 0); t.setUTCMinutes(t.getUTCMinutes() + dur)
  return { time: `${String(t.getUTCHours()).padStart(2, '0')}:${String(t.getUTCMinutes()).padStart(2, '0')}`, nextDay: t.getUTCHours() < h }
}

export function BusRow({ b, pax, onBook }: { b: any; pax: number; onBook: () => void }) {
  const am: string[] = JSON.parse(b.amenities || '[]')
  const arr = arrival(b.depart_time, b.duration_min)
  const boarding = (b.stops || []).filter((s: any) => s.kind === 'boarding').slice(0, 2)
  return (
    <li className="card group overflow-hidden transition-all hover:shadow-lift">
      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start gap-x-4 gap-y-1">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate font-bold">{b.operator}</h3>
              {!!b.verified && <Tip label="Documents verified (demo check)"><span className="badge-green !py-0.5"><Icon d={I.shield} size={11} />Verified</span></Tip>}
              {!!b.women_friendly && <span className="chip bg-pink-50 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300"><Icon d={I.heart} size={11} />Women-friendly</span>}
              <Stars value={b.op_rating} count={b.op_reviews} />
            </div>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{b.bus_name} · <b>{b.bus_type}</b></p>
          </div>
          <div className="order-3 flex w-full items-center justify-between gap-2 sm:order-none sm:w-auto">
            <div className="text-right">
              <div className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400">{inr(b.min_fare_paise)}</div>
              <div className="text-[11px] text-slate-400">per seat · {b.available_seats} left</div>
            </div>
            <button className="btn-primary ml-4" onClick={onBook}>Select seats</button>
          </div>
        </div>

        {/* Timeline */}
        <div className="mt-4 flex items-center gap-3 text-sm">
          <div className="text-center"><div className="font-extrabold">{b.depart_time}</div><div className="text-[11px] text-slate-400">{b.depart_date ? fmtDateLong(b.depart_date).slice(0, 6) : ''}</div></div>
          <div className="flex-1 border-t-2 border-dashed border-slate-200 dark:border-slate-700 relative">
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">{fmtDur(b.duration_min)}</span>
          </div>
          <div className="text-center"><div className="font-extrabold">{arr.time}{arr.nextDay && <sup className="text-[10px] text-accent-600">+1</sup>}</div><div className="text-[11px] text-slate-400">arrival</div></div>
        </div>

        {/* Boarding points */}
        {boarding.length > 0 && (
          <p className="mt-2 truncate text-xs text-slate-500 dark:text-slate-400"><Icon d={I.pin} size={12} className="inline -mt-0.5" /> Boarding: {boarding.map((s: any) => s.name).join(', ')}{(b.stops || []).length > 2 ? ' …' : ''}</p>
        )}

        {/* Amenities & policy */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {am.slice(0, 5).map((a) => <span key={a} className="badge-slate"><Icon d={a === 'wifi' ? I.wifi : a === 'charging' || a === 'live-tracking' ? I.bolt : a === 'blanket' ? I.bed : I.check} size={11} />{AMENITY_LABELS[a] || a}</span>)}
          {!!b.free_cancellation && <span className="badge-green">Free cancellation</span>}
          {am.includes('live-tracking') && <span className="badge-blue"><Icon d={I.mapPinLive} size={11} />Live tracking</span>}
          {pax > b.available_seats && <span className="badge-red">Not enough seats for {pax}</span>}
        </div>
        <details className="mt-2 text-xs text-slate-500 dark:text-slate-400"><summary className="cursor-pointer select-none font-semibold">Cancellation policy</summary><p className="pt-1 leading-relaxed">{b.cancellation_policy}</p></details>
      </div>
    </li>
  )
}
