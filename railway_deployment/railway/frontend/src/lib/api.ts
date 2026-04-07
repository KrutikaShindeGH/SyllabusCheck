// frontend/src/lib/api.ts
import axios from 'axios'
import { useAuthStore } from '../store/authStore'

// In Railway production, VITE_API_URL is set to the backend service URL
// e.g. https://syllacheck-api.up.railway.app
// In local dev, the Vite proxy forwards /api → http://localhost:8000
const BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api'

const api = axios.create({ baseURL: BASE_URL })

// Attach JWT on every request
api.interceptors.request.use(config => {
  const token = useAuthStore.getState().token
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Auto-logout on 401
api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      useAuthStore.getState().logout()
      window.location.href = '/'
    }
    return Promise.reject(err)
  }
)

export default api
