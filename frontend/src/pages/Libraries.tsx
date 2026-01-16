import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { PlusIcon, TrashIcon, FolderIcon, ArrowPathIcon } from '@heroicons/react/24/outline'
import api from '../lib/api'
import toast from 'react-hot-toast'
import type { Library, LibraryCreate, ServiceConnection } from '../types'

export default function Libraries() {
  const queryClient = useQueryClient()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingLibrary, setEditingLibrary] = useState<Library | null>(null)

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

  const createMutation = useMutation({
    mutationFn: async (data: LibraryCreate) => {
      const res = await api.post('/libraries/', data)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['libraries'] })
      setIsModalOpen(false)
      toast.success('Library created')
    },
    onError: () => toast.error('Failed to create library'),
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<LibraryCreate> }) => {
      const res = await api.put(`/libraries/${id}`, data)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['libraries'] })
      setEditingLibrary(null)
      setIsModalOpen(false)
      toast.success('Library updated')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/libraries/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['libraries'] })
      toast.success('Library deleted')
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

  const syncMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await api.post(`/libraries/${id}/sync`)
      return res.data
    },
    onSuccess: () => {
      toast.success('Sync started')
    },
    onError: () => toast.error('Sync failed'),
  })

  const embyServices = services?.filter((s) => s.service_type === 'emby') || []

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white">Libraries</h1>
          <p className="text-dark-400 mt-1">Manage your media libraries for cleanup</p>
        </div>
        <button
          onClick={() => {
            setEditingLibrary(null)
            setIsModalOpen(true)
          }}
          className="btn-primary flex items-center gap-2"
        >
          <PlusIcon className="w-5 h-5" />
          Add Library
        </button>
      </div>

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
                    <div className="w-10 h-10 rounded-lg bg-primary-600/20 flex items-center justify-center">
                      <FolderIcon className="w-5 h-5 text-primary-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white">{library.name}</h3>
                      <p className="text-sm text-dark-400">{library.emby_library_id}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => toggleMutation.mutate(library.id)}
                    className={`w-12 h-6 rounded-full transition-colors ${
                      library.is_enabled ? 'bg-primary-600' : 'bg-dark-600'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 bg-white rounded-full transition-transform ${
                        library.is_enabled ? 'translate-x-6' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>

                <div className="mt-4 pt-4 border-t border-dark-700">
                  <div className="flex flex-wrap gap-2 text-sm text-dark-400">
                    <span className={`badge ${library.media_type === 'movie' ? 'badge-info' : 'badge-success'}`}>
                      {library.media_type}
                    </span>
                    {library.path && (
                      <span className="badge bg-dark-600 text-dark-300">
                        {library.path}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex justify-end gap-2 mt-4">
                  <button
                    onClick={() => syncMutation.mutate(library.id)}
                    disabled={syncMutation.isPending}
                    className="btn-ghost text-primary-400"
                    title="Sync library"
                  >
                    <ArrowPathIcon className={`w-5 h-5 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
                  </button>
                  <button
                    onClick={() => {
                      setEditingLibrary(library)
                      setIsModalOpen(true)
                    }}
                    className="btn-ghost text-dark-400 hover:text-white"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate(library.id)}
                    className="btn-ghost text-red-400 hover:text-red-300"
                  >
                    <TrashIcon className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card">
          <div className="card-body text-center py-12">
            <FolderIcon className="w-12 h-12 mx-auto text-dark-500" />
            <p className="text-dark-400 mt-4">No libraries configured</p>
            <p className="text-sm text-dark-500 mt-1">
              Add libraries from your Emby server to start managing them
            </p>
            <button
              onClick={() => setIsModalOpen(true)}
              className="btn-primary mt-4"
            >
              Add Library
            </button>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <LibraryModal
          library={editingLibrary}
          embyServices={embyServices}
          onClose={() => {
            setIsModalOpen(false)
            setEditingLibrary(null)
          }}
          onSubmit={(data) => {
            if (editingLibrary) {
              updateMutation.mutate({ id: editingLibrary.id, data })
            } else {
              createMutation.mutate(data)
            }
          }}
          isLoading={createMutation.isPending || updateMutation.isPending}
        />
      )}
    </div>
  )
}

function LibraryModal({
  library,
  embyServices,
  onClose,
  onSubmit,
  isLoading,
}: {
  library: Library | null
  embyServices: ServiceConnection[]
  onClose: () => void
  onSubmit: (data: LibraryCreate) => void
  isLoading: boolean
}) {
  const [formData, setFormData] = useState<LibraryCreate>({
    name: library?.name || '',
    emby_service_id: library?.emby_service_id || embyServices[0]?.id || 0,
    emby_library_id: library?.emby_library_id || '',
    media_type: library?.media_type || 'movie',
    path: library?.path || '',
    is_enabled: library?.is_enabled ?? true,
  })

  const [embyLibraries, setEmbyLibraries] = useState<{ id: string; name: string }[]>([])
  const [loadingLibraries, setLoadingLibraries] = useState(false)

  const fetchEmbyLibraries = async (serviceId: number) => {
    setLoadingLibraries(true)
    try {
      const res = await api.get<{ id: string; name: string }[]>(`/services/${serviceId}/libraries`)
      setEmbyLibraries(res.data)
    } catch {
      toast.error('Failed to fetch libraries')
    } finally {
      setLoadingLibraries(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(formData)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="card w-full max-w-md mx-4">
        <div className="card-header">
          <h2 className="text-lg font-semibold text-white">
            {library ? 'Edit Library' : 'Add Library'}
          </h2>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="card-body space-y-4">
            <div>
              <label className="label">Name</label>
              <input
                type="text"
                className="input"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Movies Library"
                required
              />
            </div>

            <div>
              <label className="label">Emby Server</label>
              <div className="flex gap-2">
                <select
                  className="input flex-1"
                  value={formData.emby_service_id || ''}
                  onChange={(e) => setFormData({
                    ...formData,
                    emby_service_id: parseInt(e.target.value)
                  })}
                >
                  <option value="">Select Emby server</option>
                  {embyServices.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => formData.emby_service_id && fetchEmbyLibraries(formData.emby_service_id)}
                  disabled={!formData.emby_service_id || loadingLibraries}
                  className="btn-secondary"
                >
                  {loadingLibraries ? 'Loading...' : 'Load'}
                </button>
              </div>
            </div>

            {embyLibraries.length > 0 ? (
              <div>
                <label className="label">Emby Library</label>
                <select
                  className="input"
                  value={formData.emby_library_id}
                  onChange={(e) => {
                    const lib = embyLibraries.find((l) => l.id === e.target.value)
                    setFormData({
                      ...formData,
                      emby_library_id: e.target.value,
                      name: lib?.name || formData.name,
                    })
                  }}
                >
                  <option value="">Select library</option>
                  {embyLibraries.map((lib) => (
                    <option key={lib.id} value={lib.id}>
                      {lib.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="label">Emby Library ID</label>
                <input
                  type="text"
                  className="input"
                  value={formData.emby_library_id}
                  onChange={(e) => setFormData({ ...formData, emby_library_id: e.target.value })}
                  placeholder="Library ID"
                  required
                />
              </div>
            )}

            <div>
              <label className="label">Media Type</label>
              <select
                className="input"
                value={formData.media_type}
                onChange={(e) => setFormData({ ...formData, media_type: e.target.value as 'movie' | 'series' })}
              >
                <option value="movie">Movies</option>
                <option value="series">Series</option>
              </select>
            </div>

            <div>
              <label className="label">Path (optional)</label>
              <input
                type="text"
                className="input"
                value={formData.path || ''}
                onChange={(e) => setFormData({ ...formData, path: e.target.value })}
                placeholder="/media/movies"
              />
              <p className="text-xs text-dark-500 mt-1">
                Override path for disk space checks
              </p>
            </div>
          </div>

          <div className="px-6 py-4 border-t border-dark-700 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={isLoading} className="btn-primary">
              {isLoading ? 'Saving...' : library ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
