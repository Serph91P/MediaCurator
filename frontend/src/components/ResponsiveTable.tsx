import { ReactNode } from 'react'

interface Column<T = any> {
  header: string
  accessor: string
  cell?: (row: T) => ReactNode
  className?: string
  mobileLabel?: string | boolean // Label text for mobile view, or true to use header
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
      <div className="text-center py-12">
        <p className="text-dark-400">{emptyMessage}</p>
      </div>
    )
  }

  return (
    <>
      {/* Desktop Table View */}
      <div className="hidden md:block overflow-x-auto">
        <table className={`w-full ${className}`}>
          <thead className="bg-dark-700/50">
            <tr>
              {columns.map((column, idx) => (
                <th
                  key={idx}
                  className="px-6 py-3 text-left text-xs font-medium text-dark-400 uppercase tracking-wider"
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-dark-700">
            {data.map((row) => (
              <tr key={keyExtractor(row)} className="hover:bg-dark-700/30 transition-colors">
                {columns.map((column, idx) => (
                  <td key={idx} className={`px-6 py-4 whitespace-nowrap ${column.className || ''}`}>
                    {column.cell ? column.cell(row) : row[column.accessor]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-4">
        {data.map((row) => (
          <div
            key={keyExtractor(row)}
            className="bg-dark-800 rounded-lg border border-dark-700 p-4 space-y-3"
          >
            {columns.map((column, idx) => {
              const displayValue = column.cell ? column.cell(row) : row[column.accessor]

              // Skip empty values on mobile
              if (!displayValue && displayValue !== 0) return null

              // Get label for mobile view
              const mobileLabel = typeof column.mobileLabel === 'string' 
                ? column.mobileLabel 
                : column.header

              return (
                <div key={idx} className="flex justify-between items-start gap-4">
                  <span className="text-sm font-medium text-dark-400 flex-shrink-0">
                    {mobileLabel}
                  </span>
                  <div className="text-sm text-dark-100 text-right">{displayValue}</div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </>
  )
}
