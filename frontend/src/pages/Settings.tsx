import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Cog6ToothIcon, KeyIcon, ClockIcon, TrashIcon, ArchiveBoxIcon } from '@heroicons/react/24/outline'
import api from '../lib/api'
import toast from 'react-hot-toast'
import type { SystemSettings, SystemSettingsUpdate } from '../types'

interface StagingSettings {
  enabled: boolean
  staging_path: string
  grace_period_days: number
  library_name: string
  auto_restore_on_watch: boolean
}

export default function Settings() {
  const queryClient = useQueryClient()
  const [showPasswordChange, setShowPasswordChange] = useState(false)
  const [passwords, setPasswords] = useState({ current: '', new: '', confirm: '' })

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const res = await api.get<SystemSettings>('/system/settings')
      return res.data
    },
  })

  const { data: stagingSettings } = useQuery({
    queryKey: ['staging-settings'],
    queryFn: async () => {
      const res = await api.get<StagingSettings>('/staging/settings')
      return res.data
    },
  })

  const [stagingFormData, setStagingFormData] = useState<Partial<StagingSettings>>({})

  // Update staging form when data loads
  useEffect(() => {
    if (stagingSettings) {
      setStagingFormData(stagingSettings)
    }
  }, [stagingSettings])

  const [formData, setFormData] = useState<SystemSettingsUpdate>({
    cleanup_enabled: settings?.cleanup_enabled ?? true,
    cleanup_schedule: settings?.cleanup_schedule || '0 3 * * *',
    sync_schedule: settings?.sync_schedule || '0 * * * *',
    dry_run_mode: settings?.dry_run_mode ?? true,
    default_grace_period_days: settings?.default_grace_period_days || 7,
    max_deletions_per_run: settings?.max_deletions_per_run || 10,
  })

  const updateMutation = useMutation({
    mutationFn: async (data: SystemSettingsUpdate) => {
      const res = await api.put('/system/settings', data)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      toast.success('Settings updated')
    },
    onError: () => toast.error('Failed to update settings'),
  })

  const updateStagingMutation = useMutation({
    mutationFn: async (data: Partial<StagingSettings>) => {
      const res = await api.put('/staging/settings', data)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staging-settings'] })
      toast.success('Staging settings updated')
    },
    onError: () => toast.error('Failed to update staging settings'),
  })

  const changePasswordMutation = useMutation({
    mutationFn: async (data: { current_password: string; new_password: string }) => {
      await api.post('/auth/change-password', data)
    },
    onSuccess: () => {
      setShowPasswordChange(false)
      setPasswords({ current: '', new: '', confirm: '' })
      toast.success('Password changed successfully')
    },
    onError: () => toast.error('Failed to change password'),
  })

  const clearCacheMutation = useMutation({
    mutationFn: async () => {
      await api.post('/system/clear-cache')
    },
    onSuccess: () => toast.success('Cache cleared'),
    onError: () => toast.error('Failed to clear cache'),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    updateMutation.mutate(formData)
  }

  const handleStagingSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    updateStagingMutation.mutate(stagingFormData)
  }

  const handlePasswordChange = (e: React.FormEvent) => {
    e.preventDefault()
    if (passwords.new !== passwords.confirm) {
      toast.error('Passwords do not match')
      return
    }
    changePasswordMutation.mutate({
      current_password: passwords.current,
      new_password: passwords.new,
    })
  }

  // Update form data when settings load
  if (settings && !formData.cleanup_schedule) {
    setFormData({
      cleanup_enabled: settings.cleanup_enabled,
      cleanup_schedule: settings.cleanup_schedule,
      sync_schedule: settings.sync_schedule,
      dry_run_mode: settings.dry_run_mode,
      default_grace_period_days: settings.default_grace_period_days,
      max_deletions_per_run: settings.max_deletions_per_run,
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Settings</h1>
        <p className="text-dark-400 mt-1">Configure system settings and preferences</p>
      </div>

      {isLoading ? (
        <div className="bg-dark-800 rounded-xl border border-dark-700 shadow-lg animate-pulse">
          <div className="p-6 h-64" />
        </div>
      ) : (
        <>
          {/* General Settings */}
          <form onSubmit={handleSubmit} className="bg-dark-800 rounded-xl border border-dark-700 shadow-lg">
            <div className="px-6 py-4 border-b border-dark-700 flex items-center gap-2">
              <Cog6ToothIcon className="w-5 h-5 text-primary-400" />
              <h2 className="text-lg font-semibold text-white">General Settings</h2>
            </div>
            <div className="p-6 space-y-6">
              {/* Enable/Disable */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-white">Automatic Cleanup</h3>
                  <p className="text-sm text-dark-400">Enable or disable automated cleanup runs</p>
                </div>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, cleanup_enabled: !formData.cleanup_enabled })}
                  className={`w-14 h-7 rounded-full transition-colors ${
                    formData.cleanup_enabled ? 'bg-primary-600' : 'bg-gray-200 dark:bg-dark-600'
                  }`}
                >
                  <div
                    className={`w-6 h-6 bg-white rounded-full transition-transform ${
                      formData.cleanup_enabled ? 'translate-x-7' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>

              {/* Dry Run Mode */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-white">Dry Run Mode</h3>
                  <p className="text-sm text-dark-400">
                    Simulate cleanup without actually deleting files
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, dry_run_mode: !formData.dry_run_mode })}
                  className={`w-14 h-7 rounded-full transition-colors ${
                    formData.dry_run_mode ? 'bg-yellow-600' : 'bg-gray-200 dark:bg-dark-600'
                  }`}
                >
                  <div
                    className={`w-6 h-6 bg-white rounded-full transition-transform ${
                      formData.dry_run_mode ? 'translate-x-7' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-dark-200 mb-1 flex items-center gap-2">
                    <ClockIcon className="w-4 h-4" />
                    Cleanup Schedule (Cron)
                  </label>
                  <input
                    type="text"
                    className="block w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-gray-800 dark:text-dark-100 placeholder-dark-400 focus:outline-2 focus:outline-primary-500 focus:border-transparent transition-colors font-mono"
                    value={formData.cleanup_schedule || ''}
                    onChange={(e) => setFormData({ ...formData, cleanup_schedule: e.target.value })}
                    placeholder="0 3 * * *"
                  />
                  <p className="text-xs text-dark-500 mt-1">Default: 0 3 * * * (daily at 3 AM)</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-dark-200 mb-1 flex items-center gap-2">
                    <ClockIcon className="w-4 h-4" />
                    Sync Schedule (Cron)
                  </label>
                  <input
                    type="text"
                    className="block w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-gray-800 dark:text-dark-100 placeholder-dark-400 focus:outline-2 focus:outline-primary-500 focus:border-transparent transition-colors font-mono"
                    value={formData.sync_schedule || ''}
                    onChange={(e) => setFormData({ ...formData, sync_schedule: e.target.value })}
                    placeholder="0 * * * *"
                  />
                  <p className="text-xs text-dark-500 mt-1">Default: 0 * * * * (hourly)</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-dark-200 mb-1">Default Grace Period (days)</label>
                  <input
                    type="number"
                    className="block w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-gray-800 dark:text-dark-100 placeholder-dark-400 focus:outline-2 focus:outline-primary-500 focus:border-transparent transition-colors"
                    value={formData.default_grace_period_days || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      default_grace_period_days: parseInt(e.target.value) || 7
                    })}
                    min={0}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-dark-200 mb-1">Max Deletions Per Run</label>
                  <input
                    type="number"
                    className="block w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-gray-800 dark:text-dark-100 placeholder-dark-400 focus:outline-2 focus:outline-primary-500 focus:border-transparent transition-colors"
                    value={formData.max_deletions_per_run || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      max_deletions_per_run: parseInt(e.target.value) || 10
                    })}
                    min={1}
                  />
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-dark-700 flex justify-end">
              <button
                type="submit"
                disabled={updateMutation.isPending}
                className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 focus:outline-2 focus:outline-offset-2 focus:outline-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {updateMutation.isPending ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </form>

          {/* Staging System (Soft-Delete) */}
          <form onSubmit={handleStagingSubmit} className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 shadow-lg">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-dark-700 flex items-center gap-2">
              <ArchiveBoxIcon className="w-5 h-5 text-primary-400" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Staging System (Soft-Delete)</h2>
            </div>
            <div className="p-6 space-y-6">
              <p className="text-sm text-gray-600 dark:text-dark-300">
                Instead of immediately deleting files, move them to a staging area first. 
                Files in staging can be restored if watched again during the grace period.
              </p>
              
              {/* Enable Staging */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-gray-900 dark:text-white">Enable Staging</h3>
                  <p className="text-sm text-gray-500 dark:text-dark-400">Move files to staging instead of deleting them immediately</p>
                </div>
                <button
                  type="button"
                  onClick={() => setStagingFormData({ ...stagingFormData, enabled: !stagingFormData.enabled })}
                  className={`w-14 h-7 rounded-full transition-colors ${
                    stagingFormData.enabled ? 'bg-primary-600' : 'bg-gray-300 dark:bg-dark-600'
                  }`}
                >
                  <div
                    className={`w-6 h-6 bg-white rounded-full transition-transform ${
                      stagingFormData.enabled ? 'translate-x-7' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>

              {/* Auto-Restore on Watch */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-gray-900 dark:text-white">Auto-Restore on Watch</h3>
                  <p className="text-sm text-gray-500 dark:text-dark-400">Automatically restore files if they are watched while in staging</p>
                </div>
                <button
                  type="button"
                  onClick={() => setStagingFormData({ ...stagingFormData, auto_restore_on_watch: !stagingFormData.auto_restore_on_watch })}
                  className={`w-14 h-7 rounded-full transition-colors ${
                    stagingFormData.auto_restore_on_watch ? 'bg-primary-600' : 'bg-gray-300 dark:bg-dark-600'
                  }`}
                >
                  <div
                    className={`w-6 h-6 bg-white rounded-full transition-transform ${
                      stagingFormData.auto_restore_on_watch ? 'translate-x-7' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-200 mb-1">
                    Staging Path
                  </label>
                  <input
                    type="text"
                    className="block w-full px-3 py-2 bg-white dark:bg-dark-800 border border-gray-300 dark:border-dark-600 rounded-lg text-gray-800 dark:text-dark-100 placeholder-gray-400 dark:placeholder-dark-400 focus:outline-2 focus:outline-primary-500 focus:border-transparent transition-colors"
                    value={stagingFormData.staging_path || ''}
                    onChange={(e) => setStagingFormData({ ...stagingFormData, staging_path: e.target.value })}
                    placeholder="/path/to/staging"
                  />
                  <p className="text-xs text-gray-500 dark:text-dark-500 mt-1">Directory where staged files will be moved</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-200 mb-1">
                    Library Name (for Emby)
                  </label>
                  <input
                    type="text"
                    className="block w-full px-3 py-2 bg-white dark:bg-dark-800 border border-gray-300 dark:border-dark-600 rounded-lg text-gray-800 dark:text-dark-100 placeholder-gray-400 dark:placeholder-dark-400 focus:outline-2 focus:outline-primary-500 focus:border-transparent transition-colors"
                    value={stagingFormData.library_name || ''}
                    onChange={(e) => setStagingFormData({ ...stagingFormData, library_name: e.target.value })}
                    placeholder="Staging"
                  />
                  <p className="text-xs text-gray-500 dark:text-dark-500 mt-1">Emby library name for staged content</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-200 mb-1">
                    Grace Period (days)
                  </label>
                  <input
                    type="number"
                    className="block w-full px-3 py-2 bg-white dark:bg-dark-800 border border-gray-300 dark:border-dark-600 rounded-lg text-gray-800 dark:text-dark-100 placeholder-gray-400 dark:placeholder-dark-400 focus:outline-2 focus:outline-primary-500 focus:border-transparent transition-colors"
                    value={stagingFormData.grace_period_days || ''}
                    onChange={(e) => setStagingFormData({ ...stagingFormData, grace_period_days: parseInt(e.target.value) || 7 })}
                    min={1}
                    max={365}
                  />
                  <p className="text-xs text-gray-500 dark:text-dark-500 mt-1">Days before staged files are permanently deleted</p>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 dark:border-dark-700 flex justify-end">
              <button
                type="submit"
                disabled={updateStagingMutation.isPending}
                className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 focus:outline-2 focus:outline-offset-2 focus:outline-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {updateStagingMutation.isPending ? 'Saving...' : 'Save Staging Settings'}
              </button>
            </div>
          </form>

          {/* Security */}
          <div className="bg-dark-800 rounded-xl border border-dark-700 shadow-lg">
            <div className="px-6 py-4 border-b border-dark-700 flex items-center gap-2">
              <KeyIcon className="w-5 h-5 text-primary-400" />
              <h2 className="text-lg font-semibold text-white">Security</h2>
            </div>
            <div className="p-6">
              {showPasswordChange ? (
                <form onSubmit={handlePasswordChange} className="space-y-4 max-w-md">
                  <div>
                    <label className="block text-sm font-medium text-dark-200 mb-1">Current Password</label>
                    <input
                      type="password"
                      className="block w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-gray-800 dark:text-dark-100 placeholder-dark-400 focus:outline-2 focus:outline-primary-500 focus:border-transparent transition-colors"
                      value={passwords.current}
                      onChange={(e) => setPasswords({ ...passwords, current: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-dark-200 mb-1">New Password</label>
                    <input
                      type="password"
                      className="block w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-gray-800 dark:text-dark-100 placeholder-dark-400 focus:outline-2 focus:outline-primary-500 focus:border-transparent transition-colors"
                      value={passwords.new}
                      onChange={(e) => setPasswords({ ...passwords, new: e.target.value })}
                      required
                      minLength={8}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-dark-200 mb-1">Confirm New Password</label>
                    <input
                      type="password"
                      className="block w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-gray-800 dark:text-dark-100 placeholder-dark-400 focus:outline-2 focus:outline-primary-500 focus:border-transparent transition-colors"
                      value={passwords.confirm}
                      onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
                      required
                      minLength={8}
                    />
                  </div>
                  <div className="flex gap-3">
                    <button
                      type="submit"
                      disabled={changePasswordMutation.isPending}
                      className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 focus:outline-2 focus:outline-offset-2 focus:outline-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {changePasswordMutation.isPending ? 'Changing...' : 'Change Password'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowPasswordChange(false)}
                      className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium bg-dark-700 text-gray-800 dark:text-dark-100 rounded-lg hover:bg-gray-200 dark:bg-dark-600 focus:outline-2 focus:outline-offset-2 focus:outline-dark-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  onClick={() => setShowPasswordChange(true)}
                  className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium bg-dark-700 text-gray-800 dark:text-dark-100 rounded-lg hover:bg-gray-200 dark:bg-dark-600 focus:outline-2 focus:outline-offset-2 focus:outline-dark-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Change Password
                </button>
              )}
            </div>
          </div>

          {/* Maintenance */}
          <div className="bg-dark-800 rounded-xl border border-dark-700 shadow-lg">
            <div className="px-6 py-4 border-b border-dark-700 flex items-center gap-2">
              <TrashIcon className="w-5 h-5 text-primary-400" />
              <h2 className="text-lg font-semibold text-white">Maintenance</h2>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-white">Clear Cache</h3>
                  <p className="text-sm text-dark-400">Clear all cached data</p>
                </div>
                <button
                  onClick={() => clearCacheMutation.mutate()}
                  disabled={clearCacheMutation.isPending}
                  className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium bg-dark-700 text-gray-800 dark:text-dark-100 rounded-lg hover:bg-gray-200 dark:bg-dark-600 focus:outline-2 focus:outline-offset-2 focus:outline-dark-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {clearCacheMutation.isPending ? 'Clearing...' : 'Clear Cache'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
