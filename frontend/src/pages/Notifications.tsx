import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { PlusIcon, TrashIcon, BellIcon, BellAlertIcon, CheckCircleIcon, ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline'
import api from '../lib/api'
import toast from 'react-hot-toast'
import type { NotificationChannel, NotificationChannelCreate, NotificationType, NotificationEventType, EventTypeInfo, TemplatePreviewResponse } from '../types'

// Apprise supports 90+ notification services via URLs
// Examples: discord://webhook_id/webhook_token, ntfy://ntfy.sh/topic, tgram://bot_token/chat_id

const notificationTypes = [
  { value: 'apprise', label: 'Apprise', description: 'Universal notification gateway supporting 90+ services' },
]

// Available event types for the UI
const eventTypeLabels: Record<NotificationEventType, { label: string; color: string }> = {
  media_flagged: { label: 'Media Flagged', color: 'yellow' },
  media_deleted: { label: 'Media Deleted', color: 'red' },
  media_staged: { label: 'Media Staged', color: 'blue' },
  media_restored: { label: 'Media Restored', color: 'green' },
  cleanup_started: { label: 'Cleanup Started', color: 'purple' },
  cleanup_completed: { label: 'Cleanup Completed', color: 'green' },
  sync_completed: { label: 'Sync Completed', color: 'blue' },
  error: { label: 'Errors', color: 'orange' },
  test: { label: 'Test', color: 'gray' },
}

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
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Notifications</h1>
          <p className="text-gray-500 dark:text-dark-400 mt-1">Configure notification channels for cleanup events</p>
        </div>
        <button
          onClick={() => {
            setEditingChannel(null)
            setIsModalOpen(true)
          }}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 focus:outline-2 focus:outline-offset-2 focus:outline-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
                <h3 className="font-medium text-gray-900 dark:text-white">{type.label}</h3>
              </div>
              <p className="text-sm text-gray-500 dark:text-dark-400 mt-2">{type.description}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Channels List */}
      {isLoading ? (
        <div className="space-y-4">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 shadow-lg animate-pulse">
              <div className="p-6 h-24" />
            </div>
          ))}
        </div>
      ) : channels && channels.length > 0 ? (
        <div className="space-y-4">
          {channels.map((channel) => (
            <div key={channel.id} className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 shadow-lg">
              <div className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                      channel.is_enabled ? 'bg-primary-600/20' : 'bg-gray-200 dark:bg-dark-700'
                    }`}>
                      {channel.is_enabled ? (
                        <BellAlertIcon className="w-6 h-6 text-primary-400" />
                      ) : (
                        <BellIcon className="w-6 h-6 text-gray-400 dark:text-dark-500" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-3">
                        <h3 className="font-semibold text-gray-900 dark:text-white">{channel.name}</h3>
                        <span className="px-2 py-1 text-xs font-medium bg-primary-600/20 text-primary-400 rounded-md">
                          Apprise
                        </span>
                      </div>
                      <div className="text-sm text-gray-500 dark:text-dark-400 mt-1 space-y-1">
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
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-dark-800 ${
                        channel.is_enabled ? 'bg-primary-600' : 'bg-gray-300 dark:bg-dark-600'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-lg transition-transform ${
                          channel.is_enabled ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-gray-200 dark:border-dark-700">
                  <button
                    onClick={() => testMutation.mutate(channel.id)}
                    disabled={testMutation.isPending}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium bg-gray-200 dark:bg-dark-700 text-gray-800 dark:text-dark-100 rounded-lg hover:bg-gray-300 dark:hover:bg-dark-600 focus:outline-2 focus:outline-offset-2 focus:outline-dark-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <CheckCircleIcon className="w-4 h-4" />
                    Test
                  </button>
                  <button
                    onClick={() => {
                      setEditingChannel(channel)
                      setIsModalOpen(true)
                    }}
                    className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-gray-500 dark:text-dark-300 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-700 hover:text-gray-700 dark:hover:text-white focus:outline-2 focus:outline-offset-2 focus:outline-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate(channel.id)}
                    className="inline-flex items-center justify-center p-2 text-sm font-medium text-red-400 rounded-lg hover:bg-red-500/10 hover:text-red-300 focus:outline-2 focus:outline-offset-2 focus:outline-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <TrashIcon className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 shadow-lg">
          <div className="p-6 text-center py-12">
            <BellIcon className="w-12 h-12 mx-auto text-gray-400 dark:text-dark-500" />
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
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [templatePreview, setTemplatePreview] = useState<TemplatePreviewResponse | null>(null)
  const [testPending, setTestPending] = useState(false)
  
  const [formData, setFormData] = useState<NotificationChannelCreate>({
    name: channel?.name || '',
    notification_type: 'apprise',
    config: channel?.config || { urls: [''] },
    is_enabled: channel?.is_enabled ?? true,
    notify_on_flagged: channel?.notify_on_flagged ?? true,
    notify_on_deleted: channel?.notify_on_deleted ?? true,
    notify_on_error: channel?.notify_on_error ?? true,
    event_types: channel?.event_types || null,
    title_template: channel?.title_template || null,
    message_template: channel?.message_template || null,
    max_retries: channel?.max_retries ?? 3,
    retry_backoff_base: channel?.retry_backoff_base ?? 2,
  })

  const [urls, setUrls] = useState<string[]>(
    (channel?.config as any)?.urls || ['']
  )
  
  const [useEventTypes, setUseEventTypes] = useState(!!channel?.event_types)
  const [selectedEventTypes, setSelectedEventTypes] = useState<NotificationEventType[]>(
    (channel?.event_types as NotificationEventType[]) || ['media_deleted', 'media_flagged', 'error']
  )

  // Fetch event types info from API
  const { data: eventTypesInfo } = useQuery({
    queryKey: ['notification-event-types'],
    queryFn: async () => {
      const res = await api.get<{ event_types: EventTypeInfo[] }>('/notifications/event-types')
      return res.data.event_types
    },
  })

  // Preview template
  const previewMutation = useMutation({
    mutationFn: async (data: { title_template?: string; message_template?: string; event_type: string }) => {
      const res = await api.post<TemplatePreviewResponse>('/notifications/preview-template', data)
      return res.data
    },
    onSuccess: (data) => setTemplatePreview(data),
    onError: () => toast.error('Failed to preview template'),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit({
      ...formData,
      config: { urls: urls.filter(url => url.trim()) },
      event_types: useEventTypes ? selectedEventTypes : null,
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

  const toggleEventType = (eventType: NotificationEventType) => {
    if (selectedEventTypes.includes(eventType)) {
      setSelectedEventTypes(selectedEventTypes.filter(t => t !== eventType))
    } else {
      setSelectedEventTypes([...selectedEventTypes, eventType])
    }
  }

  const handlePreviewTemplate = () => {
    previewMutation.mutate({
      title_template: formData.title_template || undefined,
      message_template: formData.message_template || undefined,
      event_type: 'media_deleted',
    })
  }

  const handleTestUrls = async () => {
    const validUrls = urls.filter(url => url.trim())
    if (validUrls.length === 0) {
      toast.error('Please add at least one URL to test')
      return
    }
    
    setTestPending(true)
    try {
      await api.post('/notifications/test-apprise', { urls: validUrls })
      toast.success('Test notification sent successfully!')
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Test failed')
    } finally {
      setTestPending(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 shadow-lg w-full max-w-lg my-4">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-dark-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {channel ? 'Edit Notification Channel' : 'Add Notification Channel'}
          </h2>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-200 mb-1">Name</label>
              <input
                type="text"
                className="block w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-gray-800 dark:text-dark-100 placeholder-dark-400 focus:outline-2 focus:outline-primary-500 focus:border-transparent transition-colors"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Discord Alerts"
                required
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-200">
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
                      className="block w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-gray-800 dark:text-dark-100 placeholder-dark-400 focus:outline-2 focus:outline-primary-500 focus:border-transparent transition-colors font-mono text-sm"
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
            </div>

            {/* Event Types Section */}
            <div className="pt-4 border-t border-gray-200 dark:border-dark-700">
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-200">Trigger Events</label>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={useEventTypes}
                    onChange={(e) => setUseEventTypes(e.target.checked)}
                    className="rounded border-dark-600 bg-dark-700 text-primary-500"
                  />
                  <span className="text-gray-500 dark:text-dark-400">Use granular event types</span>
                </label>
              </div>
              
              {useEventTypes ? (
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(eventTypeLabels).filter(([key]) => key !== 'test').map(([eventType, info]) => (
                    <label
                      key={eventType}
                      className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                        selectedEventTypes.includes(eventType as NotificationEventType)
                          ? `border-${info.color}-500/50 bg-${info.color}-600/10`
                          : 'border-dark-600 hover:border-dark-500'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedEventTypes.includes(eventType as NotificationEventType)}
                        onChange={() => toggleEventType(eventType as NotificationEventType)}
                        className="rounded border-dark-600 bg-dark-700 text-primary-500"
                      />
                      <span className="text-sm text-dark-200">{info.label}</span>
                    </label>
                  ))}
                </div>
              ) : (
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
              )}
            </div>

            {/* Templates Section */}
            <div className="pt-4 border-t border-gray-200 dark:border-dark-700">
              <button
                type="button"
                onClick={() => setShowTemplates(!showTemplates)}
                className="flex items-center justify-between w-full text-left"
              >
                <span className="text-sm font-medium text-gray-700 dark:text-dark-200">Message Templates</span>
                {showTemplates ? (
                  <ChevronUpIcon className="w-4 h-4 text-dark-400" />
                ) : (
                  <ChevronDownIcon className="w-4 h-4 text-dark-400" />
                )}
              </button>
              
              {showTemplates && (
                <div className="mt-3 space-y-3">
                  <p className="text-xs text-gray-500 dark:text-dark-400">
                    Customize notification messages using template variables. Leave empty for defaults.
                  </p>
                  
                  <div>
                    <label className="block text-xs font-medium text-dark-300 mb-1">Title Template</label>
                    <input
                      type="text"
                      className="block w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-gray-800 dark:text-dark-100 placeholder-dark-400 focus:outline-2 focus:outline-primary-500 focus:border-transparent transition-colors text-sm"
                      value={formData.title_template || ''}
                      onChange={(e) => setFormData({ ...formData, title_template: e.target.value || null })}
                      placeholder="Media Deleted: {{count}} items"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-xs font-medium text-dark-300 mb-1">Message Template</label>
                    <textarea
                      className="block w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-gray-800 dark:text-dark-100 placeholder-dark-400 focus:outline-2 focus:outline-primary-500 focus:border-transparent transition-colors text-sm"
                      rows={3}
                      value={formData.message_template || ''}
                      onChange={(e) => setFormData({ ...formData, message_template: e.target.value || null })}
                      placeholder="**{{count}}** items deleted&#10;**Space freed:** {{size}}&#10;{{#rule_name}}**Rule:** {{rule_name}}{{/rule_name}}"
                    />
                  </div>
                  
                  <div className="p-2 bg-dark-700/50 rounded-lg text-xs text-gray-500 dark:text-dark-400">
                    <p className="font-medium text-dark-300 mb-1">Available variables:</p>
                    <p><code className="text-primary-400">{"{{count}}"}</code> - Number of items</p>
                    <p><code className="text-primary-400">{"{{size}}"}</code> - Total size</p>
                    <p><code className="text-primary-400">{"{{rule_name}}"}</code> - Cleanup rule name</p>
                    <p><code className="text-primary-400">{"{{library_name}}"}</code> - Library name</p>
                    <p><code className="text-primary-400">{"{{media_title}}"}</code> - Media title</p>
                    <p><code className="text-primary-400">{"{{timestamp}}"}</code> - Current time</p>
                  </div>
                  
                  <button
                    type="button"
                    onClick={handlePreviewTemplate}
                    disabled={previewMutation.isPending}
                    className="text-sm text-primary-400 hover:text-primary-300"
                  >
                    {previewMutation.isPending ? 'Loading...' : 'Preview with sample data →'}
                  </button>
                  
                  {templatePreview && (
                    <div className="p-3 bg-dark-700 rounded-lg space-y-2">
                      <p className="text-xs font-medium text-dark-300">Preview:</p>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{templatePreview.rendered_title}</p>
                      <p className="text-sm text-dark-200 whitespace-pre-wrap">{templatePreview.rendered_message}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Advanced Settings */}
            <div className="pt-4 border-t border-gray-200 dark:border-dark-700">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center justify-between w-full text-left"
              >
                <span className="text-sm font-medium text-gray-700 dark:text-dark-200">Retry Settings</span>
                {showAdvanced ? (
                  <ChevronUpIcon className="w-4 h-4 text-dark-400" />
                ) : (
                  <ChevronDownIcon className="w-4 h-4 text-dark-400" />
                )}
              </button>
              
              {showAdvanced && (
                <div className="mt-3 space-y-3">
                  <p className="text-xs text-gray-500 dark:text-dark-400">
                    Configure retry behavior for failed notifications with exponential backoff.
                  </p>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-dark-300 mb-1">Max Retries</label>
                      <input
                        type="number"
                        min="0"
                        max="10"
                        className="block w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-gray-800 dark:text-dark-100 placeholder-dark-400 focus:outline-2 focus:outline-primary-500 focus:border-transparent transition-colors"
                        value={formData.max_retries}
                        onChange={(e) => setFormData({ ...formData, max_retries: parseInt(e.target.value) || 0 })}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-dark-300 mb-1">Backoff Base (s)</label>
                      <input
                        type="number"
                        min="1"
                        max="60"
                        className="block w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-gray-800 dark:text-dark-100 placeholder-dark-400 focus:outline-2 focus:outline-primary-500 focus:border-transparent transition-colors"
                        value={formData.retry_backoff_base}
                        onChange={(e) => setFormData({ ...formData, retry_backoff_base: parseInt(e.target.value) || 1 })}
                      />
                    </div>
                  </div>
                  
                  <p className="text-xs text-gray-400 dark:text-dark-500">
                    Delays: {formData.retry_backoff_base}s, {(formData.retry_backoff_base || 2) ** 1}s, {(formData.retry_backoff_base || 2) ** 2}s...
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="px-6 py-4 border-t border-gray-200 dark:border-dark-700 flex justify-between">
            <button
              type="button"
              onClick={handleTestUrls}
              disabled={testPending || urls.filter(u => u.trim()).length === 0}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium bg-gray-200 dark:bg-dark-700 text-gray-800 dark:text-dark-100 rounded-lg hover:bg-gray-300 dark:hover:bg-dark-600 focus:outline-2 focus:outline-offset-2 focus:outline-dark-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <CheckCircleIcon className="w-4 h-4" />
              {testPending ? 'Testing...' : 'Test URLs'}
            </button>
            <div className="flex gap-3">
              <button type="button" onClick={onClose} className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium bg-gray-200 dark:bg-dark-700 text-gray-800 dark:text-dark-100 rounded-lg hover:bg-gray-300 dark:hover:bg-dark-600 focus:outline-2 focus:outline-offset-2 focus:outline-dark-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={isLoading} className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 focus:outline-2 focus:outline-offset-2 focus:outline-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                {isLoading ? 'Saving...' : channel ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}




