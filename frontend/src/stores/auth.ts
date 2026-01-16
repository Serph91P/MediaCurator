import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import api, { setToken, getToken } from '../lib/api'
import type { User, Token } from '../types'

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (username: string, password: string) => Promise<void>
  register: (username: string, password: string, email?: string) => Promise<void>
  logout: () => void
  fetchUser: () => Promise<void>
  checkAuth: () => boolean
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

          const token = response.data.access_token
          
          // Store token BEFORE making any other requests
          setToken(token)
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

      logout: () => {
        setToken(null)
        set({ 
          user: null, 
          isAuthenticated: false 
        })
      },

      fetchUser: async () => {
        try {
          const response = await api.get<User>('/auth/me')
          set({ user: response.data, isAuthenticated: true })
        } catch {
          // Token invalid - clear auth state
          setToken(null)
          set({ user: null, isAuthenticated: false })
        }
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
