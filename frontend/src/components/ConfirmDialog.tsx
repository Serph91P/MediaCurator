import { ExclamationTriangleIcon } from '@heroicons/react/24/outline'

interface ConfirmDialogProps {
  isOpen: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
  variant?: 'danger' | 'warning' | 'info'
}

export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  variant = 'danger',
}: ConfirmDialogProps) {
  if (!isOpen) return null

  const variantStyles = {
    danger: 'bg-red-600 hover:bg-red-700 focus:outline-red-500',
    warning: 'bg-yellow-600 hover:bg-yellow-700 focus:outline-yellow-500',
    info: 'bg-primary-600 hover:bg-primary-700 focus:outline-primary-500',
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 shadow-2xl w-full max-w-md mx-4">
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center ${
              variant === 'danger' ? 'bg-red-500/20' : 
              variant === 'warning' ? 'bg-yellow-500/20' : 
              'bg-primary-500/20'
            }`}>
              <ExclamationTriangleIcon className={`w-6 h-6 ${
                variant === 'danger' ? 'text-red-400' : 
                variant === 'warning' ? 'text-yellow-400' : 
                'text-primary-400'
              }`} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{title}</h3>
              <p className="text-sm text-gray-600 dark:text-dark-300">{message}</p>
            </div>
          </div>
        </div>
        <div className="px-6 py-4 bg-gray-50 dark:bg-dark-700/50 border-t border-gray-200 dark:border-dark-700 flex justify-end gap-3 rounded-b-xl">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium bg-gray-200 dark:bg-dark-700 text-gray-800 dark:text-dark-100 rounded-lg hover:bg-gray-300 dark:hover:bg-dark-600 focus:outline-2 focus:outline-offset-2 focus:outline-dark-500 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white rounded-lg focus:outline-2 focus:outline-offset-2 transition-colors ${variantStyles[variant]}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
