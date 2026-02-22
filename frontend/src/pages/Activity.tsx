import { useQuery } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { 
  PlayIcon,
  MagnifyingGlassIcon,
  FilmIcon,
  TvIcon,
  UserIcon,
  SignalIcon
} from '@heroicons/react/24/outline'
import api from '../lib/api'
import { formatRelativeTime, formatDurationLong, formatWatchTime } from '../lib/utils'
import { useDebounce } from '../hooks/useDebounce'
import ResponsiveTable from '../components/ResponsiveTable'
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'

interface ActivityItem {
  id: number
  user: {
    id: number
    name: string
    is_admin: boolean
  } | null
  media_title: string
  media_item_id: number | null
  media_type: string | null
  library: { id: number; name: string } | null
  client_name: string
  device_name: string
  ip_address: string
  play_method: string
  is_transcoding: boolean
  transcode_video: boolean
  transcode_audio: boolean
  started_at: string
  ended_at: string | null
  duration_seconds: number
  played_percentage: number
  is_active: boolean
}

interface ActivityResponse {
  items: ActivityItem[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

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

export default function Activity() {
  const [page, setPage] = useState(1)
  const [pageSize] = useState(25)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [mediaTypeFilter, setMediaTypeFilter] = useState<string>('')

  // Reset to page 1 when search changes
  useEffect(() => {
    setPage(1)
  }, [debouncedSearch])

  // Fetch activity stats
  const { data: stats } = useQuery({
    queryKey: ['activityStats'],
    queryFn: async () => {
      const res = await api.get<ActivityStats>('/activity/stats?days=30')
      return res.data
    }
  })

  // Fetch active sessions
  const { data: activeSessions } = useQuery({
    queryKey: ['activeSessions'],
    queryFn: async () => {
      const res = await api.get('/activity/active')
      return res.data
    },
    refetchInterval: 30000 // Refresh every 30 seconds
  })

  // Fetch activity list
  const { data, isLoading } = useQuery({
    queryKey: ['activities', page, pageSize, debouncedSearch, mediaTypeFilter],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        page_size: pageSize.toString()
      })
      if (debouncedSearch) params.append('search', debouncedSearch)
      if (mediaTypeFilter) params.append('media_type', mediaTypeFilter)
      
      const res = await api.get<ActivityResponse>(`/activity/?${params}`)
      return res.data
    }
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Activity</h1>
        <p className="text-gray-500 dark:text-dark-400 mt-1">
          Playback history and active sessions
        </p>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-500/20 rounded-lg">
                <SignalIcon className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {activeSessions?.length || 0}
                </div>
                <div className="text-sm text-gray-500 dark:text-dark-400">Now Playing</div>
              </div>
            </div>
          </div>
          
          <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary-100 dark:bg-primary-500/20 rounded-lg">
                <PlayIcon className="w-5 h-5 text-primary-600 dark:text-primary-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-primary-600 dark:text-primary-400">
                  {stats.total_plays.toLocaleString()}
                </div>
                <div className="text-sm text-gray-500 dark:text-dark-400">Plays (30 days)</div>
              </div>
            </div>
          </div>
          
          <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-100 dark:bg-yellow-500/20 rounded-lg">
                <UserIcon className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                  {stats.unique_users}
                </div>
                <div className="text-sm text-gray-500 dark:text-dark-400">Active Users</div>
              </div>
            </div>
          </div>
          
          <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 p-4">
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {formatWatchTime(stats.total_watch_seconds)}
            </div>
            <div className="text-sm text-gray-500 dark:text-dark-400">Total Watch Time</div>
          </div>
        </div>
      )}

      {/* Charts */}
      {stats && stats.plays_by_day.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Daily Plays Chart */}
          <div className="lg:col-span-2 bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 p-4 sm:p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Daily Plays (Last 30 Days)
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.plays_by_day}>
                  <defs>
                    <linearGradient id="playsGradient" x1="0" y1="0" x2="0" y2="1">
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
                  <YAxis
                    tick={{ fontSize: 12, fill: 'var(--color-gray-500)' }}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--color-dark-800)',
                      border: '1px solid var(--color-dark-700)',
                      borderRadius: '0.5rem',
                      color: '#fff',
                      fontSize: '0.875rem'
                    }}
                    labelFormatter={(d: string) => new Date(d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                    formatter={(value: number, name: string) => [value, name === 'plays' ? 'Plays' : 'Duration (s)']}
                  />
                  <Area
                    type="monotone"
                    dataKey="plays"
                    stroke="var(--color-primary-500)"
                    fill="url(#playsGradient)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Plays by Day of Week */}
          <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 p-4 sm:p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Plays by Day of Week
            </h3>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.plays_by_day_of_week.map(d => ({
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
          <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 p-4 sm:p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Plays by Hour of Day
            </h3>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.plays_by_hour.map(d => ({
                  ...d,
                  label: d.hour === 0 ? '12 AM' : d.hour < 12 ? `${d.hour} AM` : d.hour === 12 ? '12 PM' : `${d.hour - 12} PM`
                }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-gray-200)" className="dark:opacity-20" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: 'var(--color-gray-500)' }}
                    interval={2}
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
                    formatter={(value: number) => [value, 'Plays']}
                  />
                  <Bar dataKey="plays" fill="var(--color-green-500)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Active Sessions */}
      {activeSessions && activeSessions.length > 0 && (
        <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 p-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <SignalIcon className="w-5 h-5 text-green-500" />
            Now Playing
            <span className="text-sm font-normal text-gray-500 dark:text-dark-400">
              ({activeSessions.length} active)
            </span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeSessions.map((session: any) => (
              <div 
                key={session.id}
                className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/30 rounded-lg"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 dark:text-white truncate">
                    {session.media_title}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-dark-400">
                    {session.user?.name || 'Unknown'} • {session.client_name}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-medium text-green-600 dark:text-green-400">
                    {Math.round(session.played_percentage)}%
                  </div>
                  <div className="text-xs text-gray-400">
                    {session.is_transcoding ? 'Transcode' : 'Direct'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title, client, device..."
              className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-dark-700 border border-gray-200 dark:border-dark-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* Type Filter */}
          <select
            value={mediaTypeFilter}
            onChange={(e) => { setMediaTypeFilter(e.target.value); setPage(1); }}
            className="px-4 py-2 bg-gray-50 dark:bg-dark-700 border border-gray-200 dark:border-dark-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">All Types</option>
            <option value="movie">Movies</option>
            <option value="episode">Episodes</option>
          </select>
        </div>
      </div>

      {/* Activity Table */}
      <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 shadow-lg overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="animate-pulse flex gap-4">
                <div className="h-4 bg-gray-200 dark:bg-dark-700 rounded w-24" />
                <div className="h-4 bg-gray-200 dark:bg-dark-700 rounded w-48 flex-1" />
                <div className="h-4 bg-gray-200 dark:bg-dark-700 rounded w-32" />
                <div className="h-4 bg-gray-200 dark:bg-dark-700 rounded w-20" />
              </div>
            ))}
          </div>
        ) : !data?.items.length ? (
          <div className="px-4 py-12 text-center">
            <PlayIcon className="w-12 h-12 mx-auto text-gray-400 dark:text-dark-500 mb-4" />
            <p className="text-gray-500 dark:text-dark-400">No activity found</p>
            <p className="text-sm text-gray-400 dark:text-dark-500 mt-1">
              Activity will appear after syncing with your media server
            </p>
          </div>
        ) : (
          <>
            <ResponsiveTable
              columns={[
                {
                  header: 'User',
                  accessor: 'user',
                  cell: (item: ActivityItem) => item.user ? (
                    <Link
                      to={`/users/${item.user.id}`}
                      className="font-medium text-gray-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400"
                    >
                      {item.user.name}
                    </Link>
                  ) : <span className="text-gray-400">Unknown</span>
                },
                {
                  header: 'Title',
                  accessor: 'media_title',
                  cell: (item: ActivityItem) => (
                    <div className="flex items-center gap-2">
                      {item.media_type === 'movie' ? (
                        <FilmIcon className="w-4 h-4 text-primary-400 shrink-0" />
                      ) : (
                        <TvIcon className="w-4 h-4 text-green-400 shrink-0" />
                      )}
                      <span className="text-sm text-gray-900 dark:text-white truncate max-w-xs">
                        {item.media_title}
                      </span>
                      {item.is_active && (
                        <span className="px-1.5 py-0.5 text-xs bg-green-100 dark:bg-green-500/20 text-green-600 dark:text-green-400 rounded">
                          LIVE
                        </span>
                      )}
                    </div>
                  )
                },
                {
                  header: 'Client',
                  accessor: 'client_name',
                  mobileHide: true,
                  cell: (item: ActivityItem) => (
                    <div>
                      <span className="text-sm text-gray-600 dark:text-dark-300">{item.client_name}</span>
                      <span className="text-xs text-gray-400 dark:text-dark-500 block">{item.device_name}</span>
                    </div>
                  )
                },
                {
                  header: 'Transcode',
                  accessor: 'is_transcoding',
                  mobileHide: true,
                  cell: (item: ActivityItem) => item.is_transcoding ? (
                    <span className="text-xs text-yellow-500">
                      Transcode
                      {item.transcode_video && item.transcode_audio ? ' (V+A)' :
                       item.transcode_video ? ' (Video)' :
                       item.transcode_audio ? ' (Audio)' : ''}
                    </span>
                  ) : (
                    <span className="text-xs text-green-500">{item.play_method || 'Direct'}</span>
                  )
                },
                {
                  header: 'Date',
                  accessor: 'started_at',
                  cell: (item: ActivityItem) => (
                    <span className="text-sm text-gray-600 dark:text-dark-300">
                      {new Date(item.started_at).toLocaleString()}
                    </span>
                  )
                },
                {
                  header: 'Duration',
                  accessor: 'duration_seconds',
                  className: 'text-right',
                  cell: (item: ActivityItem) => (
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      {formatDurationLong(item.duration_seconds)}
                    </span>
                  )
                }
              ]}
              data={data.items}
              keyExtractor={(item: ActivityItem) => item.id}
              emptyMessage="No activity found"
            />

            {/* Pagination */}
            {data.total_pages > 1 && (
              <div className="px-4 py-3 border-t border-gray-200 dark:border-dark-700 flex items-center justify-between">
                <div className="text-sm text-gray-500 dark:text-dark-400">
                  Showing {((page - 1) * pageSize) + 1} to {Math.min(page * pageSize, data.total)} of {data.total}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1 text-sm bg-gray-100 dark:bg-dark-700 text-gray-700 dark:text-dark-300 rounded hover:bg-gray-200 dark:hover:bg-dark-600 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <span className="px-3 py-1 text-sm text-gray-600 dark:text-dark-400">
                    {page} of {data.total_pages}
                  </span>
                  <button
                    onClick={() => setPage(p => Math.min(data.total_pages, p + 1))}
                    disabled={page === data.total_pages}
                    className="px-3 py-1 text-sm bg-gray-100 dark:bg-dark-700 text-gray-700 dark:text-dark-300 rounded hover:bg-gray-200 dark:hover:bg-dark-600 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
