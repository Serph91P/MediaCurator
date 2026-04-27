import axios from 'axios'

const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || '/api'

/**
 * Read a cookie value by name.
 */
function getCookie(name: string): string | undefined {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
  return match ? decodeURIComponent(match[2]) : undefined
}

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
})

// Attach CSRF token header on state-changing requests
api.interceptors.request.use((config) => {
  const method = (config.method || '').toUpperCase()
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const csrfToken = getCookie('csrf_token')
    if (csrfToken) {
      config.headers['X-CSRF-Token'] = csrfToken
    }
  }
  return config
})

/**
 * Get a short-lived token for WebSocket authentication.
 * Required because the access token is in an httpOnly cookie inaccessible to JS.
 */
export const getWsToken = async (): Promise<string | null> => {
  try {
    const response = await api.post<{ token: string }>('/auth/ws-token')
    return response.data.token
  } catch {
    return null
  }
}

// Flag to prevent multiple refresh attempts
let isRefreshing = false
let failedQueue: Array<{
  resolve: (value?: unknown) => void
  reject: (error: any) => void
}> = []

const processQueue = (error: any) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error)
    } else {
      prom.resolve()
    }
  })
  failedQueue = []
}

// Response interceptor for handling 401 errors and token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    // If error is 401 and we haven't tried to refresh yet
    if (error.response?.status === 401 && !originalRequest._retry) {
      // Check if this is the refresh endpoint failing
      if (originalRequest.url === '/auth/refresh') {
        window.location.href = '/login'
        return Promise.reject(error)
      }

      if (isRefreshing) {
        // Wait for the refresh to complete
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        })
          .then(() => api(originalRequest))
          .catch((err) => Promise.reject(err))
      }

      originalRequest._retry = true
      isRefreshing = true

      try {
        // Refresh via cookie — no body needed
        await axios.post(`${API_BASE_URL}/auth/refresh`, {}, {
          withCredentials: true,
        })

        processQueue(null)

        // Retry original request — new cookie is set automatically
        return api(originalRequest)
      } catch (refreshError) {
        processQueue(refreshError)
        // Diagnostic: if the backend now reports setup_required=true even
        // though the user *was* logged in, the database / secret key likely
        // changed unexpectedly. Surface a one-off toast so the operator
        // notices instead of silently bouncing back to the wizard.
        try {
          const setupRes = await axios.get<{ setup_required: boolean }>(
            `${API_BASE_URL}/auth/setup-required`,
            { withCredentials: true },
          )
          if (setupRes.data?.setup_required) {
            // Use sessionStorage so we only warn once per browser session.
            if (!sessionStorage.getItem('mc_setup_warning_shown')) {
              sessionStorage.setItem('mc_setup_warning_shown', '1')
              // Dynamic import to avoid a hard dependency cycle in tests.
              const toast = (await import('react-hot-toast')).default
              toast.error(
                'Session expired and the server reports no users exist. ' +
                'Verify your database volume and SECRET_KEY are persisted.',
                { duration: 8000 },
              )
            }
          }
        } catch {
          // Diagnostic check failed — fall through to login redirect.
        }
        window.location.href = '/login'
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(error)
  }
)

export default api
