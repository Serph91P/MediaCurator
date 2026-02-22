import { ReactNode } from 'react'

interface Column<T = any> {
  header: string
  accessor: string
  cell?: (row: T) => ReactNode
  className?: string
  mobileLabel?: string | boolean // Label text for mobile view, or true to use header
  mobileHide?: boolean // Hide this column on mobile
}

interface ResponsiveTableProps<T = any> {
  columns: Column<T>[]
  data: T[]
  keyExtractor: (row: T) => string | number
  emptyMessage?: string
  className?: string
}

export default function ResponsiveTable({
  columns,
  data,
  keyExtractor,
  emptyMessage = 'No data available',
  className = '',
}: ResponsiveTableProps) {
  if (data.length === 0) {
    return (
      <div className="text-center py-8 sm:py-12">
        <p className="text-sm sm:text-base text-gray-500 dark:text-dark-400">{emptyMessage}</p>
      </div>
    )
  }

  return (
    <>
      {/* Desktop Table View */}
      <div className="hidden md:block overflow-x-auto">
        <table className={`w-full ${className}`}>
          <thead className="bg-gray-50 dark:bg-dark-700/50">
            <tr>
              {columns.map((column, idx) => (
                <th
                  key={idx}
                  className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-400 uppercase tracking-wider"
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-dark-700">
            {data.map((row) => (
              <tr key={keyExtractor(row)} className="hover:bg-gray-50 dark:hover:bg-dark-700/30 transition-colors">
                {columns.map((column, idx) => (
                  <td key={idx} className={`px-4 lg:px-6 py-3 lg:py-4 ${column.className || ''}`}>
                    {column.cell ? column.cell(row) : row[column.accessor]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-3">
        {data.map((row) => (
          <div
            key={keyExtractor(row)}
            className="bg-white dark:bg-dark-800 rounded-lg border border-gray-200 dark:border-dark-700 p-3.5 sm:p-4 space-y-2.5 sm:space-y-3 active:bg-gray-50 dark:active:bg-dark-700/50 transition-colors"
          >
            {columns.map((column, idx) => {
              // Skip columns marked as mobileHide
              if (column.mobileHide) return null

              const displayValue = column.cell ? column.cell(row) : row[column.accessor]

              // Skip empty values on mobile
              if (!displayValue && displayValue !== 0) return null

              // Get label for mobile view
              const mobileLabel = typeof column.mobileLabel === 'string' 
                ? column.mobileLabel 
                : column.header

              return (
                <div key={idx} className="flex justify-between items-start gap-3 sm:gap-4 min-h-[32px]">
                  <span className="text-xs sm:text-sm font-medium text-gray-500 dark:text-dark-400 flex-shrink-0 pt-0.5">
                    {mobileLabel}
                  </span>
                  <div className="text-xs sm:text-sm text-gray-900 dark:text-dark-100 text-right break-words max-w-[60%]">{displayValue}</div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </>
  )
}
