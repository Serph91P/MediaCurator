import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { useAuthStore } from '../stores/auth'
import api from '../lib/api'
import toast from 'react-hot-toast'

interface RegisterForm {
  username: string
  email?: string
  password: string
  confirmPassword: string
}

export default function Register() {
  const navigate = useNavigate()
  const { register: registerUser, isLoading } = useAuthStore()
  const [error, setError] = useState('')
  const [isFirstUser, setIsFirstUser] = useState(false)
  const [checkingSetup, setCheckingSetup] = useState(true)
  const { register, handleSubmit, watch, formState: { errors } } = useForm<RegisterForm>()

  const password = watch('password')

  // Check if this is the first user (setup mode)
  useEffect(() => {
    const checkSetup = async () => {
      try {
        const res = await api.get<{ setup_required: boolean }>('/auth/setup-required')
        setIsFirstUser(res.data.setup_required)
        // If not setup required (users exist) and we're on register, redirect to login
        if (!res.data.setup_required) {
          navigate('/login', { replace: true })
        }
      } catch {
        // If check fails, allow registration
        setIsFirstUser(false)
      } finally {
        setCheckingSetup(false)
      }
    }
    checkSetup()
  }, [navigate])

  const onSubmit = async (data: RegisterForm) => {
    try {
      setError('')
      await registerUser(data.username, data.password, data.email)
      toast.success('Account created successfully!')
      navigate('/', { replace: true })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Registration failed. Please try again.'
      setError(message)
      toast.error(message)
    }
  }

  if (checkingSetup) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark-900">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary-500 border-t-transparent rounded-full mx-auto"></div>
          <p className="text-dark-400 mt-4">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-dark-900 p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-600 rounded-2xl mb-4">
            <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white">MediaCleaner</h1>
          <p className="text-dark-400 mt-2">
            {isFirstUser ? 'Create your admin account' : 'Create your account'}
          </p>
          {isFirstUser && (
            <p className="text-primary-400 text-sm mt-1">First user will be the administrator</p>
          )}
        </div>

        {/* Register Form */}
        <div className="card">
          <div className="card-body">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}

              <div>
                <label htmlFor="username" className="label">Username</label>
                <input
                  id="username"
                  type="text"
                  {...register('username', { 
                    required: 'Username is required',
                    minLength: { value: 3, message: 'Username must be at least 3 characters' }
                  })}
                  className="input"
                  placeholder="Choose a username"
                />
                {errors.username && (
                  <p className="mt-1 text-sm text-red-400">{errors.username.message}</p>
                )}
              </div>

              <div>
                <label htmlFor="email" className="label">Email (optional)</label>
                <input
                  id="email"
                  type="email"
                  {...register('email')}
                  className="input"
                  placeholder="your@email.com"
                />
              </div>

              <div>
                <label htmlFor="password" className="label">Password</label>
                <input
                  id="password"
                  type="password"
                  {...register('password', { 
                    required: 'Password is required',
                    minLength: { value: 8, message: 'Password must be at least 8 characters' }
                  })}
                  className="input"
                  placeholder="Create a password"
                />
                {errors.password && (
                  <p className="mt-1 text-sm text-red-400">{errors.password.message}</p>
                )}
              </div>

              <div>
                <label htmlFor="confirmPassword" className="label">Confirm Password</label>
                <input
                  id="confirmPassword"
                  type="password"
                  {...register('confirmPassword', { 
                    required: 'Please confirm your password',
                    validate: value => value === password || 'Passwords do not match'
                  })}
                  className="input"
                  placeholder="Confirm your password"
                />
                {errors.confirmPassword && (
                  <p className="mt-1 text-sm text-red-400">{errors.confirmPassword.message}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="btn-primary w-full"
              >
                {isLoading ? 'Creating account...' : isFirstUser ? 'Create Admin Account' : 'Create Account'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
