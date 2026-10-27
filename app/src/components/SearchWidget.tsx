// City autocomplete + search widget (used on home hero and /search page).
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { Icon, I } from './ui'
import { t } from '../lib/i18n'
import { addDays, todayIST } from '../lib/i18n'
import { useApp } from '../lib/state'

export type City = { id: number; name: string; state: string; pincode_prefix: string | null; popular: number }

let cityCache: City[] | null = null
export async function loadCities(): Promise<City[]> {
  if (cityCache) return cityCache
  cityCache = await api<City[]>('/api/cities')
  return cityCache
}

export function CityInput({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string
}) {
  const [cities, setCities] = useState<City[]>([])
  const [q, setQ] = useState(value)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)
  useEffect(() => { setQ(value) }, [value])
  useEffect(() => { loadCities().then(setCities).catch(() => undefined) }, [])
  useEffect(() => {
    const h = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase()
    const list = s ? cities.filter((c) => c.name.toLowerCase().includes(s) || c.state.toLowerCase().includes(s) || String(c.pincode_prefix || '').startsWith(s)) : cities.filter((c) => c.popular)
    return list.slice(0, 8)
  }, [q, cities])

  const pick = (name: string) => { setQ(name); onChange(name); setOpen(false) }

  return (
    <div className="relative flex-1" ref={boxRef}>
      <label className="label">{label}</label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><Icon d={I.pin} size={16} /></span>
        <input className="input !pl-9" role="combobox" aria-expanded={open} aria-autocomplete="list" aria-controls="city-list" aria-label={label}
          placeholder={placeholder || 'City or pincode'} value={q} autoComplete="off"
          onFocus={() => setOpen(true)}
          onChange={(e) => { setQ(e.target.value); onChange(e.target.value); setOpen(true); setActive(0) }}
          onKeyDown={(e) => {
            if (!open && (e.key === 'ArrowDown')) { setOpen(true); return }
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, matches.length - 1)) }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
            if (e.key === 'Enter' && open && matches[active]) { e.preventDefault(); pick(matches[active].name) }
            if (e.key === 'Escape') setOpen(false)
          }} />
      </div>
      {open && matches.length > 0 && (
        <ul id="city-list" role="listbox" className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lift dark:border-slate-700 dark:bg-surface-cardDark animate-fadeUp">
          {matches.map((c, i) => (
            <li key={c.id} role="option" aria-selected={i === active}>
              <button type="button" onMouseEnter={() => setActive(i)} onClick={() => pick(c.name)}
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm ${i === active ? 'bg-brand-50 dark:bg-slate-800' : ''}`}>
                <span><b>{c.name}</b><span className="ml-2 text-xs text-slate-500">{c.state}</span></span>
                {c.popular ? <span className="badge-blue">Popular</span> : <span className="text-[10px] text-slate-400">PIN {c.pincode_prefix}•••</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && matches.length === 0 && q.trim() && (
        <div className="absolute z-30 mt-1 w-full rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-500 shadow-lift dark:border-slate-700 dark:bg-surface-cardDark">
          No demo city matches “{q}”. Try Bengaluru, Pune, Goa…
        </div>
      )}
    </div>
  )
}

export function SearchWidget({ initial }: { initial?: { from: string; to: string; date: string; pax: number } }) {
  const nav = useNavigate()
  const { toast, lang } = useApp()
  const [from, setFrom] = useState(initial?.from || '')
  const [to, setTo] = useState(initial?.to || '')
  const [date, setDate] = useState(initial?.date || todayIST())
  const [pax, setPax] = useState(initial?.pax || 1)
  const [flexible, setFlexible] = useState(false)

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!from.trim() || !to.trim()) { toast('error', 'Please choose both a source and a destination city.'); return }
    if (from.trim().toLowerCase() === to.trim().toLowerCase()) { toast('error', 'Source and destination cannot be the same city.'); return }
    if (!date) { toast('error', 'Pick a travel date.'); return }
    const params = new URLSearchParams({ from: from.trim(), to: to.trim(), date, pax: String(pax), flexible: flexible ? '1' : '0' })
    nav(`/search?${params}`)
  }

  return (
    <form onSubmit={submit} className="card p-4 sm:p-5 shadow-lift" aria-label="Bus search">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex flex-1 gap-2 items-end">
          <CityInput label={t('from', lang)} value={from} onChange={setFrom} placeholder="Bengaluru" />
          <button type="button" title="Swap origin and destination" aria-label="Swap origin and destination"
            onClick={() => { const f = from; setFrom(to); setTo(f) }}
            className="mb-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 text-brand-600 hover:bg-brand-50 transition-transform hover:rotate-180 dark:border-slate-700 dark:text-brand-300 dark:hover:bg-slate-800">
            <Icon d={I.swap} size={17} />
          </button>
          <CityInput label={t('to', lang)} value={to} onChange={setTo} placeholder="Chennai" />
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="label" htmlFor="travel-date">{t('travelDate', lang)}</label>
          <input id="travel-date" type="date" className="input" min={todayIST()} max={addDays(todayIST(), 120)} value={date}
            onChange={(e) => setDate(e.target.value)} />
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button type="button" className={`chip ${date === todayIST() ? 'badge-blue' : 'badge-slate'}`} onClick={() => setDate(todayIST())}>{t('today', lang)}</button>
            <button type="button" className={`chip ${date === addDays(todayIST(), 1) ? 'badge-blue' : 'badge-slate'}`} onClick={() => setDate(addDays(todayIST(), 1))}>{t('tomorrow', lang)}</button>
            <button type="button" aria-pressed={flexible} className={`chip ${flexible ? 'badge-amber' : 'badge-slate'}`} onClick={() => setFlexible((f) => !f)}>±3 days</button>
          </div>
        </div>
        <div>
          <label className="label">{t('passengers', lang)}</label>
          <div className="flex items-center gap-2 rounded-xl border border-slate-300 px-2 py-1.5 dark:border-slate-600">
            <button type="button" className="btn-ghost !px-2 !py-1" aria-label="Fewer passengers" disabled={pax <= 1} onClick={() => setPax((p) => Math.max(1, p - 1))}><Icon d={I.minus} size={14} /></button>
            <span className="w-6 text-center text-sm font-bold" aria-live="polite">{pax}</span>
            <button type="button" className="btn-ghost !px-2 !py-1" aria-label="More passengers" disabled={pax >= 6} onClick={() => setPax((p) => Math.min(6, p + 1))}><Icon d={I.plus} size={14} /></button>
          </div>
        </div>
        <button type="submit" className="btn-primary btn-lg !rounded-xl sm:w-auto w-full">
          <Icon d={I.search} size={18} />{t('searchBuses', lang)}
        </button>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-slate-400">Demo product — all operators, buses, fares and timings below are fictional sample data for testing the booking flow.</p>
    </form>
  )
}
