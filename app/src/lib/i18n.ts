// Tiny i18n layer — English + Hindi dictionaries. Architecture-ready for
// Kannada, Tamil, Telugu, Malayalam, Marathi etc.: add a dictionary key here.
export type Lang = 'en' | 'hi'

const DICT: Record<Lang, Record<string, string>> = {
  en: {
    searchBuses: 'Search buses',
    from: 'From',
    to: 'To',
    travelDate: 'Travel date',
    passengers: 'Passengers',
    today: 'Today',
    tomorrow: 'Tomorrow',
    flexible: 'Flexible dates',
    popularRoutes: 'Popular routes across India',
    offers: 'Offers & coupons',
    reviews: 'Traveller reviews',
    faq: 'Frequently asked questions',
    myBookings: 'My bookings',
    login: 'Login',
    logout: 'Logout',
    signup: 'Create account',
    seatSelection: 'Choose your seats',
    continueBtn: 'Continue',
    payNow: 'Pay now',
    downloadTicket: 'Download e-ticket',
    cancelBooking: 'Cancel booking',
    helpCenter: 'Help centre',
  },
  hi: {
    searchBuses: 'बस खोजें',
    from: 'कहाँ से',
    to: 'कहाँ तक',
    travelDate: 'यात्रा तिथि',
    passengers: 'यात्री',
    today: 'आज',
    tomorrow: 'कल',
    flexible: 'लचीली तारीख़ें',
    popularRoutes: 'भारत भर की लोकप्रिय रूट',
    offers: 'ऑफ़र और कूपन',
    reviews: 'यात्री समीक्षाएँ',
    faq: 'अक्सर पूछे जाने वाले प्रश्न',
    myBookings: 'मेरी बुकिंग',
    login: 'लॉगिन',
    logout: 'लॉगआउट',
    signup: 'खाता बनाएँ',
    seatSelection: 'अपनी सीट चुनें',
    continueBtn: 'आगे बढ़ें',
    payNow: 'अभी भुगतान करें',
    downloadTicket: 'ई-टिकट डाउनलोड करें',
    cancelBooking: 'बुकिंग रद्द करें',
    helpCenter: 'सहायता केंद्र',
  },
}

export function t(key: string, lang: Lang): string {
  return DICT[lang]?.[key] ?? DICT.en[key] ?? key
}

export const inr = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
export const inr2 = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export const fmtDateLong = (ymd: string, lang: Lang = 'en') =>
  new Date(ymd + 'T00:00:00+05:30').toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })

export const fmtDur = (min: number) => `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m`

export function addDays(ymd: string, n: number): string {
  const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
export const todayIST = () => new Date(Date.now() + 19.5 * 3600 * 1000).toISOString().slice(0, 10)
