import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from './stores/auth'
import { getToken } from './lib/api'
import Layout from './components/Layout'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import Services from './pages/Services'
import Rules from './pages/Rules'
import Libraries from './pages/Libraries'
import Notifications from './pages/Notifications'
import Settings from './pages/Settings'
import History from './pages/History'
import Preview from './pages/Preview'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore()
  const token = getToken()
  const location = useLocation()
  
  // Check both zustand state and localStorage token
  if (!isAuthenticated && !token) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }
  
  return <>{children}</>
}

function App() {
  const { isAuthenticated } = useAuthStore()
  const token = getToken()
  const hasAuth = isAuthenticated || !!token

  return (
    <Routes>
      <Route 
        path="/login" 
        element={hasAuth ? <Navigate to="/" replace /> : <Login />} 
      />
      <Route 
        path="/register" 
        element={hasAuth ? <Navigate to="/" replace /> : <Register />} 
      />
      
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="services" element={<Services />} />
        <Route path="rules" element={<Rules />} />
        <Route path="libraries" element={<Libraries />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="settings" element={<Settings />} />
        <Route path="history" element={<History />} />
        <Route path="preview" element={<Preview />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
