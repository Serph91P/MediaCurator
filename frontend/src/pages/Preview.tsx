import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { 
  PlayIcon, 
  ExclamationTriangleIcon, 
  TrashIcon,
  EyeIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowPathIcon,
  FilmIcon,
  TvIcon,
  DocumentTextIcon
} from '@heroicons/react/24/outline'
import api from '../lib/api'
import type { CleanupRule } from '../types'

interface PreviewItem {
  item_id: number
  title: string
  media_type: string
  path: string | null
  size_bytes: number | null
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

function formatBytes(bytes: number | null): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let unitIndex = 0
  let size = bytes
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`
}

function MediaTypeIcon({ type }: { type: string }) {
  switch (type) {
    case 'movie':
      return <FilmIcon className="w-5 h-5" />
    case 'series':
    case 'episode':
      return <TvIcon className="w-5 h-5" />
    default:
      return <DocumentTextIcon className="w-5 h-5" />
  }
}

export default function Preview() {
  const [selectedRuleId, setSelectedRuleId] = useState<number | null>(null)
  const [showSkipped, setShowSkipped] = useState(true)
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set())

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
  })

  const toggleExpanded = (id: number) => {
    setExpandedItems(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const wouldDeleteItems = preview?.items.filter(i => i.would_delete) || []
  const displayedItems = showSkipped ? preview?.items : wouldDeleteItems

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-white">Dry Run Preview</h1>
          <p className="text-dark-400 mt-1">
            Preview what would be cleaned up without actually deleting anything
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-dark-800 rounded-xl border border-dark-700 shadow-lg">
        <div className="p-6">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-dark-200 mb-1">Rule to Preview</label>
              <select
                className="block w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-dark-100 placeholder-dark-400 focus:outline-2 focus:outline-primary-500 focus:border-transparent transition-colors"
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
              className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 focus:outline-2 focus:outline-offset-2 focus:outline-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
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
        <div className="bg-dark-800 rounded-xl border border-dark-700 shadow-lg">
          <div className="p-6 text-center py-12">
            <ArrowPathIcon className="w-8 h-8 mx-auto text-primary-500 animate-spin" />
            <p className="text-dark-400 mt-4">Evaluating cleanup rules...</p>
          </div>
        </div>
      ) : preview ? (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-dark-800 rounded-xl border border-dark-700 shadow-lg">
              <div className="p-6">
                <div className="flex items-center justify-between">
                  <span className="text-dark-400">Total Evaluated</span>
                  <EyeIcon className="w-5 h-5 text-dark-400" />
                </div>
                <p className="text-2xl font-bold text-white mt-2">
                  {preview.summary.total_evaluated}
                </p>
              </div>
            </div>
            <div className="bg-dark-800 rounded-xl border border-dark-700 shadow-lg bg-red-900/20 border-red-800/50">
              <div className="p-6">
                <div className="flex items-center justify-between">
                  <span className="text-red-400">Would Delete</span>
                  <TrashIcon className="w-5 h-5 text-red-400" />
                </div>
                <p className="text-2xl font-bold text-red-400 mt-2">
                  {preview.summary.would_delete}
                </p>
              </div>
            </div>
            <div className="bg-dark-800 rounded-xl border border-dark-700 shadow-lg bg-green-900/20 border-green-800/50">
              <div className="p-6">
                <div className="flex items-center justify-between">
                  <span className="text-green-400">Would Skip</span>
                  <CheckCircleIcon className="w-5 h-5 text-green-400" />
                </div>
                <p className="text-2xl font-bold text-green-400 mt-2">
                  {preview.summary.would_skip}
                </p>
              </div>
            </div>
            <div className="bg-dark-800 rounded-xl border border-dark-700 shadow-lg bg-yellow-900/20 border-yellow-800/50">
              <div className="p-6">
                <div className="flex items-center justify-between">
                  <span className="text-yellow-400">Space to Free</span>
                  <ExclamationTriangleIcon className="w-5 h-5 text-yellow-400" />
                </div>
                <p className="text-2xl font-bold text-yellow-400 mt-2">
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
                className="rounded border-dark-600 bg-dark-700 text-primary-500"
              />
              <span className="text-sm text-dark-200">Show skipped items</span>
            </label>
            <span className="text-dark-500">
              Showing {displayedItems?.length || 0} items
            </span>
          </div>

          {/* Items List */}
          {displayedItems && displayedItems.length > 0 ? (
            <div className="space-y-3">
              {displayedItems.map((item) => (
                <div
                  key={`${item.item_id}-${item.rule_id}`}
                  className={`card transition-all ${
                    item.would_delete 
                      ? 'border-red-800/50 bg-red-900/10' 
                      : 'border-green-800/30 bg-green-900/5'
                  }`}
                >
                  <div className="p-6">
                    <div className="flex items-start gap-4">
                      {/* Status Icon */}
                      <div className={`p-2 rounded-lg ${
                        item.would_delete ? 'bg-red-900/30' : 'bg-green-900/30'
                      }`}>
                        {item.would_delete ? (
                          <XCircleIcon className="w-6 h-6 text-red-400" />
                        ) : (
                          <CheckCircleIcon className="w-6 h-6 text-green-400" />
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <MediaTypeIcon type={item.media_type} />
                          <h3 className="font-medium text-white truncate">
                            {item.title}
                          </h3>
                        </div>
                        
                        <div className="flex flex-wrap gap-2 mt-2">
                          <span className={`badge ${
                            item.would_delete ? 'bg-red-900/50 text-red-300' : 'bg-green-900/50 text-green-300'
                          }`}>
                            {item.would_delete ? `Would ${item.action}` : 'Would keep'}
                          </span>
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-500/20 text-primary-400">{item.media_type}</span>
                          <span className="badge bg-dark-600 text-dark-300">
                            Rule: {item.rule_name}
                          </span>
                          {item.size_bytes && (
                            <span className="badge bg-dark-600 text-dark-300">
                              {formatBytes(item.size_bytes)}
                            </span>
                          )}
                        </div>

                        {/* Reasons */}
                        <div className="mt-3 space-y-1">
                          {item.would_delete ? (
                            item.reasons.map((reason, i) => (
                              <p key={i} className="text-sm text-red-300">
                                • {reason}
                              </p>
                            ))
                          ) : (
                            item.skip_reasons.map((reason, i) => (
                              <p key={i} className="text-sm text-green-300">
                                • {reason}
                              </p>
                            ))
                          )}
                        </div>

                        {/* Expandable Details */}
                        <button
                          onClick={() => toggleExpanded(item.item_id)}
                          className="text-sm text-primary-400 hover:text-primary-300 mt-3"
                        >
                          {expandedItems.has(item.item_id) ? 'Hide details' : 'Show details'}
                        </button>

                        {expandedItems.has(item.item_id) && (
                          <div className="mt-3 p-3 bg-dark-800/50 rounded-lg text-sm">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                              <div>
                                <span className="text-dark-400">Watched:</span>
                                <span className="ml-2 text-white">
                                  {item.item_details.is_watched ? 'Yes' : 'No'}
                                </span>
                              </div>
                              <div>
                                <span className="text-dark-400">Progress:</span>
                                <span className="ml-2 text-white">
                                  {item.item_details.progress_percent?.toFixed(0) || 0}%
                                </span>
                              </div>
                              <div>
                                <span className="text-dark-400">Watch Count:</span>
                                <span className="ml-2 text-white">
                                  {item.item_details.watch_count || 0}
                                </span>
                              </div>
                              <div>
                                <span className="text-dark-400">Favorited:</span>
                                <span className="ml-2 text-white">
                                  {item.item_details.is_favorited ? 'Yes' : 'No'}
                                </span>
                              </div>
                              <div>
                                <span className="text-dark-400">Rating:</span>
                                <span className="ml-2 text-white">
                                  {item.item_details.rating || 'N/A'}
                                </span>
                              </div>
                              <div>
                                <span className="text-dark-400">Currently Watching:</span>
                                <span className="ml-2 text-white">
                                  {item.item_details.is_currently_watching ? 'Yes' : 'No'}
                                </span>
                              </div>
                              <div>
                                <span className="text-dark-400">Last Watched:</span>
                                <span className="ml-2 text-white">
                                  {item.item_details.last_watched_at 
                                    ? new Date(item.item_details.last_watched_at).toLocaleDateString()
                                    : 'Never'}
                                </span>
                              </div>
                              <div>
                                <span className="text-dark-400">Added:</span>
                                <span className="ml-2 text-white">
                                  {item.item_details.added_at 
                                    ? new Date(item.item_details.added_at).toLocaleDateString()
                                    : 'Unknown'}
                                </span>
                              </div>
                            </div>
                            {item.path && (
                              <div className="mt-3 pt-3 border-t border-dark-700">
                                <span className="text-dark-400">Path:</span>
                                <span className="ml-2 text-dark-300 break-all">{item.path}</span>
                              </div>
                            )}
                            {item.item_details.genres.length > 0 && (
                              <div className="mt-2">
                                <span className="text-dark-400">Genres:</span>
                                <span className="ml-2 text-dark-300">
                                  {item.item_details.genres.join(', ')}
                                </span>
                              </div>
                            )}
                            {item.item_details.tags.length > 0 && (
                              <div className="mt-2">
                                <span className="text-dark-400">Tags:</span>
                                <span className="ml-2 text-dark-300">
                                  {item.item_details.tags.join(', ')}
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-dark-800 rounded-xl border border-dark-700 shadow-lg">
              <div className="p-6 text-center py-12">
                <CheckCircleIcon className="w-12 h-12 mx-auto text-green-500" />
                <p className="text-dark-400 mt-4">
                  {showSkipped 
                    ? 'No items matched the cleanup rules'
                    : 'No items would be deleted'}
                </p>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="bg-dark-800 rounded-xl border border-dark-700 shadow-lg">
          <div className="p-6 text-center py-12">
            <EyeIcon className="w-12 h-12 mx-auto text-dark-500" />
            <p className="text-dark-400 mt-4">
              Click "Run Preview" to see what would be cleaned up
            </p>
            <p className="text-sm text-dark-500 mt-2">
              This is a safe operation - nothing will be deleted
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
