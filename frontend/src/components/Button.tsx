import { ButtonHTMLAttributes, forwardRef } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: 'bg-primary-600 text-white hover:bg-primary-700 focus:outline-primary-500',
  secondary: 'bg-dark-700 text-dark-100 hover:bg-dark-600 focus:outline-dark-500',
  danger: 'bg-red-600 text-white hover:bg-red-700 focus:outline-red-500',
  ghost: 'bg-transparent text-dark-300 hover:bg-dark-800 hover:text-dark-100',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', className = '', disabled, children, ...props }, ref) => {
    const baseStyles = 'inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-lg transition-colors focus:outline-2 focus:outline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed'
    const variantStyle = variantStyles[variant]
    
    return (
      <button
        ref={ref}
        disabled={disabled}
        className={`${baseStyles} ${variantStyle} ${className}`}
        {...props}
      >
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'
