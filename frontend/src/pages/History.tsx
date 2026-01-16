import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ClockIcon, TrashIcon, ExclamationTriangleIcon, CheckCircleIcon } from '@heroicons/react/24/outline'
import api from '../lib/api'
import { formatBytes, formatRelativeTime } from '../lib/utils'
import type { CleanupLog } from '../types'

export default function History() {
  const [filter, setFilter] = useState<'all' | 'success' | 'error'>('all')

  const { data: logs, isLoading } = useQuery({
    queryKey: ['cleanupLogs', filter],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filter !== 'all') {
        params.append('status', filter)
      }
      params.append('skip', '0')
      params.append('limit', '100')
      const res = await api.get<CleanupLog[]>(`/system/logs?${params}`)
      return res.data
    },
  })

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircleIcon className="w-5 h-5 text-green-400" />
      case 'error':
        return <ExclamationTriangleIcon className="w-5 h-5 text-red-400" />
      default:
        return <ClockIcon className="w-5 h-5 text-yellow-400" />
    }
  }

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'delete':
        return <span className="badge badge-danger">Deleted</span>
      case 'unmonitor':
        return <span className="badge badge-warning">Unmonitored</span>
      case 'notify':
        return <span className="badge badge-info">Notified</span>
      default:
        return <span className="badge bg-dark-600 text-dark-300">{action}</span>
    }
  }

  // Calculate totals
  const totalDeleted = logs?.filter(l => l.action === 'delete' && l.status === 'success').length || 0
  const totalErrors = logs?.filter(l => l.status === 'error').length || 0
  const totalSpaceFreed = logs?.reduce((acc, l) => {
    if (l.action === 'delete' && l.status === 'success') {
      return acc + (l.media_size_bytes || 0)
    }
    return acc
  }, 0) || 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Cleanup History</h1>
        <p className="text-dark-400 mt-1">View past cleanup operations and their results</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card">
          <div className="card-body">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-600/20 flex items-center justify-center">
                <CheckCircleIcon className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{totalDeleted}</p>
                <p className="text-sm text-dark-400">Items Deleted</p>
              </div>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-body">
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
        <div className="card">
          <div className="card-body">
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
          onClick={() => setFilter('all')}
          className={`btn-secondary ${filter === 'all' ? 'bg-primary-600 text-white' : ''}`}
        >
          All
        </button>
        <button
          onClick={() => setFilter('success')}
          className={`btn-secondary ${filter === 'success' ? 'bg-green-600 text-white' : ''}`}
        >
          Success
        </button>
        <button
          onClick={() => setFilter('error')}
          className={`btn-secondary ${filter === 'error' ? 'bg-red-600 text-white' : ''}`}
        >
          Errors
        </button>
      </div>

      {/* Logs Table */}
      {isLoading ? (
        <div className="card animate-pulse">
          <div className="card-body h-96" />
        </div>
      ) : logs && logs.length > 0 ? (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-dark-800/50">
                <tr>
                  <th className="text-left px-6 py-3 text-xs font-medium text-dark-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-dark-400 uppercase tracking-wider">
                    Time
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-dark-400 uppercase tracking-wider">
                    Action
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-dark-400 uppercase tracking-wider">
                    Media
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-dark-400 uppercase tracking-wider">
                    Size
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-dark-400 uppercase tracking-wider">
                    Details
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-700">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-dark-800/30">
                    <td className="px-6 py-4">
                      {getStatusIcon(log.status)}
                    </td>
                    <td className="px-6 py-4 text-dark-300 text-sm">
                      {formatRelativeTime(log.created_at)}
                    </td>
                    <td className="px-6 py-4">
                      {getActionBadge(log.action)}
                    </td>
                    <td className="px-6 py-4">
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
                    </td>
                    <td className="px-6 py-4 text-dark-300">
                      {log.media_size_bytes ? formatBytes(log.media_size_bytes) : '-'}
                    </td>
                    <td className="px-6 py-4">
                      {log.error_message ? (
                        <span className="text-sm text-red-400">{log.error_message}</span>
                      ) : log.details && Object.keys(log.details).length > 0 ? (
                        <span className="text-sm text-dark-400">
                          {JSON.stringify(log.details).substring(0, 50)}...
                        </span>
                      ) : (
                        <span className="text-dark-500">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="card-body text-center py-12">
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
