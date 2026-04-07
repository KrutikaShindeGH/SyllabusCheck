import { useAuthStore } from '../store/authStore'
import { useNavigate, useLocation } from 'react-router-dom'

const nav = [
  { path: '/dashboard',  label: 'Dashboard',     icon: '▦' },
  { path: '/syllabi',    label: 'Syllabi',        icon: '📄' },
  { path: '/jobs',       label: 'Job Explorer',   icon: '💼' },
  { path: '/coverage',   label: 'Coverage Matrix',icon: '🔥' },
  { path: '/gaps',       label: 'Gap Analysis',   icon: '⚡' },
  { path: '/reports',    label: 'Reports',        icon: '📊' },
]

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const { pathname } = useLocation()

  function handleLogout() {
    logout()
    navigate('/')
  }

  return (
    <div className="flex h-screen bg-[#F8F6F3] overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 bg-[#1C1C1C] flex flex-col shrink-0">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-white/10">
          <div className="text-xl font-bold text-[#C75B12]">SyllabusCheck</div>
          <div className="text-xs text-gray-500 mt-0.5">Curriculum Analyzer</div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {nav.map(item => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition text-left
                ${pathname === item.path
                  ? 'bg-[#C75B12] text-white font-semibold'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        {/* User */}
        <div className="px-4 py-4 border-t border-white/10">
          <div className="text-xs text-gray-400 truncate">{user?.full_name}</div>
          <div className="text-xs text-gray-600 truncate mb-2">{user?.email}</div>
          <button
            onClick={handleLogout}
            className="text-xs text-gray-500 hover:text-red-400 transition"
          >
            Sign out →
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}

