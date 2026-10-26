import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api } from './api'
import type { Lang } from './i18n'

// ---------------- Theme ----------------
type Theme = 'light' | 'dark' | 'system'
function useThemeState() {
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('safargo-theme') as Theme) || 'system')
  useEffect(() => {
    localStorage.setItem('safargo-theme', theme)
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => document.documentElement.classList.toggle('dark', theme === 'dark' || (theme === 'system' && mq.matches))
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme])
  return { theme, setTheme }
}

// ---------------- Toasts ----------------
export type Toast = { id: number; kind: 'success' | 'error' | 'info'; text: string }
let toastId = 0

// ---------------- Auth ----------------
export type User = { id: number; name: string; email: string | null; phone: string | null; role: string; loyalty_points: number; travel_credit_paise: number; notif_prefs: string; lang: string } | null

const Ctx = createContext<{
  theme: Theme; setTheme: (t: Theme) => void
  toasts: Toast[]; toast: (kind: Toast['kind'], text: string) => void; dismiss: (id: number) => void
  user: User; refreshUser: () => Promise<void>; setUser: (u: User) => void
  lang: Lang; setLang: (l: Lang) => void
  a11y: { reduceMotion: boolean; highContrast: boolean }; toggleA11y: (k: 'reduceMotion' | 'highContrast') => void
}>(null as any)

export const useApp = () => useContext(Ctx)

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { theme, setTheme } = useThemeState()
  const [toasts, setToasts] = useState<Toast[]>([])
  const [user, setUser] = useState<User>(null)
  const [lang, setLangState] = useState<Lang>((localStorage.getItem('safargo-lang') as Lang) || 'en')
  const [a11y, setA11y] = useState({ reduceMotion: localStorage.getItem('safargo-reduced-motion') === '1', highContrast: localStorage.getItem('safargo-high-contrast') === '1' })

  const toast = useCallback((kind: Toast['kind'], text: string) => {
    const id = ++toastId
    setToasts((ts) => [...ts.slice(-3), { id, kind, text }])
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 4200)
  }, [])
  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((x) => x.id !== id)), [])

  const refreshUser = useCallback(async () => {
    try { const d = await api<{ user: User }>('/api/auth/me'); setUser(d.user); if (d.user?.lang) setLangState(d.user.lang as Lang) } catch { setUser(null) }
  }, [])
  useEffect(() => { refreshUser() }, [refreshUser])

  const setLang = useCallback((l: Lang) => {
    setLangState(l); localStorage.setItem('safargo-lang', l)
    api('/api/me', { method: 'PATCH', body: { lang: l } }).catch(() => undefined)
  }, [])

  const toggleA11y = useCallback((k: 'reduceMotion' | 'highContrast') => {
    setA11y((a) => {
      const nv = !a[k]
      localStorage.setItem(k === 'reduceMotion' ? 'safargo-reduced-motion' : 'safargo-high-contrast', nv ? '1' : '0')
      document.documentElement.classList.toggle(k === 'reduceMotion' ? 'reduce-motion' : 'high-contrast', nv)
      return { ...a, [k]: nv }
    })
  }, [])

  const value = useMemo(() => ({ theme, setTheme, toasts, toast, dismiss, user, refreshUser, setUser, lang, setLang, a11y, toggleA11y }),
    [theme, setTheme, toasts, toast, dismiss, user, refreshUser, lang, setLang, a11y, toggleA11y])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
