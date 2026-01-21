import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { FolderIcon, ArrowPathIcon, CheckCircleIcon, XCircleIcon, Cog6ToothIcon, ArchiveBoxIcon } from '@heroicons/react/24/outline'
import api from '../lib/api'
import toast from 'react-hot-toast'
import type { Library, ServiceConnection } from '../types'
import { formatRelativeTime } from '../lib/utils'

interface LibrarySyncResponse {
  synced: number
  removed: number
  message: string
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

export default function Libraries() {
  const queryClient = useQueryClient()
  const [editingLibrary, setEditingLibrary] = useState<number | null>(null)
  const [stagingForm, setStagingForm] = useState<Partial<LibraryStagingSettings>>({})

  const { data: libraries, isLoading } = useQuery({
    queryKey: ['libraries'],
    queryFn: async () => {
      const res = await api.get<Library[]>('/libraries/')
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
      queryClient.invalidateQueries({ queryKey: ['libraries'] })
    },
  })

  const updateStagingMutation = useMutation({
    mutationFn: async ({ libraryId, data }: { libraryId: number; data: any }) => {
      const res = await api.put(`/staging/libraries/${libraryId}`, data)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['libraryStagingSettings'] })
      setEditingLibrary(null)
      setStagingForm({})
      toast.success('Staging settings updated')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to update staging settings')
    },
  })

  const resetStagingMutation = useMutation({
    mutationFn: async (libraryId: number) => {
      const res = await api.delete(`/staging/libraries/${libraryId}/settings`)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['libraryStagingSettings'] })
      setEditingLibrary(null)
      setStagingForm({})
      toast.success('Staging settings reset to global defaults')
    },
  })

  // Get service name by ID
  const getServiceName = (serviceId: number) => {
    const service = services?.find(s => s.id === serviceId)
    return service?.name || 'Unknown'
  }

  // Get staging settings for a library
  const getStagingSettings = (libraryId: number) => {
    return libraryStagingSettings?.find(s => s.library_id === libraryId)
  }

  // Check if there are any Emby/Jellyfin services configured
  const hasMediaServers = services?.some(
    s => s.service_type === 'emby' || s.service_type === 'jellyfin'
  )

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Libraries</h1>
          <p className="text-gray-500 dark:text-dark-400 mt-1">
            Libraries are synced automatically from your Emby/Jellyfin servers
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

      {!hasMediaServers && (
        <div className="bg-dark-800 rounded-xl border border-amber-500/30 shadow-lg bg-amber-500/10">
          <div className="p-6">
            <p className="text-amber-400">
              No Emby or Jellyfin services configured. Add a media server in the Services section to sync libraries.
            </p>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 shadow-lg animate-pulse">
              <div className="p-6 h-32" />
            </div>
          ))}
        </div>
      ) : libraries && libraries.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {libraries.map((library) => {
            const stagingSettings = getStagingSettings(library.id)
            const isEditing = editingLibrary === library.id
            
            return (
            <div key={library.id} className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 shadow-lg">
              <div className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      library.is_enabled ? 'bg-primary-600/20' : 'bg-gray-200 dark:bg-dark-600'
                    }`}>
                      <FolderIcon className={`w-5 h-5 ${
                        library.is_enabled ? 'text-primary-400' : 'text-dark-400'
                      }`} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white">{library.name}</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-500 dark:text-dark-400">
                        {getServiceName(library.service_connection_id)}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => toggleMutation.mutate(library.id)}
                    disabled={toggleMutation.isPending}
                    className={`relative w-12 h-6 rounded-full transition-colors ${
                      library.is_enabled ? 'bg-primary-600' : 'bg-gray-300 dark:bg-dark-600'
                    }`}
                    title={library.is_enabled ? 'Click to disable' : 'Click to enable'}
                  >
                    <div
                      className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                        library.is_enabled ? 'translate-x-6' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>

                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-dark-700">
                  <div className="flex flex-wrap gap-2 text-sm">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      library.media_type === 'movie' 
                        ? 'bg-primary-500/20 text-primary-400' 
                        : 'bg-green-500/20 text-green-400'
                    }`}>
                      {library.media_type === 'movie' ? 'Movies' : 'Series'}
                    </span>
                    <span className={`flex items-center gap-1 ${library.is_enabled ? 'text-green-400' : 'text-dark-400'}`}>
                      {library.is_enabled ? (
                        <>
                          <CheckCircleIcon className="w-4 h-4" />
                          Enabled
                        </>
                      ) : (
                        <>
                          <XCircleIcon className="w-4 h-4" />
                          Disabled
                        </>
                      )}
                    </span>
                    {stagingSettings && (
                      <span className={`flex items-center gap-1 ${stagingSettings.effective_enabled ? 'text-yellow-400' : 'text-dark-400'}`}>
                        <ArchiveBoxIcon className="w-4 h-4" />
                        {stagingSettings.effective_enabled ? 'Staging On' : 'Staging Off'}
                        {stagingSettings.uses_custom_settings && <span className="text-xs">(custom)</span>}
                      </span>
                    )}
                  </div>
                  {library.path && (
                    <p className="text-xs text-gray-400 dark:text-dark-500 mt-2 truncate" title={library.path}>
                      {library.path}
                    </p>
                  )}
                  {library.last_synced_at && (
                    <p className="text-xs text-gray-400 dark:text-dark-500 mt-1">
                      Synced {formatRelativeTime(library.last_synced_at)}
                    </p>
                  )}
                </div>

                {/* Staging Settings */}
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-dark-700">
                  {isEditing ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-sm text-gray-600 dark:text-dark-300">Enable Staging</label>
                        <select
                          value={stagingForm.staging_enabled === null ? 'global' : stagingForm.staging_enabled ? 'true' : 'false'}
                          onChange={(e) => setStagingForm({
                            ...stagingForm,
                            staging_enabled: e.target.value === 'global' ? null : e.target.value === 'true'
                          })}
                          className="text-sm px-2 py-1 bg-white dark:bg-dark-700 border border-gray-300 dark:border-dark-600 rounded text-gray-900 dark:text-white"
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
                          value={stagingForm.staging_path ?? ''}
                          onChange={(e) => setStagingForm({ ...stagingForm, staging_path: e.target.value || null })}
                          placeholder="Use global path"
                          className="w-full text-sm px-2 py-1 bg-white dark:bg-dark-700 border border-gray-300 dark:border-dark-600 rounded text-gray-900 dark:text-white"
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <label className="text-sm text-gray-600 dark:text-dark-300">Grace Period (days)</label>
                        <input
                          type="number"
                          min="1"
                          max="365"
                          value={stagingForm.staging_grace_period_days ?? ''}
                          onChange={(e) => setStagingForm({ 
                            ...stagingForm, 
                            staging_grace_period_days: e.target.value ? parseInt(e.target.value) : null 
                          })}
                          placeholder="Global"
                          className="w-20 text-sm px-2 py-1 bg-white dark:bg-dark-700 border border-gray-300 dark:border-dark-600 rounded text-gray-900 dark:text-white"
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <label className="text-sm text-gray-600 dark:text-dark-300">Auto-Restore</label>
                        <select
                          value={stagingForm.staging_auto_restore === null ? 'global' : stagingForm.staging_auto_restore ? 'true' : 'false'}
                          onChange={(e) => setStagingForm({
                            ...stagingForm,
                            staging_auto_restore: e.target.value === 'global' ? null : e.target.value === 'true'
                          })}
                          className="text-sm px-2 py-1 bg-white dark:bg-dark-700 border border-gray-300 dark:border-dark-600 rounded text-gray-900 dark:text-white"
                        >
                          <option value="global">Use Global</option>
                          <option value="true">Enabled</option>
                          <option value="false">Disabled</option>
                        </select>
                      </div>
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => updateStagingMutation.mutate({ libraryId: library.id, data: stagingForm })}
                          disabled={updateStagingMutation.isPending}
                          className="flex-1 text-sm px-3 py-1.5 bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => resetStagingMutation.mutate(library.id)}
                          disabled={resetStagingMutation.isPending}
                          className="text-sm px-3 py-1.5 bg-gray-200 dark:bg-dark-600 text-gray-700 dark:text-dark-200 rounded hover:bg-gray-300 dark:hover:bg-dark-500"
                        >
                          Reset
                        </button>
                        <button
                          onClick={() => { setEditingLibrary(null); setStagingForm({}) }}
                          className="text-sm px-3 py-1.5 text-gray-500 dark:text-dark-400 hover:text-gray-700 dark:hover:text-dark-200"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setEditingLibrary(library.id)
                        setStagingForm({
                          staging_enabled: stagingSettings?.staging_enabled ?? null,
                          staging_path: stagingSettings?.staging_path ?? null,
                          staging_grace_period_days: stagingSettings?.staging_grace_period_days ?? null,
                          staging_auto_restore: stagingSettings?.staging_auto_restore ?? null,
                        })
                      }}
                      className="flex items-center gap-2 text-sm text-gray-500 dark:text-dark-400 hover:text-primary-400"
                    >
                      <Cog6ToothIcon className="w-4 h-4" />
                      Configure Staging
                    </button>
                  )}
                </div>
              </div>
            </div>
          )})}
        </div>
      ) : (
        <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 shadow-lg">
          <div className="p-6 text-center py-12">
            <FolderIcon className="w-12 h-12 mx-auto text-gray-400 dark:text-dark-500" />
            <p className="text-dark-400 mt-4">No libraries synced yet</p>
            <p className="text-sm text-dark-500 mt-1">
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

      <div className="bg-gray-50 dark:bg-dark-800/50 rounded-xl border border-gray-200 dark:border-dark-700 shadow-lg">
        <div className="p-6">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-2">How it works</h3>
          <ul className="text-sm text-dark-400 space-y-2">
            <li className="flex items-start gap-2">
              <span className="text-primary-400">•</span>
              Libraries are automatically discovered from your Emby/Jellyfin servers
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary-400">•</span>
              Enable or disable libraries to include/exclude them from cleanup rules
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary-400">•</span>
              Only movie and series libraries are synced (music, photos, etc. are ignored)
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary-400">•</span>
              Sync again to update library names or detect new libraries
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}




