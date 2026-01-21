import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import api, { setToken, setRefreshToken, getToken, getRefreshToken, removeToken } from '../lib/api'
import type { User, Token, Session } from '../types'

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (username: string, password: string) => Promise<void>
  register: (username: string, password: string, email?: string) => Promise<void>
  logout: () => Promise<void>
  logoutAll: () => Promise<void>
  fetchUser: () => Promise<void>
  checkAuth: () => boolean
  getSessions: () => Promise<Session[]>
  revokeSession: (sessionId: number) => Promise<void>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: !!getToken(),
      isLoading: false,

      checkAuth: () => {
        const hasToken = !!getToken()
        set({ isAuthenticated: hasToken })
        return hasToken
      },

      login: async (username: string, password: string) => {
        set({ isLoading: true })
        try {
          const formData = new URLSearchParams()
          formData.append('username', username)
          formData.append('password', password)

          const response = await api.post<Token>('/auth/login', formData, {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          })

          const { access_token, refresh_token } = response.data
          
          // Store both tokens
          setToken(access_token)
          setRefreshToken(refresh_token)
          set({ isAuthenticated: true, isLoading: false })

          // Now fetch user info
          await get().fetchUser()
        } catch (error) {
          set({ isLoading: false })
          throw error
        }
      },

      register: async (username: string, password: string, email?: string) => {
        set({ isLoading: true })
        try {
          await api.post<User>('/auth/register', {
            username,
            password,
            email: email || null,
          })

          // Auto-login after registration
          await get().login(username, password)
        } catch (error) {
          set({ isLoading: false })
          throw error
        }
      },

      logout: async () => {
        try {
          const refreshToken = getRefreshToken()
          if (refreshToken) {
            await api.post('/auth/logout', { refresh_token: refreshToken })
          }
        } catch {
          // Ignore errors during logout
        } finally {
          removeToken()
          set({ 
            user: null, 
            isAuthenticated: false 
          })
        }
      },

      logoutAll: async () => {
        try {
          await api.post('/auth/logout-all')
        } finally {
          removeToken()
          set({ 
            user: null, 
            isAuthenticated: false 
          })
        }
      },

      fetchUser: async () => {
        try {
          const response = await api.get<User>('/auth/me')
          set({ user: response.data, isAuthenticated: true })
        } catch {
          // Token invalid - clear auth state
          removeToken()
          set({ user: null, isAuthenticated: false })
        }
      },

      getSessions: async () => {
        const response = await api.get<{ sessions: Session[], total: number }>('/auth/sessions', {
          headers: {
            'x-refresh-token': getRefreshToken() || ''
          }
        })
        return response.data.sessions
      },

      revokeSession: async (sessionId: number) => {
        await api.delete(`/auth/sessions/${sessionId}`)
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ 
        user: state.user,
      }),
    }
  )
)
