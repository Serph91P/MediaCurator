import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ClockIcon, TrashIcon, ExclamationTriangleIcon, CheckCircleIcon } from '@heroicons/react/24/outline'
import api from '../lib/api'
import { formatBytes, formatRelativeTime } from '../lib/utils'
import { useDebounce } from '../hooks/useDebounce'
import { TableSkeleton } from '../components/Skeleton'
import ResponsiveTable from '../components/ResponsiveTable'
import type { CleanupLog } from '../types'

interface AuditLogResponse {
  logs: CleanupLog[]
  pagination: {
    total: number
    limit: number
    offset: number
    has_more: boolean
  }
  summary: {
    total_actions: number
    unique_actions: number
    total_size_freed_bytes: number
  }
  action_breakdown: Array<{
    action: string
    status: string
    count: number
  }>
}

export default function History() {
  const [filter, setFilter] = useState<'all' | 'success' | 'failed'>('all')
  const [offset, setOffset] = useState(0)
  const limit = 50

  const { data, isLoading } = useQuery({
    queryKey: ['auditLog', filter, offset],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filter !== 'all') {
        params.append('status', filter)
      }
      params.append('limit', limit.toString())
      params.append('offset', offset.toString())
      const res = await api.get<AuditLogResponse>(`/media/audit-log?${params}`)
      return res.data
    },
  })

  const logs = data?.logs || []
  const summary = data?.summary
  const pagination = data?.pagination

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircleIcon className="w-5 h-5 text-green-400" />
      case 'failed':
        return <ExclamationTriangleIcon className="w-5 h-5 text-red-400" />
      case 'skipped':
        return <ClockIcon className="w-5 h-5 text-yellow-400" />
      default:
        return <ClockIcon className="w-5 h-5 text-dark-400" />
    }
  }

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'delete':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-500/20 text-red-400">Deleted</span>
      case 'unmonitor':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-500/20 text-yellow-400">Unmonitored</span>
      case 'notify_only':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-500/20 text-primary-400">Notified</span>
      case 'move_to_trash':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-500/20 text-orange-400">Moved to Trash</span>
      default:
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-dark-600/50 text-dark-300">{action}</span>
    }
  }

  // Stats from API summary
  const totalDeleted = summary?.total_actions || 0
  const totalErrors = data?.action_breakdown?.filter(b => b.status === 'failed').reduce((sum, b) => sum + b.count, 0) || 0
  const totalSpaceFreed = summary?.total_size_freed_bytes || 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Cleanup History</h1>
        <p className="text-dark-400 mt-1">View past cleanup operations and their results</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-dark-800 rounded-xl border border-dark-700 shadow-lg">
          <div className="p-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-600/20 flex items-center justify-center">
                <CheckCircleIcon className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{totalDeleted}</p>
                <p className="text-sm text-dark-400">Total Actions</p>
              </div>
            </div>
          </div>
        </div>
        <div className="bg-dark-800 rounded-xl border border-dark-700 shadow-lg">
          <div className="p-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary-600/20 flex items-center justify-center">
                <TrashIcon className="w-5 h-5 text-primary-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{formatBytes(totalSpaceFreed)}</p>
                <p className="text-sm text-dark-400">Space Freed</p>
              </div>
            </div>
          </div>
        </div>
        <div className="bg-dark-800 rounded-xl border border-dark-700 shadow-lg">
          <div className="p-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-red-600/20 flex items-center justify-center">
                <ExclamationTriangleIcon className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{totalErrors}</p>
                <p className="text-sm text-dark-400">Errors</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        <button
          onClick={() => { setFilter('all'); setOffset(0); }}
          className={`inline-flex items-center justify-center px-4 py-2 text-sm font-medium bg-dark-700 text-dark-100 rounded-lg hover:bg-dark-600 focus:outline-2 focus:outline-offset-2 focus:outline-dark-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${filter === 'all' ? 'bg-primary-600 text-white' : ''}`}
        >
          All
        </button>
        <button
          onClick={() => { setFilter('success'); setOffset(0); }}
          className={`inline-flex items-center justify-center px-4 py-2 text-sm font-medium bg-dark-700 text-dark-100 rounded-lg hover:bg-dark-600 focus:outline-2 focus:outline-offset-2 focus:outline-dark-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${filter === 'success' ? 'bg-green-600 text-white' : ''}`}
        >
          Success
        </button>
        <button
          onClick={() => { setFilter('failed'); setOffset(0); }}
          className={`inline-flex items-center justify-center px-4 py-2 text-sm font-medium bg-dark-700 text-dark-100 rounded-lg hover:bg-dark-600 focus:outline-2 focus:outline-offset-2 focus:outline-dark-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${filter === 'failed' ? 'bg-red-600 text-white' : ''}`}
        >
          Errors
        </button>
      </div>

      {/* Logs Table */}
      {isLoading ? (
        <div className="bg-dark-800 rounded-xl border border-dark-700 shadow-lg p-6">
          <TableSkeleton rows={10} columns={6} />
        </div>
      ) : logs && logs.length > 0 ? (
        <div className="bg-dark-800 rounded-xl border border-dark-700 shadow-lg overflow-hidden">
          <ResponsiveTable
            columns={[
              {
                header: 'Status',
                accessor: 'status',
                cell: (log) => getStatusIcon(log.status),
                className: 'w-16',
              },
              {
                header: 'Time',
                accessor: 'created_at',
                cell: (log) => formatRelativeTime(log.created_at),
                mobileLabel: 'Time',
              },
              {
                header: 'Action',
                accessor: 'action',
                cell: (log) => getActionBadge(log.action),
                mobileLabel: 'Action',
              },
              {
                header: 'Media',
                accessor: 'media_title',
                cell: (log) => (
                  <div>
                    <p className="font-medium text-white">
                      {log.media_title || 'Unknown'}
                    </p>
                    {log.media_path && (
                      <p className="text-xs text-dark-500 truncate max-w-xs">
                        {log.media_path}
                      </p>
                    )}
                  </div>
                ),
                mobileLabel: 'Media',
              },
              {
                header: 'Size',
                accessor: 'media_size_bytes',
                cell: (log) => log.media_size_bytes ? formatBytes(log.media_size_bytes) : '-',
                mobileLabel: 'Size',
              },
              {
                header: 'Details',
                accessor: 'details',
                cell: (log) => 
                  log.error_message ? (
                    <span className="text-sm text-red-400">{log.error_message}</span>
                  ) : log.details && Object.keys(log.details).length > 0 ? (
                    <span className="text-sm text-dark-400">
                      {JSON.stringify(log.details).substring(0, 50)}...
                    </span>
                  ) : (
                    <span className="text-dark-500">-</span>
                  ),
                mobileLabel: 'Details',
              },
            ]}
            data={logs}
            keyExtractor={(log) => log.id.toString()}
            emptyMessage="No logs found"
          />
          
          {/* Pagination */}
          {pagination && pagination.total > limit && (
            <div className="px-6 py-4 border-t border-dark-700 flex items-center justify-between">
              <div className="text-sm text-dark-400">
                Showing {offset + 1} to {Math.min(offset + limit, pagination.total)} of {pagination.total} entries
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setOffset(Math.max(0, offset - limit))}
                  disabled={offset === 0}
                  className="inline-flex items-center justify-center px-3 py-1.5 text-sm font-medium bg-dark-700 text-dark-100 rounded-lg hover:bg-dark-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Previous
                </button>
                <button
                  onClick={() => setOffset(offset + limit)}
                  disabled={!pagination.has_more}
                  className="inline-flex items-center justify-center px-3 py-1.5 text-sm font-medium bg-dark-700 text-dark-100 rounded-lg hover:bg-dark-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-dark-800 rounded-xl border border-dark-700 shadow-lg">
          <div className="p-6 text-center py-12">
            <ClockIcon className="w-12 h-12 mx-auto text-dark-500" />
            <p className="text-dark-400 mt-4">No cleanup history yet</p>
            <p className="text-sm text-dark-500 mt-1">
              Cleanup operations will appear here once they run
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
