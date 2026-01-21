import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { PlusIcon, TrashIcon, ArrowDownTrayIcon, ArrowUpTrayIcon } from '@heroicons/react/24/outline'
import api from '../lib/api'
import toast from 'react-hot-toast'
import ConfirmDialog from '../components/ConfirmDialog'
import type { CleanupRule, CleanupRuleCreate, MediaType, RuleActionType, RuleTemplate, SeriesOptionsResponse } from '../types'

const mediaTypes: { value: MediaType; label: string }[] = [
  { value: 'movie', label: 'Movies' },
  { value: 'series', label: 'Series' },
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
  const [ruleToDelete, setRuleToDelete] = useState<CleanupRule | null>(null)
  const [selectedRules, setSelectedRules] = useState<Set<number>>(new Set())
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  const bulkMutation = useMutation({
    mutationFn: async ({ action, ruleIds }: { action: 'enable' | 'disable' | 'delete'; ruleIds: number[] }) => {
      const res = await api.post('/rules/bulk-action', {
        rule_ids: ruleIds,
        action
      })
      return res.data
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['rules'] })
      setSelectedRules(new Set())
      const actionLabel = variables.action === 'delete' ? 'deleted' : 
                         variables.action === 'enable' ? 'enabled' : 'disabled'
      toast.success(`${data.success_count} rules ${actionLabel}`)
      if (data.failed_count > 0) {
        toast.error(`${data.failed_count} rules failed`)
      }
    },
    onError: () => toast.error('Bulk operation failed'),
  })

  const toggleSelectRule = (id: number) => {
    setSelectedRules(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const toggleSelectAll = () => {
    if (!rules) return
    if (selectedRules.size === rules.length) {
      setSelectedRules(new Set())
    } else {
      setSelectedRules(new Set(rules.map(r => r.id)))
    }
  }

  const handleExport = async () => {
    try {
      const res = await api.get('/rules/export/all')
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'mediacurator-rules.json'
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Rules exported successfully')
    } catch {
      toast.error('Failed to export rules')
    }
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await api.post('/rules/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      const result = res.data
      queryClient.invalidateQueries({ queryKey: ['rules'] })
      toast.success(`Imported ${result.imported} rules (${result.skipped} skipped)`)
      if (result.errors?.length > 0) {
        toast.error(`${result.errors.length} errors occurred`)
      }
    } catch {
      toast.error('Failed to import rules')
    }
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Cleanup Rules</h1>
          <p className="text-gray-500 dark:text-dark-400 mt-1">Define when and how media should be cleaned up</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            className="inline-flex items-center justify-center px-3 py-2 text-sm font-medium bg-gray-200 dark:bg-dark-700 text-gray-800 dark:text-dark-100 rounded-lg hover:bg-gray-300 dark:hover:bg-dark-600 transition-colors"
            title="Export Rules"
          >
            <ArrowDownTrayIcon className="w-5 h-5" />
          </button>
          <label className="inline-flex items-center justify-center px-3 py-2 text-sm font-medium bg-gray-200 dark:bg-dark-700 text-gray-800 dark:text-dark-100 rounded-lg hover:bg-gray-300 dark:hover:bg-dark-600 transition-colors cursor-pointer" title="Import Rules">
            <ArrowUpTrayIcon className="w-5 h-5" />
            <input
              type="file"
              ref={fileInputRef}
              accept=".json"
              onChange={handleImport}
              className="hidden"
            />
          </label>
          <button onClick={() => setIsModalOpen(true)} className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-gray-900 dark:text-white bg-primary-600 rounded-lg hover:bg-primary-700 focus:outline-2 focus:outline-offset-2 focus:outline-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2">
            <PlusIcon className="w-5 h-5" />
            Add Rule
          </button>
        </div>
      </div>

      {/* Templates */}
      {templates && templates.length > 0 && (
        <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 shadow-lg">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-dark-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Quick Start Templates</h2>
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
                  className="p-4 bg-gray-100 dark:bg-dark-700/50 rounded-lg text-left hover:bg-gray-200 dark:hover:bg-dark-700 transition-colors"
                >
                  <h3 className="font-medium text-gray-900 dark:text-white">{template.name}</h3>
                  <p className="text-sm text-gray-500 dark:text-dark-400 mt-1">{template.description}</p>
                  <div className="flex gap-2 mt-2">
                    {template.media_types.map(mt => (
                      <span key={mt} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-500/20 text-primary-400">
                        {mediaTypes.find(t => t.value === mt)?.label || mt}
                      </span>
                    ))}
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
            <div key={i} className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 shadow-lg animate-pulse">
              <div className="p-6 h-24" />
            </div>
          ))}
        </div>
      ) : rules && rules.length > 0 ? (
        <div className="space-y-4">
          {/* Bulk Actions Bar */}
          <div className="flex items-center gap-4 bg-dark-800 rounded-xl border border-dark-700 p-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={rules.length > 0 && selectedRules.size === rules.length}
                onChange={toggleSelectAll}
                className="w-4 h-4 rounded border-dark-600 bg-dark-700 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-gray-600 dark:text-dark-300">Select All</span>
            </label>
            {selectedRules.size > 0 && (
              <>
                <span className="text-sm text-gray-500 dark:text-dark-400">
                  {selectedRules.size} selected
                </span>
                <div className="flex gap-2 ml-auto">
                  <button
                    onClick={() => bulkMutation.mutate({ action: 'enable', ruleIds: Array.from(selectedRules) })}
                    disabled={bulkMutation.isPending}
                    className="px-3 py-1.5 text-sm font-medium bg-green-600/20 text-green-400 rounded-lg hover:bg-green-600/30 transition-colors disabled:opacity-50"
                  >
                    Enable
                  </button>
                  <button
                    onClick={() => bulkMutation.mutate({ action: 'disable', ruleIds: Array.from(selectedRules) })}
                    disabled={bulkMutation.isPending}
                    className="px-3 py-1.5 text-sm font-medium bg-yellow-600/20 text-yellow-400 rounded-lg hover:bg-yellow-600/30 transition-colors disabled:opacity-50"
                  >
                    Disable
                  </button>
                  <button
                    onClick={() => bulkMutation.mutate({ action: 'delete', ruleIds: Array.from(selectedRules) })}
                    disabled={bulkMutation.isPending}
                    className="px-3 py-1.5 text-sm font-medium bg-red-600/20 text-red-400 rounded-lg hover:bg-red-600/30 transition-colors disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>

          {rules.map((rule) => (
            <div key={rule.id} className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 shadow-lg">
              <div className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={selectedRules.has(rule.id)}
                        onChange={() => toggleSelectRule(rule.id)}
                        className="w-4 h-4 rounded border-dark-600 bg-dark-700 text-primary-600 focus:ring-primary-500"
                      />
                      <button
                        onClick={() => toggleMutation.mutate(rule.id)}
                        className={`w-12 h-6 rounded-full transition-colors ${
                          rule.is_enabled ? 'bg-primary-600' : 'bg-gray-200 dark:bg-dark-600'
                        }`}
                      >
                        <div
                          className={`w-5 h-5 bg-white rounded-full transition-transform ${
                            rule.is_enabled ? 'translate-x-6' : 'translate-x-0.5'
                          }`}
                        />
                      </button>
                      <h3 className="font-semibold text-gray-900 dark:text-white">{rule.name}</h3>
                    </div>
                    {rule.description && (
                      <p className="text-sm text-gray-500 dark:text-dark-400 mt-2">{rule.description}</p>
                    )}
                    <div className="flex flex-wrap gap-2 mt-3">
                      {rule.media_types.map(mt => (
                        <span key={mt} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-500/20 text-primary-400">
                          {mediaTypes.find(t => t.value === mt)?.label || mt}
                        </span>
                      ))}
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-500/20 text-yellow-400">{rule.action}</span>
                      <span className="badge bg-gray-200 dark:bg-dark-600 text-dark-300">
                        Priority: {rule.priority}
                      </span>
                      <span className="badge bg-gray-200 dark:bg-dark-600 text-dark-300">
                        Grace: {rule.grace_period_days} days
                      </span>
                    </div>
                    {/* Conditions summary */}
                    <div className="mt-3 text-sm text-gray-500 dark:text-dark-400">
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
                      onClick={() => setRuleToDelete(rule)}
                      className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium bg-transparent text-dark-300 rounded-lg hover:bg-dark-800 hover:text-gray-800 dark:text-dark-100 focus:outline-2 focus:outline-offset-2 focus:outline-dark-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-red-400 hover:text-red-300"
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
        <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 shadow-lg">
          <div className="p-6 text-center py-12">
            <p className="text-gray-500 dark:text-dark-400">No cleanup rules configured</p>
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

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={ruleToDelete !== null}
        title="Delete Cleanup Rule"
        message={`Are you sure you want to delete the rule "${ruleToDelete?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={() => {
          if (ruleToDelete) {
            deleteMutation.mutate(ruleToDelete.id)
            setRuleToDelete(null)
          }
        }}
        onCancel={() => setRuleToDelete(null)}
      />
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
  // Fetch series options from API
  const { data: seriesOptions } = useQuery({
    queryKey: ['seriesOptions'],
    queryFn: async () => {
      const res = await api.get<SeriesOptionsResponse>('/rules/series-options')
      return res.data
    },
  })

  const [formData, setFormData] = useState<CleanupRuleCreate>({
    name: template?.name || '',
    description: template?.description || '',
    is_enabled: true,
    priority: 0,
    media_types: template?.media_types || ['movie'],  // Array of media types
    conditions: {
      disk_space_threshold_percent: template?.conditions?.disk_space_threshold_percent || null,
      not_watched_days: template?.conditions?.not_watched_days || 180,
      min_age_days: template?.conditions?.min_age_days || 30,
      exclude_favorited: template?.conditions?.exclude_favorited ?? true,
      exclude_watched_within_days: template?.conditions?.exclude_watched_within_days || 30,
      series_evaluation_mode: template?.conditions?.series_evaluation_mode || 'episode',
      series_delete_target: template?.conditions?.series_delete_target || 'matched_episode',
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
      <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 shadow-lg w-full max-w-2xl mx-4 my-8">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-dark-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {template ? `Create Rule from Template` : 'Create Cleanup Rule'}
          </h2>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-6 max-h-[60vh] overflow-y-auto">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-200 mb-1">Rule Name</label>
                <input
                  type="text"
                  className="block w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-gray-800 dark:text-dark-100 placeholder-dark-400 focus:outline-2 focus:outline-primary-500 focus:border-transparent transition-colors"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Delete old unwatched movies"
                  required
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-200 mb-1">Description</label>
                <textarea
                  className="block w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-gray-800 dark:text-dark-100 placeholder-dark-400 focus:outline-2 focus:outline-primary-500 focus:border-transparent transition-colors"
                  value={formData.description || ''}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Describe what this rule does..."
                  rows={2}
                />
              </div>
              
              {/* Media Types Multi-Select */}
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-200 mb-2">
                  Media Types
                  <span className="text-xs text-dark-400 ml-2">Select one or more types</span>
                </label>
                <div className="flex flex-wrap gap-4">
                  {mediaTypes.map((type) => (
                    <label key={type.value} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={formData.media_types.includes(type.value)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFormData({ ...formData, media_types: [...formData.media_types, type.value] })
                          } else {
                            setFormData({ 
                              ...formData, 
                              media_types: formData.media_types.filter(t => t !== type.value) 
                            })
                          }
                        }}
                        className="rounded border-dark-600 bg-dark-700 text-primary-500"
                      />
                      <span className="text-sm text-dark-200">{type.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Series Configuration - only show when 'series' is selected */}
              {formData.media_types.includes('series') && seriesOptions && (
                <div className="col-span-2 space-y-6 border-t border-gray-200 dark:border-dark-700 pt-6 mt-4">
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Series Cleanup Configuration</h4>
                    <p className="text-xs text-dark-400 mb-4">Configure how series should be evaluated and what should be deleted when rules match</p>
                  </div>

                  {/* Series Evaluation Mode */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-200 mb-3">
                      Evaluation Mode
                      <span className="text-xs text-dark-400 ml-2 font-normal">How to evaluate series for cleanup</span>
                    </label>
                    <div className="space-y-3">
                      {seriesOptions.evaluation_modes.map((mode) => (
                        <label key={mode.value} className="flex items-start gap-3 p-4 bg-dark-700/30 rounded-lg hover:bg-gray-100 dark:bg-dark-700/50 cursor-pointer transition-colors border border-dark-600/50">
                          <input
                            type="radio"
                            name="series_evaluation_mode"
                            value={mode.value}
                            checked={formData.conditions.series_evaluation_mode === mode.value}
                            onChange={(e) => setFormData({
                              ...formData,
                              conditions: { ...formData.conditions, series_evaluation_mode: e.target.value as any }
                            })}
                            className="mt-0.5 border-dark-600 bg-dark-700 text-primary-500 focus:ring-2 focus:ring-primary-500"
                          />
                          <div className="flex-1">
                            <div className="text-sm font-medium text-gray-800 dark:text-dark-100">{mode.label}</div>
                            <div className="text-xs text-gray-500 dark:text-dark-400 mt-1">{mode.description}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Series Delete Target */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-200 mb-3">
                      Delete Target
                      <span className="text-xs text-dark-400 ml-2 font-normal">What to delete when rule matches</span>
                    </label>
                    <div className="space-y-3">
                      {seriesOptions.delete_targets.map((target) => (
                        <label key={target.value} className="flex items-start gap-3 p-4 bg-dark-700/30 rounded-lg hover:bg-gray-100 dark:bg-dark-700/50 cursor-pointer transition-colors border border-dark-600/50">
                          <input
                            type="radio"
                            name="series_delete_target"
                            value={target.value}
                            checked={formData.conditions.series_delete_target === target.value}
                            onChange={(e) => setFormData({
                              ...formData,
                              conditions: { ...formData.conditions, series_delete_target: e.target.value as any }
                            })}
                            className="mt-0.5 border-dark-600 bg-dark-700 text-primary-500 focus:ring-2 focus:ring-primary-500"
                          />
                          <div className="flex-1">
                            <div className="text-sm font-medium text-gray-800 dark:text-dark-100">{target.label}</div>
                            <div className="text-xs text-gray-500 dark:text-dark-400 mt-1">{target.description}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="col-span-2 border-t border-gray-200 dark:border-dark-700 pt-6 mt-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-200 mb-1">Action</label>
                <select
                  className="block w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-gray-800 dark:text-dark-100 placeholder-dark-400 focus:outline-2 focus:outline-primary-500 focus:border-transparent transition-colors"
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
            <div className="border-t border-gray-200 dark:border-dark-700 pt-6">
              <h3 className="font-medium text-gray-900 dark:text-white mb-5">Cleanup Conditions</h3>
              
              {/* Time-based Conditions */}
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-x-4 gap-y-5">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-200 mb-2">Not Watched (days)</label>
                    <input
                      type="number"
                      className="block w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-gray-800 dark:text-dark-100 placeholder-dark-400 focus:outline-2 focus:outline-primary-500 focus:border-transparent transition-colors"
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
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-200 mb-2">Disk Space Threshold (%)</label>
                    <input
                    type="number"
                    className="block w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-gray-800 dark:text-dark-100 placeholder-dark-400 focus:outline-2 focus:outline-primary-500 focus:border-transparent transition-colors"
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
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-200 mb-2">Minimum Age (days)</label>
                  <input
                    type="number"
                    className="block w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-gray-800 dark:text-dark-100 placeholder-dark-400 focus:outline-2 focus:outline-primary-500 focus:border-transparent transition-colors"
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
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-200 mb-2">Grace Period (days)</label>
                  <input
                    type="number"
                    className="block w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-gray-800 dark:text-dark-100 placeholder-dark-400 focus:outline-2 focus:outline-primary-500 focus:border-transparent transition-colors"
                    value={formData.grace_period_days}
                    onChange={(e) => setFormData({
                      ...formData,
                      grace_period_days: parseInt(e.target.value) || 0
                    })}
                    placeholder="7"
                  />
                </div>
              </div>

              {/* Rating & Progress Conditions */}
              <div className="border-t border-gray-200 dark:border-dark-700 pt-5 mt-5">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Rating & Progress Filters</h4>
                <div className="grid grid-cols-2 gap-x-4 gap-y-5">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-200 mb-2">Rating Below (delete if below)</label>
                    <input
                      type="number"
                      step="0.1"
                      className="block w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-gray-800 dark:text-dark-100 placeholder-dark-400 focus:outline-2 focus:outline-primary-500 focus:border-transparent transition-colors"
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
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-200 mb-2">Watch Progress Below (%)</label>
                    <input
                    type="number"
                    className="block w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-gray-800 dark:text-dark-100 placeholder-dark-400 focus:outline-2 focus:outline-primary-500 focus:border-transparent transition-colors"
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
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-200 mb-2">Exclude Recently Added (days)</label>
                  <input
                    type="number"
                    className="block w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-gray-800 dark:text-dark-100 placeholder-dark-400 focus:outline-2 focus:outline-primary-500 focus:border-transparent transition-colors"
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
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-200 mb-2">Max Items Per Run</label>
                  <input
                    type="number"
                    className="block w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-gray-800 dark:text-dark-100 placeholder-dark-400 focus:outline-2 focus:outline-primary-500 focus:border-transparent transition-colors"
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
              </div>
            </div>

              {/* Genre & Tag Filters */}
              <div className="border-t border-gray-200 dark:border-dark-700 pt-5 mt-5">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Genre & Tag Filters</h4>
                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-200 mb-2">Exclude Genres (comma separated)</label>
                    <input
                      type="text"
                      className="block w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-gray-800 dark:text-dark-100 placeholder-dark-400 focus:outline-2 focus:outline-primary-500 focus:border-transparent transition-colors"
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
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-200 mb-2">Exclude Tags (comma separated)</label>
                    <input
                      type="text"
                      className="block w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-gray-800 dark:text-dark-100 placeholder-dark-400 focus:outline-2 focus:outline-primary-500 focus:border-transparent transition-colors"
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
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-200 mb-2">Include Only Tags (comma separated, leave empty for all)</label>
                    <input
                      type="text"
                      className="block w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-gray-800 dark:text-dark-100 placeholder-dark-400 focus:outline-2 focus:outline-primary-500 focus:border-transparent transition-colors"
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
              </div>

            {/* Exclusion Options */}
            <div className="border-t border-gray-200 dark:border-dark-700 pt-5">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Exclusion Options</h4>
              <div className="space-y-5">
                <div className="flex flex-wrap gap-4">
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
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-200 mb-2">
                    Exclude Recently Watched (days)
                    <span className="text-xs text-dark-400 ml-2 font-normal">Items watched within last X days won't be deleted</span>
                  </label>
                  <input
                    type="number"
                    className="block w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-gray-800 dark:text-dark-100 placeholder-dark-400 focus:outline-2 focus:outline-primary-500 focus:border-transparent transition-colors"
                    value={formData.conditions.exclude_watched_within_days || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      conditions: {
                        ...formData.conditions,
                        exclude_watched_within_days: e.target.value ? parseInt(e.target.value) : null
                      }
                    })}
                    placeholder="30"
                    min={0}
                  />
                  <p className="text-xs text-dark-500 mt-1">
                    Leave empty to disable. Common values: 7, 14, 30, 90 days
                  </p>
                </div>

                <div className="flex flex-wrap gap-4">
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
          </div>
          </div>
          </div>

          <div className="px-6 py-4 border-t border-gray-200 dark:border-dark-700 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium bg-gray-200 dark:bg-dark-700 text-gray-800 dark:text-dark-100 rounded-lg hover:bg-gray-300 dark:hover:bg-dark-600 focus:outline-2 focus:outline-offset-2 focus:outline-dark-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={isLoading} className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-gray-900 dark:text-white bg-primary-600 rounded-lg hover:bg-primary-700 focus:outline-2 focus:outline-offset-2 focus:outline-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {isLoading ? 'Creating...' : 'Create Rule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}




