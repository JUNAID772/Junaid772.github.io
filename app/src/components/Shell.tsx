// App shell: routes + shared chrome (header, footer, toasts, mobile nav).
import React from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { ShellChrome, usePageTitle } from './ui'
import Home from '../pages/Home'
import Results from '../pages/Results'
import SeatSelect from '../pages/SeatSelect'
import Checkout from '../pages/Checkout'
import PayPage from '../pages/PayPage'
import Confirmation from '../pages/Confirmation'
import AuthPage from '../pages/Auth'
import Profile, { BookingDetail, LiveTrip } from '../pages/Profile'
import Admin from '../pages/Admin'
import OperatorPortal from '../pages/OperatorPortal'
import { OffersPage, HelpPage, NotFound } from '../pages/StaticPages'

function RoutedApp() {
  const loc = useLocation()
  usePageTitle(loc.pathname)
  return (
    <ShellChrome>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/search" element={<Results />} />
        <Route path="/seat/:scheduleId" element={<SeatSelect />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/pay/:id" element={<PayPage />} />
        <Route path="/confirmation/:id" element={<Confirmation />} />
        <Route path="/login" element={<AuthPage />} />
        <Route path="/register" element={<AuthPage />} />
        <Route path="/me" element={<Profile />} />
        <Route path="/booking/:id" element={<BookingDetail />} />
        <Route path="/trip/:id" element={<LiveTrip />} />
        <Route path="/offers" element={<OffersPage />} />
        <Route path="/help" element={<HelpPage />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/operator" element={<OperatorPortal />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </ShellChrome>
  )
}

export default function Shell() {
  return <RoutedApp />
}
