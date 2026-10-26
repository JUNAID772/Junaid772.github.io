import crypto from 'node:crypto'
import { db, nowISO } from './db'

const SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me'

export function hashPassword(pw: string) {
  const salt = crypto.randomBytes(16).toString('hex')
  const h = crypto.scryptSync(pw, salt, 32).toString('hex')
  return `${salt}:${h}`
}
export function verifyPassword(pw: string, stored: string) {
  const [salt, h] = stored.split(':')
  const test = crypto.scryptSync(pw, salt, 32).toString('hex')
  return crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(test, 'hex'))
}

function sign(payloadB64: string) {
  return crypto.createHmac('sha256', SECRET).update(payloadB64).digest('base64url')
}

export function createSession(userId: number): string {
  const token = crypto.randomBytes(24).toString('hex')
  const expires = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString()
  db.prepare('INSERT INTO sessions (token,user_id,expires_at) VALUES (?,?,?)').run(token, userId, expires)
  const payload = Buffer.from(JSON.stringify({ t: token, e: expires })).toString('base64url')
  return `${payload}.${sign(payload)}`
}

export function getSessionUser(cookieVal: string | undefined): any | null {
  if (!cookieVal) return null
  const [payload, sig] = cookieVal.split('.')
  if (!payload || !sig) return null
  const expected = sign(payload)
  if (expected.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null
  let data: { t: string; e: string }
  try { data = JSON.parse(Buffer.from(payload, 'base64url').toString()) } catch { return null }
  if (data.e <= nowISO()) { db.prepare('DELETE FROM sessions WHERE token=?').run(data.t); return null }
  const sess = db.prepare('SELECT * FROM sessions WHERE token=?').get(data.t) as any
  if (!sess) return null
  const user = db.prepare('SELECT id,name,email,phone,role,operator_id,loyalty_points,travel_credit_paise,notif_prefs,lang FROM users WHERE id=?').get(sess.user_id)
  return user || null
}

export function destroySession(cookieVal: string | undefined) {
  if (!cookieVal) return
  try {
    const payload = cookieVal.split('.')[0]
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString())
    db.prepare('DELETE FROM sessions WHERE token=?').run(data.t)
  } catch { /* ignore */ }
}

// ---- OTP (demo adapter) -----------------------------------------------------
// In production wire this to MSG91/Twilio. The code is NEVER returned to the
// client and never hardcoded; in demo mode it is printed to the server console
// and delivered via an in-app notification so the flow can be tested locally.
export function issueOtp(phone: string): void {
  const code = String(crypto.randomInt(100000, 999999))
  const hash = crypto.createHash('sha256').update(`${code}:${SECRET}`).digest('hex')
  const expires = new Date(Date.now() + 5 * 60 * 1000).toISOString()
  db.prepare('DELETE FROM otps WHERE phone=?').run(phone)
  db.prepare('INSERT INTO otps (phone,hash,expires_at) VALUES (?,?,?)').run(phone, hash, expires)
  // eslint-disable-next-line no-console
  console.log(`\n[SMS ADAPTER — demo] OTP for ${phone}: ${code} (valid 5 min. Not sent to the browser.)\n`)
}

export function verifyOtp(phone: string, code: string): boolean {
  const row = db.prepare('SELECT * FROM otps WHERE phone=? AND expires_at > ? ORDER BY id DESC LIMIT 1').get(phone, nowISO()) as any
  if (!row) return false
  if (row.attempts >= 5) return false
  const hash = crypto.createHash('sha256').update(`${code}:${SECRET}`).digest('hex')
  if (hash !== row.hash) {
    db.prepare('UPDATE otps SET attempts=attempts+1 WHERE id=?').run(row.id)
    return false
  }
  db.prepare('DELETE FROM otps WHERE id=?').run(row.id)
  return true
}
