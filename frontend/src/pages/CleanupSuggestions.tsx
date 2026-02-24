import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  LightBulbIcon,
  TrashIcon,
  FilmIcon,
  TvIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  EyeSlashIcon,
  UsersIcon,
  ClockIcon,
  ServerIcon,
} from '@heroicons/react/24/outline'
import api from '../lib/api'
import { formatBytes } from '../lib/utils'

interface CleanupSuggestion {
  item_id: number
  title: string
  media_type: string
  size_bytes: number
  added_at: string | null
  last_watched_at: string | null
  watch_count: number
  unique_viewers: number
  avg_progress: number
  score: number
  reasons: string[]
}

interface SuggestionSummary {
  total_suggestions: number
  total_reclaimable_bytes: number
  days_analyzed: number
  categories: {
    unwatched: number
    abandoned: number
    low_engagement: number
    stale: number
    storage_hog: number
  }
}

interface SuggestionsResponse {
  suggestions: CleanupSuggestion[]
  summary: SuggestionSummary
}

const categoryInfo: Record<string, { label: string; icon: typeof EyeSlashIcon; color: string; description: string }> = {
  unwatched: {
    label: 'Unwatched',
    icon: EyeSlashIcon,
    color: 'text-gray-400',
    description: 'Never watched by any user',
  },
  abandoned: {
    label: 'Abandoned',
    icon: ExclamationTriangleIcon,
    color: 'text-yellow-400',
    description: 'Started but never finished (avg < 25%)',
  },
  low_engagement: {
    label: 'Low Engagement',
    icon: UsersIcon,
    color: 'text-orange-400',
    description: 'Watched by very few users',
  },
  stale: {
    label: 'Stale',
    icon: ClockIcon,
    color: 'text-blue-400',
    description: 'Fully watched, not rewatched',
  },
  storage_hog: {
    label: 'Storage Hog',
    icon: ServerIcon,
    color: 'text-red-400',
    description: 'Large files with low play counts',
  },
}

export default function CleanupSuggestions() {
  const [days, setDays] = useState(90)
  const [filterCategory, setFilterCategory] = useState<string | null>(null)

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['cleanup-suggestions', days],
    queryFn: async () => {
      const res = await api.get<SuggestionsResponse>(`/media/cleanup-suggestions?days=${days}`)
      return res.data
    },
  })

  const suggestions = data?.suggestions || []
  const summary = data?.summary

  // Filter by category
  const filtered = filterCategory
    ? suggestions.filter(s => {
        const reasonText = s.reasons.join(' ')
        switch (filterCategory) {
          case 'unwatched': return reasonText.includes('Never watched')
          case 'abandoned': return reasonText.includes('Abandoned')
          case 'low_engagement': return reasonText.includes('Low engagement')
          case 'stale': return reasonText.includes('not revisited')
          case 'storage_hog': return reasonText.includes('Large file')
          default: return true
        }
      })
    : suggestions

  const dayOptions = [
    { value: 30, label: '30 days' },
    { value: 60, label: '60 days' },
    { value: 90, label: '90 days' },
    { value: 180, label: '6 months' },
    { value: 365, label: '1 year' },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <LightBulbIcon className="w-7 h-7 text-yellow-400" />
            Cleanup Suggestions
          </h1>
          <p className="text-sm text-gray-500 dark:text-dark-400 mt-1">
            AI-powered suggestions based on watch patterns and content analytics
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-sm text-dark-300">Analyze last</label>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="px-3 py-1.5 bg-dark-800 border border-dark-600 rounded-lg text-sm text-dark-100"
          >
            {dayOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 p-4">
            <div className="text-2xl font-bold text-gray-900 dark:text-white">{summary.total_suggestions}</div>
            <div className="text-sm text-gray-500 dark:text-dark-400">Total Suggestions</div>
          </div>
          <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 p-4">
            <div className="text-2xl font-bold text-primary-400">{formatBytes(summary.total_reclaimable_bytes)}</div>
            <div className="text-sm text-gray-500 dark:text-dark-400">Reclaimable Space</div>
          </div>
          <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 p-4">
            <div className="text-2xl font-bold text-yellow-400">{summary.categories.unwatched + summary.categories.abandoned}</div>
            <div className="text-sm text-gray-500 dark:text-dark-400">Unwatched / Abandoned</div>
          </div>
          <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 p-4">
            <div className="text-2xl font-bold text-red-400">{summary.categories.storage_hog}</div>
            <div className="text-sm text-gray-500 dark:text-dark-400">Storage Hogs</div>
          </div>
        </div>
      )}

      {/* Category Filter Pills */}
      {summary && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFilterCategory(null)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              !filterCategory
                ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
                : 'bg-dark-700 text-dark-300 border border-dark-600 hover:bg-dark-600'
            }`}
          >
            All ({summary.total_suggestions})
          </button>
          {Object.entries(categoryInfo).map(([key, info]) => {
            const count = summary.categories[key as keyof typeof summary.categories] || 0
            if (count === 0) return null
            return (
              <button
                key={key}
                onClick={() => setFilterCategory(filterCategory === key ? null : key)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors flex items-center gap-1.5 ${
                  filterCategory === key
                    ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
                    : 'bg-dark-700 text-dark-300 border border-dark-600 hover:bg-dark-600'
                }`}
              >
                <info.icon className={`w-4 h-4 ${info.color}`} />
                {info.label} ({count})
              </button>
            )
          })}
        </div>
      )}

      {/* Loading */}
      {(isLoading || isFetching) && (
        <div className="flex items-center justify-center py-16">
          <ArrowPathIcon className="w-8 h-8 text-primary-500 animate-spin" />
          <span className="ml-3 text-dark-300">Analyzing watch patterns...</span>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !isFetching && suggestions.length === 0 && (
        <div className="text-center py-16 bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700">
          <LightBulbIcon className="w-12 h-12 text-dark-500 mx-auto mb-3" />
          <p className="text-dark-300 text-lg">No cleanup suggestions</p>
          <p className="text-dark-500 text-sm mt-1">Your library is well-maintained!</p>
        </div>
      )}

      {/* Suggestions List */}
      {!isLoading && filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map((suggestion) => (
            <div
              key={suggestion.item_id}
              className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 p-4 hover:border-dark-500 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="flex-shrink-0 mt-0.5">
                    {suggestion.media_type === 'movie' ? (
                      <FilmIcon className="w-5 h-5 text-primary-400" />
                    ) : (
                      <TvIcon className="w-5 h-5 text-blue-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-gray-900 dark:text-white truncate">
                      {suggestion.title}
                    </h3>
                    <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-dark-400">
                      <span>{formatBytes(suggestion.size_bytes)}</span>
                      <span>•</span>
                      <span>{suggestion.watch_count} plays</span>
                      <span>•</span>
                      <span>{suggestion.unique_viewers} viewer{suggestion.unique_viewers !== 1 ? 's' : ''}</span>
                      {suggestion.avg_progress > 0 && (
                        <>
                          <span>•</span>
                          <span>Avg progress: {suggestion.avg_progress}%</span>
                        </>
                      )}
                      {suggestion.last_watched_at && (
                        <>
                          <span>•</span>
                          <span>Last watched: {new Date(suggestion.last_watched_at).toLocaleDateString()}</span>
                        </>
                      )}
                      {suggestion.added_at && (
                        <>
                          <span>•</span>
                          <span>Added: {new Date(suggestion.added_at).toLocaleDateString()}</span>
                        </>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {suggestion.reasons.map((reason, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-dark-700 text-dark-300 border border-dark-600"
                        >
                          {reason}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 ml-4 flex-shrink-0">
                  <div className="text-right">
                    <div className={`text-sm font-bold ${
                      suggestion.score >= 40 ? 'text-red-400' :
                      suggestion.score >= 25 ? 'text-yellow-400' :
                      'text-dark-300'
                    }`}>
                      Score: {suggestion.score}
                    </div>
                    <div className="text-xs text-dark-500">cleanup priority</div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Info box */}
      <div className="bg-dark-800/50 rounded-xl border border-dark-700 p-4 text-sm text-dark-400">
        <h4 className="font-medium text-dark-200 mb-2">How suggestions work</h4>
        <ul className="space-y-1 list-disc list-inside">
          <li><strong className="text-dark-300">Unwatched</strong> — Content nobody has ever played, sitting idle for the analyzed period</li>
          <li><strong className="text-dark-300">Abandoned</strong> — Started by users but average watch progress is below 25%</li>
          <li><strong className="text-dark-300">Low Engagement</strong> — Only watched by 1 or fewer users on a multi-user server</li>
          <li><strong className="text-dark-300">Stale</strong> — Fully watched content that hasn't been revisited</li>
          <li><strong className="text-dark-300">Storage Hog</strong> — Files larger than 5 GB with minimal play counts</li>
        </ul>
        <p className="mt-2 text-dark-500">
          Suggestions are ranked by a composite score. Higher scores indicate stronger cleanup candidates. 
          Use these insights to create or refine your cleanup rules.
        </p>
      </div>
    </div>
  )
}
