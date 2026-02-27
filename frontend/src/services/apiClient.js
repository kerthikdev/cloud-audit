import axios from 'axios'
import { getToken, logout } from './authService'

const apiClient = axios.create({
    baseURL: import.meta.env.VITE_API_URL || '/api/v1',
    timeout: 60000,
    headers: { 'Content-Type': 'application/json' },
})

// Attach JWT from authService on every request
apiClient.interceptors.request.use(
    (config) => {
        const token = getToken()
        if (token) config.headers.Authorization = `Bearer ${token}`
        return config
    },
    (err) => Promise.reject(err)
)

// Handle 401 — redirect to login; normalize other errors
apiClient.interceptors.response.use(
    (res) => res,
    (err) => {
        if (err.response?.status === 401) {
            logout()  // clears localStorage and redirects to /login
            return Promise.reject(new Error('Session expired — please sign in again'))
        }
        const msg = err.response?.data?.detail || err.message || 'Unknown error'
        console.error('[API Error]', msg)
        return Promise.reject(new Error(msg))
    }
)

export default apiClient
