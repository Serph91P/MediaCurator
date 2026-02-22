import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { 
  PlayIcon, 
  ExclamationTriangleIcon, 
  TrashIcon,
  EyeIcon,
  CheckCircleIcon,
  ArrowPathIcon,
  FilmIcon,
  TvIcon,
  ChevronDownIcon,
  ChevronRightIcon
} from '@heroicons/react/24/outline'
import api from '../lib/api'
import { formatBytes } from '../lib/utils'
import type { CleanupRule } from '../types'

interface PreviewItem {
  item_id: number
  title: string
  media_type: string
  path: string | null
  size_bytes: number | null
  season_count?: number
  episode_count?: number
  would_delete: boolean
  action: string
  reasons: string[]
  skip_reasons: string[]
  rule_name: string
  rule_id: number
  item_details: {
    is_watched: boolean
    last_watched_at: string | null
    watch_count: number | null
    progress_percent: number | null
    is_currently_watching: boolean
    is_favorited: boolean
    added_at: string | null
    genres: string[]
    tags: string[]
    rating: number | null
    flagged_for_cleanup: boolean
    scheduled_cleanup_at: string | null
  }
}

interface PreviewSummary {
  total_evaluated: number
  would_delete: number
  would_skip: number
  total_size_bytes: number
  rules_evaluated: number
}

interface PreviewResponse {
  summary: PreviewSummary
  items: PreviewItem[]
  error?: string
}

// Grouped series structure
interface GroupedSeries {
  seriesTitle: string
  totalSize: number
  isEntireSeries: boolean  // True when the entire series is marked for deletion
  seasonCount: number  // From backend for "entire series" items
  episodeCount: number  // From backend for "entire series" items
  seasons: Map<number, {
    seasonNumber: number
    episodes: PreviewItem[]
    totalSize: number
  }>
  reasons: string[]
  ruleName: string
}

// Extract series name and season/episode from title like "Series Name - S01E05 - Episode Title"
function parseEpisodeTitle(title: string): { seriesName: string; seasonNumber: number | null; episodeNumber: number | null } {
  // Match patterns like "Series Name - S01E05" or "Series Name - S01E05 - Episode Title"
  const match = title.match(/^(.+?)\s*-\s*S(\d+)E(\d+)/i)
  if (match) {
    return {
      seriesName: match[1].trim(),
      seasonNumber: parseInt(match[2]),
      episodeNumber: parseInt(match[3])
    }
  }
  // Fallback - just return the title as series name
  return { seriesName: title, seasonNumber: null, episodeNumber: null }
}

export default function Preview() {
  const [selectedRuleId, setSelectedRuleId] = useState<number | null>(null)
  const [showSkipped, setShowSkipped] = useState(false)
  const [activeTab, setActiveTab] = useState<'series' | 'movies'>('series')
  const [expandedSeries, setExpandedSeries] = useState<Set<string>>(new Set())

  const { data: rules } = useQuery({
    queryKey: ['rules'],
    queryFn: async () => {
      const res = await api.get<CleanupRule[]>('/rules/')
      return res.data
    },
  })

  const { data: preview, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['preview', selectedRuleId],
    queryFn: async () => {
      const params = selectedRuleId ? `?rule_id=${selectedRuleId}` : ''
      const res = await api.get<PreviewResponse>(`/system/cleanup/preview${params}`)
      return res.data
    },
    enabled: false, // Only fetch when user clicks "Run Preview"
    gcTime: 0, // Don't cache - always fresh data
    staleTime: 0, // Always stale
  })

  // Group and filter items
  const { movies, groupedSeries, seriesCount, moviesCount, seriesTotalSize, moviesTotalSize } = useMemo(() => {
    if (!preview?.items) {
      return { movies: [], groupedSeries: [], seriesCount: 0, moviesCount: 0, seriesTotalSize: 0, moviesTotalSize: 0 }
    }

    const items = showSkipped ? preview.items : preview.items.filter(i => i.would_delete)
    const allItems = preview.items // All items for looking up episodes of a series
    
    // Separate movies and episodes/series
    const movieItems = items.filter(i => i.media_type === 'movie')
    const episodeItems = items.filter(i => i.media_type === 'episode')
    const seriesItems = items.filter(i => i.media_type === 'series')

    // Get all episodes from the full list (for "entire series" lookups)
    const allEpisodes = allItems.filter(i => i.media_type === 'episode')

    // Group episodes by series
    const seriesMap = new Map<string, GroupedSeries>()

    // First add series items (the parent series being deleted = "Entire Series")
    // Backend now provides season_count, episode_count, and total size_bytes for series items
    for (const item of seriesItems) {
      const seriesName = item.title
      if (!seriesMap.has(seriesName)) {
        const seriesEntry: GroupedSeries = {
          seriesTitle: seriesName,
          totalSize: item.size_bytes || 0,  // Backend calculates total from episodes
          isEntireSeries: true,
          seasonCount: item.season_count || 0,
          episodeCount: item.episode_count || 0,
          seasons: new Map(),
          reasons: item.reasons,
          ruleName: item.rule_name
        }
        
        // Still try to find episodes for expandable details (if they're in the response)
        for (const ep of allEpisodes) {
          const { seriesName: epSeriesName, seasonNumber } = parseEpisodeTitle(ep.title)
          if (epSeriesName === seriesName) {
            const season = seasonNumber || 0
            if (!seriesEntry.seasons.has(season)) {
              seriesEntry.seasons.set(season, {
                seasonNumber: season,
                episodes: [],
                totalSize: 0
              })
            }
            
            const seasonData = seriesEntry.seasons.get(season)!
            seasonData.episodes.push(ep)
            seasonData.totalSize += ep.size_bytes || 0
          }
        }
        
        seriesMap.set(seriesName, seriesEntry)
      }
    }

    // Then add episodes (only those not already part of an "entire series")
    for (const item of episodeItems) {
      const { seriesName, seasonNumber } = parseEpisodeTitle(item.title)
      
      // Skip if this series is already marked as "entire series"
      if (seriesMap.has(seriesName) && seriesMap.get(seriesName)!.isEntireSeries) {
        continue
      }
      
      if (!seriesMap.has(seriesName)) {
        seriesMap.set(seriesName, {
          seriesTitle: seriesName,
          totalSize: 0,
          isEntireSeries: false,
          seasonCount: 0,
          episodeCount: 0,
          seasons: new Map(),
          reasons: item.reasons,
          ruleName: item.rule_name
        })
      }
      
      const series = seriesMap.get(seriesName)!
      series.totalSize += item.size_bytes || 0
      
      const season = seasonNumber || 0
      if (!series.seasons.has(season)) {
        series.seasons.set(season, {
          seasonNumber: season,
          episodes: [],
          totalSize: 0
        })
      }
      
      const seasonData = series.seasons.get(season)!
      seasonData.episodes.push(item)
      seasonData.totalSize += item.size_bytes || 0
    }
    
    // Calculate seasonCount and episodeCount for non-entire-series entries
    for (const series of seriesMap.values()) {
      if (!series.isEntireSeries) {
        series.seasonCount = series.seasons.size
        series.episodeCount = Array.from(series.seasons.values()).reduce((sum, s) => sum + s.episodes.length, 0)
      }
    }

    // Sort series by title
    const sortedSeries = Array.from(seriesMap.values()).sort((a, b) => 
      a.seriesTitle.localeCompare(b.seriesTitle)
    )

    // Sort movies by title
    const sortedMovies = movieItems.sort((a, b) => a.title.localeCompare(b.title))

    return {
      movies: sortedMovies,
      groupedSeries: sortedSeries,
      seriesCount: sortedSeries.length,
      moviesCount: sortedMovies.length,
      seriesTotalSize: sortedSeries.reduce((acc, s) => acc + s.totalSize, 0),
      moviesTotalSize: sortedMovies.reduce((acc, m) => acc + (m.size_bytes || 0), 0)
    }
  }, [preview, showSkipped])

  const toggleSeriesExpanded = (seriesTitle: string) => {
    setExpandedSeries(prev => {
      const next = new Set(prev)
      if (next.has(seriesTitle)) {
        next.delete(seriesTitle)
      } else {
        next.add(seriesTitle)
      }
      return next
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Dry Run Preview</h1>
          <p className="text-gray-500 dark:text-dark-400 mt-1">
            Preview what would be cleaned up without actually deleting anything
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 shadow-lg">
        <div className="p-6">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-50">
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-200 mb-1">Rule to Preview</label>
              <select
                className="block w-full px-3 py-2 bg-white dark:bg-dark-800 border border-gray-300 dark:border-dark-600 rounded-lg text-gray-800 dark:text-dark-100 focus:outline-2 focus:outline-primary-500 focus:border-transparent transition-colors"
                value={selectedRuleId ?? ''}
                onChange={(e) => setSelectedRuleId(e.target.value ? parseInt(e.target.value) : null)}
              >
                <option value="">All Enabled Rules</option>
                {rules?.map((rule) => (
                  <option key={rule.id} value={rule.id}>
                    {rule.name} {!rule.is_enabled && '(disabled)'}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 focus:outline-2 focus:outline-offset-2 focus:outline-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors gap-2"
            >
              {isFetching ? (
                <ArrowPathIcon className="w-5 h-5 animate-spin" />
              ) : (
                <PlayIcon className="w-5 h-5" />
              )}
              {isFetching ? 'Running...' : 'Run Preview'}
            </button>
          </div>
        </div>
      </div>

      {/* Results */}
      {isLoading || isFetching ? (
        <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 shadow-lg">
          <div className="p-6 text-center py-12">
            <ArrowPathIcon className="w-8 h-8 mx-auto text-primary-500 animate-spin" />
            <p className="text-gray-500 dark:text-dark-400 mt-4">Evaluating cleanup rules...</p>
          </div>
        </div>
      ) : preview ? (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 shadow-lg">
              <div className="p-6">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 dark:text-dark-400">Total Evaluated</span>
                  <EyeIcon className="w-5 h-5 text-gray-400 dark:text-dark-400" />
                </div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white mt-2">
                  {preview.summary.total_evaluated}
                </p>
              </div>
            </div>
            <div className="bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800/50 shadow-lg">
              <div className="p-6">
                <div className="flex items-center justify-between">
                  <span className="text-red-600 dark:text-red-400">Would Delete</span>
                  <TrashIcon className="w-5 h-5 text-red-600 dark:text-red-400" />
                </div>
                <p className="text-2xl font-bold text-red-600 dark:text-red-400 mt-2">
                  {preview.summary.would_delete}
                </p>
              </div>
            </div>
            <div className="bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800/50 shadow-lg">
              <div className="p-6">
                <div className="flex items-center justify-between">
                  <span className="text-green-600 dark:text-green-400">Would Skip</span>
                  <CheckCircleIcon className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-2">
                  {preview.summary.would_skip}
                </p>
              </div>
            </div>
            <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-xl border border-yellow-200 dark:border-yellow-800/50 shadow-lg">
              <div className="p-6">
                <div className="flex items-center justify-between">
                  <span className="text-yellow-600 dark:text-yellow-400">Space to Free</span>
                  <ExclamationTriangleIcon className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
                </div>
                <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400 mt-2">
                  {formatBytes(preview.summary.total_size_bytes)}
                </p>
              </div>
            </div>
          </div>

          {/* Filter Toggle */}
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={showSkipped}
                onChange={(e) => setShowSkipped(e.target.checked)}
                className="rounded border-gray-300 dark:border-dark-600 bg-white dark:bg-dark-700 text-primary-500"
              />
              <span className="text-sm text-gray-700 dark:text-dark-200">Show skipped items</span>
            </label>
          </div>

          {/* Tabs */}
          <div className="border-b border-gray-200 dark:border-dark-700">
            <nav className="flex gap-4">
              <button
                onClick={() => setActiveTab('series')}
                className={`pb-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2 ${
                  activeTab === 'series'
                    ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                    : 'border-transparent text-gray-500 dark:text-dark-400 hover:text-gray-700 dark:hover:text-dark-300'
                }`}
              >
                <TvIcon className="w-5 h-5" />
                Series ({seriesCount})
                <span className="text-xs text-gray-400 dark:text-dark-500">
                  {formatBytes(seriesTotalSize)}
                </span>
              </button>
              <button
                onClick={() => setActiveTab('movies')}
                className={`pb-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2 ${
                  activeTab === 'movies'
                    ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                    : 'border-transparent text-gray-500 dark:text-dark-400 hover:text-gray-700 dark:hover:text-dark-300'
                }`}
              >
                <FilmIcon className="w-5 h-5" />
                Movies ({moviesCount})
                <span className="text-xs text-gray-400 dark:text-dark-500">
                  {formatBytes(moviesTotalSize)}
                </span>
              </button>
            </nav>
          </div>

          {/* Content */}
          {activeTab === 'series' ? (
            <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 shadow-lg overflow-hidden">
              {groupedSeries.length > 0 ? (
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-dark-700/50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-400 uppercase tracking-wider">
                        Series
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-400 uppercase tracking-wider">
                        Seasons
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-400 uppercase tracking-wider">
                        Size
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-400 uppercase tracking-wider">
                        Rule
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-400 uppercase tracking-wider">
                        Reason
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-dark-700">
                    {groupedSeries.map((series) => (
                      <>
                        <tr 
                          key={series.seriesTitle}
                          className={`hover:bg-gray-50 dark:hover:bg-dark-700/30 ${series.seasons.size > 0 ? 'cursor-pointer' : ''}`}
                          onClick={() => series.seasons.size > 0 && toggleSeriesExpanded(series.seriesTitle)}
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              {series.seasons.size > 0 ? (
                                expandedSeries.has(series.seriesTitle) ? (
                                  <ChevronDownIcon className="w-4 h-4 text-gray-400" />
                                ) : (
                                  <ChevronRightIcon className="w-4 h-4 text-gray-400" />
                                )
                              ) : (
                                <div className="w-4 h-4" /> /* Spacer when no seasons */
                              )}
                              <TvIcon className="w-5 h-5 text-primary-500" />
                              <span className="font-medium text-gray-900 dark:text-white">
                                {series.seriesTitle}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-gray-600 dark:text-dark-300">
                            {series.isEntireSeries ? (
                              <span className="inline-flex items-center gap-1.5 text-red-500 dark:text-red-400 font-medium">
                                Entire Series
                                {(series.seasonCount > 0 || series.seasons.size > 0) && (
                                  <span className="text-gray-400 dark:text-dark-500 font-normal">
                                    ({series.seasonCount || series.seasons.size} seasons, {series.episodeCount || Array.from(series.seasons.values()).reduce((sum, s) => sum + s.episodes.length, 0)} episodes)
                                  </span>
                                )}
                              </span>
                            ) : series.seasons.size > 0 ? (
                              <span>
                                {Array.from(series.seasons.keys())
                                  .sort((a, b) => a - b)
                                  .map(s => s === 0 ? 'Specials' : `S${s.toString().padStart(2, '0')}`)
                                  .join(', ')}
                              </span>
                            ) : (
                              <span className="text-gray-400 dark:text-dark-500">No episodes</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-gray-600 dark:text-dark-300">
                            {formatBytes(series.totalSize)}
                          </td>
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-100 dark:bg-primary-500/20 text-primary-800 dark:text-primary-400">
                              {series.ruleName}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-red-600 dark:text-red-400">
                            {series.reasons[0]}
                          </td>
                        </tr>
                        {/* Expanded season details */}
                        {expandedSeries.has(series.seriesTitle) && series.seasons.size > 0 && (
                          <tr key={`${series.seriesTitle}-details`}>
                            <td colSpan={5} className="px-6 py-3 bg-gray-50 dark:bg-dark-700/20">
                              <div className="ml-8 space-y-2">
                                {Array.from(series.seasons.values())
                                  .sort((a, b) => a.seasonNumber - b.seasonNumber)
                                  .map(season => (
                                    <div key={season.seasonNumber} className="flex items-center justify-between text-sm">
                                      <span className="text-gray-600 dark:text-dark-300">
                                        {season.seasonNumber === 0 ? 'Specials' : `Season ${season.seasonNumber}`}
                                        <span className="text-gray-400 dark:text-dark-500 ml-2">
                                          ({season.episodes.length} episodes)
                                        </span>
                                      </span>
                                      <span className="text-gray-500 dark:text-dark-400">
                                        {formatBytes(season.totalSize)}
                                      </span>
                                    </div>
                                  ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="p-12 text-center">
                  <CheckCircleIcon className="w-12 h-12 mx-auto text-green-500" />
                  <p className="text-gray-500 dark:text-dark-400 mt-4">No series would be deleted</p>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 shadow-lg overflow-hidden">
              {movies.length > 0 ? (
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-dark-700/50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-400 uppercase tracking-wider">
                        Movie
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-400 uppercase tracking-wider">
                        Size
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-400 uppercase tracking-wider">
                        Rule
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-400 uppercase tracking-wider">
                        Reason
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-dark-700">
                    {movies.map((movie) => (
                      <tr key={movie.item_id} className="hover:bg-gray-50 dark:hover:bg-dark-700/30">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <FilmIcon className="w-5 h-5 text-primary-500" />
                            <span className="font-medium text-gray-900 dark:text-white">
                              {movie.title}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-gray-600 dark:text-dark-300">
                          {formatBytes(movie.size_bytes)}
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-100 dark:bg-primary-500/20 text-primary-800 dark:text-primary-400">
                            {movie.rule_name}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-red-600 dark:text-red-400">
                          {movie.reasons[0]}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="p-12 text-center">
                  <CheckCircleIcon className="w-12 h-12 mx-auto text-green-500" />
                  <p className="text-gray-500 dark:text-dark-400 mt-4">No movies would be deleted</p>
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 shadow-lg">
          <div className="p-6 text-center py-12">
            <EyeIcon className="w-12 h-12 mx-auto text-gray-400 dark:text-dark-500" />
            <p className="text-gray-500 dark:text-dark-400 mt-4">
              Click "Run Preview" to see what would be cleaned up
            </p>
            <p className="text-sm text-gray-400 dark:text-dark-500 mt-2">
              This is a safe operation - nothing will be deleted
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
