import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { FolderIcon, ArrowPathIcon, CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline'
import api from '../lib/api'
import toast from 'react-hot-toast'
import type { Library, ServiceConnection } from '../types'
import { formatRelativeTime } from '../lib/utils'

interface LibrarySyncResponse {
  synced: number
  removed: number
  message: string
}

export default function Libraries() {
  const queryClient = useQueryClient()

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

  // Get service name by ID
  const getServiceName = (serviceId: number) => {
    const service = services?.find(s => s.id === serviceId)
    return service?.name || 'Unknown'
  }

  // Check if there are any Emby/Jellyfin services configured
  const hasMediaServers = services?.some(
    s => s.service_type === 'emby' || s.service_type === 'jellyfin'
  )

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white">Libraries</h1>
          <p className="text-dark-400 mt-1">
            Libraries are synced automatically from your Emby/Jellyfin servers
          </p>
        </div>
        <button
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending || !hasMediaServers}
          className="btn-primary flex items-center gap-2"
        >
          <ArrowPathIcon className={`w-5 h-5 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
          {syncMutation.isPending ? 'Syncing...' : 'Sync Libraries'}
        </button>
      </div>

      {!hasMediaServers && (
        <div className="card bg-amber-500/10 border-amber-500/30">
          <div className="card-body">
            <p className="text-amber-400">
              No Emby or Jellyfin services configured. Add a media server in the Services section to sync libraries.
            </p>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card animate-pulse">
              <div className="card-body h-32" />
            </div>
          ))}
        </div>
      ) : libraries && libraries.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {libraries.map((library) => (
            <div key={library.id} className="card">
              <div className="card-body">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      library.is_enabled ? 'bg-primary-600/20' : 'bg-dark-600'
                    }`}>
                      <FolderIcon className={`w-5 h-5 ${
                        library.is_enabled ? 'text-primary-400' : 'text-dark-400'
                      }`} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white">{library.name}</h3>
                      <p className="text-sm text-dark-400">
                        {getServiceName(library.service_connection_id)}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => toggleMutation.mutate(library.id)}
                    disabled={toggleMutation.isPending}
                    className={`w-12 h-6 rounded-full transition-colors ${
                      library.is_enabled ? 'bg-primary-600' : 'bg-dark-600'
                    }`}
                    title={library.is_enabled ? 'Click to disable' : 'Click to enable'}
                  >
                    <div
                      className={`w-5 h-5 bg-white rounded-full transition-transform ${
                        library.is_enabled ? 'translate-x-6' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>

                <div className="mt-4 pt-4 border-t border-dark-700">
                  <div className="flex flex-wrap gap-2 text-sm">
                    <span className={`badge ${library.media_type === 'movie' ? 'badge-info' : 'badge-success'}`}>
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
                  </div>
                  {library.path && (
                    <p className="text-xs text-dark-500 mt-2 truncate" title={library.path}>
                      {library.path}
                    </p>
                  )}
                  {library.last_synced_at && (
                    <p className="text-xs text-dark-500 mt-1">
                      Synced {formatRelativeTime(library.last_synced_at)}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card">
          <div className="card-body text-center py-12">
            <FolderIcon className="w-12 h-12 mx-auto text-dark-500" />
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
                className="btn-primary mt-4"
              >
                Sync Libraries
              </button>
            )}
          </div>
        </div>
      )}

      <div className="card bg-dark-800/50">
        <div className="card-body">
          <h3 className="font-semibold text-white mb-2">How it works</h3>
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
