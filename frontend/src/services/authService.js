/**
 * authService.js — JWT auth helpers
 * Uses relative URLs so the Vite proxy forwards to the backend (no CORS issues).
 * Token is stored in localStorage as 'auth_token' and 'auth_user'.
 */

const TOKEN_KEY = 'auth_token'
const USER_KEY = 'auth_user'

// Use relative path — Vite proxy forwards /api/* → http://localhost:8000
const BASE = '/api/v1'

async function _post(path, body) {
    const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.detail || `Request failed (${res.status})`)
    return data
}

export async function login(username, password) {
    const data = await _post(`${BASE}/auth/login`, { username, password })
    localStorage.setItem(TOKEN_KEY, data.access_token)
    localStorage.setItem(USER_KEY, JSON.stringify({ username: data.username, role: data.role }))
    return data
}

export async function register(username, password, email = '') {
    return _post(`${BASE}/auth/register`, { username, password, email })
}

export function logout() {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    window.location.href = '/login'
}

export function getToken() {
    return localStorage.getItem(TOKEN_KEY)
}

export function getUser() {
    try {
        return JSON.parse(localStorage.getItem(USER_KEY)) || null
    } catch {
        return null
    }
}

export function isAuthenticated() {
    const token = getToken()
    if (!token) return false
    try {
        const payload = JSON.parse(atob(token.split('.')[1]))
        return payload.exp * 1000 > Date.now()
    } catch {
        return false
    }
}
