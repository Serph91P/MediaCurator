import axios from 'axios'

const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || '/api'

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Token management
const ACCESS_TOKEN_KEY = 'auth_token'
const REFRESH_TOKEN_KEY = 'refresh_token'

export const setToken = (token: string | null) => {
  if (token) {
    localStorage.setItem(ACCESS_TOKEN_KEY, token)
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`
  } else {
    removeToken()
  }
}

export const setRefreshToken = (token: string | null) => {
  if (token) {
    localStorage.setItem(REFRESH_TOKEN_KEY, token)
  } else {
    localStorage.removeItem(REFRESH_TOKEN_KEY)
  }
}

export const getToken = (): string | null => {
  return localStorage.getItem(ACCESS_TOKEN_KEY)
}

export const getRefreshToken = (): string | null => {
  return localStorage.getItem(REFRESH_TOKEN_KEY)
}

export const removeToken = () => {
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
  delete api.defaults.headers.common['Authorization']
}

// Initialize token from localStorage
const token = getToken()
if (token) {
  api.defaults.headers.common['Authorization'] = `Bearer ${token}`
}

// Flag to prevent multiple refresh attempts
let isRefreshing = false
let failedQueue: Array<{
  resolve: (token: string) => void
  reject: (error: any) => void
}> = []

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error)
    } else {
      prom.resolve(token!)
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
        removeToken()
        window.location.href = '/login'
        return Promise.reject(error)
      }

      if (isRefreshing) {
        // Wait for the refresh to complete
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        })
          .then((token) => {
            originalRequest.headers['Authorization'] = `Bearer ${token}`
            return api(originalRequest)
          })
          .catch((err) => {
            return Promise.reject(err)
          })
      }

      originalRequest._retry = true
      isRefreshing = true

      const refreshToken = getRefreshToken()
      
      if (!refreshToken) {
        removeToken()
        window.location.href = '/login'
        return Promise.reject(error)
      }

      try {
        const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
          refresh_token: refreshToken,
        })

        const newAccessToken = response.data.access_token
        const newRefreshToken = response.data.refresh_token
        setToken(newAccessToken)
        if (newRefreshToken) {
          setRefreshToken(newRefreshToken)
        }
        
        processQueue(null, newAccessToken)
        
        originalRequest.headers['Authorization'] = `Bearer ${newAccessToken}`
        return api(originalRequest)
      } catch (refreshError) {
        processQueue(refreshError, null)
        removeToken()
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
