import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'

const DB_FILE = process.env.DB_FILE || './safargo.db'

export const db = new Database(path.resolve(process.cwd(), DB_FILE))
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')
db.pragma('busy_timeout = 5000')

/**
 * Core relational schema for SafarGo.
 * Money is stored in integer paise. Timestamps are stored as ISO-8601 UTC strings.
 * Display/scheduling uses Asia/Kolkata on the client.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  phone TEXT UNIQUE,
  password_hash TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','operator','support','admin')),
  operator_id INTEGER REFERENCES operators(id),
  loyalty_points INTEGER NOT NULL DEFAULT 0,
  travel_credit_paise INTEGER NOT NULL DEFAULT 0,
  notif_prefs TEXT NOT NULL DEFAULT '{}',
  lang TEXT NOT NULL DEFAULT 'en',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS otps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT NOT NULL,
  hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS cities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL,
  pincode_prefix TEXT,
  lat REAL, lng REAL,
  popular INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS operators (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  verified INTEGER NOT NULL DEFAULT 0,
  women_friendly INTEGER NOT NULL DEFAULT 0,
  live_tracking INTEGER NOT NULL DEFAULT 0,
  rating REAL NOT NULL DEFAULT 4.2,
  review_count INTEGER NOT NULL DEFAULT 0,
  cancellation_policy TEXT NOT NULL DEFAULT '',
  contact_email TEXT,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS routes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_city_id INTEGER NOT NULL REFERENCES cities(id),
  dest_city_id INTEGER NOT NULL REFERENCES cities(id),
  distance_km REAL NOT NULL,
  base_duration_min INTEGER NOT NULL,
  popular INTEGER NOT NULL DEFAULT 0,
  UNIQUE (source_city_id, dest_city_id)
);

CREATE TABLE IF NOT EXISTS stops (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  route_id INTEGER NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('boarding','dropping')),
  name TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  time_offset_min INTEGER NOT NULL DEFAULT 0,
  seq INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS buses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operator_id INTEGER NOT NULL REFERENCES operators(id),
  bus_name TEXT NOT NULL,
  bus_type TEXT NOT NULL,           -- AC Sleeper, Non-AC Seater, Volvo Multi-Axle, Electric ...
  layout TEXT NOT NULL,             -- JSON: {type:'sleeper'|'seater', rowsLower:[...], rowsUpper?:[...]}
  amenities TEXT NOT NULL DEFAULT '[]', -- JSON array of amenity codes
  image TEXT,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  route_id INTEGER NOT NULL REFERENCES routes(id),
  bus_id INTEGER NOT NULL REFERENCES buses(id),
  depart_date TEXT NOT NULL,        -- YYYY-MM-DD (Asia/Kolkata service date)
  depart_time TEXT NOT NULL,        -- HH:MM local
  duration_min INTEGER NOT NULL,
  fare_paise INTEGER NOT NULL,
  free_cancellation INTEGER NOT NULL DEFAULT 0,
  ladies_seats INTEGER NOT NULL DEFAULT 0,
  price_variation_paise INTEGER NOT NULL DEFAULT 0,
  UNIQUE (route_id, bus_id, depart_date)
);

CREATE TABLE IF NOT EXISTS schedule_stops (
  schedule_id INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  stop_id INTEGER NOT NULL REFERENCES stops(id),
  PRIMARY KEY (schedule_id, stop_id)
);

CREATE TABLE IF NOT EXISTS seats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  schedule_id INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  seat_no TEXT NOT NULL,            -- e.g. L1, U3
  deck TEXT NOT NULL CHECK (deck IN ('lower','upper')),
  kind TEXT NOT NULL DEFAULT 'regular' CHECK (kind IN ('regular','ladies','accessible')),
  price_paise INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','held','booked')),
  UNIQUE (schedule_id, seat_no)
);

CREATE TABLE IF NOT EXISTS seat_holds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  schedule_id INTEGER NOT NULL REFERENCES schedules(id),
  seat_id INTEGER NOT NULL REFERENCES seats(id),
  user_id INTEGER REFERENCES users(id),
  hold_token TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pnr TEXT NOT NULL UNIQUE,
  user_id INTEGER REFERENCES users(id),
  schedule_id INTEGER NOT NULL REFERENCES schedules(id),
  boarding_stop_id INTEGER REFERENCES stops(id),
  dropping_stop_id INTEGER REFERENCES stops(id),
  contact_phone TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  base_paise INTEGER NOT NULL,
  fee_paise INTEGER NOT NULL,
  discount_paise INTEGER NOT NULL DEFAULT 0,
  total_paise INTEGER NOT NULL,
  coupon_code TEXT,
  status TEXT NOT NULL DEFAULT 'pending_payment'
    CHECK (status IN ('pending_payment','confirmed','cancelled','refunded','partially_refunded')),
  cancelled_at TEXT,
  refund_paise INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS passengers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  seat_id INTEGER NOT NULL REFERENCES seats(id),
  name TEXT NOT NULL,
  age INTEGER NOT NULL,
  gender TEXT CHECK (gender IN ('male','female','other')),
  phone TEXT
);

CREATE TABLE IF NOT EXISTS saved_passengers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  age INTEGER NOT NULL,
  gender TEXT CHECK (gender IN ('male','female','other')),
  phone TEXT,
  consent INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL REFERENCES bookings(id),
  gateway TEXT NOT NULL,
  order_id TEXT NOT NULL UNIQUE,
  payment_id TEXT,
  method TEXT,
  amount_paise INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'created'
    CHECK (status IN ('created','pending','captured','failed','cancelled','refunded')),
  idempotency_key TEXT UNIQUE,
  signature_verified INTEGER NOT NULL DEFAULT 0,
  failure_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS payment_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payment_id INTEGER NOT NULL REFERENCES payments(id),
  event TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS refunds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL REFERENCES bookings(id),
  payment_id INTEGER NOT NULL REFERENCES payments(id),
  amount_paise INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'initiated' CHECK (status IN ('initiated','processing','success','failed')),
  utr TEXT,
  policy_snapshot TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS coupons (
  code TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('flat','percent')),
  value_paise INTEGER NOT NULL,
  max_discount_paise INTEGER,
  min_fare_paise INTEGER NOT NULL DEFAULT 0,
  per_user_limit INTEGER NOT NULL DEFAULT 1,
  global_limit INTEGER,
  used_count INTEGER NOT NULL DEFAULT 0,
  valid_till TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  coupon_code TEXT NOT NULL REFERENCES coupons(code),
  user_id INTEGER NOT NULL REFERENCES users(id),
  booking_id INTEGER NOT NULL REFERENCES bookings(id),
  discount_paise INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  booking_id INTEGER NOT NULL UNIQUE REFERENCES bookings(id),
  schedule_id INTEGER NOT NULL REFERENCES schedules(id),
  operator_id INTEGER NOT NULL REFERENCES operators(id),
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT NOT NULL DEFAULT '',
  reply TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  channel TEXT NOT NULL CHECK (channel IN ('inapp','email','sms','whatsapp','push')),
  template TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  meta TEXT NOT NULL DEFAULT '{}',
  read INTEGER NOT NULL DEFAULT 0,
  delivered INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS support_tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  booking_id INTEGER REFERENCES bookings(id),
  category TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','closed')),
  agent_reply TEXT,
  replied_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS saved_routes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  route_id INTEGER NOT NULL REFERENCES routes(id),
  label TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (user_id, route_id)
);

CREATE TABLE IF NOT EXISTS recent_searches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source TEXT NOT NULL, dest TEXT NOT NULL, date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  ip TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS homepage_content (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_seats_sched_status ON seats(schedule_id, status);
CREATE INDEX IF NOT EXISTS idx_schedules_route_date ON schedules(route_id, depart_date);
CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_holds_expiry ON seat_holds(expires_at);
CREATE INDEX IF NOT EXISTS idx_payments_booking ON payments(booking_id);
`

export function migrate() {
  db.exec(SCHEMA)
}

export function audit(actorId: number | null, action: string, entity: string, entityId: string | number, detail = '', ip = '') {
  db.prepare('INSERT INTO audit_logs (actor_id, action, entity, entity_id, detail, ip) VALUES (?,?,?,?,?,?)')
    .run(actorId, action, entity, String(entityId), detail, ip)
}

export function nowISO() {
  return new Date().toISOString()
}
