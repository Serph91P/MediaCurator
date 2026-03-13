import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useEffect, lazy, Suspense } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from './stores/auth'
import api from './lib/api'
import Layout from './components/Layout'

// Eagerly loaded (needed immediately)
import Login from './pages/Login'
import Register from './pages/Register'

// Lazy-loaded pages
const SetupWizard = lazy(() => import('./pages/SetupWizard'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Services = lazy(() => import('./pages/Services'))
const Rules = lazy(() => import('./pages/Rules'))
const Libraries = lazy(() => import('./pages/Libraries'))
const LibraryDetail = lazy(() => import('./pages/LibraryDetail'))
const Notifications = lazy(() => import('./pages/Notifications'))
const Settings = lazy(() => import('./pages/Settings'))
const History = lazy(() => import('./pages/History'))
const Preview = lazy(() => import('./pages/Preview'))
const Jobs = lazy(() => import('./pages/Jobs'))
const Staging = lazy(() => import('./pages/Staging'))
const Users = lazy(() => import('./pages/Users'))
const UserDetail = lazy(() => import('./pages/UserDetail'))
const Activity = lazy(() => import('./pages/Activity'))
const Analytics = lazy(() => import('./pages/Analytics'))
const CleanupSuggestions = lazy(() => import('./pages/CleanupSuggestions'))

interface SetupStatus {
  setup_complete: boolean
  has_users: boolean
  has_arr_service: boolean
  has_media_server: boolean
  current_step: string
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, fetchUser } = useAuthStore()
  const location = useLocation()

  // Validate session on mount
  useEffect(() => {
    if (isAuthenticated) {
      fetchUser()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  
  if (!isAuthenticated) {
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

function PageSpinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="animate-spin h-8 w-8 border-4 border-primary-500 border-t-transparent rounded-full"></div>
    </div>
  )
}

function App() {
  const { isAuthenticated } = useAuthStore()

  const hasAuth = isAuthenticated

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
            <Suspense fallback={<PageSpinner />}>
              <SetupWizard />
            </Suspense>
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
        <Route index element={<Suspense fallback={<PageSpinner />}><Dashboard /></Suspense>} />
        <Route path="services" element={<Suspense fallback={<PageSpinner />}><Services /></Suspense>} />
        <Route path="rules" element={<Suspense fallback={<PageSpinner />}><Rules /></Suspense>} />
        <Route path="libraries" element={<Suspense fallback={<PageSpinner />}><Libraries /></Suspense>} />
        <Route path="libraries/:libraryId" element={<Suspense fallback={<PageSpinner />}><LibraryDetail /></Suspense>} />
        <Route path="jobs" element={<Suspense fallback={<PageSpinner />}><Jobs /></Suspense>} />
        <Route path="notifications" element={<Suspense fallback={<PageSpinner />}><Notifications /></Suspense>} />
        <Route path="settings" element={<Suspense fallback={<PageSpinner />}><Settings /></Suspense>} />
        <Route path="history" element={<Suspense fallback={<PageSpinner />}><History /></Suspense>} />
        <Route path="preview" element={<Suspense fallback={<PageSpinner />}><Preview /></Suspense>} />
        <Route path="suggestions" element={<Suspense fallback={<PageSpinner />}><CleanupSuggestions /></Suspense>} />
        <Route path="staging" element={<Suspense fallback={<PageSpinner />}><Staging /></Suspense>} />
        <Route path="users" element={<Suspense fallback={<PageSpinner />}><Users /></Suspense>} />
        <Route path="users/:userId" element={<Suspense fallback={<PageSpinner />}><UserDetail /></Suspense>} />
        <Route path="activity" element={<Suspense fallback={<PageSpinner />}><Activity /></Suspense>} />
        <Route path="analytics" element={<Suspense fallback={<PageSpinner />}><Analytics /></Suspense>} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
