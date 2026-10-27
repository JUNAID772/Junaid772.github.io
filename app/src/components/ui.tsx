// Shared UI primitives: toasts, dialogs, skeletons, empty states, tooltips, theme toggle.
import React, { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useApp } from '../lib/state'
import { t } from '../lib/i18n'

// ---------------- Icons (inline SVG, no deps) ----------------
export const Icon = ({ d, size = 18, className = '' }: { d: string; size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d={d} />
  </svg>
)
export const I = {
  bus: 'M8 6v12M16 6v12M2 12h19.5M4 6h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Zm4 14v2m8-2v2',
  search: 'M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm10 18-4.35-4.35',
  swap: 'M16 3l4 4-4 4M4 14V7a2 2 0 0 1 2-2h14M8 21l-4-4 4-4m12 1v7a2 2 0 0 1-2 2H4',
  cal: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z',
  users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm14 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  star: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-15v2m0 16v2M4.2 4.2l1.4 1.4m12.8 12.8 1.4 1.4M2 12h2m16 0h2M4.2 19.8l1.4-1.4M17 5.6l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z',
  monitor: 'M3 4h18v12H3zM8 20h8m-4-4v4',
  x: 'M18 6 6 18M6 6l12 12',
  check: 'M20 6 9 17l-5-5',
  chevR: 'm9 18 6-6-6-6',
  chevD: 'm6 9 6 6 6-6',
  wifi: 'M5 12.55a11 11 0 0 1 14.08 0M1.42 9a16 16 0 0 1 21.16 0M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01',
  bolt: 'M13 2 3 14h9l-1 8 10-12h-9l1-8z',
  pin: 'M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Zm-5-3a3 3 0 1 0-6 0 3 3 0 0 0 6 0Z',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  ticket: 'M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Zm10-4v14',
  menu: 'M4 6h16M4 12h16M4 18h16',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4m7 14 5-5-5-5M16 17H9',
  heart: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8Z',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-16v6l4 2',
  arrowL: 'M19 12H5m7-7-7 7 7 7',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  chat: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  globe: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm-9-10h18M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20Z',
  trash: 'M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6',
  edit: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-10v6m0-10h.01',
  phone: 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z',
  mail: 'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm18 3-10 7L2 7',
  filter: 'M22 3H2l8 9.46V19l4 2v-8.54L22 3z',
  sort: 'M11 5h10M11 9h7M11 13h4M3 17l3 3 3-3M6 18V4',
  eye: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Zm11 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  bed: 'M2 4v16m0-8h20v8M22 12V7a1 1 0 0 0-1-1h-7a3 3 0 0 0-3 3v3M6 9h.01',
  sofa: 'M4 10V7a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v3m-16 0a2 2 0 0 0-2 2v4h20v-4a2 2 0 0 0-2-2M4 10h16M6 16v3m12-3v3',
  share: 'M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13',
  copy: 'M8 8h12v12H8zM4 16V4h12',
  mapPinLive: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-6a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-2a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  gift: 'M20 12v10H4V12M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7Zm0 0h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7Z',
  headset: 'M4 14v-3a8 8 0 0 1 16 0v3m-18 0a2 2 0 0 1 2-2h1a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2v-3Zm16 0a2 2 0 0 0-2-2h-1a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h1a2 2 0 0 0 2-2v-3Zm-3 5a3 3 0 0 1-3 3h-2',
  wallet: 'M20 12V8H6a2 2 0 0 1 0-4h12v4M4 6v12a2 2 0 0 0 2 2h14v-4M20 12a2 2 0 0 0-2-2H8a2 2 0 0 0 0 4h12',
  qr: 'M3 3h6v6H3zM15 3h6v6h-6zM3 15h6v6H3zM15 15h3v3h-3zM21 15v6h-6M15 21h.01',
  card: 'M2 6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6Zm0 4h20',
  bank: 'M3 21h18M4 18h16M6 18v-7m4 7v-7m4 7v-7m4 7v-7M12 2 3 8h18l-9-6Z',
  upi: 'M12 2 4 12l8 10 8-10-8-10Zm0 5-4 7h8l-4-7Z',
  refresh: 'M23 4v6h-6M1 20v-6h6M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15',
  home: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10',
}

// ---------------- Toast host ----------------
export function ToastHost() {
  const { toasts, dismiss } = useApp()
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 w-[calc(100%-2rem)] max-w-md" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id}
          className={`animate-toastIn flex items-start gap-3 rounded-xl px-4 py-3 text-sm font-medium shadow-lift backdrop-blur border ${
            t.kind === 'success' ? 'bg-emerald-600/95 border-emerald-500 text-white' :
            t.kind === 'error' ? 'bg-rose-600/95 border-rose-500 text-white' :
            'bg-slate-800/95 border-slate-600 text-white dark:bg-slate-700/95'}`}>
          <Icon d={t.kind === 'success' ? I.check : t.kind === 'error' ? I.x : I.info} size={16} className="mt-0.5 shrink-0" />
          <span className="flex-1">{t.text}</span>
          <button onClick={() => dismiss(t.id)} aria-label="Dismiss notification" className="opacity-70 hover:opacity-100"><Icon d={I.x} size={14} /></button>
        </div>
      ))}
    </div>
  )
}

// ---------------- Confirm dialog ----------------
export function useConfirm() {
  const [state, setState] = useState<{ msg: { title: string; body: string; danger?: boolean }; resolve: (v: boolean) => void } | null>(null)
  const confirm = (title: string, body: string, danger = false) => new Promise<boolean>((resolve) => setState({ msg: { title, body, danger }, resolve }))
  const node = state && (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4" onClick={() => { state.resolve(false); setState(null) }}>
      <div className="card w-full max-w-sm p-6 animate-fadeUp" onClick={(e) => e.stopPropagation()} role="alertdialog" aria-modal="true" aria-label={state.msg.title}>
        <h3 className="text-lg font-bold">{state.msg.title}</h3>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{state.msg.body}</p>
        <div className="mt-5 flex justify-end gap-3">
          <button className="btn-outline" onClick={() => { state.resolve(false); setState(null) }}>Keep it</button>
          <button className={`btn ${state.msg.danger ? 'bg-rose-600 hover:bg-rose-700 text-white' : 'btn-primary'} px-4 py-2.5 text-sm font-semibold rounded-xl`}
            onClick={() => { state.resolve(true); setState(null) }}>Yes, continue</button>
        </div>
      </div>
    </div>
  )
  return { confirm, confirmNode: node }
}

// ---------------- Skeleton / Empty / Error ----------------
export const Skeleton = ({ className = '' }: { className?: string }) => <div className={`skeleton ${className}`} aria-hidden="true" />
export function BusCardSkeleton() {
  return (
    <div className="card p-4 space-y-3">
      <div className="flex justify-between"><Skeleton className="h-5 w-40" /><Skeleton className="h-5 w-24" /></div>
      <div className="flex gap-6"><Skeleton className="h-10 w-28" /><Skeleton className="h-10 w-28" /><Skeleton className="h-10 w-24" /></div>
      <Skeleton className="h-4 w-full" /><div className="flex gap-2"><Skeleton className="h-6 w-16" /><Skeleton className="h-6 w-16" /><Skeleton className="h-6 w-20" /></div>
    </div>
  )
}
export function EmptyState({ icon = I.search, title, hint, action }: { icon?: string; title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="card flex flex-col items-center justify-center gap-3 p-10 text-center animate-fadeUp">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300"><Icon d={icon} size={26} /></div>
      <h3 className="font-bold text-lg">{title}</h3>
      {hint && <p className="max-w-sm text-sm text-slate-500 dark:text-slate-400">{hint}</p>}
      {action}
    </div>
  )
}
export function ErrorNote({ msg, onRetry }: { msg: string; onRetry?: () => void }) {
  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-800/60 dark:bg-rose-900/30 dark:text-rose-300 flex items-start gap-3" role="alert">
      <Icon d={I.info} className="mt-0.5 shrink-0" />
      <div className="flex-1">{msg}</div>
      {onRetry && <button className="btn-outline !py-1.5 text-xs" onClick={onRetry}>Retry</button>}
    </div>
  )
}

// ---------------- Tooltip ----------------
export const Tip = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <span className="group relative inline-flex" tabIndex={-1}>
    {children}
    <span role="tooltip" className="pointer-events-none absolute left-1/2 bottom-full z-40 mb-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-lift group-hover:block group-focus-within:block dark:bg-slate-700">{label}</span>
  </span>
)

// ---------------- Theme toggle ----------------
export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme } = useApp()
  const opts: Array<[string, string, string]> = [['light', I.sun, 'Light'], ['dark', I.moon, 'Dark'], ['system', I.monitor, 'System']]
  return (
    <div role="radiogroup" aria-label="Colour theme" className={`flex items-center gap-0.5 rounded-xl bg-slate-100 p-1 dark:bg-slate-800 ${compact ? '' : ''}`}>
      {opts.map(([v, d, lab]) => (
        <button key={v} role="radio" aria-checked={theme === v} title={`${lab} theme`}
          onClick={() => setTheme(v as any)}
          className={`rounded-lg p-1.5 transition-all ${theme === v ? 'bg-white text-brand-600 shadow-sm dark:bg-slate-700 dark:text-brand-300' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}>
          <Icon d={d} size={16} />
          {!compact && <span className="sr-only">{lab}</span>}
        </button>
      ))}
    </div>
  )
}

// ---------------- Rating stars ----------------
export const Stars = ({ value, count }: { value: number; count?: number }) => (
  <span className="inline-flex items-center gap-1 text-xs font-semibold" aria-label={`Rated ${value} out of 5`}>
    <span className="inline-flex items-center gap-0.5 rounded-md bg-emerald-600 px-1.5 py-0.5 text-white"><Icon d={I.star} size={11} className="fill-current" />{Number(value).toFixed(1)}</span>
    {count != null && <span className="font-normal text-slate-500 dark:text-slate-400">({count.toLocaleString('en-IN')})</span>}
  </span>
)

// ---------------- Page title hook ----------------
const TITLES: Record<string, string> = {
  '/': 'SafarGo — Book Bus Tickets Across India',
  '/search': 'Search buses · SafarGo', '/login': 'Sign in · SafarGo', '/register': 'Create account · SafarGo',
  '/me': 'My bookings · SafarGo', '/admin': 'Admin dashboard · SafarGo', '/operator': 'Operator portal · SafarGo',
  '/help': 'Help centre · SafarGo', '/offers': 'Offers · SafarGo',
}
export function usePageTitle(path: string) {
  useEffect(() => {
    document.title = TITLES['/' + path.split('/')[1]] || TITLES[path] || 'SafarGo — Bus tickets across India'
  }, [path])
}

// ---------------- Scroll restore + skip link ----------------
export function ShellChrome({ children }: { children: React.ReactNode }) {
  const loc = useLocation()
  const nav = useNavigate()
  const { lang } = useApp()
  useEffect(() => { window.scrollTo(0, 0) }, [loc.pathname])
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[120] focus:rounded-lg focus:bg-brand-600 focus:px-4 focus:py-2 focus:text-white">Skip to main content</a>
      <Header />
      <main id="main" className="mx-auto w-full max-w-7xl px-4 pb-24 pt-6 sm:px-6">{children}</main>
      <Footer />
      <ToastHost />
      {/* Mobile bottom quick bar */}
      <nav aria-label="Quick links" className="fixed inset-x-0 bottom-0 z-40 flex border-t border-slate-200 bg-white/90 backdrop-blur dark:border-slate-700 dark:bg-surface-cardDark/90 sm:hidden">
        {[['/', I.home, 'Home'], ['/search?quick=1', I.search, 'Search'], ['/me', I.ticket, t('myBookings', lang)], ['/help', I.headset, t('helpCenter', lang)]].map(([href, d, lab]: any) => (
          <Link key={href} to={href} className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${loc.pathname === href.split('?')[0] ? 'text-brand-600 dark:text-brand-300' : 'text-slate-500 dark:text-slate-400'}`}>
            <Icon d={d} size={19} />{lab}
          </Link>
        ))}
      </nav>
    </>
  )
}

// ---------------- Header ----------------
export function Header() {
  const { user, setUser, toast, lang, setLang, a11y, toggleA11y } = useApp()
  const [menuOpen, setMenuOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const nav = useNavigate()
  const loc = useLocation()
  const profileRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])
  useEffect(() => { setMenuOpen(false); setProfileOpen(false) }, [loc.pathname])

  const doLogout = async () => {
    try { await api('/api/auth/logout', { method: 'POST', body: {} }); setUser(null); toast('info', 'Signed out. See you soon!'); nav('/') } catch (e: any) { toast('error', e.message) }
  }

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/85 backdrop-blur-md dark:border-slate-700/60 dark:bg-surface-dark/85">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
        <button className="btn-ghost !px-2 sm:hidden" aria-label="Open menu" onClick={() => setMenuOpen((o) => !o)}><Icon d={menuOpen ? I.x : I.menu} size={22} /></button>
        <Link to="/" className="flex items-center gap-2 font-extrabold text-lg tracking-tight">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm"><Icon d={I.bus} size={20} /></span>
          <span>Safar<span className="text-brand-600 dark:text-brand-400">Go</span></span>
        </Link>
        <nav aria-label="Primary" className="ml-4 hidden items-center gap-1 text-sm font-medium sm:flex">
          <Link to="/search" className="btn-ghost">Search buses</Link>
          <Link to="/offers" className="btn-ghost">Offers</Link>
          <Link to="/help" className="btn-ghost">Help</Link>
          {user && <Link to="/me" className="btn-ghost">My bookings</Link>}
          {(user?.role === 'admin' || user?.role === 'support') && <Link to="/admin" className="btn-ghost">Admin</Link>}
          {user?.role === 'operator' && <Link to="/operator" className="btn-ghost">Operator portal</Link>}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <select value={lang} onChange={(e) => setLang(e.target.value as any)} aria-label="Language"
            className="hidden rounded-xl border border-slate-200 bg-transparent px-2 py-1.5 text-xs font-semibold dark:border-slate-700 sm:block">
            <option value="en">English</option><option value="hi">हिन्दी</option>
          </select>
          <ThemeToggle />
          {user ? (
            <div className="relative" ref={profileRef}>
              <button onClick={() => setProfileOpen((o) => !o)} aria-expanded={profileOpen} aria-haspopup="menu"
                className="flex items-center gap-2 rounded-xl border border-slate-200 px-2.5 py-1.5 text-sm font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-700 dark:bg-brand-900/50 dark:text-brand-300">{(user.name || '?')[0].toUpperCase()}</span>
                <span className="hidden max-w-24 truncate md:block">{user.name}</span><Icon d={I.chevD} size={14} />
              </button>
              {profileOpen && (
                <div role="menu" className="absolute right-0 mt-2 w-60 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-lift dark:border-slate-700 dark:bg-surface-cardDark animate-fadeUp">
                  <div className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">Signed in as <b>{user.phone || user.email}</b> · {user.role}</div>
                  <div className="px-3 pb-1 text-xs text-slate-500">Loyalty: {user.loyalty_points} pts · Credit: ₹{Math.floor(user.travel_credit_paise / 100)}</div>
                  <MenuItem to="/me" icon={I.ticket} label={t('myBookings', lang)} onNav={() => setProfileOpen(false)} />
                  <MenuItem to="/me?tab=saved" icon={I.users} label="Saved passengers" onNav={() => setProfileOpen(false)} />
                  <MenuItem to="/me?tab=coupons" icon={I.gift} label="Coupon wallet" onNav={() => setProfileOpen(false)} />
                  <MenuItem to="/me?tab=settings" icon={I.bell} label="Notification settings" onNav={() => setProfileOpen(false)} />
                  <div className="my-1 border-t border-slate-100 dark:border-slate-700" />
                  <div className="flex items-center justify-between px-3 py-1.5 text-sm">
                    <label className="flex items-center gap-2 text-slate-600 dark:text-slate-300"><input type="checkbox" checked={a11y.reduceMotion} onChange={() => toggleA11y('reduceMotion')} className="accent-brand-600" />Reduced motion</label>
                  </div>
                  <div className="flex items-center justify-between px-3 py-1.5 text-sm">
                    <label className="flex items-center gap-2 text-slate-600 dark:text-slate-300"><input type="checkbox" checked={a11y.highContrast} onChange={() => toggleA11y('highContrast')} className="accent-brand-600" />High contrast</label>
                  </div>
                  <ThemeToggle compact />
                  <button role="menuitem" onClick={doLogout} className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30">
                    <Icon d={I.logout} size={16} />{t('logout', lang)}</button>
                </div>
              )}
            </div>
          ) : (
            <button className="btn-primary !py-2" onClick={() => nav('/login')}>{t('login', lang)}</button>
          )}
        </div>
      </div>
      {menuOpen && (
        <div className="border-t border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-surface-cardDark sm:hidden animate-fadeUp">
          <nav aria-label="Mobile" className="grid gap-1 text-sm font-medium">
            <MobileLink to="/search" label="Search buses" icon={I.search} />
            <MobileLink to="/offers" label="Offers & coupons" icon={I.gift} />
            <MobileLink to="/help" label="Help centre" icon={I.headset} />
            {user && <MobileLink to="/me" label={t('myBookings', lang)} icon={I.ticket} />}
            {(user?.role === 'admin' || user?.role === 'support') && <MobileLink to="/admin" label="Admin dashboard" icon={I.shield} />}
            {user?.role === 'operator' && <MobileLink to="/operator" label="Operator portal" icon={I.bus} />}
            <div className="mt-2 flex items-center justify-between">
              <select value={lang} onChange={(e) => setLang(e.target.value as any)} aria-label="Language" className="rounded-xl border border-slate-200 bg-transparent px-2 py-1.5 text-xs font-semibold dark:border-slate-700">
                <option value="en">English</option><option value="hi">हिन्दी</option>
              </select>
              <ThemeToggle compact />
            </div>
          </nav>
        </div>
      )}
    </header>
  )
}
function MenuItem({ to, icon, label, onNav }: { to: string; icon: string; label: string; onNav: () => void }) {
  return <Link role="menuitem" to={to} onClick={onNav} className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800"><Icon d={icon} size={16} className="text-slate-500 dark:text-slate-400" />{label}</Link>
}
function MobileLink({ to, label, icon }: { to: string; label: string; icon: string }) {
  return <Link to={to} className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 hover:bg-slate-100 dark:hover:bg-slate-800"><Icon d={icon} size={18} className="text-brand-600 dark:text-brand-300" />{label}</Link>
}

// ---------------- Footer ----------------
export function Footer() {
  return (
    <footer className="mt-16 border-t border-slate-200 bg-white dark:border-slate-700/60 dark:bg-surface-cardDark">
      <div className="mx-auto grid max-w-7xl gap-8 px-6 py-12 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="flex items-center gap-2 font-extrabold text-lg"><span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white"><Icon d={I.bus} size={16} /></span>SafarGo</div>
          <p className="mt-3 text-slate-500 dark:text-slate-400">Demo product for the Indian bus-booking market. All operators, fares and schedules shown are fictional sample data.</p>
          <div className="mt-4 flex gap-2">
            {[['X', 'M18 2 8.3 2H2l8 9.3L2 22h8l7-8.3L22 2h-8L18 2Z'], ['FB', 'M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z'], ['IG', 'M16 11.4A4 4 0 1 1 12 7a4 4 0 0 1 4 4.4Z M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5Z'] ].map(([name, d]) => (
              <Tip key={name} label={`${name} — demo link`}><a href="#" onClick={(e) => e.preventDefault()} aria-label={`SafarGo on ${name} (demo)`} className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 text-slate-500 hover:text-brand-600 dark:border-slate-700 dark:text-slate-400"><Icon d={d} size={16} /></a></Tip>
            ))}
          </div>
        </div>
        <div><h4 className="mb-3 font-bold">Company</h4><ul className="space-y-2 text-slate-500 dark:text-slate-400">
          <li><Link className="link" to="/help">About & help</Link></li><li><Link className="link" to="/offers">Offers</Link></li><li><a className="link" href="#" onClick={(e) => e.preventDefault()}>Careers (demo)</a></li><li><a className="link" href="#" onClick={(e) => e.preventDefault()}>Press (demo)</a></li></ul></div>
        <div><h4 className="mb-3 font-bold">Policies</h4><ul className="space-y-2 text-slate-500 dark:text-slate-400">
          <li><Link className="link" to="/help#faq">Cancellation & refund policy</Link></li><li><a className="link" href="#" onClick={(e) => e.preventDefault()}>Privacy (demo)</a></li><li><a className="link" href="#" onClick={(e) => e.preventDefault()}>Terms (demo)</a></li><li><a className="link" href="#" onClick={(e) => e.preventDefault()}>Data retention (demo)</a></li></ul></div>
        <div><h4 className="mb-3 font-bold">Contact</h4><ul className="space-y-2 text-slate-500 dark:text-slate-400">
          <li className="flex items-center gap-2"><Icon d={I.phone} size={14} />1800-XXX-XXXX (demo helpline)</li>
          <li className="flex items-center gap-2"><Icon d={I.mail} size={14} />support@safargo.example</li>
          <li className="flex items-center gap-2"><Icon d={I.chat} size={14} /><Link className="link" to="/help#support">Raise a support ticket</Link></li></ul>
          <p className="mt-3 text-xs text-slate-400">Payments processed via sandbox adapter — no real money moves.</p></div>
      </div>
      <div className="border-t border-slate-100 px-6 py-4 text-center text-xs text-slate-400 dark:border-slate-700/60">© {new Date().getFullYear()} SafarGo (working name). Built as a portfolio/demo product. Not affiliated with any real operator.</div>
    </footer>
  )
}

// Re-export api for convenience inside components
import { api } from '../lib/api'
