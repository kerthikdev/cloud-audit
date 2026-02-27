import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Shield, Eye, EyeOff, RefreshCw, UserPlus, LogIn } from 'lucide-react'
import { login, register } from '../services/authService'

export default function Login() {
    const navigate = useNavigate()
    const [mode, setMode] = useState('login')   // 'login' | 'register'
    const [user, setUser] = useState('')
    const [pass, setPass] = useState('')
    const [email, setEmail] = useState('')
    const [showPass, setShowPass] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')
        setLoading(true)
        try {
            if (mode === 'login') {
                await login(user, pass)
                navigate('/')
            } else {
                await register(user, pass, email)
                // Auto-login after registration
                await login(user, pass)
                navigate('/')
            }
        } catch (err) {
            setError(err.message || 'Something went wrong')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div style={{
            minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--bg)', padding: '2rem',
        }}>
            <div style={{
                width: '100%', maxWidth: 400, background: 'var(--bg-card)',
                border: '1px solid var(--border)', borderRadius: '1.25rem',
                padding: '2.5rem', boxShadow: '0 25px 50px rgba(0,0,0,0.4)',
            }}>
                {/* Logo / Header */}
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <div style={{
                        width: 56, height: 56, background: 'rgba(99,102,241,0.15)',
                        borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        margin: '0 auto 1rem',
                    }}>
                        <Shield size={28} color="var(--accent)" />
                    </div>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text)', margin: 0 }}>
                        Cloud Audit Platform
                    </h1>
                    <p style={{ margin: '0.5rem 0 0', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                        {mode === 'login' ? 'Sign in to your account' : 'Create a new account'}
                    </p>
                </div>

                {/* Tab switcher */}
                <div style={{ display: 'flex', background: 'var(--bg-secondary)', borderRadius: 8, padding: 4, marginBottom: '1.5rem' }}>
                    {['login', 'register'].map(m => (
                        <button key={m} onClick={() => { setMode(m); setError('') }} style={{
                            flex: 1, padding: '0.5rem', borderRadius: 6, border: 'none', cursor: 'pointer',
                            background: mode === m ? 'var(--accent)' : 'transparent',
                            color: mode === m ? '#fff' : 'var(--text-muted)',
                            fontWeight: 600, fontSize: '0.875rem', transition: 'all 0.15s',
                        }}>
                            {m === 'login' ? '🔑 Sign In' : '✨ Register'}
                        </button>
                    ))}
                </div>

                {error && (
                    <div style={{
                        background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)',
                        borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '1rem',
                        color: '#fca5a5', fontSize: '0.875rem',
                    }}>
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {mode === 'register' && (
                        <div>
                            <label className="form-label">Email (optional)</label>
                            <input className="form-input" type="email" placeholder="you@company.com"
                                value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
                        </div>
                    )}
                    <div>
                        <label className="form-label">Username</label>
                        <input className="form-input" type="text" placeholder="admin"
                            value={user} onChange={e => setUser(e.target.value)}
                            autoComplete="username" required />
                    </div>
                    <div>
                        <label className="form-label">Password</label>
                        <div style={{ position: 'relative' }}>
                            <input className="form-input" type={showPass ? 'text' : 'password'}
                                placeholder="••••••••" value={pass}
                                onChange={e => setPass(e.target.value)}
                                style={{ paddingRight: '3rem' }} autoComplete="current-password" required />
                            <button type="button" onClick={() => setShowPass(s => !s)} style={{
                                position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)',
                                background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer',
                            }}>
                                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                    </div>

                    <button type="submit" className="btn btn-primary" disabled={loading} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginTop: '0.5rem',
                    }}>
                        {loading
                            ? <><RefreshCw size={16} className="spin" /> Please wait…</>
                            : mode === 'login'
                                ? <><LogIn size={16} /> Sign In</>
                                : <><UserPlus size={16} /> Create Account</>}
                    </button>
                </form>

                <p style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '1.5rem' }}>
                    {mode === 'login'
                        ? <>First time? <button onClick={() => setMode('register')} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', textDecoration: 'underline', fontSize: 'inherit' }}>Create an account</button></>
                        : <>Already have an account? <button onClick={() => setMode('login')} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', textDecoration: 'underline', fontSize: 'inherit' }}>Sign in</button></>}
                </p>
            </div>
        </div>
    )
}
