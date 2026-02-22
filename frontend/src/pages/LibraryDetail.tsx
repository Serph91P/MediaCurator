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
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline'
import api from '../lib/api'
import { formatBytes, formatRelativeTime, formatDuration, formatDate } from '../lib/utils'
import ResponsiveTable from '../components/ResponsiveTable'

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
  play_method: string
  is_transcoding: boolean
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

  // Activity pagination
  const [activityPage, setActivityPage] = useState(1)

  // Fetch library details
  const { data: details, isLoading, error } = useQuery<LibraryDetails>({
    queryKey: ['library-details', libraryId],
    queryFn: async () => {
      const res = await api.get<LibraryDetails>(`/libraries/${libraryId}/details`)
      return res.data
    },
    enabled: !!libraryId,
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
          </div>

          {/* Media Table */}
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
