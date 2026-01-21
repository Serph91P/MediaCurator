import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { PlusIcon, TrashIcon, ArrowPathIcon, CheckCircleIcon, XCircleIcon, PencilIcon } from '@heroicons/react/24/outline'
import api from '../lib/api'
import toast from 'react-hot-toast'
import { formatDateTime } from '../lib/utils'
import type { ServiceConnection, ServiceConnectionCreate, ServiceType } from '../types'

const serviceTypes: { value: ServiceType; label: string; category: string }[] = [
  { value: 'sonarr', label: 'Sonarr', category: 'Download Manager' },
  { value: 'radarr', label: 'Radarr', category: 'Download Manager' },
  { value: 'emby', label: 'Emby', category: 'Media Server' },
  { value: 'jellyfin', label: 'Jellyfin', category: 'Media Server' },
  { value: 'jellystat', label: 'Jellystat', category: 'Media Server' },
]

const getServiceCategory = (type: ServiceType): string => {
  const service = serviceTypes.find(s => s.value === type)
  return service?.category || 'Other'
}

export default function Services() {
  const queryClient = useQueryClient()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingService, setEditingService] = useState<ServiceConnection | null>(null)

  const { data: services, isLoading } = useQuery({
    queryKey: ['services'],
    queryFn: async () => {
      const res = await api.get<ServiceConnection[]>('/services/')
      return res.data
    },
  })

  const createMutation = useMutation({
    mutationFn: async (data: ServiceConnectionCreate) => {
      const res = await api.post('/services/', data)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] })
      setIsModalOpen(false)
      setEditingService(null)
      toast.success('Service created')
    },
    onError: () => toast.error('Failed to create service'),
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: ServiceConnectionCreate }) => {
      const res = await api.put(`/services/${id}`, data)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] })
      setIsModalOpen(false)
      setEditingService(null)
      toast.success('Service updated')
    },
    onError: () => toast.error('Failed to update service'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/services/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] })
      toast.success('Service deleted')
    },
    onError: () => toast.error('Failed to delete service'),
  })

  const testMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await api.post(`/services/${id}/test`)
      return res.data
    },
    onSuccess: (data) => {
      if (data.success) {
        toast.success(`Connection successful! Version: ${data.version}`)
      } else {
        toast.error(`Connection failed: ${data.message}`)
      }
    },
    onError: () => toast.error('Test failed'),
  })

  const syncMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await api.post(`/services/${id}/sync`)
      return res.data
    },
    onSuccess: (data) => {
      toast.success(`Synced: ${data.added} added, ${data.updated} updated`)
    },
    onError: () => toast.error('Sync failed'),
  })

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Services</h1>
          <p className="text-gray-500 dark:text-dark-400 mt-1">Manage Sonarr, Radarr, Emby connections</p>
        </div>
        <button onClick={() => setIsModalOpen(true)} className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 focus:outline-2 focus:outline-offset-2 focus:outline-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors gap-2">
          <PlusIcon className="w-5 h-5" />
          Add Service
        </button>
      </div>

      {isLoading ? (
        <div className="grid gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 shadow-lg animate-pulse">
              <div className="p-6 h-24" />
            </div>
          ))}
        </div>
      ) : services && services.length > 0 ? (
        <div className="space-y-8">
          {/* Group services by category */}
          {['Download Manager', 'Media Server'].map((category) => {
            const categoryServices = services.filter(
              (s) => getServiceCategory(s.service_type) === category
            )
            
            if (categoryServices.length === 0) return null

            return (
              <div key={category}>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <div className="w-1 h-6 bg-primary-500 rounded-full"></div>
                  {category}
                </h2>
                <div className="grid gap-4">
                  {categoryServices.map((service) => (
                    <div key={service.id} className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 shadow-lg">
                      <div className="p-6 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className={`p-3 rounded-lg ${service.is_enabled ? 'bg-green-500/20' : 'bg-gray-200 dark:bg-dark-700'}`}>
                            {service.is_enabled ? (
                              <CheckCircleIcon className="w-6 h-6 text-green-400" />
                            ) : (
                              <XCircleIcon className="w-6 h-6 text-gray-400 dark:text-dark-400" />
                            )}
                          </div>
                          <div>
                            <h3 className="font-semibold text-gray-900 dark:text-white">{service.name}</h3>
                            <p className="text-sm text-gray-500 dark:text-dark-400">
                              {service.service_type.toUpperCase()} • {service.url}
                            </p>
                            {service.last_sync && (
                              <p className="text-xs text-gray-400 dark:text-dark-500">
                                Last sync: {formatDateTime(service.last_sync)}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setEditingService(service)
                              setIsModalOpen(true)
                            }}
                            className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium bg-transparent text-dark-300 rounded-lg hover:bg-dark-800 hover:text-gray-800 dark:text-dark-100 focus:outline-2 focus:outline-offset-2 focus:outline-dark-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            title="Edit"
                          >
                            <PencilIcon className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => testMutation.mutate(service.id)}
                            disabled={testMutation.isPending}
                            className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium bg-transparent text-dark-300 rounded-lg hover:bg-dark-800 hover:text-gray-800 dark:text-dark-100 focus:outline-2 focus:outline-offset-2 focus:outline-dark-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            title="Test Connection"
                          >
                            <CheckCircleIcon className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => syncMutation.mutate(service.id)}
                            disabled={syncMutation.isPending}
                            className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium bg-transparent text-dark-300 rounded-lg hover:bg-dark-800 hover:text-gray-800 dark:text-dark-100 focus:outline-2 focus:outline-offset-2 focus:outline-dark-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            title="Sync"
                          >
                            <ArrowPathIcon className={`w-5 h-5 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
                          </button>
                          <button
                            onClick={() => deleteMutation.mutate(service.id)}
                            disabled={deleteMutation.isPending}
                            className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium bg-transparent text-red-400 rounded-lg hover:bg-dark-800 hover:text-red-300 focus:outline-2 focus:outline-offset-2 focus:outline-dark-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            title="Delete"
                          >
                            <TrashIcon className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 shadow-lg">
          <div className="p-6 text-center py-12">
            <p className="text-gray-500 dark:text-dark-400">No services configured yet</p>
            <button onClick={() => setIsModalOpen(true)} className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 focus:outline-2 focus:outline-offset-2 focus:outline-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors mt-4">
              Add your first service
            </button>
          </div>
        </div>
      )}

      {/* Add/Edit Service Modal */}
      {isModalOpen && (
        <ServiceModal
          onClose={() => {
            setIsModalOpen(false)
            setEditingService(null)
          }}
          onSubmit={(data) => {
            if (editingService) {
              updateMutation.mutate({ id: editingService.id, data })
            } else {
              createMutation.mutate(data)
            }
          }}
          isLoading={createMutation.isPending || updateMutation.isPending}
          initialData={editingService}
        />
      )}
    </div>
  )
}

function ServiceModal({
  onClose,
  onSubmit,
  isLoading,
  initialData,
}: {
  onClose: () => void
  onSubmit: (data: ServiceConnectionCreate) => void
  isLoading: boolean
  initialData?: ServiceConnection | null
}) {
  const [formData, setFormData] = useState<ServiceConnectionCreate>({
    name: initialData?.name || '',
    service_type: initialData?.service_type || 'sonarr',
    url: initialData?.url || '',
    api_key: initialData?.api_key || '',
    is_enabled: initialData?.is_enabled ?? true,
    verify_ssl: initialData?.verify_ssl ?? true,
    timeout: initialData?.timeout || 30,
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(formData)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 shadow-lg w-full max-w-md mx-4">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-dark-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {initialData ? 'Edit Service' : 'Add Service'}
          </h2>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-200 mb-1">Name</label>
              <input
                type="text"
                className="block w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-gray-800 dark:text-dark-100 placeholder-dark-400 focus:outline-2 focus:outline-primary-500 focus:border-transparent transition-colors"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="My Sonarr Server"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-200 mb-1">Service Type</label>
              <select
                className="block w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-gray-800 dark:text-dark-100 placeholder-dark-400 focus:outline-2 focus:outline-primary-500 focus:border-transparent transition-colors"
                value={formData.service_type}
                onChange={(e) => setFormData({ ...formData, service_type: e.target.value as ServiceType })}
              >
                {serviceTypes.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-200 mb-1">URL</label>
              <input
                type="url"
                className="block w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-gray-800 dark:text-dark-100 placeholder-dark-400 focus:outline-2 focus:outline-primary-500 focus:border-transparent transition-colors"
                value={formData.url}
                onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                placeholder="http://localhost:8989"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-200 mb-1">API Key</label>
              <input
                type="password"
                className="block w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-gray-800 dark:text-dark-100 placeholder-dark-400 focus:outline-2 focus:outline-primary-500 focus:border-transparent transition-colors"
                value={formData.api_key}
                onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
                placeholder="Enter API key"
                required
              />
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.is_enabled}
                  onChange={(e) => setFormData({ ...formData, is_enabled: e.target.checked })}
                  className="rounded border-dark-600 bg-dark-700 text-primary-500 focus:ring-primary-500"
                />
                <span className="text-sm text-dark-200">Enabled</span>
              </label>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.verify_ssl}
                  onChange={(e) => setFormData({ ...formData, verify_ssl: e.target.checked })}
                  className="rounded border-dark-600 bg-dark-700 text-primary-500 focus:ring-primary-500"
                />
                <span className="text-sm text-dark-200">Verify SSL</span>
              </label>
            </div>
          </div>

          <div className="px-6 py-4 border-t border-gray-200 dark:border-dark-700 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium bg-gray-200 dark:bg-dark-700 text-gray-800 dark:text-dark-100 rounded-lg hover:bg-gray-300 dark:hover:bg-dark-600 focus:outline-2 focus:outline-offset-2 focus:outline-dark-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={isLoading} className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 focus:outline-2 focus:outline-offset-2 focus:outline-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {isLoading ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}




