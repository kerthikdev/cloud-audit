import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import Settings from './pages/Settings'
import Recommendations from './pages/Recommendations'
import Analytics from './pages/Analytics'
import Compliance from './pages/Compliance'
import History from './pages/History'
import Login from './pages/Login'
import { isAuthenticated } from './services/authService'

function ProtectedLayout() {
    if (!isAuthenticated()) return <Navigate to="/login" replace />
    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/recommendations" element={<Recommendations />} />
                    <Route path="/analytics" element={<Analytics />} />
                    <Route path="/compliance" element={<Compliance />} />
                    <Route path="/history" element={<History />} />
                    <Route path="/settings" element={<Settings />} />
                </Routes>
            </main>
        </div>
    )
}

export default function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/*" element={<ProtectedLayout />} />
            </Routes>
        </BrowserRouter>
    )
}
