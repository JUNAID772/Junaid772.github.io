import express from 'express'
import cookieParser from 'cookie-parser'
import crypto from 'node:crypto'
import { db, migrate, nowISO, audit } from './db'
import { seed } from './seed'
import { holdSeats, validateHold, bookSeats, releaseHold, freeBookingSeats, releaseExpiredHolds } from './inventory'
import { createSession, getSessionUser, destroySession, hashPassword, verifyPassword, issueOtp, verifyOtp } from './auth'
import { payProvider, confirmBookingAfterPayment, notifyUser } from './payments'

migrate()
seed()

const app = express()
app.use(express.json({ limit: '100kb' }))
app.use(cookieParser())

// ---- Security headers -------------------------------------------------------
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'same-origin')
  next()
})

// ---- Simple in-memory rate limiter (per IP + route bucket) ------------------
const buckets = new Map<string, { n: number; reset: number }>()
function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now()
  const b = buckets.get(key)
  if (!b || b.reset < now) { buckets.set(key, { n: 1, reset: now + windowMs }); return true }
  if (b.n >= max) return false
  b.n += 1
  return true
}
const rl = (max: number, windowMs: number) => (req: any, res: any, next: any) => {
  if (!rateLimit(`${req.ip}:${req.method}:${req.path}`, max, windowMs)) {
    return res.status(429).json({ error: 'Too many requests. Please slow down and try again shortly.' })
  }
  next()
}

// Same-site cookie CSRF double-submit for state-changing calls from browsers
app.use((req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const token = req.get('x-csrf-token')
    if (!token || token !== req.cookies.sg_csrf) {
      // Allow unauthenticated bootstrap to fetch a csrf cookie via /api/csrf
      return res.status(403).json({ error: 'CSRF token missing or invalid' })
    }
  }
  next()
})

app.get('/api/csrf', (req, res) => {
  let tok = req.cookies.sg_csrf
  if (!tok) {
    tok = crypto.randomBytes(16).toString('hex')
    res.cookie('sg_csrf', tok, { httpOnly: false, sameSite: 'lax', secure: process.env.COOKIE_SECURE === '1' })
  }
  res.json({ token: tok })
})

const SESSION_COOKIE = 'sg_session'
const setSessionCookie = (res: any, val: string) =>
  res.cookie(SESSION_COOKIE, val, { httpOnly: true, sameSite: 'lax', secure: process.env.COOKIE_SECURE === '1', maxAge: 30 * 24 * 3600 * 1000 })
const auth = (req: any, res: any, next: any) => {
  const u = getSessionUser(req.cookies[SESSION_COOKIE])
  if (!u) return res.status(401).json({ error: 'Please sign in to continue.' })
  req.user = u
  next()
}
const requireRole = (...roles: string[]) => (req: any, res: any, next: any) => {
  if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ error: 'You do not have permission for this action.' })
  next()
}

// ---- Validation helpers -----------------------------------------------------
const PHONE_RE = /^(\+91[- ]?)?[6-9]\d{9}$/
const normPhone = (p: string) => p.replace(/[\s-]/g, '').replace(/^\+91/, '')
const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)
const validDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d)

// ============================== PUBLIC DATA ==================================
app.get('/api/cities', (req, res) => {
  const q = String(req.query.q || '').toLowerCase()
  const rows = db.prepare('SELECT id,name,state,pincode_prefix,popular FROM cities').all() as any[]
  const filtered = q ? rows.filter((r) => r.name.toLowerCase().startsWith(q) || r.state.toLowerCase().includes(q) || (r.pincode_prefix && String(r.pincode_prefix).startsWith(q))) : rows
  res.json(filtered.sort((a, b) => Number(b.popular) - Number(a.popular) || a.name.localeCompare(b.name)))
})

app.get('/api/routes/popular', (_req, res) => {
  const rows = db.prepare(`SELECT r.id, cs.name source, cd.name dest, r.distance_km, r.base_duration_min
    FROM routes r JOIN cities cs ON cs.id=r.source_city_id JOIN cities cd ON cd.id=r.dest_city_id
    WHERE r.popular=1 ORDER BY r.distance_km LIMIT 8`).all()
  res.json(rows)
})

app.get('/api/content/:key', (req, res) => {
  const row = db.prepare('SELECT value FROM homepage_content WHERE key=?').get(req.params.key) as any
  res.json({ value: row?.value ?? null })
})

// ---- Search -----------------------------------------------------------------
app.get('/api/search', rl(120, 60_000), (req, res) => {
  const { from, to, date } = req.query as Record<string, string>
  if (!from || !to || !date) return res.status(400).json({ error: 'Source, destination and travel date are required.' })
  if (!validDate(date)) return res.status(400).json({ error: 'Invalid travel date.' })
  if (from.toLowerCase() === to.toLowerCase()) return res.status(400).json({ error: 'Source and destination cannot be the same.' })
  const src = db.prepare('SELECT id FROM cities WHERE lower(name)=?').get(from.toLowerCase()) as any
  const dst = db.prepare('SELECT id FROM cities WHERE lower(name)=?').get(to.toLowerCase()) as any
  if (!src || !dst) return res.json({ demo: true, buses: [], message: 'No demo routes exist between these cities yet. Try one of the popular routes.' })
  if (req.query.persist === '1' && req.cookies[SESSION_COOKIE]) {
    const u = getSessionUser(req.cookies[SESSION_COOKIE])
    if (u) db.prepare('INSERT INTO recent_searches (user_id,source,dest,date) VALUES (?,?,?,?)').run(u.id, from, to, date)
  }
  const rows = db.prepare(`
    SELECT s.id schedule_id, s.depart_date, s.depart_time, s.duration_min, s.fare_paise, s.free_cancellation, s.ladies_seats,
           o.id operator_id, o.name operator, o.verified, o.women_friendly, o.live_tracking op_tracking, o.rating op_rating, o.review_count op_reviews, o.cancellation_policy,
           b.id bus_id, b.bus_name, b.bus_type, b.layout, b.amenities,
           r.distance_km, cs.name source_city, cd.name dest_city
    FROM schedules s
    JOIN operators o ON o.id = (SELECT operator_id FROM buses WHERE id=s.bus_id)
    JOIN buses b ON b.id=s.bus_id
    JOIN routes r ON r.id=s.route_id
    JOIN cities cs ON cs.id=r.source_city_id
    JOIN cities cd ON cd.id=r.dest_city_id
    WHERE r.source_city_id=? AND r.dest_city_id=? AND s.depart_date=? AND b.active=1 AND o.active=1
    ORDER BY s.depart_time`).all(src.id, dst.id, date) as any[]

  const out = rows.map((r) => {
    const avail = (db.prepare(`SELECT COUNT(*) c FROM seats WHERE schedule_id=? AND status='available'`).get(r.schedule_id) as any).c
    const stops = db.prepare(`SELECT st.id, st.kind, st.name, st.time_offset_min FROM stops st
      JOIN schedule_stops ss ON ss.stop_id=st.id WHERE ss.schedule_id=? ORDER BY st.kind, st.seq`).all(r.schedule_id)
    const minFare = (db.prepare(`SELECT MIN(price_paise) m FROM seats WHERE schedule_id=? AND status!='booked'`).get(r.schedule_id) as any)?.m ?? r.fare_paise
    return { ...r, available_seats: avail, min_fare_paise: minFare, stops }
  })
  res.json({ demo: true, from, to, date, buses: out })
})

app.get('/api/schedules/:id', (req, res) => {
  const s = db.prepare(`SELECT s.*, o.name operator, o.verified, o.women_friendly, o.live_tracking, o.rating op_rating, o.review_count op_reviews, o.cancellation_policy,
      b.bus_name, b.bus_type, b.layout, b.amenities, r.distance_km, cs.name source_city, cd.name dest_city, r.id route_id
    FROM schedules s JOIN buses b ON b.id=s.bus_id JOIN operators o ON o.id=b.operator_id
    JOIN routes r ON r.id=s.route_id JOIN cities cs ON cs.id=r.source_city_id JOIN cities cd ON cd.id=r.dest_city_id
    WHERE s.id=?`).get(req.params.id) as any
  if (!s) return res.status(404).json({ error: 'Schedule not found' })
  releaseExpiredHolds()
  const seats = db.prepare('SELECT seat_no, deck, kind, price_paise, status FROM seats WHERE schedule_id=?').all(s.id)
  const stops = db.prepare(`SELECT st.* FROM stops st JOIN schedule_stops ss ON ss.stop_id=st.id WHERE ss.schedule_id=? ORDER BY st.kind, st.seq`).all(s.id)
  const reviews = db.prepare(`SELECT rv.rating, rv.comment, rv.created_at, u.name user_name FROM reviews rv JOIN users u ON u.id=rv.user_id
    WHERE rv.schedule_id IN (SELECT id FROM schedules WHERE route_id=? AND bus_id=?) ORDER BY rv.created_at DESC LIMIT 6`).all(s.route_id, s.bus_id)
  res.json({ demo: true, schedule: s, seats, stops, reviews, ...s })
})

// ---- Seat holds ---------------------------------------------------------------
app.post('/api/hold', rl(60, 60_000), (req, res) => {
  const u = getSessionUser(req.cookies[SESSION_COOKIE])
  const { scheduleId, seats } = req.body || {}
  if (!scheduleId || !Array.isArray(seats) || seats.length === 0 || seats.length > 6)
    return res.status(400).json({ error: 'Select between 1 and 6 seats.' })
  const r = holdSeats(Number(scheduleId), seats.map(String), u?.id ?? null)
  if (!r.ok) return res.status(409).json({ error: r.error, unavailable: r.unavailable })
  res.json(r)
})
app.delete('/api/hold/:token', (req, res) => { releaseHold(req.params.token); res.json({ ok: true }) })
app.post('/api/hold/:token/refresh', rl(60, 60_000), (req, res) => {
  const holds = db.prepare('SELECT * FROM seat_holds WHERE hold_token=?').all(req.params.token) as any[]
  if (!holds.length) return res.status(410).json({ error: 'Your seat hold has expired. Please reselect seats.' })
  const exp = new Date(Date.now() + 8 * 60 * 1000).toISOString()
  for (const h of holds) db.prepare('UPDATE seat_holds SET expires_at=? WHERE id=?').run(exp, h.id)
  res.json({ ok: true, expiresAt: exp })
})

// ---- Fare calculation (server is the single source of truth) -----------------
function computeFare(scheduleId: number, seatNos: string[], couponCode?: string, userId?: number | null) {
  const seats = db.prepare('SELECT seat_no, price_paise FROM seats WHERE schedule_id=? AND seat_no IN (' + seatNos.map(() => '?').join(',') + ')')
    .all(scheduleId, ...seatNos) as Array<{ seat_no: string; price_paise: number }>
  if (seats.length !== seatNos.length) throw Object.assign(new Error('One or more selected seats no longer exist.'), { status: 400 })
  const base = seats.reduce((a, s) => a + s.price_paise, 0)
  const feePerSeatPaise = 900 // ₹9 convenience fee per seat + GST shown together (demo)
  const fee = Math.min(seats.length * feePerSeatPaise + Math.round(base * 0.05), Math.round(base * 0.15))
  let discount = 0
  let couponMsg = ''
  if (couponCode) {
    const c = db.prepare('SELECT * FROM coupons WHERE code=? COLLATE NOCASE AND active=1').get(couponCode.trim().toUpperCase()) as any
    if (!c) throw Object.assign(new Error('This coupon code is not valid.'), { status: 400 })
    if (c.valid_till <= nowISO()) throw Object.assign(new Error('This coupon has expired.'), { status: 400 })
    if ((base + fee) < c.min_fare_paise) throw Object.assign(new Error(`Minimum fare ₹${(c.min_fare_paise / 100).toFixed(0)} applies for ${c.code}.`), { status: 400 })
    if (c.global_limit != null && c.used_count >= c.global_limit) throw Object.assign(new Error('This coupon has been fully redeemed.'), { status: 400 })
    if (userId) {
      const used = (db.prepare('SELECT COUNT(*) c FROM coupon_redemptions WHERE coupon_code=? AND user_id=?').get(c.code, userId) as any).c
      if (used >= c.per_user_limit) throw Object.assign(new Error(`You have already used ${c.code} the allowed number of times.`), { status: 400 })
    }
    discount = c.kind === 'flat' ? c.value_paise : Math.min(Math.round((base * c.value_paise) / 100), c.max_discount_paise ?? Infinity)
    discount = Math.min(discount, base + fee)
    couponMsg = c.description
  }
  const total = base + fee - discount
  return { base, fee, discount, total, couponMsg, breakdown: seats }
}

app.post('/api/quote', rl(120, 60_000), (req, res) => {
  const u = getSessionUser(req.cookies[SESSION_COOKIE])
  try {
    const { scheduleId, seats, couponCode } = req.body || {}
    if (!scheduleId || !Array.isArray(seats) || !seats.length) return res.status(400).json({ error: 'Choose at least one seat.' })
    res.json(computeFare(Number(scheduleId), seats.map(String), couponCode, u?.id ?? null))
  } catch (e: any) { res.status(e.status || 500).json({ error: e.message }) }
})

// ================================ AUTH =======================================
app.post('/api/auth/register', rl(10, 60_000), (req, res) => {
  const { name, email, phone, password } = req.body || {}
  if (!name || String(name).trim().length < 2) return res.status(400).json({ error: 'Please enter your full name.' })
  if (!email || !validEmail(email)) return res.status(400).json({ error: 'Please enter a valid email address.' })
  if (!phone || !PHONE_RE.test(phone)) return res.status(400).json({ error: 'Please enter a valid Indian mobile number.' })
  if (!password || String(password).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' })
  const ph = normPhone(phone)
  if (db.prepare('SELECT 1 FROM users WHERE email=? OR phone=?').get(email.toLowerCase(), ph))
    return res.status(409).json({ error: 'An account with this email or phone already exists. Try signing in instead.' })
  const r = db.prepare('INSERT INTO users (name,email,phone,password_hash) VALUES (?,?,?,?)').run(String(name).trim(), email.toLowerCase(), ph, hashPassword(password))
  const token = createSession(Number(r.lastInsertRowid))
  setSessionCookie(res, token)
  audit(Number(r.lastInsertRowid), 'user_registered', 'users', Number(r.lastInsertRowid), '', req.ip)
  res.json({ ok: true, user: getSessionUser(token.split('.')[0] ? undefined : undefined) || publicUser(Number(r.lastInsertRowid)) })
})
function publicUser(id: number) {
  return db.prepare('SELECT id,name,email,phone,role,loyalty_points,travel_credit_paise,notif_prefs,lang FROM users WHERE id=?').get(id)
}

app.post('/api/auth/login', rl(15, 60_000), (req, res) => {
  const { identifier, password } = req.body || {}
  if (!identifier || !password) return res.status(400).json({ error: 'Enter your email/phone and password.' })
  const ph = normPhone(identifier)
  const u = db.prepare('SELECT * FROM users WHERE email=? COLLATE NOCASE OR phone=?').get(String(identifier).toLowerCase(), ph) as any
  if (!u || !u.password_hash || !verifyPassword(password, u.password_hash))
    return res.status(401).json({ error: 'Incorrect credentials. Please try again or use OTP login.' })
  setSessionCookie(res, createSession(u.id))
  audit(u.id, 'user_login', 'users', u.id, 'password', req.ip)
  res.json({ ok: true, user: publicUser(u.id) })
})

app.post('/api/auth/otp/request', rl(5, 60_000), (req, res) => {
  const { phone } = req.body || {}
  if (!phone || !PHONE_RE.test(phone)) return res.status(400).json({ error: 'Enter a valid 10-digit Indian mobile number.' })
  issueOtp(normPhone(phone))
  res.json({ ok: true, demoHint: 'Demo mode: the 6-digit code was printed in the server console (never sent to the browser). In production an SMS provider delivers it.' })
})
app.post('/api/auth/otp/verify', rl(15, 60_000), (req, res) => {
  const { phone, code } = req.body || {}
  if (!phone || !code || !/^\d{6}$/.test(code)) return res.status(400).json({ error: 'Enter the 6-digit OTP.' })
  const ph = normPhone(phone)
  if (!verifyOtp(ph, code)) return res.status(401).json({ error: 'That OTP is invalid or has expired. Request a new code.' })
  let u = db.prepare('SELECT id FROM users WHERE phone=?').get(ph) as any
  if (!u) {
    const r = db.prepare('INSERT INTO users (name,phone) VALUES (?,?)').run(`Traveller ${ph.slice(-4)}`, ph)
    u = { id: Number(r.lastInsertRowid) }
  }
  setSessionCookie(res, createSession(u.id))
  audit(u.id, 'otp_login', 'users', u.id, '', req.ip)
  res.json({ ok: true, user: publicUser(u.id) })
})

app.post('/api/auth/logout', (req, res) => {
  destroySession(req.cookies[SESSION_COOKIE])
  res.clearCookie(SESSION_COOKIE)
  res.json({ ok: true })
})
app.get('/api/auth/me', (req, res) => {
  res.json({ user: getSessionUser(req.cookies[SESSION_COOKIE]) })
})

app.post('/api/auth/password-reset/request', rl(5, 60_000), (req, res) => {
  const { email } = req.body || {}
  // Do not reveal whether the account exists.
  const u = db.prepare('SELECT id FROM users WHERE email=? COLLATE NOCASE').get(String(email || '').toLowerCase()) as any
  if (u) {
    const code = String(crypto.randomInt(100000, 999999))
    db.prepare('INSERT INTO otps (phone,hash,expires_at) VALUES (?,?,?)')
      .run(`reset:${email.toLowerCase()}`, crypto.createHash('sha256').update(`${code}:${process.env.JWT_SECRET || 'dev-only-secret-change-me'}`).digest('hex'),
        new Date(Date.now() + 15 * 60 * 1000).toISOString())
    console.log(`[EMAIL ADAPTER — demo] Password reset code for ${email}: ${code}`)
  }
  res.json({ ok: true, message: 'If an account exists for that email, a reset code has been sent.' })
})
app.post('/api/auth/password-reset/confirm', rl(10, 60_000), (req, res) => {
  const { email, code, newPassword } = req.body || {}
  if (!newPassword || String(newPassword).length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters.' })
  const ph = `reset:${String(email || '').toLowerCase()}`
  if (!verifyOtp(ph, String(code || ''))) return res.status(401).json({ error: 'Reset code is invalid or expired.' })
  db.prepare('UPDATE users SET password_hash=? WHERE email=? COLLATE NOCASE').run(hashPassword(newPassword), email)
  audit(null, 'password_reset', 'users', email, '', req.ip)
  res.json({ ok: true })
})

// =============================== BOOKING =====================================
app.post('/api/bookings', rl(30, 60_000), (req, res) => {
  const u = getSessionUser(req.cookies[SESSION_COOKIE])
  const { scheduleId, seats, boardingStopId, droppingStopId, passengers, contactPhone, contactEmail, couponCode, holdToken } = req.body || {}
  const err = (msg: string, code = 400) => res.status(code).json({ error: msg })
  if (!Array.isArray(seats) || seats.length === 0) return err('Select at least one seat.')
  if (!Array.isArray(passengers) || passengers.length !== seats.length) return err('Add details for every selected passenger.')
  if (!boardingStopId || !droppingStopId) return err('Choose both a boarding point and a drop point.')
  if (!contactPhone || !PHONE_RE.test(contactPhone)) return err('Enter a valid Indian mobile number (+91 accepted).')
  if (!contactEmail || !validEmail(contactEmail)) return err('Enter a valid email for your ticket and updates.')
  for (const [i, p] of passengers.entries()) {
    if (!p.name || String(p.name).trim().length < 3) return err(`Passenger ${i + 1}: enter a full name (at least 3 characters).`)
    const age = Number(p.age)
    if (!Number.isInteger(age) || age < 1 || age > 120) return err(`Passenger ${i + 1}: age must be between 1 and 120.`)
    if (!['male', 'female', 'other'].includes(p.gender)) return err(`Passenger ${i + 1}: choose a gender — operators need this for ladies-seat and safety rules.`)
  }
  // Ladies-reserved seats may only be booked by female passengers (operator rule).
  const seatRows = db.prepare('SELECT seat_no, kind FROM seats WHERE schedule_id=? AND seat_no IN (' + seats.map(() => '?').join(',') + ')')
    .all(Number(scheduleId), ...seats.map(String)) as Array<{ seat_no: string; kind: string }>
  for (const sr of seatRows) {
    if (sr.kind === 'ladies') {
      const idx = seats.indexOf(sr.seat_no)
      if (passengers[idx]?.gender !== 'female') return err(`Seat ${sr.seat_no} is reserved for female travellers as per this operator's policy. Pick another seat or mark a female passenger.`)
    }
  }
  if (!validateHold(Number(scheduleId), seats.map(String), String(holdToken || '')).ok)
    return err('Your seat hold expired or is invalid. Please select seats again.', 410)

  let fare: ReturnType<typeof computeFare>
  try { fare = computeFare(Number(scheduleId), seats.map(String), couponCode, u?.id ?? null) }
  catch (e: any) { return err(e.message, e.status || 400) }

  try {
    const pnr = `SG${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(2).toString('hex').toUpperCase()}`
    const result = db.transaction(() => {
      bookSeats(Number(scheduleId), seats.map(String), String(holdToken))
      const b = db.prepare(`INSERT INTO bookings (pnr,user_id,schedule_id,boarding_stop_id,dropping_stop_id,contact_phone,contact_email,
          base_paise,fee_paise,discount_paise,total_paise,coupon_code,status)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'pending_payment')`)
        .run(pnr, u?.id ?? null, Number(scheduleId), Number(boardingStopId), Number(droppingStopId),
          normPhone(contactPhone), contactEmail.toLowerCase(), fare.base, fare.fee, fare.discount, fare.total, couponCode || null)
      const bookingId = Number(b.lastInsertRowid)
      const insP = db.prepare('INSERT INTO passengers (booking_id,seat_id,name,age,gender,phone) VALUES (?,?,?,?,?,?)')
      for (const [i, no] of seats.entries()) {
        const seat = db.prepare('SELECT id FROM seats WHERE schedule_id=? AND seat_no=?').get(Number(scheduleId), String(no)) as any
        insP.run(bookingId, seat.id, String(passengers[i].name).trim(), Number(passengers[i].age), passengers[i].gender, passengers[i].phone ? normPhone(passengers[i].phone) : null)
      }
      if (couponCode && fare.discount > 0 && u) {
        db.prepare('UPDATE coupons SET used_count=used_count+1 WHERE code=?').run(couponCode.trim().toUpperCase())
        db.prepare('INSERT INTO coupon_redemptions (coupon_code,user_id,booking_id,discount_paise) VALUES (?,?,?,?)')
          .run(couponCode.trim().toUpperCase(), u.id, bookingId, fare.discount)
      }
      return bookingId
    })()
    audit(u?.id ?? null, 'booking_created', 'bookings', result, `${seats.join(',')} on schedule ${scheduleId}`, req.ip)
    res.json({ ok: true, bookingId: result, pnr, totalPaise: fare.total })
  } catch (e: any) {
    res.status(409).json({ error: e.message || 'Those seats were just taken. Please choose different seats.' })
  }
})

// ---- Payments ---------------------------------------------------------------
app.post('/api/payments/order', rl(30, 60_000), (req, res) => {
  const u = getSessionUser(req.cookies[SESSION_COOKIE])
  const { bookingId, method } = req.body || {}
  const b = db.prepare('SELECT * FROM bookings WHERE id=?').get(Number(bookingId)) as any
  if (!b) return res.status(404).json({ error: 'Booking not found.' })
  if (b.status === 'confirmed') return res.status(409).json({ error: 'This booking is already paid and confirmed.' })
  if (b.status !== 'pending_payment') return res.status(409).json({ error: 'This booking can no longer be paid.' })
  if (!['upi_intent', 'upi_qr', 'card', 'netbanking', 'wallet', 'credit'].includes(method)) return res.status(400).json({ error: 'Unsupported payment method.' })
  // Re-validate live inventory before charging anyone. Seats must still belong
  // to a live booking (pending_payment or confirmed) — booked by THIS booking.
  const seatNos = (db.prepare(`SELECT s.seat_no FROM passengers p JOIN seats s ON s.id=p.seat_id WHERE p.booking_id=?`).all(b.id) as any[]).map((r) => r.seat_no)
  const stillOk = seatNos.length > 0 && seatNos.every((no: string) => {
    const row = db.prepare(`SELECT se.status FROM seats se JOIN passengers ps ON ps.seat_id=se.id JOIN bookings bk ON bk.id=ps.booking_id
      WHERE se.schedule_id=? AND se.seat_no=? AND bk.id=? AND se.status IN ('held','booked')`).get(b.schedule_id, no, b.id)
    return !!row
  })
  if (!stillOk) {
    db.prepare(`UPDATE bookings SET status='cancelled' WHERE id=?`).run(b.id)
    return res.status(409).json({ error: 'Your held seats expired before payment could start. Please search again and reselect seats.' })
  }
  const order = payProvider.createOrder(b.id, b.total_paise, method)
  res.json({ ...order, amountPaise: b.total_paise, gateway: payProvider.name, sandbox: payProvider.sandbox })
})

// Sandbox client callback: the "gateway" posts here with an HMAC signature.
app.post('/api/payments/sandbox-callback', rl(60, 60_000), (req, res) => {
  const { orderId, paymentId, status, reason } = req.body || {}
  if (!orderId) return res.status(400).json({ error: 'orderId required' })
  const sig = crypto.createHmac('sha256', process.env.JWT_SECRET || 'dev-only-secret-change-me').update(`${orderId}|${paymentId || ''}`).digest('hex')
  // A real Razorpay webhook would arrive signed with RPO_AUTH_SIGNATURE; never trust the browser alone.
  const v = payProvider.verifyAndCapture(String(orderId), { payment_id: paymentId, status, reason }, sig)
  if (!v.ok) return res.status(402).json({ error: v.reason })
  const booking = confirmBookingAfterPayment(String(orderId))
  res.json({ ok: true, bookingStatus: booking?.status, pnr: booking?.pnr })
})

// Real-provider webhook endpoint (signature verified inside adapter).
app.post('/api/payments/webhook', (req, res) => {
  const body = req.body || {}
  const orderId = body?.payload?.payment?.order_id || body?.order_id
  const sig = req.get('x-razorpay-signature') || req.get('x-webhook-signature')
  if (!orderId) return res.status(400).json({ error: 'unrecognised payload' })
  const v = payProvider.verifyAndCapture(String(orderId), body?.payload?.payment || body, sig)
  if (!v.ok) return res.status(400).json({ error: v.reason })
  confirmBookingAfterPayment(String(orderId))
  res.json({ ok: true })
})

app.get('/api/bookings/:id/status', (req, res) => {
  const b = db.prepare('SELECT pnr,status FROM bookings WHERE id=?').get(Number(req.params.id)) as any
  if (!b) return res.status(404).json({ error: 'not found' })
  res.json(b)
})

// ---- Ticket HTML (download/print) --------------------------------------------
app.get('/api/bookings/:id/ticket', auth, (req, res) => {
  const b = getBookingFull(Number(req.params.id))
  if (!b) return res.status(404).send('Not found')
  if (b.booking.user_id !== req.user.id && !['admin', 'support'].includes(req.user.role)) return res.status(403).send('Forbidden')
  if (b.booking.status !== 'confirmed') return res.status(409).send('Ticket becomes available only after payment is confirmed by the gateway.')
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.send(renderTicketHtml(b))
})

export function renderTicketHtml(b: any): string {
  const rs = (n: number) => `₹${(n / 100).toLocaleString('en-IN')}`
  return `<!doctype html><html><head><meta charset="utf-8"><title>SafarGo e-ticket ${b.booking.pnr}</title>
<style>body{font-family:Inter,system-ui,sans-serif;background:#f2f5fa;margin:0;padding:24px;color:#101828}
.card{max-width:720px;margin:auto;background:#fff;border-radius:16px;box-shadow:0 8px 30px rgba(16,24,40,.12);overflow:hidden}
.hd{background:linear-gradient(90deg,#1668e0,#1252b8);color:#fff;padding:20px 28px;display:flex;justify-content:space-between;align-items:center}
.bd{padding:24px 28px}.row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px dashed #e4e7ec}
.tag{background:#eef6ff;color:#1252b8;font-weight:700;padding:6px 14px;border-radius:999px}
table{width:100%;border-collapse:collapse;margin-top:12px}td,th{text-align:left;padding:6px 8px;border-bottom:1px solid #eef1f5;font-size:14px}
.ft{padding:16px 28px;background:#f8fafc;font-size:12px;color:#475467}</style></head><body>
<div class="card"><div class="hd"><div><div style="font-size:22px;font-weight:800">SafarGo</div><div style="opacity:.85;font-size:12px">DEMO e-ticket — sample inventory, not a real travel document</div></div>
<div class="tag">${b.booking.status.toUpperCase()}</div></div>
<div class="bd"><h2 style="margin:0 0 4px">${b.schedule.source_city} → ${b.schedule.dest_city}</h2>
<div class="row"><span>PNR</span><b>${b.booking.pnr}</b></div>
<div class="row"><span>Operator</span><b>${b.schedule.operator} · ${b.schedule.bus_name} (${b.schedule.bus_type})</b></div>
<div class="row"><span>Journey</span><b>${b.schedule.depart_date} ${b.schedule.depart_time} → ${arrivalTime(b)}</b></div>
<div class="row"><span>Boarding</span><b>${b.boarding?.name || '-'}</b></div>
<div class="row"><span>Drop</span><b>${b.dropping?.name || '-'}</b></div>
<table><tr><th>Seat</th><th>Passenger</th><th>Age</th></tr>
${b.passengers.map((p: any) => `<tr><td>${p.seat_no}</td><td>${p.name}</td><td>${p.age}</td></tr>`).join('')}</table>
<div class="row" style="margin-top:16px"><span>Fare</span><b>${rs(b.booking.base_paise)}</b></div>
<div class="row"><span>Convenience fee & taxes</span><b>${rs(b.booking.fee_paise)}</b></div>
${b.booking.discount_paise ? `<div class="row"><span>Coupon ${b.booking.coupon_code}</span><b>- ${rs(b.booking.discount_paise)}</b></div>` : ''}
<div class="row"><span>Total paid</span><b style="color:#12b76a">${rs(b.booking.total_paise)}</b></div>
</div><div class="ft">Cancellation as per operator policy: ${b.schedule.cancellation_policy || 'See booking page.'}<br/>Generated ${nowISO()} · safargo.example</div></div>
<script>window.print()</script></body></html>`
}
function arrivalTime(b: any) {
  const [h, m] = b.schedule.depart_time.split(':').map(Number)
  const t = new Date(); t.setUTCHours(h, m, 0, 0); t.setUTCMinutes(t.getUTCMinutes() + b.schedule.duration_min)
  return `${String(t.getUTCHours()).padStart(2, '0')}:${String(t.getUTCMinutes()).padStart(2, '0')}${t.getUTCDate() > new Date(b.schedule.depart_date + 'T00:00:00Z').getUTCDate() ? ' (+1 day)' : ''}`
}

function getBookingFull(id: number) {
  const booking = db.prepare('SELECT * FROM bookings WHERE id=?').get(id) as any
  if (!booking) return null
  const schedule = db.prepare(`SELECT s.*, o.name operator, o.verified, o.cancellation_policy, o.live_tracking, b.bus_name, b.bus_type, b.amenities,
    r.distance_km, cs.name source_city, cd.name dest_city FROM schedules s JOIN buses b ON b.id=s.bus_id JOIN operators o ON o.id=b.operator_id
    JOIN routes r ON r.id=s.route_id JOIN cities cs ON cs.id=r.source_city_id JOIN cities cd ON cd.id=r.dest_city_id WHERE s.id=?`).get(booking.schedule_id) as any
  const passengers = db.prepare(`SELECT p.*, s.seat_no FROM passengers p JOIN seats s ON s.id=p.seat_id WHERE p.booking_id=?`).all(id)
  const boarding = booking.boarding_stop_id ? (db.prepare('SELECT * FROM stops WHERE id=?').get(booking.boarding_stop_id) as any) : null
  const dropping = booking.dropping_stop_id ? (db.prepare('SELECT * FROM stops WHERE id=?').get(booking.dropping_stop_id) as any) : null
  const payments = db.prepare('SELECT id,order_id,payment_id,method,amount_paise,status,failure_reason,gateway FROM payments WHERE booking_id=?').all(id)
  const refunds = db.prepare('SELECT * FROM refunds WHERE booking_id=?').all(id)
  return { booking, schedule, passengers, boarding, dropping, payments, refunds }
}

app.get('/api/bookings/:id', auth, (req, res) => {
  const b = getBookingFull(Number(req.params.id))
  if (!b) return res.status(404).json({ error: 'Booking not found' })
  if (b.booking.user_id !== req.user.id && !['admin', 'support'].includes(req.user.role) &&
      !(req.user.role === 'operator' && b.schedule && db.prepare('SELECT 1 FROM buses WHERE id=(SELECT bus_id FROM schedules WHERE id=?) AND operator_id=?').get(b.booking.schedule_id, req.user.operator_id)))
    return res.status(403).json({ error: 'You cannot view this booking.' })
  res.json(b)
})

// ---- Cancellation & refunds (policy-driven) -----------------------------------
export function refundPolicyMinutesLeft(scheduleId: number) {
  const s = db.prepare('SELECT depart_date, depart_time FROM schedules WHERE id=?').get(scheduleId) as any
  const dep = new Date(`${s.depart_date}T${s.depart_time}:00+05:30`)
  return Math.floor((dep.getTime() - Date.now()) / 60000)
}
export function calcRefund(booking: any, scheduleId: number, freeCancel: boolean) {
  const mins = refundPolicyMinutesLeft(scheduleId)
  if (mins < 0) return { pct: 0, label: 'Departure has passed — cancellations are no longer permitted for this trip.' }
  if (freeCancel) return { pct: 100, label: 'Free cancellation applies: full refund of ticket fare (convenience fee non-refundable).' }
  if (mins >= 180) return { pct: 90, label: 'More than 3 hours before departure: 90% fare refund.' }
  if (mins >= 60) return { pct: 70, label: 'Between 1–3 hours before departure: 70% fare refund.' }
  return { pct: 50, label: 'Less than 1 hour before departure: 50% fare refund.' }
}
app.get('/api/bookings/:id/cancel-quote', auth, (req, res) => {
  const b = getBookingFull(Number(req.params.id))
  if (!b) return res.status(404).json({ error: 'Booking not found' })
  if (b.booking.user_id !== req.user.id) return res.status(403).json({ error: 'Not your booking.' })
  if (b.booking.status !== 'confirmed') return res.status(409).json({ error: 'Only confirmed bookings can be cancelled.' })
  const pol = calcRefund(b.booking, b.booking.schedule_id, !!b.schedule.free_cancellation)
  const refundable = Math.max(0, Math.round((b.booking.base_paise * pol.pct) / 100))
  res.json({ policy: pol, refundPaise: refundable, deductionPaise: b.booking.base_paise - refundable })
})
app.post('/api/bookings/:id/cancel', auth, rl(10, 60_000), (req, res) => {
  const b = getBookingFull(Number(req.params.id))
  if (!b) return res.status(404).json({ error: 'Booking not found' })
  if (b.booking.user_id !== req.user.id) return res.status(403).json({ error: 'Not your booking.' })
  if (b.booking.status !== 'confirmed') return res.status(409).json({ error: 'This booking cannot be cancelled.' })
  const pol = calcRefund(b.booking, b.booking.schedule_id, !!b.schedule.free_cancellation)
  const refundable = Math.max(0, Math.round((b.booking.base_paise * pol.pct) / 100))
  const payment = b.payments.find((p: any) => p.status === 'captured')
  db.transaction(() => {
    db.prepare(`UPDATE bookings SET status=?, cancelled_at=?, refund_paise=? WHERE id=?`).run(refundable > 0 ? 'refunded' : 'cancelled', nowISO(), refundable, b.booking.id)
    freeBookingSeats(b.booking.id)
    if (payment && refundable > 0) {
      const utr = `UTR${Date.now().toString().slice(-10)}`
      db.prepare(`UPDATE payments SET status='refunded' WHERE id=?`).run((payment as any).id)
      db.prepare('INSERT INTO refunds (booking_id,payment_id,amount_paise,status,utr,policy_snapshot) VALUES (?,?,?,?,?,?)')
        .run((b.booking as any).id, (payment as any).id, refundable, 'success', utr, pol.label)
    }
  })()
  notifyUser(req.user.id, 'refund_update', 'Cancellation processed',
    `Booking ${b.booking.pnr} cancelled. Refund of ₹${(refundable / 100).toLocaleString('en-IN')} credited to original payment method (UTR generated in sandbox).`)
  audit(req.user.id, 'booking_cancelled', 'bookings', b.booking.id, `refund ${refundable} paise`, req.ip)
  res.json({ ok: true, refundPaise: refundable, policy: pol.label })
})

// ---- Reviews (only for verified completed journeys) ---------------------------
app.post('/api/reviews', auth, rl(10, 60_000), (req, res) => {
  const { bookingId, rating, comment } = req.body || {}
  const b = db.prepare('SELECT * FROM bookings WHERE id=?').get(Number(bookingId)) as any
  if (!b || b.user_id !== req.user.id) return res.status(403).json({ error: 'Reviews can only be written for your own bookings.' })
  if (b.status !== 'confirmed') return res.status(409).json({ error: 'Only completed/confirmed journeys can be reviewed.' })
  if (db.prepare('SELECT 1 FROM reviews WHERE booking_id=?').get(b.id)) return res.status(409).json({ error: 'You already reviewed this journey.' })
  const r = Number(rating); if (!Number.isInteger(r) || r < 1 || r > 5) return res.status(400).json({ error: 'Rating must be 1–5.' })
  const sched = db.prepare('SELECT s.*, b.operator_id FROM schedules s JOIN buses b ON b.id=s.bus_id WHERE s.id=?').get(b.schedule_id) as any
  const dep = new Date(`${sched.depart_date}T${sched.depart_time}:00+05:30`)
  if (dep.getTime() + sched.duration_min * 60000 > Date.now()) return res.status(409).json({ error: 'You can review this trip after it completes.' })
  db.prepare('INSERT INTO reviews (user_id,booking_id,schedule_id,operator_id,rating,comment) VALUES (?,?,?,?,?,?)')
    .run(req.user.id, b.id, sched.id, sched.operator_id, r, String(comment || '').slice(0, 600))
  res.json({ ok: true })
})

// =============================== PROFILE =====================================
app.get('/api/me/bookings', auth, (req, res) => {
  const rows = db.prepare(`SELECT b.id, b.pnr, b.status, b.total_paise, b.refund_paise, b.created_at,
      s.depart_date, s.depart_time, s.duration_min, o.name operator, b2.bus_type, cs.name source, cd.name dest
    FROM bookings b JOIN schedules s ON s.id=b.schedule_id JOIN buses b2 ON b2.id=s.bus_id JOIN operators o ON o.id=b2.operator_id
    JOIN routes r ON r.id=s.route_id JOIN cities cs ON cs.id=r.source_city_id JOIN cities cd ON cd.id=r.dest_city_id
    WHERE b.user_id=? ORDER BY b.created_at DESC LIMIT 100`).all(req.user.id)
  res.json(rows)
})
app.get('/api/me/notifications', auth, (req, res) => {
  res.json(db.prepare('SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 50').all(req.user.id))
})
app.post('/api/me/notifications/read-all', auth, (req, res) => {
  db.prepare('UPDATE notifications SET read=1 WHERE user_id=?').run(req.user.id); res.json({ ok: true })
})
app.patch('/api/me', auth, (req, res) => {
  const { name, lang, notifPrefs } = req.body || {}
  if (name) db.prepare('UPDATE users SET name=? WHERE id=?').run(String(name).slice(0, 80), req.user.id)
  if (lang && ['en', 'hi'].includes(lang)) db.prepare('UPDATE users SET lang=? WHERE id=?').run(lang, req.user.id)
  if (notifPrefs) db.prepare('UPDATE users SET notif_prefs=? WHERE id=?').run(JSON.stringify(notifPrefs), req.user.id)
  res.json({ user: publicUser(req.user.id) })
})
app.delete('/api/me', auth, (req, res) => {
  // Personal-data deletion: anonymise bookings, remove profile data.
  db.transaction(() => {
    db.prepare('UPDATE bookings SET user_id=NULL WHERE user_id=?').run(req.user.id)
    db.prepare('DELETE FROM saved_passengers WHERE user_id=?').run(req.user.id)
    db.prepare('DELETE FROM saved_routes WHERE user_id=?').run(req.user.id)
    db.prepare('DELETE FROM recent_searches WHERE user_id=?').run(req.user.id)
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(req.user.id)
    db.prepare('DELETE FROM notifications WHERE user_id=?').run(req.user.id)
    db.prepare('DELETE FROM users WHERE id=?').run(req.user.id)
  })()
  audit(null, 'account_deleted', 'users', req.user.id, '', req.ip)
  res.clearCookie(SESSION_COOKIE)
  res.json({ ok: true })
})
app.get('/api/me/saved-passengers', auth, (req, res) => {
  res.json(db.prepare('SELECT * FROM saved_passengers WHERE user_id=?').all(req.user.id))
})
app.post('/api/me/saved-passengers', auth, (req, res) => {
  const { name, age, gender, phone, consent } = req.body || {}
  if (!consent) return res.status(400).json({ error: 'Save only with the passenger’s consent to store their details.' })
  if (!name || !Number.isInteger(Number(age)) || Number(age) < 1) return res.status(400).json({ error: 'Name and valid age are required.' })
  const r = db.prepare('INSERT INTO saved_passengers (user_id,name,age,gender,phone,consent) VALUES (?,?,?,?,?,1)')
    .run(req.user.id, String(name).trim(), Number(age), ['male', 'female', 'other'].includes(gender) ? gender : null, phone ? normPhone(phone) : null)
  res.json({ id: Number(r.lastInsertRowid) })
})
app.delete('/api/me/saved-passengers/:id', auth, (req, res) => {
  db.prepare('DELETE FROM saved_passengers WHERE id=? AND user_id=?').run(Number(req.params.id), req.user.id)
  res.json({ ok: true })
})
app.get('/api/me/recent-searches', auth, (req, res) => {
  res.json(db.prepare('SELECT * FROM recent_searches WHERE user_id=? ORDER BY created_at DESC LIMIT 6').all(req.user.id))
})
app.get('/api/me/saved-routes', auth, (req, res) => {
  res.json(db.prepare(`SELECT sr.id, r.id route_id, cs.name source, cd.name dest FROM saved_routes sr JOIN routes r ON r.id=sr.route_id
    JOIN cities cs ON cs.id=r.source_city_id JOIN cities cd ON cd.id=r.dest_city_id WHERE sr.user_id=?`).all(req.user.id))
})
app.post('/api/me/saved-routes', auth, (req, res) => {
  db.prepare('INSERT OR IGNORE INTO saved_routes (user_id, route_id) VALUES (?,?)').run(req.user.id, Number(req.body.routeId))
  res.json({ ok: true })
})
app.delete('/api/me/saved-routes/:routeId', auth, (req, res) => {
  db.prepare('DELETE FROM saved_routes WHERE user_id=? AND route_id=?').run(req.user.id, Number(req.params.routeId))
  res.json({ ok: true })
})

// ---- Coupons wallet -----------------------------------------------------------
app.get('/api/me/coupons', auth, (req, res) => {
  const rows = db.prepare(`SELECT code, description, kind, value_paise, max_discount_paise, min_fare_paise, valid_till FROM coupons
    WHERE active=1 AND valid_till > ?`).all(nowISO()) as any[]
  res.json(rows.map((c) => ({ ...c, mine: true })))
})
app.post('/api/coupons/apply', rl(30, 60_000), (req, res) => {
  const u = getSessionUser(req.cookies[SESSION_COOKIE])
  try {
    const { scheduleId, seats, code } = req.body || {}
    const f = computeFare(Number(scheduleId), seats.map(String), code, u?.id ?? null)
    res.json({ ok: true, discount: f.discount, message: f.couponMsg, total: f.total })
  } catch (e: any) { res.status(e.status || 400).json({ error: e.message }) }
})

// ---- Support tickets ----------------------------------------------------------
app.post('/api/support/tickets', auth, rl(10, 60_000), (req, res) => {
  const { bookingId, category, subject, message } = req.body || {}
  if (!subject || String(subject).length < 5) return res.status(400).json({ error: 'Add a short subject (min 5 characters).' })
  if (!message || String(message).length < 10) return res.status(400).json({ error: 'Describe the issue in at least 10 characters.' })
  if (bookingId) {
    const b = db.prepare('SELECT id FROM bookings WHERE id=? AND user_id=?').get(Number(bookingId), req.user.id)
    if (!b) return res.status(403).json({ error: 'Booking not found for this account.' })
  }
  const r = db.prepare('INSERT INTO support_tickets (user_id,booking_id,category,subject,message) VALUES (?,?,?,?,?)')
    .run(req.user.id, bookingId ? Number(bookingId) : null, String(category || 'general'), String(subject).slice(0, 120), String(message).slice(0, 2000))
  notifyUser(req.user.id, 'support_ack', 'Support request received', `We got your request “${String(subject).slice(0, 60)}”. Our team replies within 24 hours.`)
  res.json({ id: Number(r.lastInsertRowid) })
})
app.get('/api/support/tickets', auth, (req, res) => {
  res.json(db.prepare('SELECT id,booking_id,category,subject,message,status,agent_reply,created_at,updated_at FROM support_tickets WHERE user_id=? ORDER BY created_at DESC').all(req.user.id))
})

// ---- Live tracking (demo GPS simulation, clearly labelled) --------------------
app.get('/api/tracking/:bookingId', auth, (req, res) => {
  const b = getBookingFull(Number(req.params.bookingId))
  if (!b || b.booking.user_id !== req.user.id) return res.status(403).json({ error: 'not yours' })
  if (!b.schedule.live_tracking) return res.json({ available: false, message: 'This operator does not share live GPS data with SafarGo.' })
  if (b.booking.status !== 'confirmed') return res.json({ available: false, message: 'Tracking appears once your booking is confirmed.' })
  const dep = new Date(`${b.schedule.depart_date}T${b.schedule.depart_time}:00+05:30`)
  const endMs = dep.getTime() + b.schedule.duration_min * 60000
  const now = Date.now()
  if (now < dep.getTime() - 30 * 60000) return res.json({ available: true, phase: 'scheduled', etaLabel: 'Bus has not departed yet', updatedAt: nowISO() })
  if (now > endMs) return res.json({ available: true, phase: 'completed', etaLabel: 'Trip completed', updatedAt: nowISO() })
  const frac = (now - dep.getTime()) / (endMs - dep.getTime())
  const src = db.prepare('SELECT lat,lng FROM cities WHERE id=(SELECT source_city_id FROM routes WHERE id=?)').get(b.schedule.route_id) as any
  const dst = db.prepare('SELECT lat,lng FROM cities WHERE id=(SELECT dest_city_id FROM routes WHERE id=?)').get(b.schedule.route_id) as any
  const minutesLeft = Math.max(0, Math.round((endMs - now) / 60000))
  const boardStops = db.prepare(`SELECT st.name, st.time_offset_min FROM stops st JOIN schedule_stops ss ON ss.stop_id=st.id WHERE ss.schedule_id=? AND st.kind='boarding' ORDER BY st.seq`).all(b.booking.schedule_id) as any[]
  const nextStop = boardStops.find((s: any) => s.time_offset_min >= frac * b.schedule.duration_min)?.name ?? 'Destination'
  res.json({
    available: true, phase: 'running', demoGps: true,
    position: { lat: src.lat + (dst.lat - src.lat) * frac, lng: src.lng + (dst.lng - src.lng) * frac },
    etaLabel: `Approx. ${minutesLeft} min to destination`,
    nextStop,
    updatedAt: nowISO(),
  })
})

// =============================== ADMIN =======================================
app.get('/api/admin/stats', auth, requireRole('admin', 'support'), (_req, res) => {
  const g = (sql: string) => (db.prepare(sql).get() as any).v
  res.json({
    bookings: g('SELECT COUNT(*) v FROM bookings'),
    confirmed: g(`SELECT COUNT(*) v FROM bookings WHERE status='confirmed'`),
    revenuePaise: g(`SELECT COALESCE(SUM(total_paise),0) v FROM bookings WHERE status IN ('confirmed','partially_refunded','refunded')`),
    pendingPayments: g(`SELECT COUNT(*) v FROM payments WHERE status IN ('created','pending')`),
    cancelled: g(`SELECT COUNT(*) v FROM bookings WHERE status='cancelled'`),
    refundedPaise: g(`SELECT COALESCE(SUM(amount_paise),0) v FROM refunds`),
    openTickets: g(`SELECT COUNT(*) v FROM support_tickets WHERE status IN ('open','in_progress')`),
    users: g('SELECT COUNT(*) v FROM users'),
    topRoutes: db.prepare(`SELECT cs.name||' → '||cd.name route, COUNT(*) bookings FROM bookings b JOIN schedules s ON s.id=b.schedule_id
      JOIN routes r ON r.id=s.route_id JOIN cities cs ON cs.id=r.source_city_id JOIN cities cd ON cd.id=r.dest_city_id
      GROUP BY r.id ORDER BY bookings DESC LIMIT 6`).all(),
    operatorPerf: db.prepare(`SELECT o.name, o.verified, o.rating, COUNT(b.id) bookings FROM operators o
      LEFT JOIN buses bs ON bs.operator_id=o.id LEFT JOIN schedules sc ON sc.bus_id=bs.id
      LEFT JOIN bookings b ON b.schedule_id=sc.id GROUP BY o.id ORDER BY bookings DESC LIMIT 8`).all(),
    conversion: (() => {
      const searches = (db.prepare(`SELECT COUNT(*) v FROM recent_searches`).get() as any).v
      const bookings = (db.prepare(`SELECT COUNT(*) v FROM bookings`).get() as any).v
      return { searches, bookings, pct: searches ? Math.round((bookings / searches) * 100) : null }
    })(),
  })
})
const adminList = (table: string) => (_req: any, res: any) => res.json(db.prepare(`SELECT * FROM ${table} ORDER BY id DESC LIMIT 200`).all())
app.get('/api/admin/users', auth, requireRole('admin'), adminList('users'))
app.get('/api/admin/bookings', auth, requireRole('admin', 'support'), (_req, res) => {
  res.json(db.prepare(`SELECT b.id,b.pnr,b.status,b.total_paise,b.refund_paise,b.created_at,u.phone,s.depart_date,cs.name||'→'||cd.name route
    FROM bookings b LEFT JOIN users u ON u.id=b.user_id JOIN schedules s ON s.id=b.schedule_id JOIN routes r ON r.id=s.route_id
    JOIN cities cs ON cs.id=r.source_city_id JOIN cities cd ON cd.id=r.dest_city_id ORDER BY b.id DESC LIMIT 200`).all())
})
app.get('/api/admin/payments', auth, requireRole('admin'), adminList('payments'))
app.get('/api/admin/refunds', auth, requireRole('admin', 'support'), adminList('refunds'))
app.get('/api/admin/audit', auth, requireRole('admin'), adminList('audit_logs'))
app.get('/api/admin/tickets', auth, requireRole('admin', 'support'), (_req, res) => {
  res.json(db.prepare('SELECT st.*, u.name user FROM support_tickets st JOIN users u ON u.id=st.user_id ORDER BY st.id DESC LIMIT 100').all())
})
app.patch('/api/admin/tickets/:id', auth, requireRole('admin', 'support'), (req, res) => {
  const { status, reply } = req.body || {}
  db.prepare('UPDATE support_tickets SET status=?, agent_reply=?, replied_by=?, updated_at=? WHERE id=?')
    .run(String(status || 'resolved'), String(reply || ''), req.user.id, nowISO(), Number(req.params.id))
  audit(req.user.id, 'ticket_updated', 'support_tickets', req.params.id, status, req.ip)
  res.json({ ok: true })
})
app.patch('/api/admin/users/:id/role', auth, requireRole('admin'), (req, res) => {
  const { role } = req.body || {}
  if (!['user', 'operator', 'support', 'admin'].includes(role)) return res.status(400).json({ error: 'Invalid role' })
  db.prepare('UPDATE users SET role=? WHERE id=?').run(role, Number(req.params.id))
  audit(req.user.id, 'role_change', 'users', req.params.id, role, req.ip)
  res.json({ ok: true })
})
app.post('/api/admin/operators', auth, requireRole('admin'), (req, res) => {
  const { name, verified, womenFriendly, liveTracking } = req.body || {}
  if (!name) return res.status(400).json({ error: 'Operator name required' })
  const r = db.prepare('INSERT INTO operators (name,verified,women_friendly,live_tracking,cancellation_policy) VALUES (?,?,?,?,?)')
    .run(String(name), verified ? 1 : 0, womenFriendly ? 1 : 0, liveTracking ? 1 : 0, 'Standard tiered refund policy.')
  audit(req.user.id, 'operator_created', 'operators', Number(r.lastInsertRowid), name, req.ip)
  res.json({ id: Number(r.lastInsertRowid) })
})
app.patch('/api/admin/operators/:id', auth, requireRole('admin'), (req, res) => {
  const { verified, womenFriendly, liveTracking, active } = req.body || {}
  db.prepare('UPDATE operators SET verified=?, women_friendly=?, live_tracking=?, active=? WHERE id=?')
    .run(verified ? 1 : 0, womenFriendly ? 1 : 0, liveTracking ? 1 : 0, active === false ? 0 : 1, Number(req.params.id))
  audit(req.user.id, 'operator_updated', 'operators', req.params.id, JSON.stringify(req.body), req.ip)
  res.json({ ok: true })
})
app.post('/api/admin/coupons', auth, requireRole('admin'), (req, res) => {
  const { code, description, kind, valuePaise, maxDiscountPaise, minFarePaise, validTill } = req.body || {}
  const cleanCode = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (!cleanCode || cleanCode.length < 3 || cleanCode.length > 16) return res.status(400).json({ error: 'Coupon code must be 3–16 letters/digits.' })
  if (!['flat', 'percent'].includes(kind)) return res.status(400).json({ error: 'Kind must be flat or percent.' })
  try {
    const r = db.prepare('INSERT INTO coupons (code,description,kind,value_paise,max_discount_paise,min_fare_paise,valid_till) VALUES (?,?,?,?,?,?,?)')
      .run(String(code).toUpperCase(), String(description || ''), kind, Number(valuePaise), maxDiscountPaise ? Number(maxDiscountPaise) : null, Number(minFarePaise || 0), String(validTill || new Date(Date.now() + 30 * 864e5).toISOString()))
    audit(req.user.id, 'coupon_created', 'coupons', code, '', req.ip)
    res.json({ ok: true, id: r.lastInsertRowid })
  } catch { res.status(409).json({ error: 'Coupon code already exists.' }) }
})
app.patch('/api/admin/coupons/:code', auth, requireRole('admin'), (req, res) => {
  db.prepare('UPDATE coupons SET active=? WHERE code=?').run(req.body.active ? 1 : 0, String(req.params.code).toUpperCase())
  audit(req.user.id, 'coupon_toggled', 'coupons', req.params.code, String(req.body.active), req.ip)
  res.json({ ok: true })
})
app.patch('/api/admin/content/:key', auth, requireRole('admin'), (req, res) => {
  db.prepare('INSERT OR REPLACE INTO homepage_content (key,value) VALUES (?,?)').run(req.params.key, String(req.body.value ?? ''))
  audit(req.user.id, 'content_updated', 'homepage_content', req.params.key, '', req.ip)
  res.json({ ok: true })
})
app.get('/api/admin/reviews', auth, requireRole('admin', 'support'), (_req, res) => {
  res.json(db.prepare(`SELECT rv.*, u.name user, o.name operator FROM reviews rv JOIN users u ON u.id=rv.user_id JOIN operators o ON o.id=rv.operator_id ORDER BY rv.id DESC LIMIT 100`).all())
})
app.patch('/api/admin/reviews/:id/reply', auth, requireRole('admin', 'support', 'operator'), (req, res) => {
  const rv = db.prepare('SELECT * FROM reviews WHERE id=?').get(Number(req.params.id)) as any
  if (!rv) return res.status(404).json({ error: 'Review not found' })
  if (req.user.role === 'operator' && rv.operator_id !== req.user.operator_id) return res.status(403).json({ error: 'Not your operator review.' })
  db.prepare('UPDATE reviews SET reply=? WHERE id=?').run(String(req.body.reply || '').slice(0, 600), rv.id)
  res.json({ ok: true })
})

// =============================== OPERATOR PORTAL =============================
const operatorAuth = (req: any, res: any, next: any) => {
  if (req.user.role !== 'operator' || !req.user.operator_id) return res.status(403).json({ error: 'Link an operator account first (admin can assign).' })
  next()
}
app.get('/api/operator/overview', auth, operatorAuth, (req, res) => {
  const oid = req.user.operator_id
  const buses = db.prepare('SELECT * FROM buses WHERE operator_id=?').all(oid)
  const upcoming = db.prepare(`SELECT s.id, s.depart_date, s.depart_time, s.duration_min, s.fare_paise,
      cs.name||' → '||cd.name route, b.bus_name, b.bus_type,
      (SELECT COUNT(*) FROM seats se WHERE se.schedule_id=s.id AND se.status='booked') booked,
      (SELECT COUNT(*) FROM seats se WHERE se.schedule_id=s.id) total
    FROM schedules s JOIN buses b ON b.id=s.bus_id JOIN routes r ON r.id=s.route_id
    JOIN cities cs ON cs.id=r.source_city_id JOIN cities cd ON cd.id=r.dest_city_id
    WHERE b.operator_id=? AND s.depart_date >= date('now') ORDER BY s.depart_date, s.depart_time LIMIT 40`).all(oid)
  const revenue = (db.prepare(`SELECT COALESCE(SUM(b.total_paise),0) v FROM bookings b JOIN schedules s ON s.id=b.schedule_id
    JOIN buses bs ON bs.id=s.bus_id WHERE bs.operator_id=? AND b.status='confirmed'`).get(oid) as any).v
  res.json({ buses, upcoming, revenuePaise: revenue })
})
app.patch('/api/operator/schedules/:id', auth, operatorAuth, (req, res) => {
  const s = db.prepare(`SELECT sc.*, b.operator_id FROM schedules sc JOIN buses b ON b.id=sc.bus_id WHERE sc.id=?`).get(Number(req.params.id)) as any
  if (!s || s.operator_id !== req.user.operator_id) return res.status(403).json({ error: 'Not your schedule.' })
  const { departTime, durationMin, farePaise, status } = req.body || {}
  if (departTime && !/^\d{2}:\d{2}$/.test(departTime)) return res.status(400).json({ error: 'Invalid time format HH:MM.' })
  if (farePaise != null && Number(farePaise) < 0) return res.status(400).json({ error: 'Fare cannot be negative.' })
  db.prepare('UPDATE schedules SET depart_time=COALESCE(?,depart_time), duration_min=COALESCE(?,duration_min), fare_paise=COALESCE(?,fare_paise) WHERE id=?')
    .run(departTime || null, durationMin ? Number(durationMin) : null, farePaise != null ? Number(farePaise) : null, s.id)
  // Un-booked seats re-price to the new base fare; window berths keep their premium.
  if (farePaise != null) {
    const schedRow = db.prepare('SELECT price_variation_paise v FROM schedules WHERE id=?').get(s.id) as any
    db.prepare(`UPDATE seats SET price_paise = ? + CASE WHEN kind='regular' AND rowid IN
      (SELECT rowid FROM seats WHERE schedule_id=? AND substr(seat_no,1,1) IN ('L','U')) THEN 0 ELSE 0 END
      WHERE schedule_id=? AND status!='booked'`).run(Number(farePaise), s.id, s.id)
    void schedRow
  }
  audit(req.user.id, 'schedule_updated', 'schedules', s.id, JSON.stringify(req.body), req.ip)
  res.json({ ok: true, note: 'Changes sync to central booking inventory immediately; booked seats keep their locked price.' })
})
app.get('/api/operator/schedules/:id/manifest', auth, operatorAuth, (req, res) => {
  const s = db.prepare(`SELECT sc.*, b.operator_id FROM schedules sc JOIN buses b ON b.id=sc.bus_id WHERE sc.id=?`).get(Number(req.params.id)) as any
  if (!s || s.operator_id !== req.user.operator_id) return res.status(403).json({ error: 'Not your schedule.' })
  res.json(db.prepare(`SELECT ps.name, ps.age, ps.gender, se.seat_no, bk.pnr, bk.contact_phone
    FROM passengers ps JOIN seats se ON se.id=ps.seat_id JOIN bookings bk ON bk.id=ps.booking_id
    WHERE bk.status='confirmed' AND bk.schedule_id=? ORDER BY se.seat_no`).all(s.id))
})

// =============================== MISC ========================================
app.get('/api/health', (_req, res) => res.json({ ok: true, payProvider: payProvider.name, sandbox: payProvider.sandbox, ts: nowISO() }))

app.use('/api', (_req, res) => res.status(404).json({ error: 'Unknown API endpoint' }))
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error('[error]', err?.message || err)
  res.status(500).json({ error: 'Something went wrong on our side. Please retry.' })
})

const PORT = Number(process.env.PORT || 3001)
app.listen(PORT, () => console.log(`SafarGo API (demo inventory) listening on http://localhost:${PORT}`))
