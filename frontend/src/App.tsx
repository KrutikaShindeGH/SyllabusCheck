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
import ProgramGapAnalysis from './pages/ProgramGapAnalysis'
import ProgramReport  from './pages/ProgramReport'


// ── Handle Google OAuth redirect synchronously before React renders ───────────
const _params = new URLSearchParams(window.location.search)
const _oauthToken   = _params.get('access_token')
const _refreshToken = _params.get('refresh_token')
const _oauthEmail   = _params.get('email')
const _oauthName    = _params.get('name')

if (_oauthToken) {
  localStorage.setItem('access_token',  _oauthToken)
  if (_refreshToken) localStorage.setItem('refresh_token', _refreshToken)
  window.history.replaceState({}, document.title, '/dashboard')
}
// ─────────────────────────────────────────────────────────────────────────────

function ProtectedApp() {
  const { logout } = useAuthStore()
  const navigate   = useNavigate()
  const hasFetched = useRef(false)

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
        <Route path="/dashboard"     element={<Dashboard />} />
        <Route path="/syllabi"       element={<Syllabi />} />
        <Route path="/jobs"          element={<JobExplorer />} />
        <Route path="/coverage"      element={<CoverageMatrix />} />
        <Route path="/gaps"          element={<GapAnalysis />} />
        <Route path="/reports"       element={<Reports />} />
        <Route path="/program-gap"   element={<ProgramGapAnalysis />} />
        <Route path="/program-report" element={<ProgramReport />} />
        <Route path="*"              element={<Navigate to="/dashboard" replace />} />
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

