import { InputHTMLAttributes, forwardRef } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = '', ...props }, ref) => {
    return (
      <div>
        {label && (
          <label className="block text-sm font-medium text-dark-200 mb-1">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={`block w-full px-3 py-2 bg-dark-800 border ${
            error ? 'border-red-500' : 'border-dark-600'
          } rounded-lg text-dark-100 placeholder-dark-400 focus:outline-2 focus:outline-primary-500 focus:border-transparent transition-colors ${className}`}
          {...props}
        />
        {error && <p className="mt-1 text-sm text-red-500">{error}</p>}
      </div>
    )
  }
)

Input.displayName = 'Input'
