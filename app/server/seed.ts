import { db, migrate, nowISO } from './db'

/**
 * DEMO DATA — clearly fictional operators, fares, ratings and seat maps.
 * This is test/sample inventory for the SafarGo demo environment only and must
 * never be presented as live real-world bus information.
 */

const CITIES: Array<[string, string, string, number, number]> = [
  ['Bengaluru', 'Karnataka', '560', 12.97, 77.59],
  ['Hyderabad', 'Telangana', '500', 17.38, 78.49],
  ['Chennai', 'Tamil Nadu', '600', 13.08, 80.27],
  ['Mumbai', 'Maharashtra', '400', 19.07, 72.88],
  ['Pune', 'Maharashtra', '411', 18.52, 73.86],
  ['Delhi', 'Delhi', '110', 28.61, 77.21],
  ['Goa', 'Goa', '403', 15.49, 73.83],
  ['Mysuru', 'Karnataka', '570', 12.3, 76.66],
  ['Kochi', 'Kerala', '682', 9.93, 76.27],
  ['Vijayawada', 'Andhra Pradesh', '520', 16.51, 80.65],
  ['Ahmedabad', 'Gujarat', '380', 23.02, 72.57],
  ['Jaipur', 'Rajasthan', '302', 26.91, 75.79],
  ['Kolkata', 'West Bengal', '700', 22.57, 88.36],
]

// [source, dest, distanceKm, durationMin, popular]
const ROUTES: Array<[string, string, number, number, number]> = [
  ['Bengaluru', 'Hyderabad', 570, 600, 1],
  ['Bengaluru', 'Chennai', 350, 390, 1],
  ['Bengaluru', 'Mysuru', 145, 180, 1],
  ['Bengaluru', 'Goa', 560, 720, 1],
  ['Mumbai', 'Pune', 150, 200, 1],
  ['Mumbai', 'Goa', 580, 780, 0],
  ['Hyderabad', 'Vijayawada', 275, 300, 1],
  ['Chennai', 'Hyderabad', 450, 480, 0],
  ['Delhi', 'Jaipur', 280, 330, 1],
  ['Kochi', 'Bengaluru', 410, 480, 1],
  ['Ahmedabad', 'Mumbai', 460, 540, 0],
  ['Pune', 'Hyderabad', 610, 690, 0],
  ['Kolkata', 'Delhi', 1450, 1500, 0],
  ['Vijayawada', 'Chennai', 350, 390, 0],
  ['Mysuru', 'Chennai', 315, 360, 0],
]

const OPERATORS = [
  // name, verified, womenFriendly, liveTracking, rating, reviews
  ['Orange Travels', 1, 1, 1, 4.4, 12840],
  ['VRL Express', 1, 0, 1, 4.2, 9820],
  ['KPN Travels', 1, 0, 0, 4.0, 7410],
  ['Raina Tours', 0, 0, 0, 3.8, 3120],
  ['SRS Travels', 1, 1, 1, 4.5, 15230],
  ['Parveen Travels', 1, 0, 1, 4.1, 6540],
  ['Apple Green', 0, 1, 0, 3.9, 2210],
  ['East West Coaches', 1, 0, 1, 4.3, 4870],
]

const BUS_TYPES = [
  'AC Sleeper (2+1)',
  'Non-AC Sleeper (2+1)',
  'AC Seater (2+2)',
  'Volvo Multi-Axle A/C Semi Sleeper',
  'Electric AC Sleeper',
  'Non-AC Seater (2+2)',
]

const AMENITIES = ['wifi', 'charging', 'blanket', 'water', 'entertainment', 'reading-light', 'live-tracking', 'women-only-crew']

function layoutFor(type: string): object {
  const sleeper = type.toLowerCase().includes('sleeper')
  if (!sleeper) {
    // 2+2 seater: rows of 4 seats + aisle, 10 rows -> 40 seats
    return { type: 'seater', rows: 10, pattern: ['W', 'S', 'A', 'IS', 'IS', 'A', 'S', 'W'] }
  }
  // 2+1 sleeper: lower deck 2+1 rows x5 (15), upper deck 1+1... classic: lower 12, upper 10
  return {
    type: 'sleeper',
    lowerRows: 6, lowerPattern: ['WS', 'S', 'AISLE', 'IS', 'IS'],
    upperRows: 5, upperPattern: ['IS', 'AISLE', 'WS', 'S'],
  }
}

function seededRandom(seed: number) {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648
    return s / 2147483648
  }
}

export function seed() {
  migrate()
  const count = db.prepare('SELECT COUNT(*) c FROM cities').get() as { c: number }
  if (count.c > 0) return false

  console.log('[seed] Inserting DEMO inventory (fictional operators/fares — not live data)…')
  const rnd = seededRandom(42)
  const insCity = db.prepare('INSERT INTO cities (name,state,pincode_prefix,lat,lng,popular) VALUES (?,?,?,?,?,?)')
  for (const c of CITIES) insCity.run(c[0], c[1], c[2], c[3], c[4], 1)

  const cityId = (name: string) => (db.prepare('SELECT id FROM cities WHERE name=?').get(name) as { id: number }).id

  const insOp = db.prepare(`INSERT INTO operators (name,verified,women_friendly,live_tracking,rating,review_count,cancellation_policy,contact_email)
    VALUES (?,?,?,?,?,?,?,?)`)
  for (const o of OPERATORS) {
    insOp.run(o[0], o[1], o[2], o[3], o[4], o[5],
      'Post-departure cancellations not allowed. Refund % depends on time left before departure; see policy card.',
      `support@${String(o[0]).toLowerCase().replace(/\W+/g, '')}.example`)
  }

  const insRoute = db.prepare('INSERT INTO routes (source_city_id,dest_city_id,distance_km,base_duration_min,popular) VALUES (?,?,?,?,?)')
  for (const r of ROUTES) insRoute.run(cityId(r[0]), cityId(r[1]), r[2], r[3], r[4])

  // stops per route
  const stopNames: Record<string, string[]> = {
    boarding: ['Central Bus Stand', 'Madiwala Checkpost', 'Electronic City Toll', 'Hebbal Flyover', 'Aireport Toll'],
    dropping: ['Main Bus Stand', 'High Court Junction', 'Silk Board Junction', 'Belting Road', 'NH48 Exit'],
  }
  const insStop = db.prepare('INSERT INTO stops (route_id,kind,name,address,time_offset_min,seq) VALUES (?,?,?,?,?,?)')
  const routesAll = db.prepare('SELECT id, source_city_id FROM routes').all() as Array<{ id: number; source_city_id: number }>
  const cityName = (id: number) => (db.prepare('SELECT name FROM cities WHERE id=?').get(id) as { name: string }).name
  for (const rt of routesAll) {
    const src = cityName(rt.source_city_id)
    ;(stopNames.boarding.slice(0, 3)).forEach((n, i) =>
      insStop.run(rt.id, 'boarding', `${n}, ${src}`, `${src} city limit`, i * 12, i))
    ;(stopNames.dropping.slice(0, 3)).forEach((n, i) =>
      insStop.run(rt.id, 'dropping', `${n}`, 'Destination city drop point', 0, i))
  }

  const insBus = db.prepare('INSERT INTO buses (operator_id,bus_name,bus_type,layout,amenities,image,active) VALUES (?,?,?,?,?,?,1)')
  const busIds: number[] = []
  const opIds = (db.prepare('SELECT id FROM operators').all() as Array<{ id: number }>).map((r) => r.id)
  let bi = 0
  for (const opId of opIds) {
    for (let k = 0; k < 3; k++) {
      const type = BUS_TYPES[(bi + k) % BUS_TYPES.length]
      const am = AMENITIES.filter(() => rnd() > 0.45)
      if (type.includes('Electric')) am.push('live-tracking')
      const res = insBus.run(opId, `${['Voyager', 'Cruiser', 'Dream Coach', 'Eco Line', 'Royal Class'][bi % 5]} ${1000 + bi}`, type, JSON.stringify(layoutFor(type)), JSON.stringify(am), null)
      busIds.push(Number(res.lastInsertRowid))
      bi++
    }
  }

  // schedules for next N days
  const days = Number(process.env.DEMO_SEED_DEPARTURES_DAYS || 60)
  const insSched = db.prepare(`INSERT INTO schedules (route_id,bus_id,depart_date,depart_time,duration_min,fare_paise,free_cancellation,ladies_seats,price_variation_paise)
    VALUES (?,?,?,?,?,?,?,?,?)`)
  // Track (route,date) -> used bus ids so the UNIQUE(route,bus,date) constraint can never collide.
  const busUsedByRouteDate = new Map<string, Set<number>>()
  const insSS = db.prepare('INSERT OR IGNORE INTO schedule_stops (schedule_id, stop_id) VALUES (?,?)')
  const insSeat = db.prepare('INSERT INTO seats (schedule_id,seat_no,deck,kind,price_paise,status) VALUES (?,?,?,?,?,?)')
  const allStops = db.prepare('SELECT id, route_id, kind FROM stops').all() as Array<{ id: number; route_id: number; kind: string }>

  const today = new Date()
  for (const rt of routesAll) {
    const route = db.prepare('SELECT * FROM routes WHERE id=?').get(rt.id) as any
    const perDay = route.popular ? 4 : 2
    for (let d = 0; d < days; d++) {
      const date = new Date(today); date.setDate(date.getDate() + d)
      const ymd = date.toISOString().slice(0, 10)
      for (let s = 0; s < perDay; s++) {
        const key = `${rt.id}|${ymd}`
        let used = busUsedByRouteDate.get(key)
        if (!used) { used = new Set(); busUsedByRouteDate.set(key, used) }
        let busId = busIds[Math.floor(rnd() * busIds.length)]
        let guard = 0
        while (used.has(busId) && guard++ < 50) busId = busIds[Math.floor(rnd() * busIds.length)]
        if (used.has(busId)) continue // exhausted demo buses for this route/day
        used.add(busId)
        const bus = db.prepare('SELECT * FROM buses WHERE id=?').get(busId) as any
        const baseFare = Math.round((route.distance_km * (bus.bus_type.startsWith('AC') || bus.bus_type.includes('Volvo') ? 2.2 : 1.4) + 60) / 10) * 10 * 100 // paise
        const departTimes = ['06:30', '09:15', '14:00', '21:30', '22:45', '23:59']
        const dep = departTimes[(d + s) % departTimes.length]
        const dur = route.base_duration_min + Math.floor(rnd() * 60 - 20)
        const freeCancel = rnd() > 0.6 ? 1 : 0
        const ladies = rnd() > 0.7 ? 4 : 0
        const variation = rnd() > 0.5 ? 10000 : 0 // window seats +₹100
        const schedRes = insSched.run(rt.id, busId, ymd, dep, dur, baseFare, freeCancel, ladies, variation)
        const schedId = Number(schedRes.lastInsertRowid)
        for (const st of allStops.filter((x) => x.route_id === rt.id)) insSS.run(schedId, st.id)

        // create seats from layout
        const layout = JSON.parse(bus.layout)
        const mk = (deck: string, list: string[]) => {
          let n = 0
          for (const cell of list) {
            if (cell === 'AISLE') continue
            n += 1
            const seatNo = `${deck === 'lower' ? 'L' : 'U'}${n}`
            const kind = ladies > 0 && n <= ladies / (deck === 'lower' ? 2 : 1) && deck === 'upper' ? 'ladies' : 'regular'
            const price = baseFare + (cell.startsWith('W') ? variation : 0)
            insSeat.run(schedId, seatNo, deck, kind, price, 'available')
          }
        }
        if (layout.type === 'seater') {
          const cells: string[] = []
          for (let r = 0; r < layout.rows; r++) cells.push(...layout.pattern)
          mk('lower', cells)
        } else {
          const low: string[] = []
          for (let r = 0; r < layout.lowerRows; r++) low.push(...layout.lowerPattern)
          const up: string[] = []
          for (let r = 0; r < layout.upperRows; r++) up.push(...layout.upperPattern)
          mk('lower', low); mk('upper', up)
        }
      }
    }
  }

  const insCoupon = db.prepare('INSERT INTO coupons (code,description,kind,value_paise,max_discount_paise,min_fare_paise,per_user_limit,global_limit,used_count,valid_till,active) VALUES (?,?,?,?,?,?,?,?,?,?,1)')
  const validTill = new Date(); validTill.setDate(validTill.getDate() + 90)
  insCoupon.run('SAFAR100', 'Flat ₹100 off on any booking over ₹499', 'flat', 10000, null, 49900, 2, null, 0, validTill.toISOString())
  insCoupon.run('NEWTRIP20', '20% off up to ₹150 for first-time travellers', 'percent', 20, 15000, 30000, 1, 5000, 0, validTill.toISOString())
  insCoupon.run('WEEKEND15', '15% off up to ₹120 on weekend getaways', 'percent', 15, 12000, 50000, 1, null, 0, validTill.toISOString())

  const insContent = db.prepare('INSERT OR REPLACE INTO homepage_content (key,value) VALUES (?,?)')
  insContent.run('hero_tagline', 'India, one seat at a time.')
  insContent.run('offers_banner', 'Use SAFAR100 for ₹100 off · Free cancellation on selected buses')

  console.log('[seed] Demo inventory ready.')
  return true
}

if (process.argv[1] && process.argv[1].endsWith('seed.ts')) {
  seed()
  console.log('[seed] done at', nowISO())
}
