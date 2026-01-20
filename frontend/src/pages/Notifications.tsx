import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { PlusIcon, TrashIcon, BellIcon, BellAlertIcon, CheckCircleIcon } from '@heroicons/react/24/outline'
import api from '../lib/api'
import toast from 'react-hot-toast'
import type { NotificationChannel, NotificationChannelCreate, NotificationType } from '../types'

// Apprise supports 90+ notification services via URLs
// Examples: discord://webhook_id/webhook_token, ntfy://ntfy.sh/topic, tgram://bot_token/chat_id

const notificationTypes = [
  { value: 'apprise', label: 'Apprise', description: 'Universal notification gateway supporting 90+ services' },
]

export default function Notifications() {
  const queryClient = useQueryClient()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingChannel, setEditingChannel] = useState<NotificationChannel | null>(null)

  const { data: channels, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const res = await api.get<NotificationChannel[]>('/notifications/')
      return res.data
    },
  })

  const createMutation = useMutation({
    mutationFn: async (data: NotificationChannelCreate) => {
      const res = await api.post('/notifications/', data)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      setIsModalOpen(false)
      toast.success('Notification channel created')
    },
    onError: () => toast.error('Failed to create channel'),
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<NotificationChannelCreate> }) => {
      const res = await api.put(`/notifications/${id}`, data)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      setEditingChannel(null)
      setIsModalOpen(false)
      toast.success('Notification channel updated')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/notifications/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      toast.success('Notification channel deleted')
    },
  })

  const testMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await api.post(`/notifications/${id}/test`)
      return res.data
    },
    onSuccess: () => toast.success('Test notification sent!'),
    onError: () => toast.error('Failed to send test notification'),
  })

  const toggleMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await api.post(`/notifications/${id}/toggle`)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white">Notifications</h1>
          <p className="text-dark-400 mt-1">Configure notification channels for cleanup events</p>
        </div>
        <button
          onClick={() => {
            setEditingChannel(null)
            setIsModalOpen(true)
          }}
          className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 focus:outline-2 focus:outline-offset-2 focus:outline-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
        >
          <PlusIcon className="w-5 h-5" />
          Add Channel
        </button>
      </div>

      {/* Channel Types Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {notificationTypes.map((type) => (
          <button
            key={type.value}
            onClick={() => {
              setEditingChannel(null)
              setIsModalOpen(true)
            }}
            className="card text-left hover:border-primary-500/50 transition-colors"
          >
            <div className="p-6">
              <div className="flex items-center gap-2">
                <BellIcon className="w-5 h-5 text-primary-400" />
                <h3 className="font-medium text-white">{type.label}</h3>
              </div>
              <p className="text-sm text-dark-400 mt-2">{type.description}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Channels List */}
      {isLoading ? (
        <div className="space-y-4">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="bg-dark-800 rounded-xl border border-dark-700 shadow-lg animate-pulse">
              <div className="p-6 h-24" />
            </div>
          ))}
        </div>
      ) : channels && channels.length > 0 ? (
        <div className="space-y-4">
          {channels.map((channel) => (
            <div key={channel.id} className="bg-dark-800 rounded-xl border border-dark-700 shadow-lg">
              <div className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                      channel.is_enabled ? 'bg-primary-600/20' : 'bg-dark-700'
                    }`}>
                      {channel.is_enabled ? (
                        <BellAlertIcon className="w-6 h-6 text-primary-400" />
                      ) : (
                        <BellIcon className="w-6 h-6 text-dark-500" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-3">
                        <h3 className="font-semibold text-white">{channel.name}</h3>
                        <span className="px-2 py-1 text-xs font-medium bg-primary-600/20 text-primary-400 rounded-md">
                          Apprise
                        </span>
                      </div>
                      <div className="text-sm text-dark-400 mt-1 space-y-1">
                        {((channel.config as any)?.urls || []).map((url: string, idx: number) => (
                          <p key={idx} className="font-mono text-xs">
                            {url.substring(0, 60)}{url.length > 60 && '...'}
                          </p>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {channel.notify_on_deleted && (
                          <span className="px-2 py-1 text-xs font-medium bg-red-600/20 text-red-400 rounded-md">
                            Deletions
                          </span>
                        )}
                        {channel.notify_on_flagged && (
                          <span className="px-2 py-1 text-xs font-medium bg-yellow-600/20 text-yellow-400 rounded-md">
                            Flagged
                          </span>
                        )}
                        {channel.notify_on_error && (
                          <span className="px-2 py-1 text-xs font-medium bg-orange-600/20 text-orange-400 rounded-md">
                            Errors
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleMutation.mutate(channel.id)}
                      className={`w-12 h-6 rounded-full transition-colors ${
                        channel.is_enabled ? 'bg-primary-600' : 'bg-dark-600'
                      }`}
                    >
                      <div
                        className={`w-5 h-5 bg-white rounded-full transition-transform ${
                          channel.is_enabled ? 'translate-x-6' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-dark-700">
                  <button
                    onClick={() => testMutation.mutate(channel.id)}
                    disabled={testMutation.isPending}
                    className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium bg-dark-700 text-dark-100 rounded-lg hover:bg-dark-600 focus:outline-2 focus:outline-offset-2 focus:outline-dark-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                  >
                    <CheckCircleIcon className="w-4 h-4" />
                    Test
                  </button>
                  <button
                    onClick={() => {
                      setEditingChannel(channel)
                      setIsModalOpen(true)
                    }}
                    className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium bg-transparent text-dark-300 rounded-lg hover:bg-dark-800 hover:text-dark-100 focus:outline-2 focus:outline-offset-2 focus:outline-dark-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-dark-400 hover:text-white"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate(channel.id)}
                    className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium bg-transparent text-dark-300 rounded-lg hover:bg-dark-800 hover:text-dark-100 focus:outline-2 focus:outline-offset-2 focus:outline-dark-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-red-400 hover:text-red-300"
                  >
                    <TrashIcon className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-dark-800 rounded-xl border border-dark-700 shadow-lg">
          <div className="p-6 text-center py-12">
            <BellIcon className="w-12 h-12 mx-auto text-dark-500" />
            <p className="text-dark-400 mt-4">No notification channels configured</p>
            <p className="text-sm text-dark-500 mt-1">
              Add a channel to receive alerts when media is cleaned up
            </p>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <NotificationModal
          channel={editingChannel}
          onClose={() => {
            setIsModalOpen(false)
            setEditingChannel(null)
          }}
          onSubmit={(data) => {
            if (editingChannel) {
              updateMutation.mutate({ id: editingChannel.id, data })
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

function NotificationModal({
  channel,
  onClose,
  onSubmit,
  isLoading,
}: {
  channel: NotificationChannel | null
  onClose: () => void
  onSubmit: (data: NotificationChannelCreate) => void
  isLoading: boolean
}) {
  const [formData, setFormData] = useState<NotificationChannelCreate>({
    name: channel?.name || '',
    notification_type: 'apprise',
    config: channel?.config || { urls: [''] },
    is_enabled: channel?.is_enabled ?? true,
    notify_on_flagged: channel?.notify_on_flagged ?? true,
    notify_on_deleted: channel?.notify_on_deleted ?? true,
    notify_on_error: channel?.notify_on_error ?? true,
  })

  const [urls, setUrls] = useState<string[]>(
    (channel?.config as any)?.urls || ['']
  )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit({
      ...formData,
      config: { urls: urls.filter(url => url.trim()) }
    })
  }

  const addUrl = () => {
    setUrls([...urls, ''])
  }

  const removeUrl = (index: number) => {
    setUrls(urls.filter((_, i) => i !== index))
  }

  const updateUrl = (index: number, value: string) => {
    const newUrls = [...urls]
    newUrls[index] = value
    setUrls(newUrls)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-dark-800 rounded-xl border border-dark-700 shadow-lg w-full max-w-md mx-4">
        <div className="px-6 py-4 border-b border-dark-700">
          <h2 className="text-lg font-semibold text-white">
            {channel ? 'Edit Notification Channel' : 'Add Notification Channel'}
          </h2>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-dark-200 mb-1">Name</label>
              <input
                type="text"
                className="block w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-dark-100 placeholder-dark-400 focus:outline-2 focus:outline-primary-500 focus:border-transparent transition-colors"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Discord Alerts"
                required
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-dark-200">
                  Apprise URLs
                </label>
                <a
                  href="https://github.com/caronc/apprise/wiki"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary-400 hover:text-primary-300"
                >
                  View Documentation →
                </a>
              </div>
              <p className="text-xs text-dark-400 mb-3">
                Use Apprise URL format to support 90+ services like Discord, Slack, Telegram, ntfy, etc.
              </p>
              
              <div className="space-y-2">
                {urls.map((url, index) => (
                  <div key={index} className="flex gap-2">
                    <input
                      type="text"
                      className="block w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-dark-100 placeholder-dark-400 focus:outline-2 focus:outline-primary-500 focus:border-transparent transition-colors font-mono text-sm"
                      value={url}
                      onChange={(e) => updateUrl(index, e.target.value)}
                      placeholder="discord://webhook_id/webhook_token"
                      required={index === 0}
                    />
                    {urls.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeUrl(index)}
                        className="px-3 py-2 text-red-400 hover:text-red-300 transition-colors"
                      >
                        <TrashIcon className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              
              <button
                type="button"
                onClick={addUrl}
                className="mt-2 text-sm text-primary-400 hover:text-primary-300"
              >
                + Add another URL
              </button>

              <div className="mt-3 p-3 bg-dark-700/50 rounded-lg text-xs text-dark-300 space-y-1">
                <p className="font-medium text-dark-200">Examples:</p>
                <p className="font-mono">discord://webhook_id/webhook_token</p>
                <p className="font-mono">ntfy://ntfy.sh/my_topic</p>
                <p className="font-mono">tgram://bot_token/chat_id</p>
                <p className="font-mono">slack://token_a/token_b/token_c</p>
              </div>
            </div>

            <div className="pt-4 border-t border-dark-700">
              <label className="block text-sm font-medium text-dark-200 mb-2">Trigger Events</label>
              <div className="space-y-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.notify_on_deleted}
                    onChange={(e) => setFormData({ ...formData, notify_on_deleted: e.target.checked })}
                    className="rounded border-dark-600 bg-dark-700 text-primary-500"
                  />
                  <span className="text-sm text-dark-200">Media deleted</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.notify_on_flagged}
                    onChange={(e) => setFormData({ ...formData, notify_on_flagged: e.target.checked })}
                    className="rounded border-dark-600 bg-dark-700 text-primary-500"
                  />
                  <span className="text-sm text-dark-200">Media flagged for cleanup</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.notify_on_error}
                    onChange={(e) => setFormData({ ...formData, notify_on_error: e.target.checked })}
                    className="rounded border-dark-600 bg-dark-700 text-primary-500"
                  />
                  <span className="text-sm text-dark-200">Errors</span>
                </label>
              </div>
            </div>
          </div>

          <div className="px-6 py-4 border-t border-dark-700 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium bg-dark-700 text-dark-100 rounded-lg hover:bg-dark-600 focus:outline-2 focus:outline-offset-2 focus:outline-dark-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={isLoading} className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 focus:outline-2 focus:outline-offset-2 focus:outline-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {isLoading ? 'Saving...' : channel ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
