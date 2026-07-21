import { Routes, Route } from 'react-router-dom'
import Home from './pages/Home.jsx'
import VenuePage from './pages/VenuePage.jsx'
import AdminPage from './pages/AdminPage.jsx'
import NotFound from './pages/NotFound.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      {/* playnext.com/CAFENAME */}
      <Route path="/:venueSlug" element={<VenuePage />} />
      {/* playnext.com/CAFENAME/admin */}
      <Route path="/:venueSlug/admin" element={<AdminPage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
