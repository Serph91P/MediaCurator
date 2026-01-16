import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Cog6ToothIcon, KeyIcon, ClockIcon, TrashIcon } from '@heroicons/react/24/outline'
import api from '../lib/api'
import toast from 'react-hot-toast'
import type { SystemSettings, SystemSettingsUpdate } from '../types'

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
        <div className="card animate-pulse">
          <div className="card-body h-64" />
        </div>
      ) : (
        <>
          {/* General Settings */}
          <form onSubmit={handleSubmit} className="card">
            <div className="card-header flex items-center gap-2">
              <Cog6ToothIcon className="w-5 h-5 text-primary-400" />
              <h2 className="text-lg font-semibold text-white">General Settings</h2>
            </div>
            <div className="card-body space-y-6">
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
                    formData.cleanup_enabled ? 'bg-primary-600' : 'bg-dark-600'
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
                    formData.dry_run_mode ? 'bg-yellow-600' : 'bg-dark-600'
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
                  <label className="label flex items-center gap-2">
                    <ClockIcon className="w-4 h-4" />
                    Cleanup Schedule (Cron)
                  </label>
                  <input
                    type="text"
                    className="input font-mono"
                    value={formData.cleanup_schedule || ''}
                    onChange={(e) => setFormData({ ...formData, cleanup_schedule: e.target.value })}
                    placeholder="0 3 * * *"
                  />
                  <p className="text-xs text-dark-500 mt-1">Default: 0 3 * * * (daily at 3 AM)</p>
                </div>
                <div>
                  <label className="label flex items-center gap-2">
                    <ClockIcon className="w-4 h-4" />
                    Sync Schedule (Cron)
                  </label>
                  <input
                    type="text"
                    className="input font-mono"
                    value={formData.sync_schedule || ''}
                    onChange={(e) => setFormData({ ...formData, sync_schedule: e.target.value })}
                    placeholder="0 * * * *"
                  />
                  <p className="text-xs text-dark-500 mt-1">Default: 0 * * * * (hourly)</p>
                </div>
                <div>
                  <label className="label">Default Grace Period (days)</label>
                  <input
                    type="number"
                    className="input"
                    value={formData.default_grace_period_days || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      default_grace_period_days: parseInt(e.target.value) || 7
                    })}
                    min={0}
                  />
                </div>
                <div>
                  <label className="label">Max Deletions Per Run</label>
                  <input
                    type="number"
                    className="input"
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
                className="btn-primary"
              >
                {updateMutation.isPending ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </form>

          {/* Security */}
          <div className="card">
            <div className="card-header flex items-center gap-2">
              <KeyIcon className="w-5 h-5 text-primary-400" />
              <h2 className="text-lg font-semibold text-white">Security</h2>
            </div>
            <div className="card-body">
              {showPasswordChange ? (
                <form onSubmit={handlePasswordChange} className="space-y-4 max-w-md">
                  <div>
                    <label className="label">Current Password</label>
                    <input
                      type="password"
                      className="input"
                      value={passwords.current}
                      onChange={(e) => setPasswords({ ...passwords, current: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="label">New Password</label>
                    <input
                      type="password"
                      className="input"
                      value={passwords.new}
                      onChange={(e) => setPasswords({ ...passwords, new: e.target.value })}
                      required
                      minLength={8}
                    />
                  </div>
                  <div>
                    <label className="label">Confirm New Password</label>
                    <input
                      type="password"
                      className="input"
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
                      className="btn-primary"
                    >
                      {changePasswordMutation.isPending ? 'Changing...' : 'Change Password'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowPasswordChange(false)}
                      className="btn-secondary"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  onClick={() => setShowPasswordChange(true)}
                  className="btn-secondary"
                >
                  Change Password
                </button>
              )}
            </div>
          </div>

          {/* Maintenance */}
          <div className="card">
            <div className="card-header flex items-center gap-2">
              <TrashIcon className="w-5 h-5 text-primary-400" />
              <h2 className="text-lg font-semibold text-white">Maintenance</h2>
            </div>
            <div className="card-body space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-white">Clear Cache</h3>
                  <p className="text-sm text-dark-400">Clear all cached data</p>
                </div>
                <button
                  onClick={() => clearCacheMutation.mutate()}
                  disabled={clearCacheMutation.isPending}
                  className="btn-secondary"
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
