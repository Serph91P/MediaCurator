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
  TvIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ComputerDesktopIcon,
  GlobeAltIcon,
  SignalIcon,
  MagnifyingGlassIcon
} from '@heroicons/react/24/outline'
import {
  ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import api from '../lib/api'
import { formatRelativeTime, formatDurationLong, formatWatchTime } from '../lib/utils'
import ResponsiveTable from '../components/ResponsiveTable'
import toast from 'react-hot-toast'

interface GenreStatsResponse {
  period_days: number
  total_genres: number
  genres: { genre: string; plays: number; duration_seconds: number }[]
}

interface TimelineResponse {
  user_id: number
  period_days: number
  calendar_heatmap: { date: string; plays: number; duration_seconds: number }[]
  sessions: {
    started_at: string | null
    ended_at: string | null
    duration_seconds: number
    item_count: number
    items: {
      id: number
      media_title: string
      media_type: string | null
      duration_seconds: number
      played_percentage: number
      started_at: string | null
    }[]
  }[]
}

interface Library {
  id: number
  name: string
  media_type: string
}

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
  const [activeTab, setActiveTab] = useState<'overview' | 'activity' | 'timeline'>('overview')
  const [activityPage, setActivityPage] = useState(1)
  const [activityLibraryFilter, setActivityLibraryFilter] = useState<string>('')
  const [activityTypeFilter, setActivityTypeFilter] = useState<string>('')
  const [activitySearch, setActivitySearch] = useState<string>('')
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())

  const toggleExpanded = (id: number) => {
    setExpandedRows(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const { data: user, isLoading } = useQuery({
    queryKey: ['mediaUser', userId],
    queryFn: async () => {
      const res = await api.get<UserDetail>(`/users/${userId}`)
      return res.data
    },
    enabled: !!userId
  })

  // Fetch libraries for filter dropdown
  const { data: libraries } = useQuery({
    queryKey: ['libraries'],
    queryFn: async () => {
      const res = await api.get<Library[]>('/libraries/')
      return res.data
    }
  })

  const { data: activityData, isLoading: activityLoading } = useQuery({
    queryKey: ['userActivity', userId, activityPage, activityLibraryFilter, activityTypeFilter, activitySearch],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: activityPage.toString(),
        page_size: '25'
      })
      if (activityLibraryFilter) params.append('library_id', activityLibraryFilter)
      if (activityTypeFilter) params.append('media_type', activityTypeFilter)
      if (activitySearch) params.append('search', activitySearch)
      const res = await api.get<ActivityResponse>(`/users/${userId}/activity?${params}`)
      return res.data
    },
    enabled: !!userId && activeTab === 'activity'
  })

  // Fetch user's favorite genres
  const { data: userGenreStats } = useQuery({
    queryKey: ['user-genre-stats', userId],
    queryFn: async () => {
      const res = await api.get<GenreStatsResponse>(`/activity/genre-stats?days=365&user_id=${userId}`)
      return res.data
    },
    enabled: !!userId && activeTab === 'overview',
  })

  // Fetch user timeline data
  const { data: timelineData } = useQuery({
    queryKey: ['userTimeline', userId],
    queryFn: async () => {
      const res = await api.get<TimelineResponse>(`/users/${userId}/timeline?days=90`)
      return res.data
    },
    enabled: !!userId && activeTab === 'timeline',
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
        <button
          onClick={() => setActiveTab('timeline')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'timeline'
              ? 'border-primary-500 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-gray-500 dark:text-dark-400 hover:text-gray-700 dark:hover:text-dark-200'
          }`}
        >
          Timeline
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'timeline' && (
        <div className="space-y-6">
          {/* Calendar Heatmap */}
          <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Watch Calendar (Last 90 Days)</h3>
            {timelineData && timelineData.calendar_heatmap.length > 0 ? (() => {
              const maxPlays = Math.max(...timelineData.calendar_heatmap.map(d => d.plays))
              const heatmapMap = new Map(timelineData.calendar_heatmap.map(d => [d.date, d]))
              // Generate last 90 days
              const days: { date: Date; dateStr: string }[] = []
              for (let i = 89; i >= 0; i--) {
                const d = new Date()
                d.setDate(d.getDate() - i)
                days.push({ date: d, dateStr: d.toISOString().split('T')[0] })
              }
              // Group by week
              const weeks: typeof days[] = []
              let currentWeek: typeof days = []
              days.forEach((d, i) => {
                currentWeek.push(d)
                if (d.date.getDay() === 0 || i === days.length - 1) {
                  weeks.push(currentWeek)
                  currentWeek = []
                }
              })
              return (
                <div>
                  <div className="flex gap-0.5 overflow-x-auto pb-2">
                    {weeks.map((week, wi) => (
                      <div key={wi} className="flex flex-col gap-0.5">
                        {week.map((day) => {
                          const data = heatmapMap.get(day.dateStr)
                          const plays = data?.plays || 0
                          const intensity = maxPlays > 0 ? plays / maxPlays : 0
                          const isDark = document.documentElement.classList.contains('dark')
                          let bg = isDark ? 'var(--color-dark-700)' : 'var(--color-gray-100)'
                          if (plays > 0) {
                            if (intensity > 0.75) bg = 'var(--color-primary-500)'
                            else if (intensity > 0.5) bg = 'var(--color-primary-400)'
                            else if (intensity > 0.25) bg = isDark ? 'var(--color-primary-300)' : 'var(--color-primary-300)'
                            else bg = isDark ? 'var(--color-primary-200)' : 'var(--color-primary-200)'
                          }
                          return (
                            <div
                              key={day.dateStr}
                              className="w-3.5 h-3.5 rounded-sm cursor-default"
                              style={{ backgroundColor: bg }}
                              title={`${day.date.toLocaleDateString()} — ${plays} play${plays !== 1 ? 's' : ''}${data ? `, ${Math.round(data.duration_seconds / 60)}m` : ''}`}
                            />
                          )
                        })}
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 mt-3 text-xs text-gray-500 dark:text-dark-400">
                    <span>Less</span>
                    {[0, 0.25, 0.5, 0.75, 1].map((t, i) => {
                      const isDark = document.documentElement.classList.contains('dark')
                      let bg = isDark ? 'var(--color-dark-700)' : 'var(--color-gray-100)'
                      if (t > 0.75) bg = 'var(--color-primary-500)'
                      else if (t > 0.5) bg = 'var(--color-primary-400)'
                      else if (t > 0.25) bg = 'var(--color-primary-300)'
                      else if (t > 0) bg = 'var(--color-primary-200)'
                      return <div key={i} className="w-3 h-3 rounded-sm" style={{ backgroundColor: bg }} />
                    })}
                    <span>More</span>
                  </div>
                </div>
              )
            })() : (
              <p className="text-gray-500 dark:text-dark-400 text-center py-4">No watch history in the last 90 days</p>
            )}
          </div>

          {/* Recent Sessions */}
          <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Recent Watch Sessions</h3>
            {timelineData && timelineData.sessions.length > 0 ? (
              <div className="space-y-4">
                {[...timelineData.sessions].reverse().slice(0, 20).map((session, idx) => (
                  <div key={idx} className="border-l-2 border-primary-500 pl-4">
                    <div className="flex items-center gap-2 mb-2">
                      <ClockIcon className="w-4 h-4 text-primary-500" />
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {session.started_at ? new Date(session.started_at).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : 'Unknown'}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-dark-400">
                        {session.started_at ? new Date(session.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                        {session.ended_at ? ` – ${new Date(session.ended_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
                      </span>
                      <span className="text-xs px-2 py-0.5 bg-primary-500/20 text-primary-500 rounded-full">
                        {session.item_count} item{session.item_count !== 1 ? 's' : ''}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-dark-400">
                        {formatDurationLong(session.duration_seconds)}
                      </span>
                    </div>
                    <div className="space-y-1 ml-1">
                      {session.items.map((item) => (
                        <div key={item.id} className="flex items-center gap-2 text-sm">
                          {item.media_type === 'movie' ? (
                            <FilmIcon className="w-3.5 h-3.5 text-primary-400 shrink-0" />
                          ) : (
                            <TvIcon className="w-3.5 h-3.5 text-green-400 shrink-0" />
                          )}
                          <span className="text-gray-900 dark:text-white truncate">{item.media_title}</span>
                          <span className="text-xs text-gray-400 dark:text-dark-500 shrink-0">
                            {formatDurationLong(item.duration_seconds)}
                            {item.played_percentage > 0 && ` (${Math.round(item.played_percentage)}%)`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 dark:text-dark-400 text-center py-4">No recent sessions found</p>
            )}
          </div>
        </div>
      )}

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

          {/* Favorite Genres */}
          {userGenreStats && userGenreStats.genres.length > 0 && (
            <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Favorite Genres</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={userGenreStats.genres.slice(0, 10).map(g => ({
                      genre: g.genre,
                      plays: g.plays,
                      hours: Math.round(g.duration_seconds / 3600 * 10) / 10
                    }))}
                    layout="vertical"
                    margin={{ left: 70, right: 20, top: 5, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-gray-200)" className="dark:opacity-20" />
                    <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--color-gray-500)' }} />
                    <YAxis
                      type="category"
                      dataKey="genre"
                      tick={{ fontSize: 11, fill: 'var(--color-gray-500)' }}
                      width={65}
                    />
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
                    <Bar dataKey="plays" fill="var(--color-primary-500)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

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
                        {formatDurationLong(item.duration_seconds)}
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
        <div className="space-y-4">
          {/* Activity Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-dark-400" />
              <input
                type="text"
                placeholder="Search by title..."
                value={activitySearch}
                onChange={(e) => { setActivitySearch(e.target.value); setActivityPage(1); }}
                className="w-full pl-9 pr-4 py-2 bg-gray-50 dark:bg-dark-700 border border-gray-200 dark:border-dark-600 rounded-lg text-gray-900 dark:text-white text-sm placeholder-gray-400 dark:placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <select
              value={activityLibraryFilter}
              onChange={(e) => { setActivityLibraryFilter(e.target.value); setActivityPage(1); }}
              className="px-4 py-2 bg-gray-50 dark:bg-dark-700 border border-gray-200 dark:border-dark-600 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">All Libraries</option>
              {libraries?.map((lib) => (
                <option key={lib.id} value={lib.id}>{lib.name}</option>
              ))}
            </select>
            <select
              value={activityTypeFilter}
              onChange={(e) => { setActivityTypeFilter(e.target.value); setActivityPage(1); }}
              className="px-4 py-2 bg-gray-50 dark:bg-dark-700 border border-gray-200 dark:border-dark-600 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">All Types</option>
              <option value="movie">Movies</option>
              <option value="episode">Episodes</option>
            </select>
          </div>

          <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 shadow-lg overflow-hidden">
          {activityLoading ? (
            <div className="p-4 space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="animate-pulse flex gap-4">
                  <div className="h-4 bg-gray-200 dark:bg-dark-700 rounded w-48 flex-1" />
                  <div className="h-4 bg-gray-200 dark:bg-dark-700 rounded w-32" />
                  <div className="h-4 bg-gray-200 dark:bg-dark-700 rounded w-20" />
                </div>
              ))}
            </div>
          ) : !activityData?.items.length ? (
            <div className="px-4 py-12 text-center text-gray-500 dark:text-dark-400">
              No activity found
            </div>
          ) : (
            <>
              <ResponsiveTable
                columns={[
                  {
                    header: '',
                    accessor: '_expand',
                    mobileHide: true,
                    className: 'w-8',
                    cell: (item: ActivityItem) => (
                      expandedRows.has(item.id) ? (
                        <ChevronDownIcon className="w-4 h-4 text-gray-400" />
                      ) : (
                        <ChevronRightIcon className="w-4 h-4 text-gray-400" />
                      )
                    )
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
                data={activityData.items}
                keyExtractor={(item: ActivityItem) => item.id}
                onRowClick={(item: ActivityItem) => toggleExpanded(item.id)}
                isExpanded={(item: ActivityItem) => expandedRows.has(item.id)}
                expandedContent={(item: ActivityItem) => (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <div className="flex items-center gap-1.5 text-gray-500 dark:text-dark-400 mb-1">
                        <GlobeAltIcon className="w-4 h-4" />
                        <span className="font-medium">IP Address</span>
                      </div>
                      <span className="text-gray-900 dark:text-white font-mono text-xs">{item.ip_address || 'N/A'}</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 text-gray-500 dark:text-dark-400 mb-1">
                        <ComputerDesktopIcon className="w-4 h-4" />
                        <span className="font-medium">Device</span>
                      </div>
                      <span className="text-gray-900 dark:text-white">{item.device_name || 'Unknown'}</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 text-gray-500 dark:text-dark-400 mb-1">
                        <SignalIcon className="w-4 h-4" />
                        <span className="font-medium">Play Method</span>
                      </div>
                      <span className={item.is_transcoding ? 'text-yellow-500' : 'text-green-500'}>
                        {item.play_method || 'Unknown'}
                        {item.is_transcoding && (
                          <span className="text-gray-400 dark:text-dark-500 ml-1">
                            ({[item.transcode_video && 'Video', item.transcode_audio && 'Audio'].filter(Boolean).join(' + ')})
                          </span>
                        )}
                      </span>
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 text-gray-500 dark:text-dark-400 mb-1">
                        <PlayIcon className="w-4 h-4" />
                        <span className="font-medium">Progress</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-gray-200 dark:bg-dark-600 rounded-full overflow-hidden max-w-24">
                          <div
                            className="h-full bg-primary-500 rounded-full"
                            style={{ width: `${Math.min(100, item.played_percentage || 0)}%` }}
                          />
                        </div>
                        <span className="text-gray-900 dark:text-white text-xs">
                          {(item.played_percentage || 0).toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  </div>
                )}
                emptyMessage="No activity found"
              />

              {/* Pagination */}
              {activityData.total_pages > 1 && (
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
            </>
          )}
        </div>
        </div>
      )}
    </div>
  )
}
