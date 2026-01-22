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
import { formatBytes, formatDateTime } from '../lib/utils'
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
    <div className="bg-white dark:bg-dark-800 rounded-lg sm:rounded-xl border border-gray-200 dark:border-dark-700 shadow-sm sm:shadow-lg">
      <div className="p-4 sm:p-6 flex items-center gap-3 sm:gap-4">
        <div className={`p-2.5 sm:p-3 rounded-lg ${colorClasses[color]}`}>
          <Icon className="w-5 h-5 sm:w-6 sm:h-6" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs sm:text-sm text-gray-500 dark:text-dark-400 truncate">{title}</p>
          <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-dark-100">{value}</p>
          {subtitle && <p className="text-xs text-gray-400 dark:text-dark-500 truncate">{subtitle}</p>}
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
      <div className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-0 text-xs sm:text-sm">
        <span className="text-gray-700 dark:text-dark-300 font-medium truncate">{path}</span>
        <span className="text-gray-500 dark:text-dark-400 text-xs sm:text-sm">
          {formatBytes(used)} / {formatBytes(total)}
        </span>
      </div>
      <div className="h-2.5 sm:h-2 bg-gray-200 dark:bg-dark-700 rounded-full overflow-hidden">
        <div 
          className={`h-full ${getColor(usedPercent)} transition-all`}
          style={{ width: `${usedPercent}%` }}
        />
      </div>
      <p className="text-xs text-gray-400 dark:text-dark-500">{usedPercent.toFixed(1)}% used</p>
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

  const { data: importStats } = useQuery({
    queryKey: ['importStats'],
    queryFn: async () => {
      const res = await api.get('/media/import-stats?days=7')
      return res.data
    },
  })

  const { data: watchStats } = useQuery({
    queryKey: ['watchStats'],
    queryFn: async () => {
      const res = await api.get('/media/watch-stats?limit=10')
      return res.data
    },
  })

  const { data: recentActivity } = useQuery({
    queryKey: ['recentActivity'],
    queryFn: async () => {
      const res = await api.get('/media/audit-log?limit=10&offset=0')
      return res.data
    },
    refetchInterval: 30000,
  })

  const isLoading = statsLoading || mediaLoading

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
        <p className="text-sm sm:text-base text-gray-500 dark:text-dark-400 mt-1">Overview of your media library</p>
      </div>

      {/* Stats Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white dark:bg-dark-800 rounded-lg sm:rounded-xl border border-gray-200 dark:border-dark-700 shadow-sm sm:shadow-lg animate-pulse">
              <div className="p-4 sm:p-6 h-20 sm:h-24" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
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
      <div className="bg-white dark:bg-dark-800 rounded-lg sm:rounded-xl border border-gray-200 dark:border-dark-700 shadow-sm sm:shadow-lg">
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 dark:border-dark-700">
          <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <CircleStackIcon className="w-4 h-4 sm:w-5 sm:h-5" />
            Disk Usage
          </h2>
        </div>
        <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
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
            <p className="text-gray-500 dark:text-dark-400 text-center py-4">No disk information available</p>
          )}
        </div>
      </div>

      {/* Service Breakdown */}
      {mediaStats?.service_breakdown && mediaStats.service_breakdown.length > 0 && (
        <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 shadow-lg">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-dark-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <ServerStackIcon className="w-5 h-5" />
              Media by Service
            </h2>
            <p className="text-sm text-gray-500 dark:text-dark-400 mt-1">
              Compare media counts across different services
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-100 dark:bg-dark-700/50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 dark:text-dark-300 uppercase tracking-wider">Service</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 dark:text-dark-300 uppercase tracking-wider">Type</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-600 dark:text-dark-300 uppercase tracking-wider">Movies</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-600 dark:text-dark-300 uppercase tracking-wider">Series</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-600 dark:text-dark-300 uppercase tracking-wider">Episodes</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-600 dark:text-dark-300 uppercase tracking-wider">Total</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 dark:text-dark-300 uppercase tracking-wider">Last Sync</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-dark-700">
                {mediaStats.service_breakdown.map((service) => (
                  <tr key={service.service_id} className="hover:bg-gray-50 dark:hover:bg-dark-700/50">
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">{service.service_name}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-500/20 text-primary-400">
                        {service.service_type}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-600 dark:text-dark-300">{service.movies.toLocaleString()}</td>
                    <td className="px-6 py-4 text-right text-sm text-gray-600 dark:text-dark-300">{service.series.toLocaleString()}</td>
                    <td className="px-6 py-4 text-right text-sm text-gray-600 dark:text-dark-300">{service.episodes.toLocaleString()}</td>
                    <td className="px-6 py-4 text-right text-sm font-medium text-gray-900 dark:text-white">{service.total_items.toLocaleString()}</td>
                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-dark-400">
                      {service.last_sync 
                        ? formatDateTime(service.last_sync)
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

      {/* Import Statistics (Last 7 Days) */}
      {importStats && importStats.by_service && importStats.by_service.length > 0 && (
        <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 shadow-lg">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-dark-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <PlayIcon className="w-5 h-5" />
              Import Activity (Last 7 Days)
            </h2>
            <p className="text-sm text-gray-500 dark:text-dark-400 mt-1">
              {importStats.total_syncs} syncs • {importStats.total_added} items added • {importStats.total_updated} updated
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-100 dark:bg-dark-700/50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 dark:text-dark-300 uppercase tracking-wider">Service</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-600 dark:text-dark-300 uppercase tracking-wider">Syncs</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-600 dark:text-dark-300 uppercase tracking-wider">Added</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-600 dark:text-dark-300 uppercase tracking-wider">Updated</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-600 dark:text-dark-300 uppercase tracking-wider">Movies</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-600 dark:text-dark-300 uppercase tracking-wider">Series</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-600 dark:text-dark-300 uppercase tracking-wider">Episodes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-dark-700">
                {importStats.by_service.map((service: any) => (
                  <tr key={service.service_id} className="hover:bg-gray-50 dark:hover:bg-dark-700/50">
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">{service.service_name}</div>
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary-500/20 text-primary-400 mt-1">
                        {service.service_type}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-600 dark:text-dark-300">{service.sync_count}</td>
                    <td className="px-6 py-4 text-right text-sm font-medium text-green-400">+{service.total_added}</td>
                    <td className="px-6 py-4 text-right text-sm text-gray-500 dark:text-dark-400">{service.total_updated}</td>
                    <td className="px-6 py-4 text-right text-sm text-gray-600 dark:text-dark-300">{service.movies_added}</td>
                    <td className="px-6 py-4 text-right text-sm text-gray-600 dark:text-dark-300">{service.series_added}</td>
                    <td className="px-6 py-4 text-right text-sm text-gray-600 dark:text-dark-300">{service.episodes_added}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Watch Statistics */}
      {watchStats && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Most Watched */}
          <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 shadow-lg">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-dark-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <TvIcon className="w-5 h-5" />
                Most Watched
              </h2>
              <p className="text-sm text-gray-500 dark:text-dark-400 mt-1">
                Total: {watchStats.summary?.total_watches?.toLocaleString()} plays • {watchStats.summary?.watched_items} items watched
              </p>
            </div>
            <div className="p-6">
              {watchStats.most_watched && watchStats.most_watched.length > 0 ? (
                <div className="space-y-3">
                  {watchStats.most_watched.slice(0, 5).map((item: any) => (
                    <div key={item.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-dark-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-700 transition-colors">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-gray-900 dark:text-white truncate">{item.title}</h3>
                          {item.is_favorited && (
                            <span className="text-yellow-400 text-xs">★</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary-500/20 text-primary-400">
                            {item.media_type}
                          </span>
                          {item.rating && (
                            <span className="text-xs text-gray-500 dark:text-dark-400">⭐ {item.rating.toFixed(1)}</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right ml-4">
                        <div className="text-lg font-bold text-primary-400">{item.watch_count}</div>
                        <div className="text-xs text-gray-400 dark:text-dark-500">plays</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-gray-500 dark:text-dark-400 py-4">No watch data available</p>
              )}
            </div>
          </div>

          {/* Recently Watched */}
          <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 shadow-lg">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-dark-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <PlayIcon className="w-5 h-5" />
                Recently Watched
              </h2>
              <p className="text-sm text-gray-500 dark:text-dark-400 mt-1">
                Movies: {watchStats.summary?.movies_watches?.toLocaleString()} plays • Episodes: {watchStats.summary?.episodes_watches?.toLocaleString()} plays
              </p>
            </div>
            <div className="p-6">
              {watchStats.recently_watched && watchStats.recently_watched.length > 0 ? (
                <div className="space-y-3">
                  {watchStats.recently_watched.slice(0, 5).map((item: any) => (
                    <div key={item.id} className="flex items-start justify-between p-3 bg-gray-50 dark:bg-dark-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-700 transition-colors">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-gray-900 dark:text-white truncate">{item.title}</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary-500/20 text-primary-400">
                            {item.media_type}
                          </span>
                          {item.genres && item.genres.length > 0 && (
                            <span className="text-xs text-gray-500 dark:text-dark-400">{item.genres[0]}</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right ml-4">
                        <div className="text-xs text-gray-500 dark:text-dark-400">
                          {item.last_watched_at
                            ? new Date(item.last_watched_at).toLocaleDateString('de-DE', { month: 'short', day: 'numeric' })
                            : '-'
                          }
                        </div>
                        <div className="text-xs text-gray-400 dark:text-dark-500">{item.watch_count}× watched</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-gray-500 dark:text-dark-400 py-4">No recent watches</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Recent Cleanup Activity */}
      {recentActivity && recentActivity.logs && recentActivity.logs.length > 0 && (
        <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 shadow-lg">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-dark-700 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Recent Cleanup Activity</h2>
            <a href="/history" className="text-sm text-primary-400 hover:text-primary-300">View All →</a>
          </div>
          <div className="p-6">
            <div className="space-y-3">
              {recentActivity.logs.slice(0, 8).map((log: any) => (
                <div key={log.id} className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-dark-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-700 transition-colors">
                  <div className={`mt-0.5 font-bold ${
                    log.status === 'success' ? 'text-green-400' :
                    log.status === 'failed' ? 'text-red-400' :
                    'text-yellow-400'
                  }`}>
                    {log.status === 'success' ? '✓' : log.status === 'failed' ? '✗' : '○'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        log.action === 'delete' ? 'bg-red-500/20 text-red-400' :
                        log.action === 'unmonitor' ? 'bg-yellow-500/20 text-yellow-400' :
                        log.action === 'notify_only' ? 'bg-primary-500/20 text-primary-400' :
                        'bg-gray-200 dark:bg-dark-600/50 text-gray-600 dark:text-dark-300'
                      }`}>
                        {log.action}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-dark-400">
                        {formatDateTime(log.created_at)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-900 dark:text-white mt-1">{log.media_title || 'Unknown item'}</p>
                    {log.media_size_bytes > 0 && (
                      <p className="text-xs text-gray-400 dark:text-dark-500 mt-0.5">{formatBytes(log.media_size_bytes)} freed</p>
                    )}
                    {log.error_message && (
                      <p className="text-xs text-red-400 mt-1">{log.error_message}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 shadow-lg">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-dark-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Quick Actions</h2>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              onClick={async () => {
                await api.post('/system/sync/run')
              }}
              className="inline-flex items-center justify-center gap-2 px-4 py-4 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-dark-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <PlayIcon className="w-5 h-5" />
              Sync All Services
            </button>
            <button
              onClick={async () => {
                await api.post('/system/cleanup/run', null, { params: { dry_run: true } })
              }}
              className="inline-flex items-center justify-center gap-2 px-4 py-4 text-sm font-medium text-white bg-yellow-600 rounded-lg hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2 focus:ring-offset-dark-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ExclamationTriangleIcon className="w-5 h-5" />
              Preview Cleanup
            </button>
            <button
              onClick={async () => {
                await api.post('/system/cleanup/run')
              }}
              className="inline-flex items-center justify-center gap-2 px-4 py-4 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-dark-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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



