import { useQuery } from '@tanstack/react-query'
import { 
  FilmIcon, 
  TvIcon, 
  PlayIcon, 
  ExclamationTriangleIcon,
  TrashIcon,
  CircleStackIcon,
  ServerStackIcon
} from '@heroicons/react/24/outline'
import api from '../lib/api'
import { formatBytes } from '../lib/utils'
import type { SystemStats, MediaStats } from '../types'

function StatCard({ 
  title, 
  value, 
  subtitle, 
  icon: Icon, 
  color = 'primary' 
}: { 
  title: string
  value: string | number
  subtitle?: string
  icon: React.ComponentType<{ className?: string }>
  color?: 'primary' | 'green' | 'yellow' | 'red'
}) {
  const colorClasses = {
    primary: 'bg-primary-500/20 text-primary-400',
    green: 'bg-green-500/20 text-green-400',
    yellow: 'bg-yellow-500/20 text-yellow-400',
    red: 'bg-red-500/20 text-red-400',
  }

  return (
    <div className="bg-dark-800 rounded-xl border border-dark-700 shadow-lg">
      <div className="p-6 flex items-center gap-4">
        <div className={`p-3 rounded-lg ${colorClasses[color]}`}>
          <Icon className="w-6 h-6" />
        </div>
        <div>
          <p className="text-sm text-dark-400">{title}</p>
          <p className="text-2xl font-bold text-dark-100">{value}</p>
          {subtitle && <p className="text-xs text-dark-500">{subtitle}</p>}
        </div>
      </div>
    </div>
  )
}

function DiskUsageBar({ 
  path, 
  usedPercent, 
  used, 
  total 
}: { 
  path: string
  usedPercent: number
  used: number
  total: number
}) {
  const getColor = (percent: number) => {
    if (percent >= 90) return 'bg-red-500'
    if (percent >= 75) return 'bg-yellow-500'
    return 'bg-primary-500'
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span className="text-dark-300">{path}</span>
        <span className="text-dark-400">
          {formatBytes(used)} / {formatBytes(total)}
        </span>
      </div>
      <div className="h-2 bg-dark-700 rounded-full overflow-hidden">
        <div 
          className={`h-full ${getColor(usedPercent)} transition-all`}
          style={{ width: `${usedPercent}%` }}
        />
      </div>
      <p className="text-xs text-dark-500">{usedPercent.toFixed(1)}% used</p>
    </div>
  )
}

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['systemStats'],
    queryFn: async () => {
      const res = await api.get<SystemStats>('/system/stats')
      return res.data
    },
  })

  const { data: mediaStats, isLoading: mediaLoading } = useQuery({
    queryKey: ['mediaStats'],
    queryFn: async () => {
      const res = await api.get<MediaStats>('/media/stats')
      return res.data
    },
  })

  const isLoading = statsLoading || mediaLoading

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white">Dashboard</h1>
        <p className="text-dark-400 mt-1">Overview of your media library</p>
      </div>

      {/* Stats Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-dark-800 rounded-xl border border-dark-700 shadow-lg animate-pulse">
              <div className="p-6 h-24" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard
            title="Total Movies"
            value={mediaStats?.movies || 0}
            subtitle={formatBytes(stats?.space_freed_bytes || 0) + ' total'}
            icon={FilmIcon}
            color="primary"
          />
          <StatCard
            title="Total Series"
            value={mediaStats?.series || 0}
            subtitle={`${mediaStats?.episodes || 0} episodes`}
            icon={TvIcon}
            color="green"
          />
          <StatCard
            title="Flagged for Cleanup"
            value={mediaStats?.flagged_items || 0}
            subtitle={formatBytes(mediaStats?.flagged_size_bytes || 0)}
            icon={ExclamationTriangleIcon}
            color="yellow"
          />
          <StatCard
            title="Deleted (30 days)"
            value={stats?.deleted_last_30_days || 0}
            subtitle={formatBytes(stats?.space_freed_bytes || 0) + ' freed'}
            icon={TrashIcon}
            color="red"
          />
        </div>
      )}

      {/* Disk Usage */}
      <div className="bg-dark-800 rounded-xl border border-dark-700 shadow-lg">
        <div className="px-6 py-4 border-b border-dark-700">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <CircleStackIcon className="w-5 h-5" />
            Disk Usage
          </h2>
        </div>
        <div className="p-6 space-y-6">
          {stats?.disk_space && stats.disk_space.length > 0 ? (
            stats.disk_space.map((disk, i) => (
              <DiskUsageBar
                key={i}
                path={disk.path}
                usedPercent={disk.used_percent}
                used={disk.used_bytes}
                total={disk.total_bytes}
              />
            ))
          ) : (
            <p className="text-dark-400 text-center py-4">No disk information available</p>
          )}
        </div>
      </div>

      {/* Service Breakdown */}
      {mediaStats?.service_breakdown && mediaStats.service_breakdown.length > 0 && (
        <div className="bg-dark-800 rounded-xl border border-dark-700 shadow-lg">
          <div className="px-6 py-4 border-b border-dark-700">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <ServerStackIcon className="w-5 h-5" />
              Media by Service
            </h2>
            <p className="text-sm text-dark-400 mt-1">
              Compare media counts across different services
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-dark-700/50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-dark-300 uppercase tracking-wider">Service</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-dark-300 uppercase tracking-wider">Type</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-dark-300 uppercase tracking-wider">Movies</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-dark-300 uppercase tracking-wider">Series</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-dark-300 uppercase tracking-wider">Episodes</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-dark-300 uppercase tracking-wider">Total</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-dark-300 uppercase tracking-wider">Last Sync</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-700">
                {mediaStats.service_breakdown.map((service) => (
                  <tr key={service.service_id} className="hover:bg-dark-700/30">
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-white">{service.service_name}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-500/20 text-primary-400">
                        {service.service_type}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-dark-300">{service.movies.toLocaleString()}</td>
                    <td className="px-6 py-4 text-right text-sm text-dark-300">{service.series.toLocaleString()}</td>
                    <td className="px-6 py-4 text-right text-sm text-dark-300">{service.episodes.toLocaleString()}</td>
                    <td className="px-6 py-4 text-right text-sm font-medium text-white">{service.total_items.toLocaleString()}</td>
                    <td className="px-6 py-4 text-sm text-dark-400">
                      {service.last_sync 
                        ? new Date(service.last_sync).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })
                        : 'Never'
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="bg-dark-800 rounded-xl border border-dark-700 shadow-lg">
        <div className="px-6 py-4 border-b border-dark-700">
          <h2 className="text-lg font-semibold text-white">Quick Actions</h2>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              onClick={async () => {
                await api.post('/system/sync/run')
              }}
              className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium bg-dark-700 text-dark-100 rounded-lg hover:bg-dark-600 focus:outline-2 focus:outline-offset-2 focus:outline-dark-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors gap-2 py-4"
            >
              <PlayIcon className="w-5 h-5" />
              Sync All Services
            </button>
            <button
              onClick={async () => {
                await api.post('/system/cleanup/run', null, { params: { dry_run: true } })
              }}
              className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium bg-dark-700 text-dark-100 rounded-lg hover:bg-dark-600 focus:outline-2 focus:outline-offset-2 focus:outline-dark-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors gap-2 py-4"
            >
              <ExclamationTriangleIcon className="w-5 h-5" />
              Preview Cleanup
            </button>
            <button
              onClick={async () => {
                await api.post('/system/cleanup/run')
              }}
              className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 focus:outline-2 focus:outline-offset-2 focus:outline-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors gap-2 py-4"
            >
              <TrashIcon className="w-5 h-5" />
              Run Cleanup Now
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
