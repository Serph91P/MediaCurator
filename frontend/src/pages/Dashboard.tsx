import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { 
  FilmIcon, 
  TvIcon, 
  PlayIcon, 
  ExclamationTriangleIcon,
  TrashIcon,
  CircleStackIcon,
  ServerStackIcon,
  UserGroupIcon,
  HeartIcon,
  ClockIcon,
  ChartBarIcon,
  StarIcon
} from '@heroicons/react/24/outline'
import api from '../lib/api'
import { formatBytes, formatDateTime } from '../lib/utils'
import type { SystemStats, MediaStats } from '../types'
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'

interface ActivityStats {
  period_days: number
  total_plays: number
  total_watch_seconds: number
  unique_users: number
  active_sessions: number
  plays_by_day: { date: string; plays: number; duration_seconds: number }[]
  plays_by_hour: { hour: number; plays: number }[]
  plays_by_day_of_week: { day_of_week: number; plays: number }[]
}

interface GenreStatsResponse {
  period_days: number
  total_genres: number
  genres: { genre: string; plays: number; duration_seconds: number }[]
}

// Stat Card Component
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
  color?: 'primary' | 'green' | 'yellow' | 'red' | 'purple' | 'cyan'
}) {
  const colorClasses = {
    primary: 'bg-primary-500/20 text-primary-400',
    green: 'bg-green-500/20 text-green-400',
    yellow: 'bg-yellow-500/20 text-yellow-400',
    red: 'bg-red-500/20 text-red-400',
    purple: 'bg-purple-500/20 text-purple-400',
    cyan: 'bg-cyan-500/20 text-cyan-400',
  }

  return (
    <div className="bg-white dark:bg-dark-800 rounded-lg sm:rounded-xl border border-gray-200 dark:border-dark-700 shadow-sm sm:shadow-lg">
      <div className="p-4 sm:p-5 flex items-center gap-3 sm:gap-4">
        <div className={`p-2.5 sm:p-3 rounded-lg ${colorClasses[color]}`}>
          <Icon className="w-5 h-5 sm:w-6 sm:h-6" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs sm:text-sm text-gray-500 dark:text-dark-400 truncate">{title}</p>
          <p className="text-lg sm:text-xl font-bold text-gray-900 dark:text-dark-100">{value}</p>
          {subtitle && <p className="text-xs text-gray-400 dark:text-dark-500 truncate">{subtitle}</p>}
        </div>
      </div>
    </div>
  )
}

// Disk Usage Bar Component
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

// Top List Item Component
function TopListItem({ 
  rank, 
  title, 
  value, 
  valueLabel = 'Plays',
  isFavorite = false 
}: { 
  rank: number
  title: string
  value: number
  valueLabel?: string
  isFavorite?: boolean
}) {
  return (
    <div className="flex items-center gap-3 py-2 px-3 hover:bg-gray-50 dark:hover:bg-dark-700/50 rounded-lg transition-colors">
      <span className="text-lg font-bold text-gray-400 dark:text-dark-500 w-6 text-center">{rank}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-900 dark:text-white truncate">{title}</span>
          {isFavorite && <HeartIcon className="w-4 h-4 text-red-400 shrink-0" />}
        </div>
      </div>
      <div className="text-right shrink-0">
        <span className="text-sm font-bold text-primary-400">{value}</span>
        <span className="text-xs text-gray-400 dark:text-dark-500 ml-1">{valueLabel}</span>
      </div>
    </div>
  )
}

// Stats Panel Component (for Watch Statistics)
function StatsPanel({ 
  title, 
  icon: Icon, 
  iconColor,
  items,
  valueLabel = 'Plays',
  emptyMessage = 'No data'
}: { 
  title: string
  icon: React.ComponentType<{ className?: string }>
  iconColor: string
  items: Array<{ id: number; title: string; watch_count?: number; user_count?: number; is_favorited?: boolean }>
  valueLabel?: string
  emptyMessage?: string
}) {
  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon className={`w-5 h-5 ${iconColor}`} />
        <h3 className="font-semibold text-gray-900 dark:text-white text-sm uppercase tracking-wider">{title}</h3>
      </div>
      {items?.length > 0 ? (
        <div className="space-y-1">
          {items.map((item, idx) => (
            <TopListItem
              key={item.id}
              rank={idx + 1}
              title={item.title}
              value={item.watch_count ?? item.user_count ?? 0}
              valueLabel={valueLabel}
              isFavorite={item.is_favorited}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-500 dark:text-dark-400 text-center py-4">{emptyMessage}</p>
      )}
    </div>
  )
}

export default function Dashboard() {
  const [statsDays, setStatsDays] = useState(30)

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

  // Dashboard stats with user tracking
  const { data: dashboardStats } = useQuery({
    queryKey: ['dashboardStats', statsDays],
    queryFn: async () => {
      const res = await api.get(`/media/dashboard-stats?days=${statsDays}&limit=5`)
      return res.data
    },
  })

  const { data: recentActivity } = useQuery({
    queryKey: ['recentActivity'],
    queryFn: async () => {
      const res = await api.get('/media/audit-log?limit=8&offset=0')
      return res.data
    },
    refetchInterval: 30000,
  })

  // Fetch activity stats for dashboard charts
  const { data: activityStats } = useQuery({
    queryKey: ['dashboardActivityStats', statsDays],
    queryFn: async () => {
      const res = await api.get<ActivityStats>(`/activity/stats?days=${statsDays}`)
      return res.data
    }
  })

  // Fetch genre stats for dashboard
  const { data: genreStats } = useQuery({
    queryKey: ['dashboardGenreStats', statsDays],
    queryFn: async () => {
      const res = await api.get<GenreStatsResponse>(`/activity/genre-stats?days=${statsDays}`)
      return res.data
    }
  })

  const isLoading = statsLoading || mediaLoading

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
        <p className="text-sm sm:text-base text-gray-500 dark:text-dark-400 mt-1">Overview of your media library</p>
      </div>

      {/* Main Stats Grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 sm:gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white dark:bg-dark-800 rounded-lg sm:rounded-xl border border-gray-200 dark:border-dark-700 shadow-sm sm:shadow-lg animate-pulse">
              <div className="p-4 sm:p-5 h-20" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 sm:gap-4">
          <StatCard
            title="Movies"
            value={(dashboardStats?.global_stats?.total_movies || mediaStats?.movies || 0).toLocaleString()}
            subtitle={`${(dashboardStats?.global_stats?.movie_plays || 0).toLocaleString()} plays`}
            icon={FilmIcon}
            color="primary"
          />
          <StatCard
            title="Series"
            value={(dashboardStats?.global_stats?.total_series || mediaStats?.series || 0).toLocaleString()}
            subtitle={`${(dashboardStats?.global_stats?.total_episodes || mediaStats?.episodes || 0).toLocaleString()} eps`}
            icon={TvIcon}
            color="green"
          />
          <StatCard
            title="Total Plays"
            value={(dashboardStats?.global_stats?.total_plays || 0).toLocaleString()}
            subtitle={`${(dashboardStats?.global_stats?.total_watched || 0).toLocaleString()} watched`}
            icon={PlayIcon}
            color="purple"
          />
          <StatCard
            title="Users"
            value={(dashboardStats?.global_stats?.total_users || 0).toLocaleString()}
            subtitle="active users"
            icon={UserGroupIcon}
            color="cyan"
          />
          <StatCard
            title="Flagged"
            value={mediaStats?.flagged_items || 0}
            subtitle={formatBytes(mediaStats?.flagged_size_bytes || 0)}
            icon={ExclamationTriangleIcon}
            color="yellow"
          />
          <StatCard
            title="Deleted"
            value={stats?.deleted_last_30_days || 0}
            subtitle={formatBytes(stats?.space_freed_bytes || 0)}
            icon={TrashIcon}
            color="red"
          />
        </div>
      )}

      {/* Watch Statistics Section */}
      <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 shadow-lg">
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 dark:border-dark-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <ChartBarIcon className="w-5 h-5" />
            Watch Statistics
          </h2>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500 dark:text-dark-400">Last</span>
            <select 
              value={statsDays}
              onChange={(e) => setStatsDays(Number(e.target.value))}
              className="rounded-lg border border-gray-300 dark:border-dark-600 bg-white dark:bg-dark-700 text-gray-900 dark:text-white text-sm px-3 py-1.5 focus:ring-2 focus:ring-primary-500"
            >
              <option value={7}>7</option>
              <option value={14}>14</option>
              <option value={30}>30</option>
              <option value={90}>90</option>
              <option value={365}>365</option>
            </select>
            <span className="text-sm text-gray-500 dark:text-dark-400">Days</span>
          </div>
        </div>
        
        {/* Movies Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-0 divide-y md:divide-y-0 md:divide-x divide-gray-200 dark:divide-dark-700 border-b border-gray-200 dark:border-dark-700">
          <StatsPanel
            title="Most Viewed Movies"
            icon={FilmIcon}
            iconColor="text-primary-400"
            items={dashboardStats?.most_viewed_movies || []}
            valueLabel="Plays"
            emptyMessage="No movie plays yet"
          />
          <StatsPanel
            title="Most Popular Movies"
            icon={StarIcon}
            iconColor="text-yellow-400"
            items={dashboardStats?.most_popular_movies || []}
            valueLabel="Users"
            emptyMessage="No user data yet"
          />
        </div>
        
        {/* Series Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-0 divide-y md:divide-y-0 md:divide-x divide-gray-200 dark:divide-dark-700 border-b border-gray-200 dark:border-dark-700">
          <StatsPanel
            title="Most Viewed Series"
            icon={TvIcon}
            iconColor="text-green-400"
            items={dashboardStats?.most_viewed_series || []}
            valueLabel="Plays"
            emptyMessage="No series plays yet"
          />
          <StatsPanel
            title="Most Popular Series"
            icon={StarIcon}
            iconColor="text-yellow-400"
            items={dashboardStats?.most_popular_series || []}
            valueLabel="Users"
            emptyMessage="No user data yet"
          />
        </div>
        
        {/* Users & Recent Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-0 divide-y md:divide-y-0 md:divide-x divide-gray-200 dark:divide-dark-700">
          {/* Most Active Users */}
          <div className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <UserGroupIcon className="w-5 h-5 text-cyan-400" />
              <h3 className="font-semibold text-gray-900 dark:text-white text-sm uppercase tracking-wider">Most Active Users</h3>
            </div>
            {dashboardStats?.most_active_users?.length > 0 ? (
              <div className="space-y-1">
                {dashboardStats.most_active_users.map((user: any, idx: number) => (
                  <div key={user.id} className="flex items-center gap-3 py-2 px-3 hover:bg-gray-50 dark:hover:bg-dark-700/50 rounded-lg transition-colors">
                    <span className="text-lg font-bold text-gray-400 dark:text-dark-500 w-6 text-center">{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-gray-900 dark:text-white truncate block">{user.name}</span>
                      {user.is_admin && (
                        <span className="text-xs text-primary-400">Admin</span>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-sm font-bold text-cyan-400">{user.total_plays}</span>
                      <span className="text-xs text-gray-400 dark:text-dark-500 ml-1">Plays</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-dark-400 text-center py-4">No user activity yet</p>
            )}
          </div>
          
          {/* Recently Added */}
          <div className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <ClockIcon className="w-5 h-5 text-purple-400" />
              <h3 className="font-semibold text-gray-900 dark:text-white text-sm uppercase tracking-wider">Recently Added</h3>
            </div>
            {dashboardStats?.recently_added?.length > 0 ? (
              <div className="space-y-1">
                {dashboardStats.recently_added.slice(0, 5).map((item: any, idx: number) => (
                  <div key={item.id} className="flex items-center gap-3 py-2 px-3 hover:bg-gray-50 dark:hover:bg-dark-700/50 rounded-lg transition-colors">
                    <span className="text-lg font-bold text-gray-400 dark:text-dark-500 w-6 text-center">{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-gray-900 dark:text-white truncate block">{item.title}</span>
                      <span className="text-xs text-gray-400 dark:text-dark-500">{item.year || ''}</span>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
                      item.media_type === 'movie' ? 'bg-primary-500/20 text-primary-400' : 'bg-green-500/20 text-green-400'
                    }`}>
                      {item.media_type}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-dark-400 text-center py-4">No recent additions</p>
            )}
          </div>
        </div>
      </div>

      {/* Play Trends Charts */}
      {activityStats && activityStats.plays_by_day.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {/* Daily Plays Chart */}
          <div className="lg:col-span-2 bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 shadow-lg p-4 sm:p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Daily Plays (Last {statsDays} Days)
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={activityStats.plays_by_day}>
                  <defs>
                    <linearGradient id="dashPlaysGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-primary-500)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--color-primary-500)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-gray-200)" className="dark:opacity-20" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 12, fill: 'var(--color-gray-500)' }}
                    tickFormatter={(d: string) => {
                      const date = new Date(d)
                      return `${date.getMonth() + 1}/${date.getDate()}`
                    }}
                    interval="preserveStartEnd"
                  />
                  <YAxis tick={{ fontSize: 12, fill: 'var(--color-gray-500)' }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--color-dark-800)',
                      border: '1px solid var(--color-dark-700)',
                      borderRadius: '0.5rem',
                      color: '#fff',
                      fontSize: '0.875rem'
                    }}
                    labelFormatter={(d: string) => new Date(d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                    formatter={(value: number, name: string) => [value, name === 'plays' ? 'Plays' : name]}
                  />
                  <Area
                    type="monotone"
                    dataKey="plays"
                    stroke="var(--color-primary-500)"
                    fill="url(#dashPlaysGradient)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Plays by Day of Week */}
          <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 shadow-lg p-4 sm:p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Plays by Day of Week
            </h3>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={activityStats.plays_by_day_of_week.map(d => ({
                  ...d,
                  name: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][d.day_of_week]
                }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-gray-200)" className="dark:opacity-20" />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--color-gray-500)' }} />
                  <YAxis tick={{ fontSize: 12, fill: 'var(--color-gray-500)' }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--color-dark-800)',
                      border: '1px solid var(--color-dark-700)',
                      borderRadius: '0.5rem',
                      color: '#fff',
                      fontSize: '0.875rem'
                    }}
                    formatter={(value: number) => [value, 'Plays']}
                  />
                  <Bar dataKey="plays" fill="var(--color-primary-500)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Plays by Hour */}
          <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 shadow-lg p-4 sm:p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Plays by Hour of Day
            </h3>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={activityStats.plays_by_hour.map(d => ({
                  ...d,
                  label: d.hour === 0 ? '12 AM' : d.hour < 12 ? `${d.hour} AM` : d.hour === 12 ? '12 PM' : `${d.hour - 12} PM`
                }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-gray-200)" className="dark:opacity-20" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--color-gray-500)' }} interval={2} />
                  <YAxis tick={{ fontSize: 12, fill: 'var(--color-gray-500)' }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--color-dark-800)',
                      border: '1px solid var(--color-dark-700)',
                      borderRadius: '0.5rem',
                      color: '#fff',
                      fontSize: '0.875rem'
                    }}
                    formatter={(value: number) => [value, 'Plays']}
                  />
                  <Bar dataKey="plays" fill="var(--color-green-500)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Genre Distribution */}
      {genreStats && genreStats.genres.length > 0 && (
        <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 shadow-lg p-4 sm:p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Genre Distribution (Last {statsDays} Days)
          </h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={genreStats.genres.slice(0, 12).map(g => ({
                  genre: g.genre,
                  plays: g.plays,
                  hours: Math.round(g.duration_seconds / 3600 * 10) / 10
                }))}
                margin={{ left: 5, right: 20, top: 5, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-gray-200)" className="dark:opacity-20" />
                <XAxis
                  dataKey="genre"
                  tick={{ fontSize: 10, fill: 'var(--color-gray-500)' }}
                  interval={0}
                  angle={-35}
                  textAnchor="end"
                  height={60}
                />
                <YAxis tick={{ fontSize: 11, fill: 'var(--color-gray-500)' }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--color-dark-800)',
                    border: '1px solid var(--color-dark-700)',
                    borderRadius: '0.5rem',
                    color: '#fff',
                    fontSize: '0.875rem'
                  }}
                  formatter={(value: number, name: string) => {
                    if (name === 'plays') return [value, 'Plays']
                    return [`${value}h`, 'Watch Time']
                  }}
                />
                <Bar dataKey="plays" fill="var(--color-primary-500)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Library Overview */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <ServerStackIcon className="w-5 h-5" />
          Library Overview
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Movie Libraries */}
          <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 shadow-lg overflow-hidden">
            <div className="px-4 py-3 bg-linear-to-r from-primary-600 to-primary-500 flex items-center gap-2">
              <FilmIcon className="w-5 h-5 text-white" />
              <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Movie Libraries</h3>
            </div>
            <div className="p-4">
              {dashboardStats?.library_overview?.movie_libraries?.length > 0 ? (
                <div className="space-y-2">
                  {dashboardStats.library_overview.movie_libraries.map((lib: any, idx: number) => (
                    <div key={lib.id} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-dark-700 last:border-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-500 dark:text-dark-400">{idx + 1}</span>
                        <span className="text-sm font-medium text-gray-900 dark:text-white">{lib.name}</span>
                      </div>
                      <span className="text-sm font-bold text-primary-400">{lib.count.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500 dark:text-dark-400 text-center py-4">No movie libraries</p>
              )}
            </div>
          </div>
          
          {/* TV Libraries */}
          <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 shadow-lg overflow-hidden">
            <div className="px-4 py-3 bg-linear-to-r from-green-600 to-green-500 flex items-center gap-2">
              <TvIcon className="w-5 h-5 text-white" />
              <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Show Libraries</h3>
            </div>
            <div className="p-4">
              {dashboardStats?.library_overview?.tv_libraries?.length > 0 ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-4 gap-2 text-xs text-gray-500 dark:text-dark-400 uppercase tracking-wider pb-2 border-b border-gray-200 dark:border-dark-700">
                    <span></span>
                    <span className="text-right">Series</span>
                    <span className="text-right">Seasons</span>
                    <span className="text-right">Episodes</span>
                  </div>
                  {dashboardStats.library_overview.tv_libraries.map((lib: any, idx: number) => (
                    <div key={lib.id} className="grid grid-cols-4 gap-2 items-center py-2 border-b border-gray-100 dark:border-dark-700 last:border-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm text-gray-500 dark:text-dark-400 shrink-0">{idx + 1}</span>
                        <span className="text-sm font-medium text-gray-900 dark:text-white truncate">{lib.name}</span>
                      </div>
                      <span className="text-sm font-bold text-green-400 text-right">{lib.series.toLocaleString()}</span>
                      <span className="text-sm text-gray-600 dark:text-dark-300 text-right">{lib.seasons.toLocaleString()}</span>
                      <span className="text-sm text-gray-600 dark:text-dark-300 text-right">{lib.episodes.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500 dark:text-dark-400 text-center py-4">No TV libraries</p>
              )}
            </div>
          </div>
        </div>
      </div>

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
                  <div className={`mt-0.5 text-xs font-bold uppercase ${
                    log.status === 'success' ? 'text-green-400' :
                    log.status === 'failed' ? 'text-red-400' :
                    'text-yellow-400'
                  }`}>
                    {log.status === 'success' ? 'OK' : log.status === 'failed' ? 'ERR' : 'SKIP'}
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
    </div>
  )
}



