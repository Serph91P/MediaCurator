import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  FilmIcon,
  TvIcon,
  PlayIcon,
  ClockIcon,
  FolderIcon,
  ArrowLeftIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  MagnifyingGlassIcon,
  ComputerDesktopIcon,
  GlobeAltIcon,
  SignalIcon,
  Squares2X2Icon,
  ListBulletIcon
} from '@heroicons/react/24/outline'
import {
  ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import api from '../lib/api'
import { formatBytes, formatRelativeTime, formatDuration, formatDate } from '../lib/utils'
import ResponsiveTable from '../components/ResponsiveTable'

interface GenreStatsResponse {
  period_days: number
  total_genres: number
  genres: { genre: string; plays: number; duration_seconds: number }[]
}

interface LibraryDetails {
  id: number
  name: string
  type: string
  media_type: string
  is_enabled: boolean
  path: string
  service_name: string | null
  external_id: string
  last_synced_at: string | null
  total_items: number
  total_size_bytes: number
  total_plays: number
  item_breakdown: {
    movies: number
    series: number
    seasons: number
    episodes: number
  }
  stats: {
    plays_24h: number
    plays_7d: number
    plays_30d: number
    watch_time_24h: number
    watch_time_7d: number
    watch_time_30d: number
  }
  top_users: Array<{
    user_id: string
    plays: number
    watch_time_seconds: number
  }>
  recently_watched: Array<{
    id: number
    title: string
    media_type: string
    last_watched_at: string | null
    watch_count: number
  }>
  active_sessions: number
}

interface MediaItem {
  id: number
  title: string
  media_type: string
  external_id: string
  added_at: string | null
  last_watched_at: string | null
  watch_count: number
  size_bytes: number
  year: number | null
}

interface MediaResponse {
  items: MediaItem[]
  total_pages: number
}

interface ActivityItem {
  id: number
  user_id: string
  media_title: string
  client_name: string
  device_name: string
  ip_address: string
  play_method: string
  is_transcoding: boolean
  transcode_video: boolean
  transcode_audio: boolean
  started_at: string | null
  ended_at: string | null
  duration_seconds: number
  played_percentage: number
  is_active: boolean
}

interface ActivityResponse {
  items: ActivityItem[]
  total_pages: number
}

type TabType = 'overview' | 'media' | 'activity'

export default function LibraryDetail() {
  const { libraryId } = useParams<{ libraryId: string }>()
  const [activeTab, setActiveTab] = useState<TabType>('overview')

  // Media pagination & filters
  const [mediaPage, setMediaPage] = useState(1)
  const [mediaSearch, setMediaSearch] = useState('')
  const [mediaSortBy, setMediaSortBy] = useState('title')
  const [mediaSortOrder, setMediaSortOrder] = useState('asc')
  const [mediaView, setMediaView] = useState<'table' | 'grid'>('table')

  // Activity pagination
  const [activityPage, setActivityPage] = useState(1)
  const [expandedActivityRows, setExpandedActivityRows] = useState<Set<number>>(new Set())

  const toggleActivityExpanded = (id: number) => {
    setExpandedActivityRows(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Fetch library details
  const { data: details, isLoading, error } = useQuery<LibraryDetails>({
    queryKey: ['library-details', libraryId],
    queryFn: async () => {
      const res = await api.get<LibraryDetails>(`/libraries/${libraryId}/details`)
      return res.data
    },
    enabled: !!libraryId,
  })

  // Fetch genre stats for this library
  const { data: genreStats } = useQuery({
    queryKey: ['library-genre-stats', libraryId],
    queryFn: async () => {
      const res = await api.get<GenreStatsResponse>(`/activity/genre-stats?days=90&library_id=${libraryId}`)
      return res.data
    },
    enabled: !!libraryId && activeTab === 'overview',
  })

  // Fetch media (only when media tab is active)
  const { data: mediaData } = useQuery<MediaResponse>({
    queryKey: ['library-media', libraryId, mediaPage, mediaSearch, mediaSortBy, mediaSortOrder],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: mediaPage.toString(),
        page_size: '50',
        sort_by: mediaSortBy,
        sort_order: mediaSortOrder,
      })
      if (mediaSearch) {
        params.append('search', mediaSearch)
      }
      const res = await api.get<MediaResponse>(`/libraries/${libraryId}/media?${params}`)
      return res.data
    },
    enabled: !!libraryId && activeTab === 'media',
  })

  // Fetch activity (only when activity tab is active)
  const { data: activityData } = useQuery<ActivityResponse>({
    queryKey: ['library-activity', libraryId, activityPage],
    queryFn: async () => {
      const res = await api.get<ActivityResponse>(`/libraries/${libraryId}/activity?page=${activityPage}&page_size=50`)
      return res.data
    },
    enabled: !!libraryId && activeTab === 'activity',
  })

  const tabs = [
    { id: 'overview' as TabType, name: 'Overview' },
    { id: 'media' as TabType, name: 'Media' },
    { id: 'activity' as TabType, name: 'Activity' },
  ]

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    )
  }

  if (error || !details) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400">
        {error instanceof Error ? error.message : 'Library not found'}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          to="/libraries"
          className="p-2 hover:bg-gray-100 dark:hover:bg-dark-700 rounded-lg transition-colors"
        >
          <ArrowLeftIcon className="w-5 h-5 text-gray-600 dark:text-gray-300" />
        </Link>
        <div className="flex items-center gap-3">
          {details.media_type === 'movie' ? (
            <FilmIcon className="w-8 h-8 text-primary-500" />
          ) : (
            <TvIcon className="w-8 h-8 text-primary-500" />
          )}
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{details.name}</h1>
            <p className="text-gray-500 dark:text-dark-400 text-sm">
              {details.service_name} &bull; {details.type}
              {details.active_sessions > 0 && (
                <span className="ml-2 text-green-600 dark:text-green-400">
                  &bull; {details.active_sessions} active session{details.active_sessions !== 1 ? 's' : ''}
                </span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-dark-700">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === tab.id
                  ? 'border-primary-500 text-primary-500'
                  : 'border-transparent text-gray-500 dark:text-dark-400 hover:text-gray-700 dark:hover:text-dark-200 hover:border-gray-300 dark:hover:border-dark-600'
              }`}
            >
              {tab.name}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-dark-800 rounded-xl p-4 border border-gray-200 dark:border-dark-700">
              <div className="flex items-center gap-2 text-gray-500 dark:text-dark-400 text-sm mb-1">
                <FolderIcon className="w-4 h-4" />
                Total Items
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{details.total_items.toLocaleString()}</p>
            </div>
            <div className="bg-white dark:bg-dark-800 rounded-xl p-4 border border-gray-200 dark:border-dark-700">
              <div className="flex items-center gap-2 text-gray-500 dark:text-dark-400 text-sm mb-1">
                <PlayIcon className="w-4 h-4" />
                Total Plays
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{details.total_plays.toLocaleString()}</p>
            </div>
            <div className="bg-white dark:bg-dark-800 rounded-xl p-4 border border-gray-200 dark:border-dark-700">
              <div className="flex items-center gap-2 text-gray-500 dark:text-dark-400 text-sm mb-1">
                Size
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatBytes(details.total_size_bytes)}</p>
            </div>
            <div className="bg-white dark:bg-dark-800 rounded-xl p-4 border border-gray-200 dark:border-dark-700">
              <div className="flex items-center gap-2 text-gray-500 dark:text-dark-400 text-sm mb-1">
                Status
              </div>
              <p className={`text-lg font-bold ${details.is_enabled ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {details.is_enabled ? 'Enabled' : 'Disabled'}
              </p>
            </div>
          </div>

          {/* Time-based Stats */}
          <div className="bg-white dark:bg-dark-800 rounded-xl p-6 border border-gray-200 dark:border-dark-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Activity Summary</h3>
            <div className="grid grid-cols-3 gap-6">
              <div className="text-center">
                <p className="text-gray-500 dark:text-dark-400 text-sm mb-1">Last 24 Hours</p>
                <p className="text-xl font-bold text-primary-600 dark:text-primary-400">{details.stats.plays_24h} plays</p>
                <p className="text-sm text-gray-500 dark:text-dark-400">{formatDuration(details.stats.watch_time_24h)}</p>
              </div>
              <div className="text-center">
                <p className="text-gray-500 dark:text-dark-400 text-sm mb-1">Last 7 Days</p>
                <p className="text-xl font-bold text-primary-600 dark:text-primary-400">{details.stats.plays_7d} plays</p>
                <p className="text-sm text-gray-500 dark:text-dark-400">{formatDuration(details.stats.watch_time_7d)}</p>
              </div>
              <div className="text-center">
                <p className="text-gray-500 dark:text-dark-400 text-sm mb-1">Last 30 Days</p>
                <p className="text-xl font-bold text-primary-600 dark:text-primary-400">{details.stats.plays_30d} plays</p>
                <p className="text-sm text-gray-500 dark:text-dark-400">{formatDuration(details.stats.watch_time_30d)}</p>
              </div>
            </div>
          </div>

          {/* Item Breakdown (for Series) */}
          {details.media_type === 'series' && (
            <div className="bg-white dark:bg-dark-800 rounded-xl p-6 border border-gray-200 dark:border-dark-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Content Breakdown</h3>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{details.item_breakdown.series}</p>
                  <p className="text-gray-500 dark:text-dark-400 text-sm">Series</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{details.item_breakdown.seasons}</p>
                  <p className="text-gray-500 dark:text-dark-400 text-sm">Seasons</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{details.item_breakdown.episodes}</p>
                  <p className="text-gray-500 dark:text-dark-400 text-sm">Episodes</p>
                </div>
              </div>
            </div>
          )}

          {/* Genre Distribution */}
          {genreStats && genreStats.genres.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Radar Chart */}
              <div className="bg-white dark:bg-dark-800 rounded-xl p-6 border border-gray-200 dark:border-dark-700">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Genre Distribution (Last 90 Days)
                </h3>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={genreStats.genres.slice(0, 10)}>
                      <PolarGrid stroke="var(--color-gray-300)" className="dark:opacity-30" />
                      <PolarAngleAxis
                        dataKey="genre"
                        tick={{ fontSize: 11, fill: 'var(--color-gray-500)' }}
                      />
                      <PolarRadiusAxis
                        tick={{ fontSize: 10, fill: 'var(--color-gray-400)' }}
                        axisLine={false}
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
                          const hrs = Math.floor(value / 3600)
                          const mins = Math.floor((value % 3600) / 60)
                          return [hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`, 'Watch Time']
                        }}
                      />
                      <Radar
                        name="plays"
                        dataKey="plays"
                        stroke="var(--color-primary-500)"
                        fill="var(--color-primary-500)"
                        fillOpacity={0.3}
                        strokeWidth={2}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Top Genres Bar Chart */}
              <div className="bg-white dark:bg-dark-800 rounded-xl p-6 border border-gray-200 dark:border-dark-700">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Top Genres by Watch Time
                </h3>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={genreStats.genres.slice(0, 8).map(g => ({
                        genre: g.genre,
                        hours: Math.round(g.duration_seconds / 3600 * 10) / 10
                      }))}
                      layout="vertical"
                      margin={{ left: 60, right: 20, top: 5, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-gray-200)" className="dark:opacity-20" />
                      <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--color-gray-500)' }} />
                      <YAxis
                        type="category"
                        dataKey="genre"
                        tick={{ fontSize: 11, fill: 'var(--color-gray-500)' }}
                        width={55}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'var(--color-dark-800)',
                          border: '1px solid var(--color-dark-700)',
                          borderRadius: '0.5rem',
                          color: '#fff',
                          fontSize: '0.875rem'
                        }}
                        formatter={(value: number) => [`${value}h`, 'Watch Time']}
                      />
                      <Bar dataKey="hours" fill="var(--color-primary-500)" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {/* Recently Watched */}
          {details.recently_watched.length > 0 && (
            <div className="bg-white dark:bg-dark-800 rounded-xl p-6 border border-gray-200 dark:border-dark-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Recently Watched</h3>
              <div className="space-y-3">
                {details.recently_watched.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 bg-gray-50 dark:bg-dark-700/50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      {item.media_type === 'movie' ? (
                        <FilmIcon className="w-5 h-5 text-gray-400 dark:text-dark-400" />
                      ) : (
                        <TvIcon className="w-5 h-5 text-gray-400 dark:text-dark-400" />
                      )}
                      <span className="font-medium text-gray-900 dark:text-white">{item.title}</span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-dark-400">
                      <span>{item.watch_count} plays</span>
                      <span>{formatRelativeTime(item.last_watched_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Library Info */}
          <div className="bg-white dark:bg-dark-800 rounded-xl p-6 border border-gray-200 dark:border-dark-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Library Information</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-dark-400">Path</span>
                <span className="font-mono text-gray-900 dark:text-white">{details.path}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-dark-400">External ID</span>
                <span className="font-mono text-gray-900 dark:text-white">{details.external_id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-dark-400">Last Synced</span>
                <span className="text-gray-900 dark:text-white">{formatDate(details.last_synced_at)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'media' && (
        <div className="space-y-4">
          {/* Search and Sort */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-dark-400" />
              <input
                type="text"
                placeholder="Search media..."
                value={mediaSearch}
                onChange={(e) => {
                  setMediaSearch(e.target.value)
                  setMediaPage(1)
                }}
                className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-dark-800 border border-gray-200 dark:border-dark-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-dark-400 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <select
              value={`${mediaSortBy}-${mediaSortOrder}`}
              onChange={(e) => {
                const [field, order] = e.target.value.split('-')
                setMediaSortBy(field)
                setMediaSortOrder(order)
                setMediaPage(1)
              }}
              className="px-4 py-2 bg-gray-50 dark:bg-dark-800 border border-gray-200 dark:border-dark-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500"
            >
              <option value="title-asc">Title (A-Z)</option>
              <option value="title-desc">Title (Z-A)</option>
              <option value="added_at-desc">Recently Added</option>
              <option value="added_at-asc">Oldest Added</option>
              <option value="last_watched_at-desc">Recently Watched</option>
              <option value="watch_count-desc">Most Watched</option>
              <option value="size_bytes-desc">Largest</option>
              <option value="size_bytes-asc">Smallest</option>
            </select>
            {/* View Toggle */}
            <div className="flex border border-gray-200 dark:border-dark-600 rounded-lg overflow-hidden">
              <button
                onClick={() => setMediaView('table')}
                className={`p-2 transition-colors ${
                  mediaView === 'table'
                    ? 'bg-primary-500 text-white'
                    : 'bg-gray-50 dark:bg-dark-800 text-gray-500 dark:text-dark-400 hover:bg-gray-100 dark:hover:bg-dark-700'
                }`}
                title="Table view"
              >
                <ListBulletIcon className="w-5 h-5" />
              </button>
              <button
                onClick={() => setMediaView('grid')}
                className={`p-2 transition-colors ${
                  mediaView === 'grid'
                    ? 'bg-primary-500 text-white'
                    : 'bg-gray-50 dark:bg-dark-800 text-gray-500 dark:text-dark-400 hover:bg-gray-100 dark:hover:bg-dark-700'
                }`}
                title="Grid view"
              >
                <Squares2X2Icon className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Media Grid View */}
          {mediaView === 'grid' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {(mediaData?.items || []).map((item) => (
                <div
                  key={item.id}
                  className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 overflow-hidden hover:border-primary-500 dark:hover:border-primary-500 transition-colors group"
                >
                  {/* Poster Image */}
                  <div className="aspect-[2/3] bg-gray-100 dark:bg-dark-700 relative overflow-hidden">
                    <img
                      src={`/api/media/${item.id}/image`}
                      alt={item.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement
                        target.style.display = 'none'
                        const parent = target.parentElement
                        if (parent && !parent.querySelector('.fallback-icon')) {
                          const fallback = document.createElement('div')
                          fallback.className = 'fallback-icon absolute inset-0 flex items-center justify-center'
                          fallback.innerHTML = `<svg class="w-12 h-12 text-gray-300 dark:text-dark-500" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125M3.375 19.5h1.5C5.496 19.5 6 18.996 6 18.375m-2.625 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-1.5A1.125 1.125 0 0 1 18 18.375M20.625 4.5H3.375m17.25 0c.621 0 1.125.504 1.125 1.125M20.625 4.5h-1.5C18.504 4.5 18 5.004 18 5.625m3.75 0v1.5c0 .621-.504 1.125-1.125 1.125M3.375 4.5c-.621 0-1.125.504-1.125 1.125M3.375 4.5h1.5C5.496 4.5 6 5.004 6 5.625m-3.75 0v1.5c0 .621.504 1.125 1.125 1.125m0 0h1.5m-1.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m1.5-3.75C5.496 8.25 6 7.746 6 7.125v-1.5M4.875 8.25C5.496 8.25 6 8.754 6 9.375v1.5m0-5.25v5.25m0-5.25C6 5.004 6.504 4.5 7.125 4.5h9.75c.621 0 1.125.504 1.125 1.125m1.125 2.625h1.5m-1.5 0A1.125 1.125 0 0 1 18 7.125v-1.5m1.125 2.625c-.621 0-1.125.504-1.125 1.125v1.5m2.625-2.625c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125M18 5.625v5.25M7.125 12h9.75m-9.75 0A1.125 1.125 0 0 1 6 10.875M7.125 12C6.504 12 6 12.504 6 13.125m0-2.25C6 11.496 5.496 12 4.875 12M18 10.875c0 .621-.504 1.125-1.125 1.125M18 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m-12 5.25v-5.25m0 5.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125m-12 0v-1.5c0-.621-.504-1.125-1.125-1.125M18 18.375v-5.25m0 5.25v-1.5c0-.621.504-1.125 1.125-1.125M18 13.125v1.5c0 .621.504 1.125 1.125 1.125M18 13.125c0-.621.504-1.125 1.125-1.125M6 13.125v1.5c0 .621-.504 1.125-1.125 1.125M6 13.125C6 12.504 5.496 12 4.875 12m-1.5 0h1.5m-1.5 0c-.621 0-1.125-.504-1.125-1.125v-1.5c0-.621.504-1.125 1.125-1.125M19.125 12h1.5m0 0c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-1.5" /></svg>`
                          parent.appendChild(fallback)
                        }
                      }}
                    />
                    {/* Watch count badge */}
                    {item.watch_count > 0 && (
                      <div className="absolute top-2 right-2 bg-primary-500/90 text-white text-xs font-bold px-1.5 py-0.5 rounded-md">
                        {item.watch_count} {item.watch_count === 1 ? 'play' : 'plays'}
                      </div>
                    )}
                  </div>
                  {/* Info */}
                  <div className="p-3">
                    <h4 className="font-medium text-sm text-gray-900 dark:text-white truncate" title={item.title}>
                      {item.title}
                    </h4>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-gray-500 dark:text-dark-400">
                        {item.year || '—'}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-dark-400">
                        {formatBytes(item.size_bytes)}
                      </span>
                    </div>
                    {item.last_watched_at && (
                      <p className="text-xs text-gray-400 dark:text-dark-500 mt-1 truncate">
                        {formatRelativeTime(item.last_watched_at)}
                      </p>
                    )}
                  </div>
                </div>
              ))}
              {(!mediaData?.items || mediaData.items.length === 0) && (
                <div className="col-span-full text-center py-12 text-gray-500 dark:text-dark-400">
                  No media items found
                </div>
              )}
            </div>
          )}

          {/* Media Table View */}
          {mediaView === 'table' && (
          <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 overflow-hidden">
            <ResponsiveTable
              columns={[
                {
                  header: 'Title',
                  accessor: 'title',
                  cell: (item: MediaItem) => (
                    <div className="flex items-center gap-2">
                      {item.media_type === 'movie' ? (
                        <FilmIcon className="w-4 h-4 text-gray-400 dark:text-dark-400 shrink-0" />
                      ) : (
                        <TvIcon className="w-4 h-4 text-gray-400 dark:text-dark-400 shrink-0" />
                      )}
                      <span className="font-medium text-gray-900 dark:text-white">{item.title}</span>
                    </div>
                  )
                },
                {
                  header: 'Year',
                  accessor: 'year',
                  mobileHide: true,
                  cell: (item: MediaItem) => (
                    <span className="text-sm text-gray-500 dark:text-dark-400">{item.year || '-'}</span>
                  )
                },
                {
                  header: 'Size',
                  accessor: 'size_bytes',
                  cell: (item: MediaItem) => (
                    <span className="text-sm text-gray-500 dark:text-dark-400">{formatBytes(item.size_bytes)}</span>
                  )
                },
                {
                  header: 'Plays',
                  accessor: 'watch_count',
                  cell: (item: MediaItem) => (
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{item.watch_count}</span>
                  )
                },
                {
                  header: 'Last Watched',
                  accessor: 'last_watched_at',
                  cell: (item: MediaItem) => (
                    <span className="text-sm text-gray-500 dark:text-dark-400">
                      {formatRelativeTime(item.last_watched_at)}
                    </span>
                  )
                }
              ]}
              data={mediaData?.items || []}
              keyExtractor={(item: MediaItem) => item.id}
              emptyMessage="No media items found"
            />
          </div>
          )}

          {/* Media Pagination */}
          {mediaData && mediaData.total_pages > 1 && (
            <div className="flex justify-center items-center gap-2">
              <button
                onClick={() => setMediaPage(p => Math.max(1, p - 1))}
                disabled={mediaPage === 1}
                className="p-2 rounded-lg bg-gray-100 dark:bg-dark-700 hover:bg-gray-200 dark:hover:bg-dark-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeftIcon className="w-5 h-5 text-gray-600 dark:text-gray-300" />
              </button>
              <span className="text-sm text-gray-500 dark:text-dark-400">
                Page {mediaPage} of {mediaData.total_pages}
              </span>
              <button
                onClick={() => setMediaPage(p => Math.min(mediaData.total_pages, p + 1))}
                disabled={mediaPage === mediaData.total_pages}
                className="p-2 rounded-lg bg-gray-100 dark:bg-dark-700 hover:bg-gray-200 dark:hover:bg-dark-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRightIcon className="w-5 h-5 text-gray-600 dark:text-gray-300" />
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'activity' && (
        <div className="space-y-4">
          {/* Activity Table */}
          <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 overflow-hidden">
            <ResponsiveTable
              columns={[
                {
                  header: '',
                  accessor: '_expand',
                  mobileHide: true,
                  className: 'w-8',
                  cell: (item: ActivityItem) => (
                    expandedActivityRows.has(item.id) ? (
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
                    <span className="font-medium text-gray-900 dark:text-white">{item.media_title}</span>
                  )
                },
                {
                  header: 'User',
                  accessor: 'user_id',
                  cell: (item: ActivityItem) => (
                    <Link
                      to={`/users/${item.user_id}`}
                      className="text-sm text-gray-500 dark:text-dark-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                    >
                      {String(item.user_id).slice(0, 8)}...
                    </Link>
                  )
                },
                {
                  header: 'Client',
                  accessor: 'client_name',
                  mobileHide: true,
                  cell: (item: ActivityItem) => (
                    <span className="text-sm text-gray-500 dark:text-dark-400">
                      {item.client_name || item.device_name || 'Unknown'}
                    </span>
                  )
                },
                {
                  header: 'Played',
                  accessor: 'started_at',
                  cell: (item: ActivityItem) => (
                    <span className="text-sm text-gray-500 dark:text-dark-400">
                      {formatRelativeTime(item.started_at)}
                    </span>
                  )
                },
                {
                  header: 'Duration',
                  accessor: 'duration_seconds',
                  cell: (item: ActivityItem) => (
                    <span className="text-sm text-gray-500 dark:text-dark-400">
                      {formatDuration(item.duration_seconds)}
                      {item.played_percentage > 0 && (
                        <span className="ml-1 text-xs">
                          ({Math.round(item.played_percentage)}%)
                        </span>
                      )}
                    </span>
                  )
                },
                {
                  header: 'Status',
                  accessor: 'is_active',
                  mobileHide: true,
                  cell: (item: ActivityItem) => item.is_active ? (
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-500/20 text-green-600 dark:text-green-400 text-xs rounded-full">
                      <span className="w-1.5 h-1.5 bg-green-500 dark:bg-green-400 rounded-full animate-pulse"></span>
                      Playing
                    </span>
                  ) : (
                    <span className="text-gray-500 dark:text-dark-400 text-sm">
                      {item.is_transcoding ? 'Transcoded' : 'Direct'}
                    </span>
                  )
                }
              ]}
              data={activityData?.items || []}
              keyExtractor={(item: ActivityItem) => item.id}
              onRowClick={(item: ActivityItem) => toggleActivityExpanded(item.id)}
              isExpanded={(item: ActivityItem) => expandedActivityRows.has(item.id)}
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
              emptyMessage="No activity recorded yet"
            />
          </div>

          {/* Activity Pagination */}
          {activityData && activityData.total_pages > 1 && (
            <div className="flex justify-center items-center gap-2">
              <button
                onClick={() => setActivityPage(p => Math.max(1, p - 1))}
                disabled={activityPage === 1}
                className="p-2 rounded-lg bg-gray-100 dark:bg-dark-700 hover:bg-gray-200 dark:hover:bg-dark-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeftIcon className="w-5 h-5 text-gray-600 dark:text-gray-300" />
              </button>
              <span className="text-sm text-gray-500 dark:text-dark-400">
                Page {activityPage} of {activityData.total_pages}
              </span>
              <button
                onClick={() => setActivityPage(p => Math.min(activityData.total_pages, p + 1))}
                disabled={activityPage === activityData.total_pages}
                className="p-2 rounded-lg bg-gray-100 dark:bg-dark-700 hover:bg-gray-200 dark:hover:bg-dark-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRightIcon className="w-5 h-5 text-gray-600 dark:text-gray-300" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
