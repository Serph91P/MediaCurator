import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { 
  FolderIcon, 
  ArrowPathIcon, 
  CheckCircleIcon, 
  XCircleIcon, 
  ArchiveBoxIcon,
  FilmIcon,
  TvIcon,
  PlayIcon,
  ClockIcon,
  ArrowTopRightOnSquareIcon
} from '@heroicons/react/24/outline'
import api from '../lib/api'
import toast from 'react-hot-toast'
import type { Library, ServiceConnection } from '../types'
import { formatRelativeTime, formatBytes } from '../lib/utils'

interface LibrarySyncResponse {
  synced: number
  removed: number
  message: string
}

interface LibraryStagingSettings {
  library_id: number
  library_name: string
  effective_enabled: boolean
  uses_custom_settings: boolean
}

interface LibraryStat {
  id: number
  name: string
  type: string
  media_type: string
  is_enabled: boolean
  service_name: string | null
  total_files: number
  total_size_bytes: number
  total_plays: number
  total_playback_seconds: number
  last_played: string | null
  last_activity_at: string | null
  movies: number
  series: number
  seasons: number
  episodes: number
  path: string | null
  last_synced_at: string | null
}

// Format seconds to human readable time
function formatDuration(seconds: number): string {
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

// Library Card Component
function LibraryCard({ 
  stat, 
  stagingSettings,
  onToggle 
}: { 
  stat: LibraryStat
  stagingSettings?: LibraryStagingSettings
  onToggle: (id: number) => void
}) {
  const isMovie = stat.media_type === 'movie'
  
  return (
    <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 shadow-lg overflow-hidden group relative">
      {/* Header with gradient */}
      <div className={`px-4 py-3 ${isMovie ? 'bg-linear-to-r from-primary-600 to-primary-500' : 'bg-linear-to-r from-green-600 to-green-500'} flex items-center justify-between`}>
        <Link to={`/libraries/${stat.id}`} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          {isMovie ? (
            <FilmIcon className="w-5 h-5 text-white" />
          ) : (
            <TvIcon className="w-5 h-5 text-white" />
          )}
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider">{stat.name}</h3>
          <ArrowTopRightOnSquareIcon className="w-4 h-4 text-white/70 opacity-0 group-hover:opacity-100 transition-opacity" />
        </Link>
        <button
          onClick={() => onToggle(stat.id)}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
            stat.is_enabled ? 'bg-white/30' : 'bg-black/20'
          }`}
          title={stat.is_enabled ? 'Click to disable' : 'Click to enable'}
        >
          <span
            className={`inline-block h-3 w-3 transform rounded-full bg-white shadow-lg transition-transform ${
              stat.is_enabled ? 'translate-x-5' : 'translate-x-1'
            }`}
          />
        </button>
      </div>
      
      {/* Content */}
      <div className="p-4 space-y-3">
        {/* Library Type */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500 dark:text-dark-400">Type</span>
          <span className="font-medium text-gray-900 dark:text-white">{stat.type}</span>
        </div>
        
        {/* Total Files */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500 dark:text-dark-400">Total Files</span>
          <span className="font-bold text-primary-400">{stat.total_files.toLocaleString()}</span>
        </div>
        
        {/* Size */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500 dark:text-dark-400">Library Size</span>
          <span className="font-medium text-gray-900 dark:text-white">{formatBytes(stat.total_size_bytes)}</span>
        </div>
        
        {/* Total Plays */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500 dark:text-dark-400">Total Plays</span>
          <span className="font-bold text-green-400">{stat.total_plays.toLocaleString()}</span>
        </div>
        
        {/* Last Played */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500 dark:text-dark-400">Last Played</span>
          <span className="font-medium text-gray-900 dark:text-white truncate max-w-[60%] text-right" title={stat.last_played || 'N/A'}>
            {stat.last_played || 'N/A'}
          </span>
        </div>
        
        {/* Last Activity */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500 dark:text-dark-400">Last Activity</span>
          <span className="font-medium text-gray-900 dark:text-white">
            {stat.last_activity_at ? formatRelativeTime(stat.last_activity_at) : 'Never'}
          </span>
        </div>
        
        {/* Series specific: Series/Seasons/Episodes breakdown */}
        {!isMovie && (
          <div className="pt-2 border-t border-gray-200 dark:border-dark-700 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500 dark:text-dark-400">Series</span>
              <span className="font-bold text-green-400">{stat.series.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500 dark:text-dark-400">Seasons</span>
              <span className="font-medium text-gray-600 dark:text-dark-300">{stat.seasons.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500 dark:text-dark-400">Episodes</span>
              <span className="font-medium text-gray-600 dark:text-dark-300">{stat.episodes.toLocaleString()}</span>
            </div>
          </div>
        )}
        
        {/* Movies specific */}
        {isMovie && (
          <div className="pt-2 border-t border-gray-200 dark:border-dark-700">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500 dark:text-dark-400">Movies</span>
              <span className="font-bold text-primary-400">{stat.movies.toLocaleString()}</span>
            </div>
          </div>
        )}
        
        {/* Status indicators */}
        <div className="pt-2 border-t border-gray-200 dark:border-dark-700 flex flex-wrap gap-2">
          <span className={`inline-flex items-center gap-1 text-xs ${stat.is_enabled ? 'text-green-500' : 'text-gray-400 dark:text-dark-500'}`}>
            {stat.is_enabled ? <CheckCircleIcon className="w-3.5 h-3.5" /> : <XCircleIcon className="w-3.5 h-3.5" />}
            {stat.is_enabled ? 'Enabled' : 'Disabled'}
          </span>
          {stagingSettings && (
            <span className={`inline-flex items-center gap-1 text-xs ${stagingSettings.effective_enabled ? 'text-yellow-500' : 'text-gray-400 dark:text-dark-500'}`}>
              <ArchiveBoxIcon className="w-3.5 h-3.5" />
              Staging {stagingSettings.effective_enabled ? 'On' : 'Off'}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Libraries() {
  const queryClient = useQueryClient()

  const { data: libraryStats, isLoading } = useQuery({
    queryKey: ['libraryStats'],
    queryFn: async () => {
      const res = await api.get<LibraryStat[]>('/libraries/stats')
      return res.data
    },
  })

  const { data: services } = useQuery({
    queryKey: ['services'],
    queryFn: async () => {
      const res = await api.get<ServiceConnection[]>('/services/')
      return res.data
    },
  })

  const { data: libraryStagingSettings } = useQuery({
    queryKey: ['libraryStagingSettings'],
    queryFn: async () => {
      const res = await api.get<LibraryStagingSettings[]>('/staging/libraries')
      return res.data
    },
  })

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post<LibrarySyncResponse>('/libraries/sync')
      return res.data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['libraryStats'] })
      queryClient.invalidateQueries({ queryKey: ['libraries'] })
      toast.success(data.message)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to sync libraries')
    },
  })

  const toggleMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await api.post(`/libraries/${id}/toggle`)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['libraryStats'] })
      queryClient.invalidateQueries({ queryKey: ['libraries'] })
    },
  })

  // Get staging settings for a library
  const getStagingSettings = (libraryId: number) => {
    return libraryStagingSettings?.find(s => s.library_id === libraryId)
  }

  // Check if there are any Emby/Jellyfin services configured
  const hasMediaServers = services?.some(
    s => s.service_type === 'emby' || s.service_type === 'jellyfin'
  )

  // Calculate totals
  const totals = libraryStats?.reduce((acc, stat) => ({
    files: acc.files + stat.total_files,
    size: acc.size + stat.total_size_bytes,
    plays: acc.plays + stat.total_plays,
    movies: acc.movies + stat.movies,
    series: acc.series + stat.series,
    episodes: acc.episodes + stat.episodes,
  }), { files: 0, size: 0, plays: 0, movies: 0, series: 0, episodes: 0 })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Libraries</h1>
          <p className="text-gray-500 dark:text-dark-400 mt-1">
            Detailed statistics for your media libraries
          </p>
        </div>
        <button
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending || !hasMediaServers}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 focus:outline-2 focus:outline-offset-2 focus:outline-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <ArrowPathIcon className={`w-5 h-5 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
          {syncMutation.isPending ? 'Syncing...' : 'Sync Libraries'}
        </button>
      </div>

      {/* Summary Stats Row */}
      {totals && libraryStats && libraryStats.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 p-4 text-center">
            <div className="text-2xl font-bold text-primary-400">{libraryStats.length}</div>
            <div className="text-sm text-gray-500 dark:text-dark-400">Libraries</div>
          </div>
          <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 p-4 text-center">
            <div className="text-2xl font-bold text-primary-400">{totals.movies.toLocaleString()}</div>
            <div className="text-sm text-gray-500 dark:text-dark-400">Movies</div>
          </div>
          <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 p-4 text-center">
            <div className="text-2xl font-bold text-green-400">{totals.series.toLocaleString()}</div>
            <div className="text-sm text-gray-500 dark:text-dark-400">Series</div>
          </div>
          <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 p-4 text-center">
            <div className="text-2xl font-bold text-green-400">{totals.episodes.toLocaleString()}</div>
            <div className="text-sm text-gray-500 dark:text-dark-400">Episodes</div>
          </div>
          <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 p-4 text-center">
            <div className="text-2xl font-bold text-yellow-400">{totals.plays.toLocaleString()}</div>
            <div className="text-sm text-gray-500 dark:text-dark-400">Total Plays</div>
          </div>
          <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 p-4 text-center">
            <div className="text-2xl font-bold text-gray-900 dark:text-white">{formatBytes(totals.size)}</div>
            <div className="text-sm text-gray-500 dark:text-dark-400">Total Size</div>
          </div>
        </div>
      )}

      {!hasMediaServers && (
        <div className="rounded-xl border border-amber-500/30 shadow-lg bg-amber-500/10">
          <div className="p-6">
            <p className="text-amber-600 dark:text-amber-400">
              No Emby or Jellyfin services configured. Add a media server in the Services section to sync libraries.
            </p>
          </div>
        </div>
      )}

      {/* Library Cards Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 shadow-lg animate-pulse">
              <div className="h-12 bg-gray-200 dark:bg-dark-700 rounded-t-xl" />
              <div className="p-4 space-y-3">
                {[...Array(6)].map((_, j) => (
                  <div key={j} className="h-4 bg-gray-200 dark:bg-dark-700 rounded" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : libraryStats && libraryStats.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {libraryStats.map((stat) => (
            <LibraryCard
              key={stat.id}
              stat={stat}
              stagingSettings={getStagingSettings(stat.id)}
              onToggle={(id) => toggleMutation.mutate(id)}
            />
          ))}
        </div>
      ) : (
        <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 shadow-lg">
          <div className="p-6 text-center py-12">
            <FolderIcon className="w-12 h-12 mx-auto text-gray-400 dark:text-dark-500" />
            <p className="text-gray-500 dark:text-dark-400 mt-4">No libraries synced yet</p>
            <p className="text-sm text-gray-400 dark:text-dark-500 mt-1">
              {hasMediaServers
                ? 'Click "Sync Libraries" to fetch libraries from your media servers'
                : 'Add an Emby or Jellyfin service first, then sync libraries'}
            </p>
            {hasMediaServers && (
              <button
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending}
                className="inline-flex items-center justify-center px-4 py-2 mt-4 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 focus:outline-2 focus:outline-offset-2 focus:outline-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Sync Libraries
              </button>
            )}
          </div>
        </div>
      )}

      {/* Help Section */}
      <div className="bg-gray-50 dark:bg-dark-800/50 rounded-xl border border-gray-200 dark:border-dark-700 shadow-lg">
        <div className="p-6">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-2">How it works</h3>
          <ul className="text-sm text-gray-600 dark:text-dark-400 space-y-2">
            <li className="flex items-start gap-2">
              <span className="text-primary-500">•</span>
              Libraries are automatically discovered from your Emby/Jellyfin servers
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary-500">•</span>
              Toggle libraries on/off to include/exclude them from cleanup rules
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary-500">•</span>
              Statistics are updated on each sync (play counts, sizes, etc.)
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary-500">•</span>
              Only movie and series libraries are synced (music, photos, etc. are ignored)
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}




