import { useState } from 'react'
import api from '../lib/api'

export default function Register() {
  const [form, setForm] = useState({ email: '', password: '', full_name: '' })
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleRegister() {
    setLoading(true)
    setError('')
    try {
      await api.post('/auth/register', form)
      setDone(true)
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  if (done) return (
    <div className="min-h-screen bg-[#F8F6F3] flex items-center justify-center">
      <div className="text-center">
        <div className="text-4xl mb-3">✅</div>
        <div className="font-semibold text-gray-800">Account created!</div>
        <a href="/" className="text-sm text-[#C75B12] mt-2 block">Sign in →</a>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#F8F6F3] flex items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="text-3xl font-bold text-[#C75B12]">SyllabusCheck</div>
          <div className="text-sm text-gray-500 mt-1">Create your account</div>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <div className="space-y-4">
            {(['full_name', 'email', 'password'] as const).map(field => (
              <div key={field}>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {field.replace('_', ' ')}
                </label>
                <input
                  type={field === 'password' ? 'password' : field === 'email' ? 'email' : 'text'}
                  value={form[field]}
                  onChange={e => setForm(p => ({ ...p, [field]: e.target.value }))}
                  className="mt-1 w-full px-4 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#C75B12] transition"
                />
              </div>
            ))}
            {error && <p className="text-red-500 text-xs">{error}</p>}
            <button
              onClick={handleRegister}
              disabled={loading}
              className="w-full py-2.5 bg-[#C75B12] text-white rounded-lg text-sm font-semibold hover:bg-[#A84A0A] transition disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Account'}
            </button>
          </div>
        </div>
        <p className="text-center text-xs text-gray-400 mt-4">
          Already have an account?{' '}
          <a href="/" className="text-[#C75B12] font-medium">Sign in</a>
        </p>
      </div>
    </div>
  )
}
