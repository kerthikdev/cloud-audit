/**
 * apiClient.js — Axios instance with JWT auth, auto-refresh, and 401 handling.
 * Token is refreshed if <5 min remain before expiry (proactive refresh).
 */
import axios from 'axios'
import { getToken, logout } from './authService'

const apiClient = axios.create({
    baseURL: import.meta.env.VITE_API_URL || '/api/v1',
    timeout: 60000,
    headers: { 'Content-Type': 'application/json' },
})

/** Check if JWT expires within the next `bufferMs` milliseconds */
function _tokenExpiresWithin(bufferMs = 5 * 60 * 1000) {
    const token = getToken()
    if (!token) return false
    try {
        const payload = JSON.parse(atob(token.split('.')[1]))
        return payload.exp * 1000 < Date.now() + bufferMs
    } catch {
        return false
    }
}

/** Attempt a silent token refresh via /auth/refresh (no-op if endpoint not available) */
let _refreshPromise = null
async function _refreshToken() {
    if (_refreshPromise) return _refreshPromise
    _refreshPromise = (async () => {
        try {
            const token = getToken()
            if (!token) return
            const res = await axios.post(
                `${import.meta.env.VITE_API_URL || '/api/v1'}/auth/refresh`,
                {},
                { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 }
            )
            if (res.data?.access_token) {
                localStorage.setItem('auth_token', res.data.access_token)
            }
        } catch {
            // Refresh endpoint not available or token too old — let 401 handle it
        } finally {
            _refreshPromise = null
        }
    })()
    return _refreshPromise
}

// Attach JWT on every request; proactively refresh if near expiry
apiClient.interceptors.request.use(
    async (config) => {
        if (_tokenExpiresWithin()) {
            await _refreshToken()
        }
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
