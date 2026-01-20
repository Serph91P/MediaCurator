import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline'
import api from '../lib/api'
import toast from 'react-hot-toast'
import type { CleanupRule, CleanupRuleCreate, MediaType, RuleActionType, RuleTemplate } from '../types'

const mediaTypes: { value: MediaType; label: string }[] = [
  { value: 'movie', label: 'Movies' },
  { value: 'series', label: 'Series' },
  { value: 'episode', label: 'Episodes' },
]

const actionTypes: { value: RuleActionType; label: string }[] = [
  { value: 'delete', label: 'Delete' },
  { value: 'unmonitor', label: 'Unmonitor' },
  { value: 'notify_only', label: 'Notify Only' },
]

export default function Rules() {
  const queryClient = useQueryClient()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<RuleTemplate | null>(null)

  const { data: rules, isLoading } = useQuery({
    queryKey: ['rules'],
    queryFn: async () => {
      const res = await api.get<CleanupRule[]>('/rules/')
      return res.data
    },
  })

  const { data: templates } = useQuery({
    queryKey: ['ruleTemplates'],
    queryFn: async () => {
      const res = await api.get<RuleTemplate[]>('/rules/templates/default')
      return res.data
    },
  })

  const createMutation = useMutation({
    mutationFn: async (data: CleanupRuleCreate) => {
      const res = await api.post('/rules/', data)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rules'] })
      setIsModalOpen(false)
      setSelectedTemplate(null)
      toast.success('Rule created')
    },
    onError: () => toast.error('Failed to create rule'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/rules/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rules'] })
      toast.success('Rule deleted')
    },
  })

  const toggleMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await api.post(`/rules/${id}/toggle`)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rules'] })
    },
  })

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white">Cleanup Rules</h1>
          <p className="text-dark-400 mt-1">Define when and how media should be cleaned up</p>
        </div>
        <button onClick={() => setIsModalOpen(true)} className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 focus:outline-2 focus:outline-offset-2 focus:outline-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2">
          <PlusIcon className="w-5 h-5" />
          Add Rule
        </button>
      </div>

      {/* Templates */}
      {templates && templates.length > 0 && (
        <div className="bg-dark-800 rounded-xl border border-dark-700 shadow-lg">
          <div className="px-6 py-4 border-b border-dark-700">
            <h2 className="text-lg font-semibold text-white">Quick Start Templates</h2>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {templates.map((template, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setSelectedTemplate(template)
                    setIsModalOpen(true)
                  }}
                  className="p-4 bg-dark-700/50 rounded-lg text-left hover:bg-dark-700 transition-colors"
                >
                  <h3 className="font-medium text-white">{template.name}</h3>
                  <p className="text-sm text-dark-400 mt-1">{template.description}</p>
                  <div className="flex gap-2 mt-2">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-500/20 text-primary-400">{template.media_type}</span>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-500/20 text-yellow-400">{template.action}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Rules List */}
      {isLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-dark-800 rounded-xl border border-dark-700 shadow-lg animate-pulse">
              <div className="p-6 h-24" />
            </div>
          ))}
        </div>
      ) : rules && rules.length > 0 ? (
        <div className="space-y-4">
          {rules.map((rule) => (
            <div key={rule.id} className="bg-dark-800 rounded-xl border border-dark-700 shadow-lg">
              <div className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => toggleMutation.mutate(rule.id)}
                        className={`w-12 h-6 rounded-full transition-colors ${
                          rule.is_enabled ? 'bg-primary-600' : 'bg-dark-600'
                        }`}
                      >
                        <div
                          className={`w-5 h-5 bg-white rounded-full transition-transform ${
                            rule.is_enabled ? 'translate-x-6' : 'translate-x-0.5'
                          }`}
                        />
                      </button>
                      <h3 className="font-semibold text-white">{rule.name}</h3>
                    </div>
                    {rule.description && (
                      <p className="text-sm text-dark-400 mt-2">{rule.description}</p>
                    )}
                    <div className="flex flex-wrap gap-2 mt-3">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-500/20 text-primary-400">{rule.media_type}</span>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-500/20 text-yellow-400">{rule.action}</span>
                      <span className="badge bg-dark-600 text-dark-300">
                        Priority: {rule.priority}
                      </span>
                      <span className="badge bg-dark-600 text-dark-300">
                        Grace: {rule.grace_period_days} days
                      </span>
                    </div>
                    {/* Conditions summary */}
                    <div className="mt-3 text-sm text-dark-400">
                      {rule.conditions.not_watched_days && (
                        <span className="mr-3">• Not watched: {rule.conditions.not_watched_days} days</span>
                      )}
                      {rule.conditions.disk_space_threshold_percent && (
                        <span className="mr-3">• Disk threshold: {rule.conditions.disk_space_threshold_percent}%</span>
                      )}
                      {rule.conditions.exclude_favorited && (
                        <span className="mr-3">• Excludes favorites</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => deleteMutation.mutate(rule.id)}
                      className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium bg-transparent text-dark-300 rounded-lg hover:bg-dark-800 hover:text-dark-100 focus:outline-2 focus:outline-offset-2 focus:outline-dark-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-red-400 hover:text-red-300"
                    >
                      <TrashIcon className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-dark-800 rounded-xl border border-dark-700 shadow-lg">
          <div className="p-6 text-center py-12">
            <p className="text-dark-400">No cleanup rules configured</p>
            <p className="text-sm text-dark-500 mt-1">
              Create rules to automatically clean up your media library
            </p>
          </div>
        </div>
      )}

      {/* Add Rule Modal */}
      {isModalOpen && (
        <RuleModal
          onClose={() => {
            setIsModalOpen(false)
            setSelectedTemplate(null)
          }}
          onSubmit={(data) => createMutation.mutate(data)}
          isLoading={createMutation.isPending}
          template={selectedTemplate}
        />
      )}
    </div>
  )
}

function RuleModal({
  onClose,
  onSubmit,
  isLoading,
  template,
}: {
  onClose: () => void
  onSubmit: (data: CleanupRuleCreate) => void
  isLoading: boolean
  template?: RuleTemplate | null
}) {
  const [formData, setFormData] = useState<CleanupRuleCreate>({
    name: template?.name || '',
    description: template?.description || '',
    is_enabled: true,
    priority: 0,
    media_type: template?.media_type || 'movie',
    conditions: {
      disk_space_threshold_percent: template?.conditions?.disk_space_threshold_percent || null,
      not_watched_days: template?.conditions?.not_watched_days || 180,
      min_age_days: template?.conditions?.min_age_days || 30,
      exclude_favorited: template?.conditions?.exclude_favorited ?? true,
      exclude_currently_watching: template?.conditions?.exclude_currently_watching ?? true,
      series_delete_mode: 'episode',
      exclude_genres: [],
      exclude_tags: [],
      include_tags: [],
      rating_below: null,
      max_items_per_run: null,
    },
    action: template?.action || 'delete',
    grace_period_days: template?.grace_period_days || 7,
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(formData)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 overflow-y-auto">
      <div className="bg-dark-800 rounded-xl border border-dark-700 shadow-lg w-full max-w-2xl mx-4 my-8">
        <div className="px-6 py-4 border-b border-dark-700">
          <h2 className="text-lg font-semibold text-white">
            {template ? `Create Rule from Template` : 'Create Cleanup Rule'}
          </h2>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-6 max-h-[60vh] overflow-y-auto">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-dark-200 mb-1">Rule Name</label>
                <input
                  type="text"
                  className="block w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-dark-100 placeholder-dark-400 focus:outline-2 focus:outline-primary-500 focus:border-transparent transition-colors"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Delete old unwatched movies"
                  required
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-dark-200 mb-1">Description</label>
                <textarea
                  className="block w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-dark-100 placeholder-dark-400 focus:outline-2 focus:outline-primary-500 focus:border-transparent transition-colors"
                  value={formData.description || ''}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Describe what this rule does..."
                  rows={2}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-dark-200 mb-1">Media Type</label>
                <select
                  className="block w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-dark-100 placeholder-dark-400 focus:outline-2 focus:outline-primary-500 focus:border-transparent transition-colors"
                  value={formData.media_type}
                  onChange={(e) => setFormData({ ...formData, media_type: e.target.value as MediaType })}
                >
                  {mediaTypes.map((type) => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-dark-200 mb-1">Action</label>
                <select
                  className="block w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-dark-100 placeholder-dark-400 focus:outline-2 focus:outline-primary-500 focus:border-transparent transition-colors"
                  value={formData.action}
                  onChange={(e) => setFormData({ ...formData, action: e.target.value as RuleActionType })}
                >
                  {actionTypes.map((type) => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Conditions */}
            <div className="border-t border-dark-700 pt-6">
              <h3 className="font-medium text-white mb-4">Conditions</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-dark-200 mb-1">Not Watched (days)</label>
                  <input
                    type="number"
                    className="block w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-dark-100 placeholder-dark-400 focus:outline-2 focus:outline-primary-500 focus:border-transparent transition-colors"
                    value={formData.conditions.not_watched_days || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      conditions: {
                        ...formData.conditions,
                        not_watched_days: e.target.value ? parseInt(e.target.value) : null
                      }
                    })}
                    placeholder="180"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-dark-200 mb-1">Disk Space Threshold (%)</label>
                  <input
                    type="number"
                    className="block w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-dark-100 placeholder-dark-400 focus:outline-2 focus:outline-primary-500 focus:border-transparent transition-colors"
                    value={formData.conditions.disk_space_threshold_percent || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      conditions: {
                        ...formData.conditions,
                        disk_space_threshold_percent: e.target.value ? parseInt(e.target.value) : null
                      }
                    })}
                    placeholder="90"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-dark-200 mb-1">Minimum Age (days)</label>
                  <input
                    type="number"
                    className="block w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-dark-100 placeholder-dark-400 focus:outline-2 focus:outline-primary-500 focus:border-transparent transition-colors"
                    value={formData.conditions.min_age_days || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      conditions: {
                        ...formData.conditions,
                        min_age_days: e.target.value ? parseInt(e.target.value) : null
                      }
                    })}
                    placeholder="30"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-dark-200 mb-1">Grace Period (days)</label>
                  <input
                    type="number"
                    className="block w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-dark-100 placeholder-dark-400 focus:outline-2 focus:outline-primary-500 focus:border-transparent transition-colors"
                    value={formData.grace_period_days}
                    onChange={(e) => setFormData({
                      ...formData,
                      grace_period_days: parseInt(e.target.value) || 0
                    })}
                    placeholder="7"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-dark-200 mb-1">Rating Below (delete if below)</label>
                  <input
                    type="number"
                    step="0.1"
                    className="block w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-dark-100 placeholder-dark-400 focus:outline-2 focus:outline-primary-500 focus:border-transparent transition-colors"
                    value={formData.conditions.rating_below || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      conditions: {
                        ...formData.conditions,
                        rating_below: e.target.value ? parseFloat(e.target.value) : null
                      }
                    })}
                    placeholder="5.0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-dark-200 mb-1">Watch Progress Below (%)</label>
                  <input
                    type="number"
                    className="block w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-dark-100 placeholder-dark-400 focus:outline-2 focus:outline-primary-500 focus:border-transparent transition-colors"
                    value={formData.conditions.watched_progress_below || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      conditions: {
                        ...formData.conditions,
                        watched_progress_below: e.target.value ? parseInt(e.target.value) : null
                      }
                    })}
                    placeholder="Only delete if progress is below this %"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-dark-200 mb-1">Exclude Recently Added (days)</label>
                  <input
                    type="number"
                    className="block w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-dark-100 placeholder-dark-400 focus:outline-2 focus:outline-primary-500 focus:border-transparent transition-colors"
                    value={formData.conditions.exclude_recently_added_days || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      conditions: {
                        ...formData.conditions,
                        exclude_recently_added_days: e.target.value ? parseInt(e.target.value) : null
                      }
                    })}
                    placeholder="30"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-dark-200 mb-1">Max Items Per Run</label>
                  <input
                    type="number"
                    className="block w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-dark-100 placeholder-dark-400 focus:outline-2 focus:outline-primary-500 focus:border-transparent transition-colors"
                    value={formData.conditions.max_items_per_run || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      conditions: {
                        ...formData.conditions,
                        max_items_per_run: e.target.value ? parseInt(e.target.value) : null
                      }
                    })}
                    placeholder="Unlimited"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-dark-200 mb-1">Exclude Genres (comma separated)</label>
                  <input
                    type="text"
                    className="block w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-dark-100 placeholder-dark-400 focus:outline-2 focus:outline-primary-500 focus:border-transparent transition-colors"
                    value={(formData.conditions.exclude_genres || []).join(', ')}
                    onChange={(e) => setFormData({
                      ...formData,
                      conditions: {
                        ...formData.conditions,
                        exclude_genres: e.target.value ? e.target.value.split(',').map(g => g.trim()).filter(Boolean) : []
                      }
                    })}
                    placeholder="Documentary, Animation"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-dark-200 mb-1">Exclude Tags (comma separated)</label>
                  <input
                    type="text"
                    className="block w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-dark-100 placeholder-dark-400 focus:outline-2 focus:outline-primary-500 focus:border-transparent transition-colors"
                    value={(formData.conditions.exclude_tags || []).join(', ')}
                    onChange={(e) => setFormData({
                      ...formData,
                      conditions: {
                        ...formData.conditions,
                        exclude_tags: e.target.value ? e.target.value.split(',').map(t => t.trim()).filter(Boolean) : []
                      }
                    })}
                    placeholder="keep, important"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-dark-200 mb-1">Include Only Tags (comma separated, leave empty for all)</label>
                  <input
                    type="text"
                    className="block w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-dark-100 placeholder-dark-400 focus:outline-2 focus:outline-primary-500 focus:border-transparent transition-colors"
                    value={(formData.conditions.include_tags || []).join(', ')}
                    onChange={(e) => setFormData({
                      ...formData,
                      conditions: {
                        ...formData.conditions,
                        include_tags: e.target.value ? e.target.value.split(',').map(t => t.trim()).filter(Boolean) : []
                      }
                    })}
                    placeholder="cleanup-eligible"
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-4 mt-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.conditions.exclude_favorited}
                    onChange={(e) => setFormData({
                      ...formData,
                      conditions: { ...formData.conditions, exclude_favorited: e.target.checked }
                    })}
                    className="rounded border-dark-600 bg-dark-700 text-primary-500"
                  />
                  <span className="text-sm text-dark-200">Exclude Favorites</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.conditions.exclude_currently_watching}
                    onChange={(e) => setFormData({
                      ...formData,
                      conditions: { ...formData.conditions, exclude_currently_watching: e.target.checked }
                    })}
                    className="rounded border-dark-600 bg-dark-700 text-primary-500"
                  />
                  <span className="text-sm text-dark-200">Exclude Currently Watching</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.conditions.exclude_in_progress ?? true}
                    onChange={(e) => setFormData({
                      ...formData,
                      conditions: { ...formData.conditions, exclude_in_progress: e.target.checked }
                    })}
                    className="rounded border-dark-600 bg-dark-700 text-primary-500"
                  />
                  <span className="text-sm text-dark-200">Exclude In Progress</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.conditions.add_import_exclusion ?? true}
                    onChange={(e) => setFormData({
                      ...formData,
                      conditions: { ...formData.conditions, add_import_exclusion: e.target.checked }
                    })}
                    className="rounded border-dark-600 bg-dark-700 text-primary-500"
                  />
                  <span className="text-sm text-dark-200">Add to Import Exclusion on Delete</span>
                </label>
              </div>
            </div>
          </div>

          <div className="px-6 py-4 border-t border-dark-700 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium bg-dark-700 text-dark-100 rounded-lg hover:bg-dark-600 focus:outline-2 focus:outline-offset-2 focus:outline-dark-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={isLoading} className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 focus:outline-2 focus:outline-offset-2 focus:outline-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {isLoading ? 'Creating...' : 'Create Rule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
