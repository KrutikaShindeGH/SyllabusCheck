import { useEffect, useRef } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import api from './lib/api'
import Layout from './components/Layout'
import Login          from './pages/Login'
import Register       from './pages/Register'
import Dashboard      from './pages/Dashboard'
import Syllabi        from './pages/Syllabi'
import JobExplorer    from './pages/JobExplorer'
import CoverageMatrix from './pages/CoverageMatrix'
import GapAnalysis    from './pages/GapAnalysis'
import Reports        from './pages/Reports'

// ── Handle Google OAuth redirect synchronously before React renders ───────────
// Backend redirects to: /?access_token=...&refresh_token=...&email=...&name=...
const _params = new URLSearchParams(window.location.search)
const _oauthToken   = _params.get('access_token')
const _refreshToken = _params.get('refresh_token')
const _oauthEmail   = _params.get('email')
const _oauthName    = _params.get('name')

if (_oauthToken) {
  localStorage.setItem('access_token',  _oauthToken)
  if (_refreshToken) localStorage.setItem('refresh_token', _refreshToken)
  // Clean the URL — redirect to /dashboard so ProtectedApp loads directly
  window.history.replaceState({}, document.title, '/dashboard')
}
// ─────────────────────────────────────────────────────────────────────────────

function ProtectedApp() {
  const { logout } = useAuthStore()
  const navigate   = useNavigate()
  const hasFetched = useRef(false)

  // Read token directly from localStorage — avoids Zustand hydration race
  const token = useAuthStore(state => state.token)


  useEffect(() => {
    if (hasFetched.current) return
    hasFetched.current = true

    if (!token) {
      navigate('/')
      return
    }

    api.get('/auth/me')
      .then(r => {
        useAuthStore.setState({ user: r.data, token })
      })
      .catch(() => {
        // /auth/me failed — if we have OAuth params in memory, build a minimal user
        // so the app doesn't boot-loop on the very first OAuth load
        if (_oauthEmail) {
          useAuthStore.setState({
            token,
            user: { id:'', email: _oauthEmail, full_name: _oauthName ?? _oauthEmail, role: 'professor' }
          })
        } else {
          logout()
          navigate('/')
        }
      })
  }, [])

  if (!token) return <Navigate to="/" replace />

  return (
    <Layout>
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/syllabi"   element={<Syllabi />} />
        <Route path="/jobs"      element={<JobExplorer />} />
        <Route path="/coverage"  element={<CoverageMatrix />} />
        <Route path="/gaps"      element={<GapAnalysis />} />
        <Route path="/reports"   element={<Reports />} />
        <Route path="*"          element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Layout>
  )
}

export default function App() {
  const token = localStorage.getItem('access_token')
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"         element={token ? <Navigate to="/dashboard" replace /> : <Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/*"        element={<ProtectedApp />} />
      </Routes>
    </BrowserRouter>
  )
}

