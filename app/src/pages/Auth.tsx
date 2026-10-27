// /login & /register — password + OTP flows, password reset.
import React, { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import { Icon, I } from '../components/ui'
import { useApp } from '../lib/state'

export default function AuthPage() {
  const [sp] = useSearchParams()
  const next = sp.get('next') || '/me'
  const mode0 = sp.get('mode') === 'register' ? 'register' : 'login'
  const [mode, setMode] = useState<'login' | 'register'>(mode0)
  const nav = useNavigate()
  const { setUser, toast } = useApp()

  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [otpPhase, setOtpPhase] = useState<'idle' | 'sent'>('idle')
  const [otp, setOtp] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<Record<string, string>>({})
  const [showPw, setShowPw] = useState(false)
  const [resetPhase, setResetPhase] = useState<'idle' | 'codeSent'>('idle')
  const [resetCode, setResetCode] = useState('')
  const [newPw, setNewPw] = useState('')

  const PHONE_RE = /^(\+91[- ]?)?[6-9]\d{9}$/
  const norm = (p: string) => p.replace(/\D/g, '').slice(-10)

  const finish = (u: any, msg: string) => { setUser(u); toast('success', msg); nav(next) }

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault(); setErr({}); setBusy(true)
    try {
      const idn = mode === 'login' ? (phone.trim() || email.trim()) : phone.trim()
      if (!idn) throw { message: 'Enter your mobile number or email.' }
      if (password.length < 8) throw { message: 'Password must be at least 8 characters.' }
      const path = mode === 'login' ? '/api/auth/login' : '/api/auth/register'
      const body = mode === 'login' ? { identifier: idn, password } : { name, phone: idn, email: email.trim() || undefined, password }
      const r = await api<any>(path, { method: 'POST', body })
      finish(r.user, mode === 'login' ? `Welcome back, ${r.user.name.split(' ')[0]}!` : 'Account created — happy travels!')
    } catch (er: any) { setErr({ form: er.message }) } finally { setBusy(false) }
  }

  const sendOtp = async () => {
    setErr({})
    if (!PHONE_RE.test(phone)) { setErr({ phone: 'Enter a valid Indian mobile number.' }); return }
    setBusy(true)
    try { const r = await api<any>('/api/auth/otp/request', { method: 'POST', body: { phone: norm(phone) } }); setOtpPhase('sent'); toast('info', `Demo OTP is ${r.demoOtp} (in production this arrives by SMS).`) }
    catch (er: any) { setErr({ phone: er.message }) } finally { setBusy(false) }
  }
  const verifyOtp = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true)
    try { const r = await api<any>('/api/auth/otp/verify', { method: 'POST', body: { phone: norm(phone), code: otp } }); finish(r.user, `Signed in as ${r.user.phone}`) }
    catch (er: any) { setErr({ otp: er.message }) } finally { setBusy(false) }
  }

  const startReset = async () => {
    setErr({})
    if (!phone && !email) { setErr({ form: 'Enter the mobile or email linked to your account.' }); return }
    setBusy(true)
    try { const r = await api<any>('/api/auth/password-reset/request', { method: 'POST', body: { identifier: phone.trim() || email.trim() } }); setResetPhase('codeSent'); toast('info', `Demo reset code: ${r.demoCode}`) }
    catch (er: any) { setErr({ form: er.message }) } finally { setBusy(false) }
  }
  const confirmReset = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPw.length < 8) { setErr({ form: 'New password needs at least 8 characters.' }); return }
    setBusy(true)
    try { await api('/api/auth/password-reset/confirm', { method: 'POST', body: { identifier: phone.trim() || email.trim(), code: resetCode, newPassword: newPw } }); toast('success', 'Password updated — sign in with your new password.'); setResetPhase('idle'); setPassword('') }
    catch (er: any) { setErr({ form: er.message }) } finally { setBusy(false) }
  }

  return (
    <div className="mx-auto grid max-w-4xl gap-8 md:grid-cols-2">
      <section className="hidden flex-col justify-center md:flex">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white"><Icon d={I.bus} size={26} /></span>
        <h1 className="mt-4 text-3xl font-extrabold leading-tight">Your seat,<br />one tap away.</h1>
        <ul className="mt-4 space-y-2 text-sm text-slate-500 dark:text-slate-400">
          <li className="flex gap-2"><Icon d={I.check} size={16} className="text-emerald-500" />Track bookings & live bus position</li>
          <li className="flex gap-2"><Icon d={I.check} size={16} className="text-emerald-500" />Saved passengers for one-tap rebooking</li>
          <li className="flex gap-2"><Icon d={I.check} size={16} className="text-emerald-500" />Loyalty points & coupon wallet</li>
        </ul>
        <div className="card mt-6 p-4 text-xs text-slate-500 dark:text-slate-400">
          <b>Demo accounts</b> (password <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">demo1234</code>): traveller <code>9999999999</code> · admin <code>admin@safargo.example</code> · support <code>support@safargo.example</code> · operator <code>operator@safargo.example</code>. OTP codes are shown on screen instead of sent by SMS.
        </div>
      </section>

      <section className="card p-6 sm:p-8">
        <div className="mb-5 flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800" role="tablist" aria-label="Authentication mode">
          {(['login', 'register'] as const).map((m) => (
            <button key={m} role="tab" aria-selected={mode === m} onClick={() => { setMode(m); setErr({}); setOtpPhase('idle'); setResetPhase('idle') }}
              className={`flex-1 rounded-lg py-2 text-sm font-bold transition-all ${mode === m ? 'bg-white shadow-sm dark:bg-slate-700' : 'text-slate-500'}`}>
              {m === 'login' ? 'Sign in' : 'Create account'}
            </button>
          ))}
        </div>

        {err.form && <div role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-800/60 dark:bg-rose-900/30 dark:text-rose-300">{err.form}</div>}

        {/* Password / register form */}
        {resetPhase !== 'codeSent' && (
          <form onSubmit={submitPassword} noValidate className="space-y-4">
            {mode === 'register' && (
              <div><label className="label" htmlFor="nm">Full name</label>
                <input id="nm" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Asha Verma" autoComplete="name" /></div>
            )}
            <div><label className="label" htmlFor="ph">{mode === 'login' ? 'Mobile or email' : 'Mobile number'}</label>
              <input id="ph" inputMode="tel" className={`input ${err.phone ? '!border-rose-500' : ''}`} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" autoComplete="tel" />
              {err.phone && <p role="alert" className="mt-1 text-xs text-rose-600">{err.phone}</p>}</div>
            {mode === 'register' && (
              <div><label className="label" htmlFor="em">Email (optional)</label>
                <input id="em" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.in" autoComplete="email" /></div>
            )}
            <div><label className="label" htmlFor="pw">Password</label>
              <div className="relative">
                <input id="pw" type={showPw ? 'text' : 'password'} className="input pr-10" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min. 8 characters" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
                <button type="button" aria-label={showPw ? 'Hide password' : 'Show password'} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" onClick={() => setShowPw((s) => !s)}><Icon d={I.eye} size={16} /></button>
              </div></div>
            <button disabled={busy} className="btn-primary btn-lg w-full">{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
          </form>
        )}

        {/* Forgot password */}
        {mode === 'login' && (
          <div className="mt-4 text-sm">
            {resetPhase === 'idle' && <button type="button" className="link" onClick={startReset}>Forgot password?</button>}
            {resetPhase === 'codeSent' && (
              <form onSubmit={confirmReset} className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                <p className="text-xs font-bold uppercase text-slate-400">Reset password</p>
                <input className="input" placeholder="6-digit code" inputMode="numeric" value={resetCode} onChange={(e) => setResetCode(e.target.value.replace(/\D/g, '').slice(0, 6))} />
                <input className="input" type="password" placeholder="New password (min 8 chars)" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
                <div className="flex gap-2"><button className="btn-primary flex-1" disabled={busy}>Set new password</button><button type="button" className="btn-outline" onClick={() => setResetPhase('idle')}>Back</button></div>
              </form>
            )}
          </div>
        )}

        {/* OTP */}
        {mode === 'login' && (
          <div className="mt-6 border-t border-slate-100 pt-5 dark:border-slate-700/60">
            <p className="mb-3 text-center text-xs font-bold uppercase tracking-wide text-slate-400">or continue with OTP</p>
            {otpPhase === 'idle' ? (
              <button type="button" className="btn-outline w-full" onClick={sendOtp} disabled={busy}><Icon d={I.bolt} size={16} />Send OTP to my mobile</button>
            ) : (
              <form onSubmit={verifyOtp} className="space-y-3">
                <input inputMode="numeric" className={`input text-center font-mono text-2xl tracking-[0.5em] ${err.otp ? '!border-rose-500' : ''}`} placeholder="••••••" value={otp} maxLength={6}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} aria-label="6-digit OTP" autoFocus />
                {err.otp && <p role="alert" className="text-xs text-rose-600">{err.otp}</p>}
                <button className="btn-primary w-full" disabled={busy || otp.length !== 6}>{busy ? 'Verifying…' : 'Verify & sign in'}</button>
                <button type="button" className="link block w-full text-center text-xs" onClick={() => setOtpPhase('idle')}>Change number</button>
              </form>
            )}
          </div>
        )}
        <p className="mt-5 text-center text-xs text-slate-400">By continuing you agree to the demo Terms & Privacy notice. <Link to="/help" className="link">Help</Link></p>
      </section>
    </div>
  )
}
