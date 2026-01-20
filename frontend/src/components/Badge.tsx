import { HTMLAttributes, forwardRef } from 'react'

type BadgeVariant = 'info' | 'success' | 'warning' | 'danger'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
}

const variantStyles: Record<BadgeVariant, string> = {
  info: 'bg-primary-500/20 text-primary-400',
  success: 'bg-green-500/20 text-green-400',
  warning: 'bg-yellow-500/20 text-yellow-400',
  danger: 'bg-red-500/20 text-red-400',
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ variant = 'info', className = '', children, ...props }, ref) => {
    const baseStyles = 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium'
    const variantStyle = variantStyles[variant]
    
    return (
      <span
        ref={ref}
        className={`${baseStyles} ${variantStyle} ${className}`}
        {...props}
      >
        {children}
      </span>
    )
  }
)

Badge.displayName = 'Badge'
