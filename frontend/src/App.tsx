import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from './stores/auth'
import { getToken } from './lib/api'
import api from './lib/api'
import Layout from './components/Layout'
import Login from './pages/Login'
import Register from './pages/Register'
import SetupWizard from './pages/SetupWizard'
import Dashboard from './pages/Dashboard'
import Services from './pages/Services'
import Rules from './pages/Rules'
import Libraries from './pages/Libraries'
import LibraryDetail from './pages/LibraryDetail'
import Notifications from './pages/Notifications'
import Settings from './pages/Settings'
import History from './pages/History'
import Preview from './pages/Preview'
import Jobs from './pages/Jobs'
import Staging from './pages/Staging'
import Users from './pages/Users'
import UserDetail from './pages/UserDetail'
import Activity from './pages/Activity'

interface SetupStatus {
  setup_complete: boolean
  has_users: boolean
  has_arr_service: boolean
  has_media_server: boolean
  current_step: string
}

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

/**
 * Redirect to /setup if authenticated but setup is not complete.
 */
function SetupGate({ children }: { children: React.ReactNode }) {
  const { data: setupStatus, isLoading } = useQuery<SetupStatus>({
    queryKey: ['setup-status'],
    queryFn: async () => {
      const res = await api.get<SetupStatus>('/setup/status')
      return res.data
    },
    staleTime: 30_000,
    retry: 1,
  })

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-dark-900">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary-500 border-t-transparent rounded-full mx-auto"></div>
          <p className="text-gray-400 dark:text-dark-400 mt-4">Loading...</p>
        </div>
      </div>
    )
  }

  // If setup is not complete, redirect to wizard
  if (setupStatus && !setupStatus.setup_complete) {
    return <Navigate to="/setup" replace />
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
        path="/setup"
        element={
          <ProtectedRoute>
            <SetupWizard />
          </ProtectedRoute>
        }
      />
      
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <SetupGate>
              <Layout />
            </SetupGate>
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="services" element={<Services />} />
        <Route path="rules" element={<Rules />} />
        <Route path="libraries" element={<Libraries />} />
        <Route path="libraries/:libraryId" element={<LibraryDetail />} />
        <Route path="jobs" element={<Jobs />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="settings" element={<Settings />} />
        <Route path="history" element={<History />} />
        <Route path="preview" element={<Preview />} />
        <Route path="staging" element={<Staging />} />
        <Route path="users" element={<Users />} />
        <Route path="users/:userId" element={<UserDetail />} />
        <Route path="activity" element={<Activity />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
