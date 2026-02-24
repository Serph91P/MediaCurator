import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import api from '../lib/api'
import type { User, Session } from '../types'

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
      isAuthenticated: false,
      isLoading: false,

      checkAuth: () => {
        return get().isAuthenticated
      },

      login: async (username: string, password: string) => {
        set({ isLoading: true })
        try {
          const formData = new URLSearchParams()
          formData.append('username', username)
          formData.append('password', password)

          await api.post('/auth/login', formData, {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          })

          // Cookies are set automatically by the response
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
          await api.post('/auth/register', {
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
          // Server clears cookies and revokes refresh token
          await api.post('/auth/logout')
        } catch {
          // Ignore errors during logout
        } finally {
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
          // Cookie invalid or expired — clear auth state
          set({ user: null, isAuthenticated: false })
        }
      },

      getSessions: async () => {
        const response = await api.get<{ sessions: Session[], total: number }>('/auth/sessions')
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
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)
