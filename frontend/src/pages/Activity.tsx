import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { 
  PlayIcon,
  MagnifyingGlassIcon,
  FilmIcon,
  TvIcon,
  UserIcon,
  FunnelIcon,
  SignalIcon
} from '@heroicons/react/24/outline'
import api from '../lib/api'
import { formatRelativeTime } from '../lib/utils'

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

function formatDuration(seconds: number): string {
  if (!seconds || seconds === 0) return '0s'
  
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`
  }
  return `${secs}s`
}

function formatWatchTime(seconds: number): string {
  if (!seconds || seconds === 0) return '0 Minutes'
  
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  
  if (hours > 0) {
    return `${hours} Hours ${minutes} Minutes`
  }
  return `${minutes} Minutes`
}

export default function Activity() {
  const [page, setPage] = useState(1)
  const [pageSize] = useState(25)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [mediaTypeFilter, setMediaTypeFilter] = useState<string>('')

  const handleSearchChange = (value: string) => {
    setSearch(value)
    setTimeout(() => {
      setDebouncedSearch(value)
      setPage(1)
    }, 300)
  }

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
              onChange={(e) => handleSearchChange(e.target.value)}
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
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 dark:bg-dark-700/50 border-b border-gray-200 dark:border-dark-700">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-dark-400 uppercase">User</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-dark-400 uppercase">Title</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-dark-400 uppercase hidden md:table-cell">Client</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-dark-400 uppercase hidden lg:table-cell">Transcode</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-dark-400 uppercase">Date</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-dark-400 uppercase">Duration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-dark-700">
              {isLoading ? (
                [...Array(10)].map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-4 py-4"><div className="h-4 bg-gray-200 dark:bg-dark-700 rounded w-24" /></td>
                    <td className="px-4 py-4"><div className="h-4 bg-gray-200 dark:bg-dark-700 rounded w-48" /></td>
                    <td className="px-4 py-4 hidden md:table-cell"><div className="h-4 bg-gray-200 dark:bg-dark-700 rounded w-32" /></td>
                    <td className="px-4 py-4 hidden lg:table-cell"><div className="h-4 bg-gray-200 dark:bg-dark-700 rounded w-24" /></td>
                    <td className="px-4 py-4"><div className="h-4 bg-gray-200 dark:bg-dark-700 rounded w-32" /></td>
                    <td className="px-4 py-4"><div className="h-4 bg-gray-200 dark:bg-dark-700 rounded w-20 ml-auto" /></td>
                  </tr>
                ))
              ) : data?.items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <PlayIcon className="w-12 h-12 mx-auto text-gray-400 dark:text-dark-500 mb-4" />
                    <p className="text-gray-500 dark:text-dark-400">No activity found</p>
                    <p className="text-sm text-gray-400 dark:text-dark-500 mt-1">
                      Activity will appear after syncing with your media server
                    </p>
                  </td>
                </tr>
              ) : (
                data?.items.map((item) => (
                  <tr 
                    key={item.id} 
                    className={`hover:bg-gray-50 dark:hover:bg-dark-700/50 ${item.is_active ? 'bg-green-50/50 dark:bg-green-500/5' : ''}`}
                  >
                    <td className="px-4 py-4">
                      {item.user ? (
                        <Link 
                          to={`/users/${item.user.id}`}
                          className="font-medium text-gray-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400"
                        >
                          {item.user.name}
                        </Link>
                      ) : (
                        <span className="text-gray-400">Unknown</span>
                      )}
                    </td>
                    <td className="px-4 py-4">
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
                    </td>
                    <td className="px-4 py-4 hidden md:table-cell">
                      <span className="text-sm text-gray-600 dark:text-dark-300">{item.client_name}</span>
                      <span className="text-xs text-gray-400 dark:text-dark-500 block">{item.device_name}</span>
                    </td>
                    <td className="px-4 py-4 hidden lg:table-cell">
                      {item.is_transcoding ? (
                        <span className="text-xs text-yellow-500">
                          Transcode
                          {item.transcode_video && item.transcode_audio ? ' (V+A)' :
                           item.transcode_video ? ' (Video)' :
                           item.transcode_audio ? ' (Audio)' : ''}
                        </span>
                      ) : (
                        <span className="text-xs text-green-500">{item.play_method || 'Direct'}</span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-sm text-gray-600 dark:text-dark-300">
                        {new Date(item.started_at).toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {formatDuration(item.duration_seconds)}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && data.total_pages > 1 && (
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
      </div>
    </div>
  )
}
