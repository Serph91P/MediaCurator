import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ClockIcon, TrashIcon, ArrowPathIcon, Cog6ToothIcon, CheckCircleIcon, FolderIcon } from '@heroicons/react/24/outline'
import api from '../lib/api'
import toast from 'react-hot-toast'
import { formatBytes, formatRelativeTime } from '../lib/utils'
import ResponsiveTable from '../components/ResponsiveTable'

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
  staging_library_name: string | null
  uses_custom_settings: boolean
  effective_enabled: boolean
  effective_path: string
  effective_grace_period_days: number
  effective_auto_restore: boolean
  effective_library_name: string
}

export default function Staging() {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<'items' | 'settings'>('items')
  const [showGlobalSettings, setShowGlobalSettings] = useState(false)
  const [settingsForm, setSettingsForm] = useState<Partial<StagingSettings>>({})
  const [editingLibrary, setEditingLibrary] = useState<number | null>(null)
  const [libraryForm, setLibraryForm] = useState<Partial<LibraryStagingSettings>>({})

  const { data: items = [], isLoading: itemsLoading } = useQuery<StagedItem[]>({
    queryKey: ['stagedItems'],
    queryFn: async () => {
      const res = await api.get('/staging/staged')
      return res.data
    },
    refetchInterval: 30000,
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
      toast.success('Item restored')
    },
    onError: () => {
      toast.error('Failed to restore item')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (itemId: number) => {
      await api.delete(`/staging/${itemId}/permanent`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stagedItems'] })
      queryClient.invalidateQueries({ queryKey: ['stagingStats'] })
      toast.success('Item permanently deleted')
    },
    onError: () => {
      toast.error('Failed to delete item')
    },
  })

  const settingsMutation = useMutation({
    mutationFn: async (data: Partial<StagingSettings>) => {
      await api.put('/staging/settings', data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stagingSettings'] })
      setShowGlobalSettings(false)
      setSettingsForm({})
      toast.success('Global settings saved')
    },
    onError: () => {
      toast.error('Failed to save settings')
    },
  })

  const updateLibraryMutation = useMutation({
    mutationFn: async ({ libraryId, data }: { libraryId: number; data: any }) => {
      const res = await api.put(`/staging/libraries/${libraryId}`, data)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['libraryStagingSettings'] })
      setEditingLibrary(null)
      setLibraryForm({})
      toast.success('Library settings updated')
    },
    onError: () => {
      toast.error('Failed to update library settings')
    },
  })

  const resetLibraryMutation = useMutation({
    mutationFn: async (libraryId: number) => {
      const res = await api.delete(`/staging/libraries/${libraryId}/settings`)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['libraryStagingSettings'] })
      setEditingLibrary(null)
      setLibraryForm({})
      toast.success('Library reset to global defaults')
    },
  })

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
      return { text: `${diffDays} days remaining`, className: 'text-gray-500 dark:text-dark-400', urgency: 'normal' }
    }
  }

  // Global Settings Modal
  const globalSettingsModal = showGlobalSettings && settings && (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 shadow-lg max-w-lg w-full">
        <div className="p-6 border-b border-gray-200 dark:border-dark-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Global Staging Settings</h2>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-600 dark:text-dark-300">
              Enable Staging System
            </label>
            <button
              onClick={() => setSettingsForm({ ...settingsForm, enabled: !(settingsForm.enabled ?? settings.enabled) })}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                (settingsForm.enabled ?? settings.enabled) ? 'bg-primary-600' : 'bg-gray-300 dark:bg-dark-600'
              }`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-lg transition-transform ${
                (settingsForm.enabled ?? settings.enabled) ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-dark-300 mb-2">
              Default Staging Path
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
              Default Grace Period (days)
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
          
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-gray-600 dark:text-dark-300">
                Auto-restore on Watch
              </label>
              <p className="text-xs text-gray-500 dark:text-dark-400 mt-1">
                Restore items if watched in Emby
              </p>
            </div>
            <button
              onClick={() => setSettingsForm({ 
                ...settingsForm, 
                auto_restore_on_watch: !(settingsForm.auto_restore_on_watch ?? settings.auto_restore_on_watch) 
              })}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                (settingsForm.auto_restore_on_watch ?? settings.auto_restore_on_watch) ? 'bg-primary-600' : 'bg-gray-300 dark:bg-dark-600'
              }`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-lg transition-transform ${
                (settingsForm.auto_restore_on_watch ?? settings.auto_restore_on_watch) ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </div>
        </div>
        <div className="p-6 border-t border-gray-200 dark:border-dark-700 flex justify-end gap-3">
          <button
            onClick={() => {
              setShowGlobalSettings(false)
              setSettingsForm({})
            }}
            className="px-4 py-2 text-sm font-medium bg-gray-200 dark:bg-dark-700 text-gray-800 dark:text-dark-100 rounded-lg hover:bg-gray-300 dark:hover:bg-dark-600"
          >
            Cancel
          </button>
          <button
            onClick={() => settingsMutation.mutate(settingsForm)}
            disabled={settingsMutation.isPending}
            className="px-4 py-2 text-sm font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
          >
            {settingsMutation.isPending ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )

  // Disabled state
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
          <p className="text-gray-500 dark:text-dark-400 mb-6">
            The staging system allows media to be moved to a temporary location before permanent deletion.
            Users can still watch staged items in Emby, and they will be auto-restored if watched.
          </p>
          <button
            onClick={() => {
              setSettingsForm({ enabled: true })
              setShowGlobalSettings(true)
            }}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700"
          >
            <Cog6ToothIcon className="w-4 h-4" />
            Enable & Configure
          </button>
        </div>
        
        {globalSettingsModal}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Staging System</h1>
          <p className="text-gray-500 dark:text-dark-400 mt-1">
            Soft-delete with {settings.grace_period_days}-day grace period
          </p>
        </div>
        <button
          onClick={() => {
            setSettingsForm(settings)
            setShowGlobalSettings(true)
          }}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium bg-gray-200 dark:bg-dark-700 text-gray-800 dark:text-dark-100 rounded-lg hover:bg-gray-300 dark:hover:bg-dark-600"
        >
          <Cog6ToothIcon className="w-4 h-4" />
          Global Settings
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

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-dark-700">
        <nav className="flex gap-4">
          <button
            onClick={() => setActiveTab('items')}
            className={`pb-3 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'items'
                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-gray-500 dark:text-dark-400 hover:text-gray-700 dark:hover:text-dark-300'
            }`}
          >
            Staged Items ({items.length})
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`pb-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2 ${
              activeTab === 'settings'
                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-gray-500 dark:text-dark-400 hover:text-gray-700 dark:hover:text-dark-300'
            }`}
          >
            <FolderIcon className="w-4 h-4" />
            Library Settings
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'items' ? (
        <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 shadow-lg overflow-hidden">
          {itemsLoading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
              <p className="text-gray-500 dark:text-dark-400 mt-2">Loading staged items...</p>
            </div>
          ) : items.length === 0 ? (
            <div className="p-8 text-center">
              <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-dark-700 flex items-center justify-center mx-auto mb-4">
                <CheckCircleIcon className="w-8 h-8 text-gray-400 dark:text-dark-400" />
              </div>
              <p className="text-gray-500 dark:text-dark-400">No staged items</p>
            </div>
          ) : (
            <ResponsiveTable
              columns={[
                {
                  header: 'Media',
                  accessor: 'title',
                  cell: (item: StagedItem) => (
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-gray-900 dark:text-white">{item.title}</span>
                      {item.season_number && item.episode_number && (
                        <span className="text-xs text-gray-500 dark:text-dark-400">
                          S{item.season_number}E{item.episode_number}
                        </span>
                      )}
                    </div>
                  )
                },
                {
                  header: 'Type',
                  accessor: 'media_type',
                  mobileHide: true,
                  cell: (item: StagedItem) => (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-dark-700 text-gray-600 dark:text-dark-300">
                      {item.media_type.charAt(0).toUpperCase() + item.media_type.slice(1)}
                    </span>
                  )
                },
                {
                  header: 'Size',
                  accessor: 'size_bytes',
                  cell: (item: StagedItem) => (
                    <span className="text-sm text-gray-600 dark:text-dark-300">
                      {formatBytes(item.size_bytes)}
                    </span>
                  )
                },
                {
                  header: 'Staged',
                  accessor: 'staged_at',
                  mobileHide: true,
                  cell: (item: StagedItem) => (
                    <span className="text-sm text-gray-500 dark:text-dark-400">
                      {formatRelativeTime(item.staged_at)}
                    </span>
                  )
                },
                {
                  header: 'Time Remaining',
                  accessor: 'permanent_delete_at',
                  mobileLabel: 'Remaining',
                  cell: (item: StagedItem) => {
                    const timeRemaining = getTimeRemaining(item.permanent_delete_at)
                    return (
                      <span className={`text-sm font-medium ${timeRemaining.className}`}>
                        {timeRemaining.text}
                      </span>
                    )
                  }
                },
                {
                  header: 'Actions',
                  accessor: 'id',
                  className: 'text-right',
                  cell: (item: StagedItem) => (
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => restoreMutation.mutate(item.id)}
                        disabled={restoreMutation.isPending}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                      >
                        <ArrowPathIcon className="w-4 h-4" />
                        Restore
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Permanently delete "${item.title}"?`)) {
                            deleteMutation.mutate(item.id)
                          }
                        }}
                        disabled={deleteMutation.isPending}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                      >
                        <TrashIcon className="w-4 h-4" />
                        Delete
                      </button>
                    </div>
                  )
                }
              ]}
              data={items}
              keyExtractor={(item: StagedItem) => item.id}
              emptyMessage="No staged items"
            />
          )}
        </div>
      ) : (
        /* Library Settings Tab */
        <div className="space-y-4">
          <div className="bg-gray-50 dark:bg-dark-800/50 rounded-xl border border-gray-200 dark:border-dark-700 p-4">
            <p className="text-sm text-gray-600 dark:text-dark-300">
              Configure staging settings per library. Libraries without custom settings will use the global defaults.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {libraryStagingSettings?.map((lib) => {
              const isEditing = editingLibrary === lib.library_id
              
              return (
                <div
                  key={lib.library_id}
                  className={`bg-white dark:bg-dark-800 rounded-xl border shadow-lg ${
                    lib.effective_enabled
                      ? 'border-green-500/30'
                      : 'border-gray-200 dark:border-dark-700'
                  }`}
                >
                  <div className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                          lib.effective_enabled ? 'bg-green-600/20' : 'bg-gray-200 dark:bg-dark-600'
                        }`}>
                          <FolderIcon className={`w-5 h-5 ${
                            lib.effective_enabled ? 'text-green-400' : 'text-gray-400 dark:text-dark-400'
                          }`} />
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900 dark:text-white">{lib.library_name}</h3>
                          <p className="text-xs text-gray-500 dark:text-dark-400">
                            {lib.uses_custom_settings ? 'Custom settings' : 'Using global defaults'}
                          </p>
                        </div>
                      </div>
                      <span className={`text-xs px-2.5 py-1 rounded-full ${
                        lib.effective_enabled
                          ? 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400'
                          : 'bg-gray-100 dark:bg-dark-600 text-gray-600 dark:text-dark-400'
                      }`}>
                        {lib.effective_enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>

                    {isEditing ? (
                      <div className="space-y-3 pt-4 border-t border-gray-200 dark:border-dark-700">
                        <div className="flex items-center justify-between">
                          <label className="text-sm text-gray-600 dark:text-dark-300">Enable Staging</label>
                          <select
                            value={libraryForm.staging_enabled === null ? 'global' : libraryForm.staging_enabled ? 'true' : 'false'}
                            onChange={(e) => setLibraryForm({
                              ...libraryForm,
                              staging_enabled: e.target.value === 'global' ? null : e.target.value === 'true'
                            })}
                            className="text-sm px-3 py-1.5 bg-white dark:bg-dark-700 border border-gray-300 dark:border-dark-600 rounded-lg text-gray-900 dark:text-white"
                          >
                            <option value="global">Use Global</option>
                            <option value="true">Enabled</option>
                            <option value="false">Disabled</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm text-gray-600 dark:text-dark-300 mb-1">Staging Path</label>
                          <input
                            type="text"
                            value={libraryForm.staging_path ?? ''}
                            onChange={(e) => setLibraryForm({ ...libraryForm, staging_path: e.target.value || null })}
                            placeholder="Use global path"
                            className="w-full text-sm px-3 py-1.5 bg-white dark:bg-dark-700 border border-gray-300 dark:border-dark-600 rounded-lg text-gray-900 dark:text-white"
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <label className="text-sm text-gray-600 dark:text-dark-300">Grace Period (days)</label>
                          <input
                            type="number"
                            min="1"
                            max="365"
                            value={libraryForm.staging_grace_period_days ?? ''}
                            onChange={(e) => setLibraryForm({
                              ...libraryForm,
                              staging_grace_period_days: e.target.value ? parseInt(e.target.value) : null
                            })}
                            placeholder="Global"
                            className="w-24 text-sm px-3 py-1.5 bg-white dark:bg-dark-700 border border-gray-300 dark:border-dark-600 rounded-lg text-gray-900 dark:text-white"
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <label className="text-sm text-gray-600 dark:text-dark-300">Auto-Restore</label>
                          <select
                            value={libraryForm.staging_auto_restore === null ? 'global' : libraryForm.staging_auto_restore ? 'true' : 'false'}
                            onChange={(e) => setLibraryForm({
                              ...libraryForm,
                              staging_auto_restore: e.target.value === 'global' ? null : e.target.value === 'true'
                            })}
                            className="text-sm px-3 py-1.5 bg-white dark:bg-dark-700 border border-gray-300 dark:border-dark-600 rounded-lg text-gray-900 dark:text-white"
                          >
                            <option value="global">Use Global</option>
                            <option value="true">Enabled</option>
                            <option value="false">Disabled</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm text-gray-600 dark:text-dark-300 mb-1">Emby Library Name</label>
                          <input
                            type="text"
                            value={libraryForm.staging_library_name ?? ''}
                            onChange={(e) => setLibraryForm({ ...libraryForm, staging_library_name: e.target.value || null })}
                            placeholder="Use global name"
                            className="w-full text-sm px-3 py-1.5 bg-white dark:bg-dark-700 border border-gray-300 dark:border-dark-600 rounded-lg text-gray-900 dark:text-white"
                          />
                          <p className="text-xs text-gray-500 dark:text-dark-500 mt-1">
                            Name of the staging library in Emby for this library
                          </p>
                        </div>
                        <div className="flex gap-2 mt-4">
                          <button
                            onClick={() => updateLibraryMutation.mutate({ libraryId: lib.library_id, data: libraryForm })}
                            disabled={updateLibraryMutation.isPending}
                            className="flex-1 text-sm px-3 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                          >
                            Save
                          </button>
                          {lib.uses_custom_settings && (
                            <button
                              onClick={() => resetLibraryMutation.mutate(lib.library_id)}
                              disabled={resetLibraryMutation.isPending}
                              className="text-sm px-3 py-2 bg-gray-200 dark:bg-dark-600 text-gray-700 dark:text-dark-200 rounded-lg hover:bg-gray-300 dark:hover:bg-dark-500"
                            >
                              Reset
                            </button>
                          )}
                          <button
                            onClick={() => { setEditingLibrary(null); setLibraryForm({}) }}
                            className="text-sm px-3 py-2 text-gray-500 dark:text-dark-400 hover:text-gray-700 dark:hover:text-dark-200"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="pt-4 border-t border-gray-200 dark:border-dark-700">
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div className="text-gray-500 dark:text-dark-400">Path:</div>
                          <div className="text-gray-700 dark:text-dark-300 truncate" title={lib.effective_path}>
                            {lib.staging_path || <span className="text-gray-400 dark:text-dark-500">global</span>}
                          </div>
                          <div className="text-gray-500 dark:text-dark-400">Grace:</div>
                          <div className="text-gray-700 dark:text-dark-300">
                            {lib.staging_grace_period_days ?? <span className="text-gray-400 dark:text-dark-500">global</span>} days
                          </div>
                          <div className="text-gray-500 dark:text-dark-400">Auto-restore:</div>
                          <div className="text-gray-700 dark:text-dark-300">
                            {lib.staging_auto_restore !== null 
                              ? (lib.staging_auto_restore ? 'Yes' : 'No')
                              : <span className="text-gray-400 dark:text-dark-500">global</span>
                            }
                          </div>
                          <div className="text-gray-500 dark:text-dark-400">Emby Library:</div>
                          <div className="text-gray-700 dark:text-dark-300 truncate" title={lib.effective_library_name}>
                            {lib.staging_library_name || <span className="text-gray-400 dark:text-dark-500">global</span>}
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            setEditingLibrary(lib.library_id)
                            setLibraryForm({
                              staging_enabled: lib.staging_enabled,
                              staging_path: lib.staging_path,
                              staging_grace_period_days: lib.staging_grace_period_days,
                              staging_auto_restore: lib.staging_auto_restore,
                              staging_library_name: lib.staging_library_name,
                            })
                          }}
                          className="mt-4 w-full text-sm text-primary-500 hover:text-primary-400 flex items-center justify-center gap-1"
                        >
                          <Cog6ToothIcon className="w-4 h-4" />
                          Configure
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          
          {(!libraryStagingSettings || libraryStagingSettings.length === 0) && (
            <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 shadow-lg p-8 text-center">
              <FolderIcon className="w-12 h-12 mx-auto text-gray-400 dark:text-dark-500" />
              <p className="text-gray-500 dark:text-dark-400 mt-4">No libraries synced yet</p>
              <p className="text-sm text-gray-400 dark:text-dark-500 mt-1">
                Sync libraries from your Emby/Jellyfin server first
              </p>
            </div>
          )}
        </div>
      )}

      {globalSettingsModal}
    </div>
  )
}





