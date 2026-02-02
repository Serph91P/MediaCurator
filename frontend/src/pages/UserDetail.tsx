import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { 
  UserIcon, 
  ArrowLeftIcon,
  PlayIcon,
  ClockIcon,
  ShieldCheckIcon,
  EyeSlashIcon,
  EyeIcon,
  FilmIcon,
  TvIcon
} from '@heroicons/react/24/outline'
import api from '../lib/api'
import { formatRelativeTime } from '../lib/utils'
import toast from 'react-hot-toast'

interface UserStats {
  plays: number
  watch_seconds: number
}

interface RecentActivity {
  id: number
  media_title: string
  client_name: string
  device_name: string
  started_at: string
  duration_seconds: number
  played_percentage: number
}

interface UserDetail {
  id: number
  external_id: string
  name: string
  is_admin: boolean
  is_hidden: boolean
  service: string | null
  total_plays: number
  total_watch_time_seconds: number
  last_activity_at: string | null
  created_at: string | null
  stats: {
    last_24h: UserStats
    last_7d: UserStats
    last_30d: UserStats
  }
  recently_watched: RecentActivity[]
}

interface ActivityItem {
  id: number
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
}

interface ActivityResponse {
  items: ActivityItem[]
  total: number
  page: number
  page_size: number
  total_pages: number
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
  
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  
  const parts = []
  if (days > 0) parts.push(`${days} Days`)
  if (hours > 0) parts.push(`${hours} Hours`)
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes} Minutes`)
  
  return parts.join(' ')
}

// Stats Box Component
function StatsBox({ title, stats }: { title: string; stats: UserStats }) {
  return (
    <div className="text-center">
      <h4 className="text-sm font-medium text-gray-500 dark:text-dark-400 mb-2">{title}</h4>
      <div className="text-2xl font-bold text-primary-400">{stats.plays}</div>
      <div className="text-xs text-gray-400 dark:text-dark-500">Plays</div>
      <div className="text-sm text-gray-600 dark:text-dark-300 mt-1">
        {formatWatchTime(stats.watch_seconds)}
      </div>
    </div>
  )
}

export default function UserDetail() {
  const { userId } = useParams<{ userId: string }>()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<'overview' | 'activity'>('overview')
  const [activityPage, setActivityPage] = useState(1)

  const { data: user, isLoading } = useQuery({
    queryKey: ['mediaUser', userId],
    queryFn: async () => {
      const res = await api.get<UserDetail>(`/users/${userId}`)
      return res.data
    },
    enabled: !!userId
  })

  const { data: activityData, isLoading: activityLoading } = useQuery({
    queryKey: ['userActivity', userId, activityPage],
    queryFn: async () => {
      const res = await api.get<ActivityResponse>(`/users/${userId}/activity?page=${activityPage}&page_size=25`)
      return res.data
    },
    enabled: !!userId && activeTab === 'activity'
  })

  const toggleHiddenMutation = useMutation({
    mutationFn: async () => {
      const res = await api.patch(`/users/${userId}`, { is_hidden: !user?.is_hidden })
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mediaUser', userId] })
      queryClient.invalidateQueries({ queryKey: ['mediaUsers'] })
      toast.success(user?.is_hidden ? 'User is now visible' : 'User is now hidden')
    }
  })

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 dark:bg-dark-700 rounded w-48 mb-4" />
          <div className="h-4 bg-gray-200 dark:bg-dark-700 rounded w-96" />
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="text-center py-12">
        <UserIcon className="w-12 h-12 mx-auto text-gray-400 dark:text-dark-500 mb-4" />
        <p className="text-gray-500 dark:text-dark-400">User not found</p>
        <Link to="/users" className="text-primary-500 hover:text-primary-600 mt-2 inline-block">
          Back to Users
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link 
          to="/users"
          className="p-2 text-gray-500 hover:text-gray-700 dark:text-dark-400 dark:hover:text-dark-200"
        >
          <ArrowLeftIcon className="w-5 h-5" />
        </Link>
        
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <div className="w-16 h-16 rounded-full bg-primary-100 dark:bg-primary-500/20 flex items-center justify-center">
              <UserIcon className="w-8 h-8 text-primary-600 dark:text-primary-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{user.name}</h1>
                {user.is_admin && (
                  <ShieldCheckIcon className="w-5 h-5 text-yellow-500" title="Admin" />
                )}
                {user.is_hidden && (
                  <EyeSlashIcon className="w-5 h-5 text-gray-400" title="Hidden" />
                )}
              </div>
              <p className="text-gray-500 dark:text-dark-400">
                {user.service || 'Unknown service'}
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={() => toggleHiddenMutation.mutate()}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-gray-100 dark:bg-dark-700 text-gray-700 dark:text-dark-300 rounded-lg hover:bg-gray-200 dark:hover:bg-dark-600"
        >
          {user.is_hidden ? (
            <>
              <EyeIcon className="w-4 h-4" />
              Show in Stats
            </>
          ) : (
            <>
              <EyeSlashIcon className="w-4 h-4" />
              Hide from Stats
            </>
          )}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200 dark:border-dark-700">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'overview'
              ? 'border-primary-500 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-gray-500 dark:text-dark-400 hover:text-gray-700 dark:hover:text-dark-200'
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveTab('activity')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'activity'
              ? 'border-primary-500 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-gray-500 dark:text-dark-400 hover:text-gray-700 dark:hover:text-dark-200'
          }`}
        >
          Activity
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' ? (
        <div className="space-y-6">
          {/* User Stats */}
          <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">User Stats</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <StatsBox title="Last 24 Hours" stats={user.stats.last_24h} />
              <StatsBox title="Last 7 Days" stats={user.stats.last_7d} />
              <StatsBox title="Last 30 Days" stats={user.stats.last_30d} />
              <div className="text-center">
                <h4 className="text-sm font-medium text-gray-500 dark:text-dark-400 mb-2">All Time</h4>
                <div className="text-2xl font-bold text-green-400">{user.total_plays}</div>
                <div className="text-xs text-gray-400 dark:text-dark-500">Plays</div>
                <div className="text-sm text-gray-600 dark:text-dark-300 mt-1">
                  {formatWatchTime(user.total_watch_time_seconds)}
                </div>
              </div>
            </div>
          </div>

          {/* Recently Watched */}
          <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Last Watched</h3>
            {user.recently_watched.length > 0 ? (
              <div className="space-y-3">
                {user.recently_watched.map((item) => (
                  <div 
                    key={item.id} 
                    className="flex items-center gap-4 p-3 bg-gray-50 dark:bg-dark-700/50 rounded-lg"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 dark:text-white truncate">
                        {item.media_title}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-dark-400">
                        {item.client_name} • {item.device_name}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {formatDuration(item.duration_seconds)}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-dark-400">
                        {formatRelativeTime(item.started_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 dark:text-dark-400 text-center py-4">No watch history yet</p>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 shadow-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 dark:bg-dark-700/50 border-b border-gray-200 dark:border-dark-700">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-dark-400 uppercase">Title</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-dark-400 uppercase hidden md:table-cell">Client</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-dark-400 uppercase hidden lg:table-cell">Transcode</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-dark-400 uppercase">Date</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-dark-400 uppercase">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-dark-700">
                {activityLoading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td className="px-4 py-4"><div className="h-4 bg-gray-200 dark:bg-dark-700 rounded w-48" /></td>
                      <td className="px-4 py-4 hidden md:table-cell"><div className="h-4 bg-gray-200 dark:bg-dark-700 rounded w-32" /></td>
                      <td className="px-4 py-4 hidden lg:table-cell"><div className="h-4 bg-gray-200 dark:bg-dark-700 rounded w-24" /></td>
                      <td className="px-4 py-4"><div className="h-4 bg-gray-200 dark:bg-dark-700 rounded w-32" /></td>
                      <td className="px-4 py-4"><div className="h-4 bg-gray-200 dark:bg-dark-700 rounded w-20 ml-auto" /></td>
                    </tr>
                  ))
                ) : activityData?.items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-gray-500 dark:text-dark-400">
                      No activity found
                    </td>
                  </tr>
                ) : (
                  activityData?.items.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-dark-700/50">
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
                        </div>
                      </td>
                      <td className="px-4 py-4 hidden md:table-cell">
                        <span className="text-sm text-gray-600 dark:text-dark-300">
                          {item.client_name}
                        </span>
                        <span className="text-xs text-gray-400 dark:text-dark-500 block">
                          {item.device_name}
                        </span>
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
                          <span className="text-xs text-green-500">
                            {item.play_method || 'Direct'}
                          </span>
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
          {activityData && activityData.total_pages > 1 && (
            <div className="px-4 py-3 border-t border-gray-200 dark:border-dark-700 flex items-center justify-between">
              <div className="text-sm text-gray-500 dark:text-dark-400">
                Page {activityPage} of {activityData.total_pages}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setActivityPage(p => Math.max(1, p - 1))}
                  disabled={activityPage === 1}
                  className="px-3 py-1 text-sm bg-gray-100 dark:bg-dark-700 rounded disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  onClick={() => setActivityPage(p => Math.min(activityData.total_pages, p + 1))}
                  disabled={activityPage === activityData.total_pages}
                  className="px-3 py-1 text-sm bg-gray-100 dark:bg-dark-700 rounded disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
