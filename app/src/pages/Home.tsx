// Homepage — hero + search, popular routes, categories, offers, operators,
// reviews, safety, FAQ, newsletter.
import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { Icon, I, Stars, Skeleton } from '../components/ui'
import { SearchWidget } from '../components/SearchWidget'
import { useApp } from '../lib/state'
import { t, fmtDateLong, addDays, todayIST, inr } from '../lib/i18n'

type PopularRoute = { id: number; source: string; dest: string; distance_km: number; base_duration_min: number }

const FAQS: Array<[string, string]> = [
  ['How do refunds work if I cancel a booking?', 'Refunds follow the operator’s policy shown before you confirm cancellation. In this demo: ≥3 hours before departure → 90% fare refund; 1–3 hours → 70%; under 1 hour → 50%; buses marked “Free cancellation” refund 100% of the fare. Convenience fees are non-refundable. Refunds are processed to the original payment method and tracked in My bookings.'],
  ['Are the operators on SafarGo verified?', 'Operators labelled “Verified” have passed our (demo) document-check flow: fitness papers, permits and insurance. Look for the shield badge on each bus card.'],
  ['Which payment methods are supported?', 'UPI (intent & QR), debit/credit cards, net banking, wallets and pay-later where eligible. This build uses a clearly-labelled sandbox adapter — no real money moves. Swap in Razorpay/Cashfree via the PaymentAdapter interface.'],
  ['Can women travellers pick ladies-priority seats?', 'Yes. Where an operator marks ladies-reserved berths they appear pink on the seat map and can only be booked by a female passenger, as per operator rules.'],
  ['Is live tracking available for my bus?', 'Buses with the “Live tracking” amenity show a simulated GPS position while the trip is running. A “DEMO GPS” label always appears because locations are interpolated, not real.'],
  ['What happens if my seat gets taken while paying?', 'Seats are held for 8 minutes with a countdown. The server re-verifies inventory before charging; if a hold expired you’ll be asked to reselect — you are never charged for seats you don’t hold.'],
]

export default function Home() {
  const { lang, toast } = useApp()
  const nav = useNavigate()
  const [routes, setRoutes] = useState<PopularRoute[] | null>(null)
  const [offers, setOffers] = useState<any[]>([])
  const [reviews, setReviews] = useState<any[] | null>(null)
  const [tagline, setTagline] = useState('India, one seat at a time.')
  const [email, setEmail] = useState('')
  const [openFaq, setOpenFaq] = useState<number | null>(0)

  useEffect(() => {
    api<PopularRoute[]>('/api/routes/popular').then(setRoutes).catch(() => setRoutes([]))
    api<any[]>('/api/me/coupons').then((d) => setOffers(d)).catch(() => {
      // Not signed in? Show public demo coupons statically.
      setOffers([
        { code: 'SAFAR100', description: 'Flat ₹100 off on any booking over ₹499', kind: 'flat', value_paise: 10000 },
        { code: 'NEWTRIP20', description: '20% off up to ₹150 for first-time travellers', kind: 'percent', value_paise: 20 },
        { code: 'WEEKEND15', description: '15% off up to ₹120 on weekend getaways', kind: 'percent', value_paise: 15 },
      ])
    })
    api<{ value: string }>('/api/content/hero_tagline').then((d) => d.value && setTagline(d.value)).catch(() => undefined)
    // Public review snippets come from schedule endpoint for a known route — keep simple: static demo quotes clearly labelled.
    setReviews([
      { name: 'Ananya R.', route: 'Bengaluru → Chennai', rating: 5, text: 'Seat map matched reality exactly and the boarding reminder was super useful. (Demo testimonial)' },
      { name: 'Rohit K.', route: 'Pune → Goa', rating: 4, text: 'Loved the free-cancellation filter — found a sleeper with blanket and Wi-Fi in seconds. (Demo testimonial)' },
      { name: 'Fathima S.', route: 'Kochi → Vijayawada', rating: 5, text: 'UPI intent checkout took under a minute and the e-ticket downloaded instantly. (Demo testimonial)' },
    ])
  }, [])

  const quickSearch = (from: string, to: string) => {
    nav(`/search?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&date=${addDays(todayIST(), 1)}&pax=1`)
  }

  const subscribe = (e: React.FormEvent) => {
    e.preventDefault()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { toast('error', 'Please enter a valid email address.'); return }
    toast('success', `Subscribed ${email} for travel offers (demo — no real mail sent).`)
    setEmail('')
  }

  const cats = [
    { icon: I.bolt, title: 'AC Sleeper', desc: 'Reclining berths, blankets & privacy curtains', href: `/search?quick=1&type=${encodeURIComponent('AC Sleeper')}` },
    { icon: I.sofa, title: 'Volvo / Premium', desc: 'Multi-axle comfort for long highways', href: `/search?quick=1&type=${encodeURIComponent('Volvo')}` },
    { icon: I.bed, title: 'Sleeper (Non-AC)', desc: 'Budget night journeys across states', href: `/search?quick=1&type=${encodeURIComponent('Non-AC')}` },
    { icon: I.bus, title: 'Electric fleet', desc: 'Zero-emission coaches on select routes', href: `/search?quick=1&type=${encodeURIComponent('Electric')}` },
  ]

  return (
    <div className="space-y-16">
      {/* HERO */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-700 via-brand-600 to-accent-500 px-5 pb-28 pt-12 text-white sm:px-10 sm:pt-16">
        <svg aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-40 w-full opacity-20" viewBox="0 0 1200 160" preserveAspectRatio="none">
          <path d="M0 120 Q 150 60 300 110 T 600 100 T 900 120 T 1200 90 V160 H0 Z" fill="#fff" />
          <circle cx="1050" cy="40" r="26" fill="#fff" opacity=".5" /><path d="M60 130h40m-20-20v20" stroke="#fff" strokeWidth="4" />
        </svg>
        <div className="relative mx-auto max-w-3xl text-center">
          <span className="badge-blue !bg-white/15 !text-white backdrop-blur border border-white/25">🇮🇳 Demo product · fictional sample inventory</span>
          <h1 className="mt-4 text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl">{tagline}</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm text-white/85 sm:text-base">Search thousands of (sample) seats across Indian cities, compare operators and amenities, pick your berth on a live-style seat map, and pay with UPI — all in under two minutes.</p>
        </div>
        <div className="relative mx-auto -mb-36 mt-8 max-w-4xl text-slate-800 dark:text-slate-100">
          <SearchWidget />
        </div>
      </section>
      <div className="h-28 sm:h-32" aria-hidden="true" />

      {/* POPULAR ROUTES */}
      <section aria-labelledby="popular-h">
        <div className="mb-4 flex items-end justify-between">
          <h2 id="popular-h" className="text-xl font-extrabold sm:text-2xl">{t('popularRoutes', lang)}</h2>
          <Link to="/search" className="link text-sm font-semibold">Browse all →</Link>
        </div>
        {!routes ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {routes.map((r) => (
              <button key={r.id} onClick={() => quickSearch(r.source, r.dest)}
                className="card group p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-lift">
                <div className="flex items-center gap-1.5 text-sm font-bold"><Icon d={I.pin} size={14} className="text-brand-600 dark:text-brand-300" />{r.source}<Icon d={I.chevR} size={13} className="text-slate-400" /></div>
                <div className="mt-0.5 pl-5 text-sm text-slate-600 dark:text-slate-300">{r.dest}</div>
                <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-400">
                  <span>{r.distance_km} km</span><span>·</span><span>{Math.floor(r.base_duration_min / 60)}h+ travel</span>
                </div>
                <span className="mt-2 inline-block text-xs font-semibold text-brand-600 opacity-0 transition-opacity group-hover:opacity-100 dark:text-brand-300">See buses →</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* CATEGORIES */}
      <section aria-labelledby="cats-h">
        <h2 id="cats-h" className="mb-4 text-xl font-extrabold sm:text-2xl">Travel your way</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {cats.map((c) => (
            <Link key={c.title} to={c.href} className="card flex gap-3 p-4 transition-all hover:-translate-y-0.5 hover:shadow-lift">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-100 text-accent-600 dark:bg-accent-700/20 dark:text-accent-300"><Icon d={c.icon} size={22} /></span>
              <span><b className="block text-sm">{c.title}</b><span className="text-xs text-slate-500 dark:text-slate-400">{c.desc}</span></span>
            </Link>
          ))}
        </div>
      </section>

      {/* OFFERS */}
      <section aria-labelledby="offers-h" id="offers-strip">
        <div className="mb-4 flex items-end justify-between">
          <h2 id="offers-h" className="text-xl font-extrabold sm:text-2xl">{t('offers', lang)}</h2>
          <Link to="/offers" className="link text-sm font-semibold">All offers →</Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {offers.slice(0, 3).map((o) => (
            <div key={o.code} className="relative overflow-hidden rounded-2xl border border-dashed border-brand-300 bg-gradient-to-br from-brand-50 to-white p-5 dark:border-brand-700 dark:from-brand-900/30 dark:to-surface-cardDark">
              <span className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-accent-400/20 blur-xl" aria-hidden="true" />
              <div className="text-2xl font-extrabold text-brand-700 dark:text-brand-300">{o.kind === 'flat' ? `${inr(o.value_paise)} off` : `${o.value_paise}% off`}</div>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{o.description}</p>
              <div className="mt-3 flex items-center justify-between">
                <code className="rounded-lg border border-brand-200 bg-white px-2 py-1 text-xs font-bold tracking-wider dark:border-brand-700 dark:bg-slate-900">{o.code}</code>
                <button className="btn-ghost text-xs" onClick={() => navigator.clipboard?.writeText(o.code).then(() => toast('success', `Coupon ${o.code} copied — apply it at checkout.`)).catch(() => toast('info', `Use code ${o.code} at checkout.`))}>Copy</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* TRUSTED OPERATORS */}
      <section aria-labelledby="ops-h">
        <h2 id="ops-h" className="mb-4 text-xl font-extrabold sm:text-2xl">Trusted operators</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[['Orange Travels', 4.5, 1284], ['GreenLine Coachways', 4.3, 976], ['Skyline Volvo Tours', 4.6, 2043], ['Coastal Roadlines', 4.1, 655]].map(([name, r, c]: any) => (
            <div key={name} className="card flex items-center gap-3 p-4">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-600/10 text-brand-700 dark:text-brand-300 font-extrabold">{String(name)[0]}</span>
              <div className="min-w-0"><b className="block truncate text-sm">{name}</b><Stars value={r} count={c} /><span className="badge-green mt-1 !py-0.5"><Icon d={I.shield} size={11} />Verified (demo)</span></div>
            </div>
          ))}
        </div>
      </section>

      {/* REVIEWS */}
      <section aria-labelledby="rev-h">
        <h2 id="rev-h" className="mb-4 text-xl font-extrabold sm:text-2xl">{t('reviews', lang)}</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {(reviews || []).map((rv) => (
            <figure key={rv.name} className="card p-5">
              <Stars value={rv.rating} />
              <blockquote className="mt-2 text-sm text-slate-600 dark:text-slate-300">“{rv.text}”</blockquote>
              <figcaption className="mt-3 text-xs font-semibold text-slate-400">{rv.name} · {rv.route}</figcaption>
            </figure>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-slate-400">These are illustrative demo quotes. Real SafarGo reviews would only come from verified completed journeys.</p>
      </section>

      {/* SAFETY + SUPPORT */}
      <section className="grid gap-3 rounded-3xl bg-gradient-to-r from-emerald-50 to-brand-50 p-6 dark:from-emerald-900/20 dark:to-brand-900/20 sm:grid-cols-3 sm:p-8">
        {[[I.shield, 'Verified operators', 'Permits, insurance and fitness checks flagged on every listing.'],
          [I.headset, '24×7 support (demo)', 'Ticket-based help centre with acknowledgement inside seconds.'],
          [I.heart, 'Women-friendly picks', 'Filter for ladies-priority berths and women-crew buses.']].map(([ic, ti, de]: any) => (
          <div key={ti} className="flex gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-emerald-600 shadow-sm dark:bg-slate-900"><Icon d={ic} size={20} /></span>
            <div><b className="text-sm">{ti}</b><p className="text-xs text-slate-600 dark:text-slate-300">{de}</p></div>
          </div>
        ))}
      </section>

      {/* FAQ */}
      <section aria-labelledby="faq-h">
        <h2 id="faq-h" className="mb-4 text-xl font-extrabold sm:text-2xl">{t('faq', lang)}</h2>
        <div className="card divide-y divide-slate-100 dark:divide-slate-700/60">
          {FAQS.map(([q, a], i) => (
            <div key={i}>
              <button className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800/60"
                aria-expanded={openFaq === i} onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                {q}<Icon d={openFaq === i ? I.chevD : I.chevR} size={16} className="shrink-0 text-slate-400" />
              </button>
              {openFaq === i && <p className="animate-fadeUp px-5 pb-5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{a}</p>}
            </div>
          ))}
        </div>
      </section>

      {/* NEWSLETTER */}
      <section className="card overflow-hidden">
        <div className="grid items-center gap-4 p-6 sm:grid-cols-2 sm:p-8">
          <div>
            <h2 className="text-xl font-extrabold">Get route launches & coupon drops</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Optional subscription — unsubscribe anytime. (Demo: nothing is emailed.)</p>
          </div>
          <form onSubmit={subscribe} className="flex gap-2" noValidate>
            <label htmlFor="nl-email" className="sr-only">Email address</label>
            <input id="nl-email" type="email" className="input" placeholder="you@example.in" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <button className="btn-primary shrink-0">Subscribe</button>
          </form>
        </div>
      </section>
    </div>
  )
}
