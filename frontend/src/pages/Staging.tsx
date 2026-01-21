import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ClockIcon, TrashIcon, ArrowPathIcon, Cog6ToothIcon, CheckCircleIcon, FolderIcon } from '@heroicons/react/24/outline'
import api from '../lib/api'
import { formatBytes, formatRelativeTime } from '../lib/utils'

interface StagedItem {
  id: number
  title: string
  media_type: string
  staged_at: string
  permanent_delete_at: string
  original_path: string
  staged_path: string
  size_bytes: number
  series_id?: number
  season_number?: number
  episode_number?: number
}

interface StagingStats {
  total_staged: number
  total_size_bytes: number
  expiring_soon: number
  expired: number
}

interface StagingSettings {
  enabled: boolean
  staging_path: string
  grace_period_days: number
  library_name: string
  auto_restore_on_watch: boolean
}

interface LibraryStagingSettings {
  library_id: number
  library_name: string
  staging_enabled: boolean | null
  staging_path: string | null
  staging_grace_period_days: number | null
  staging_auto_restore: boolean | null
  uses_custom_settings: boolean
  effective_enabled: boolean
  effective_path: string
  effective_grace_period_days: number
  effective_auto_restore: boolean
}

export default function Staging() {
  const queryClient = useQueryClient()
  const [showSettings, setShowSettings] = useState(false)
  const [settingsForm, setSettingsForm] = useState<Partial<StagingSettings>>({})

  const { data: items = [], isLoading: itemsLoading } = useQuery<StagedItem[]>({
    queryKey: ['stagedItems'],
    queryFn: async () => {
      const res = await api.get('/staging/staged')
      return res.data
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  })

  const { data: stats } = useQuery<StagingStats>({
    queryKey: ['stagingStats'],
    queryFn: async () => {
      const res = await api.get('/staging/stats')
      return res.data
    },
    refetchInterval: 30000,
  })

  const { data: settings } = useQuery<StagingSettings>({
    queryKey: ['stagingSettings'],
    queryFn: async () => {
      const res = await api.get('/staging/settings')
      return res.data
    },
  })

  const { data: libraryStagingSettings } = useQuery<LibraryStagingSettings[]>({
    queryKey: ['libraryStagingSettings'],
    queryFn: async () => {
      const res = await api.get('/staging/libraries')
      return res.data
    },
  })

  const restoreMutation = useMutation({
    mutationFn: async (itemId: number) => {
      await api.post(`/staging/${itemId}/restore`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stagedItems'] })
      queryClient.invalidateQueries({ queryKey: ['stagingStats'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (itemId: number) => {
      await api.delete(`/staging/${itemId}/permanent`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stagedItems'] })
      queryClient.invalidateQueries({ queryKey: ['stagingStats'] })
    },
  })

  const settingsMutation = useMutation({
    mutationFn: async (data: Partial<StagingSettings>) => {
      await api.put('/staging/settings', data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stagingSettings'] })
      setShowSettings(false)
      setSettingsForm({})
    },
  })

  const handleSaveSettings = () => {
    settingsMutation.mutate(settingsForm)
  }

  const getTimeRemaining = (deleteAt: string) => {
    const now = new Date()
    const deleteDate = new Date(deleteAt)
    const diffMs = deleteDate.getTime() - now.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    
    if (diffMs < 0) {
      return { text: 'Expired', className: 'text-red-400', urgency: 'expired' }
    } else if (diffDays === 0) {
      return { text: `${diffHours}h remaining`, className: 'text-red-400', urgency: 'critical' }
    } else if (diffDays <= 2) {
      return { text: `${diffDays}d ${diffHours}h remaining`, className: 'text-orange-400', urgency: 'warning' }
    } else if (diffDays <= 7) {
      return { text: `${diffDays} days remaining`, className: 'text-yellow-400', urgency: 'soon' }
    } else {
      return { text: `${diffDays} days remaining`, className: 'text-dark-400', urgency: 'normal' }
    }
  }

  const getMediaTypeIcon = (mediaType: string) => {
    // For now, just return a simple text badge
    return mediaType.charAt(0).toUpperCase() + mediaType.slice(1)
  }

  // Settings Modal - render outside of conditional content so it shows when disabled too
  const settingsModal = showSettings && settings && (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 shadow-lg max-w-lg w-full">
        <div className="p-6 border-b border-gray-200 dark:border-dark-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Staging Settings</h2>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-dark-300 mb-2">
              Enable Staging System
            </label>
            <input
              type="checkbox"
              checked={settingsForm.enabled ?? settings.enabled}
              onChange={(e) => setSettingsForm({ ...settingsForm, enabled: e.target.checked })}
              className="rounded border-dark-600 text-primary-600 focus:ring-primary-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-dark-300 mb-2">
              Staging Path
            </label>
            <input
              type="text"
              value={settingsForm.staging_path ?? settings.staging_path}
              onChange={(e) => setSettingsForm({ ...settingsForm, staging_path: e.target.value })}
              className="w-full px-3 py-2 bg-white dark:bg-dark-700 border border-gray-300 dark:border-dark-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="/media/staging"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-dark-300 mb-2">
              Grace Period (days)
            </label>
            <input
              type="number"
              min="1"
              max="365"
              value={settingsForm.grace_period_days ?? settings.grace_period_days}
              onChange={(e) => setSettingsForm({ ...settingsForm, grace_period_days: parseInt(e.target.value) })}
              className="w-full px-3 py-2 bg-white dark:bg-dark-700 border border-gray-300 dark:border-dark-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-dark-300 mb-2">
              Emby Library Name
            </label>
            <input
              type="text"
              value={settingsForm.library_name ?? settings.library_name}
              onChange={(e) => setSettingsForm({ ...settingsForm, library_name: e.target.value })}
              className="w-full px-3 py-2 bg-white dark:bg-dark-700 border border-gray-300 dark:border-dark-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="MediaCleanup - Scheduled for Deletion"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-dark-300 mb-2">
              Auto-restore on Watch
            </label>
            <input
              type="checkbox"
              checked={settingsForm.auto_restore_on_watch ?? settings.auto_restore_on_watch}
              onChange={(e) => setSettingsForm({ ...settingsForm, auto_restore_on_watch: e.target.checked })}
              className="rounded border-dark-600 text-primary-600 focus:ring-primary-500"
            />
            <p className="text-xs text-gray-500 dark:text-dark-400 mt-1">
              Automatically restore items to original location if watched in Emby
            </p>
          </div>
        </div>
        <div className="p-6 border-t border-gray-200 dark:border-dark-700 flex justify-end gap-3">
          <button
            onClick={() => {
              setShowSettings(false)
              setSettingsForm({})
            }}
            className="px-4 py-2 text-sm font-medium bg-gray-200 dark:bg-dark-700 text-gray-800 dark:text-dark-100 rounded-lg hover:bg-gray-300 dark:hover:bg-dark-600"
          >
            Cancel
          </button>
          <button
            onClick={handleSaveSettings}
            disabled={settingsMutation.isPending}
            className="px-4 py-2 text-sm font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
          >
            {settingsMutation.isPending ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )

  if (!settings?.enabled) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Staging System</h1>
          <p className="text-gray-500 dark:text-dark-400 mt-1">Soft-delete system with grace period</p>
        </div>
        
        <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 shadow-lg p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-yellow-600/20 flex items-center justify-center mx-auto mb-4">
            <ClockIcon className="w-8 h-8 text-yellow-400" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Staging System Disabled</h2>
          <p className="text-dark-400 mb-6">
            The staging system allows media to be moved to a temporary location before permanent deletion.
            Users can still watch staged items in Emby, and they will be auto-restored if watched.
          </p>
          <button
            onClick={() => {
              setSettingsForm({ enabled: true })
              setShowSettings(true)
            }}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700"
          >
            <Cog6ToothIcon className="w-4 h-4" />
            Enable & Configure
          </button>
        </div>
        
        {settingsModal}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Staged Items</h1>
          <p className="text-gray-500 dark:text-dark-400 mt-1">Items scheduled for deletion with {settings.grace_period_days}-day grace period</p>
        </div>
        <button
          onClick={() => {
            setSettingsForm(settings)
            setShowSettings(true)
          }}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium bg-gray-200 dark:bg-dark-700 text-gray-800 dark:text-dark-100 rounded-lg hover:bg-gray-300 dark:hover:bg-dark-600"
        >
          <Cog6ToothIcon className="w-4 h-4" />
          Settings
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 shadow-lg">
          <div className="p-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary-600/20 flex items-center justify-center">
                <ClockIcon className="w-5 h-5 text-primary-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats?.total_staged || 0}</p>
                <p className="text-sm text-gray-500 dark:text-dark-400">Total Staged</p>
              </div>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 shadow-lg">
          <div className="p-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-yellow-600/20 flex items-center justify-center">
                <TrashIcon className="w-5 h-5 text-yellow-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatBytes(stats?.total_size_bytes || 0)}</p>
                <p className="text-sm text-gray-500 dark:text-dark-400">Total Size</p>
              </div>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 shadow-lg">
          <div className="p-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-orange-600/20 flex items-center justify-center">
                <ClockIcon className="w-5 h-5 text-orange-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats?.expiring_soon || 0}</p>
                <p className="text-sm text-gray-500 dark:text-dark-400">Expiring Soon</p>
              </div>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 shadow-lg">
          <div className="p-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-red-600/20 flex items-center justify-center">
                <TrashIcon className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats?.expired || 0}</p>
                <p className="text-sm text-gray-500 dark:text-dark-400">Expired</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Library Staging Overview */}
      {libraryStagingSettings && libraryStagingSettings.length > 0 && (
        <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 shadow-lg">
          <div className="p-6">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <FolderIcon className="w-5 h-5" />
              Library Staging Status
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {libraryStagingSettings.map((lib) => (
                <div 
                  key={lib.library_id}
                  className={`p-3 rounded-lg border ${
                    lib.effective_enabled 
                      ? 'border-green-500/30 bg-green-500/10' 
                      : 'border-gray-300 dark:border-dark-600 bg-gray-100 dark:bg-dark-700/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-900 dark:text-white">{lib.library_name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      lib.effective_enabled 
                        ? 'bg-green-500/20 text-green-400' 
                        : 'bg-gray-200 dark:bg-dark-600 text-gray-500 dark:text-dark-400'
                    }`}>
                      {lib.effective_enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 dark:text-dark-400 mt-1">
                    {lib.uses_custom_settings ? (
                      <span className="text-primary-400">Custom settings</span>
                    ) : (
                      <span>Using global settings</span>
                    )}
                    {lib.effective_enabled && (
                      <span className="ml-2">• {lib.effective_grace_period_days}d grace</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500 dark:text-dark-400 mt-3">
              Configure per-library staging in the Libraries page
            </p>
          </div>
        </div>
      )}

      {/* Staged Items List */}
      <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 shadow-lg overflow-hidden">
        {itemsLoading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
            <p className="text-dark-400 mt-2">Loading staged items...</p>
          </div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-dark-700 flex items-center justify-center mx-auto mb-4">
              <CheckCircleIcon className="w-8 h-8 text-gray-400 dark:text-dark-400" />
            </div>
            <p className="text-gray-500 dark:text-dark-400">No staged items</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-dark-700">
              <thead className="bg-gray-50 dark:bg-dark-900/50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-400 uppercase tracking-wider">
                    Media
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-400 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-400 uppercase tracking-wider">
                    Size
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-400 uppercase tracking-wider">
                    Staged
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-400 uppercase tracking-wider">
                    Time Remaining
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-dark-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-dark-800 divide-y divide-gray-200 dark:divide-dark-700">
                {items.map((item) => {
                  const timeRemaining = getTimeRemaining(item.permanent_delete_at)
                  
                  return (
                    <tr key={item.id} className="hover:bg-gray-100 dark:hover:bg-dark-700/50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-gray-900 dark:text-white">{item.title}</span>
                          {item.season_number && item.episode_number && (
                            <span className="text-xs text-gray-500 dark:text-dark-400">S{item.season_number}E{item.episode_number}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-dark-700 text-gray-600 dark:text-dark-300">
                          {getMediaTypeIcon(item.media_type)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-dark-300">
                        {formatBytes(item.size_bytes)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-dark-400">
                        {formatRelativeTime(item.staged_at)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`text-sm font-medium ${timeRemaining.className}`}>
                          {timeRemaining.text}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => restoreMutation.mutate(item.id)}
                            disabled={restoreMutation.isPending}
                            className="inline-flex items-center justify-center gap-1 px-3 py-1.5 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                            title="Restore to original location"
                          >
                            <ArrowPathIcon className="w-4 h-4" />
                            Restore
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`Permanently delete "${item.title}"? This cannot be undone.`)) {
                                deleteMutation.mutate(item.id)
                              }
                            }}
                            disabled={deleteMutation.isPending}
                            className="inline-flex items-center justify-center gap-1 px-3 py-1.5 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                            title="Delete permanently"
                          >
                            <TrashIcon className="w-4 h-4" />
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {settingsModal}
    </div>
  )
}





