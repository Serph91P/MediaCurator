import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { PlayIcon, ClockIcon, CheckCircleIcon, XCircleIcon, ArrowPathIcon, MinusCircleIcon } from '@heroicons/react/24/outline'
import api from '../lib/api'
import toast from 'react-hot-toast'
import { formatDateTime } from '../lib/utils'

interface Job {
  id: string
  name: string
  next_run_time: string | null
  trigger: string
}

interface JobExecution {
  id: number
  job_id: string
  job_name: string
  status: 'running' | 'success' | 'error' | 'skipped'
  started_at: string
  completed_at: string | null
  duration_seconds: number | null
  error_message: string | null
  details: Record<string, any>
}

export default function Jobs() {
  const queryClient = useQueryClient()
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)

  const { data: jobsData, isLoading: jobsLoading } = useQuery({
    queryKey: ['jobs'],
    queryFn: async () => {
      const res = await api.get<{ running: boolean; jobs: Job[] }>('/jobs/')
      return res.data
    },
    refetchInterval: 5000, // Refresh every 5 seconds
  })

  const { data: recentExecutions, isLoading: executionsLoading } = useQuery({
    queryKey: ['job-executions'],
    queryFn: async () => {
      const res = await api.get<JobExecution[]>('/jobs/history/recent?limit=50')
      return res.data
    },
    refetchInterval: 5000,
  })

  const { data: jobHistory } = useQuery({
    queryKey: ['job-history', selectedJobId],
    queryFn: async () => {
      if (!selectedJobId) return []
      const res = await api.get<JobExecution[]>(`/jobs/${selectedJobId}/history?limit=20`)
      return res.data
    },
    enabled: !!selectedJobId,
  })

  const triggerMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const res = await api.post(`/jobs/${jobId}/trigger`)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
      toast.success('Job triggered successfully')
    },
    onError: () => toast.error('Failed to trigger job'),
  })

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'running':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400">
            <ArrowPathIcon className="w-3 h-3 animate-spin" />
            Running
          </span>
        )
      case 'success':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-500/20 text-green-400">
            <CheckCircleIcon className="w-3 h-3" />
            Success
          </span>
        )
      case 'error':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-500/20 text-red-400">
            <XCircleIcon className="w-3 h-3" />
            Error
          </span>
        )
      case 'skipped':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-500/20 text-yellow-400">
            <MinusCircleIcon className="w-3 h-3" />
            Skipped
          </span>
        )
      default:
        return <span className="text-gray-500 dark:text-dark-400">{status}</span>
    }
  }

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '-'
    if (seconds < 60) return `${seconds.toFixed(1)}s`
    if (seconds < 3600) return `${(seconds / 60).toFixed(1)}m`
    return `${(seconds / 3600).toFixed(1)}h`
  }

  const formatNextRun = (dateStr: string | null) => {
    if (!dateStr) return 'Not scheduled'
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = date.getTime() - now.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    
    if (diffMins < 1) return 'Starting soon...'
    if (diffMins < 60) return `in ${diffMins}m`
    if (diffMins < 1440) return `in ${Math.floor(diffMins / 60)}h`
    return `in ${Math.floor(diffMins / 1440)}d`
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Scheduled Jobs</h1>
        <p className="text-gray-500 dark:text-dark-400 mt-1">Monitor and manage scheduled tasks</p>
      </div>

      {/* Scheduler Status */}
      {jobsData && (
        <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 shadow-lg p-6">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${jobsData.running ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
            <span className="text-gray-900 dark:text-white font-medium">
              Scheduler: {jobsData.running ? 'Running' : 'Stopped'}
            </span>
          </div>
        </div>
      )}

      {/* Active Jobs */}
      <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 shadow-lg">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-dark-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Active Jobs</h2>
        </div>
        <div className="p-6">
          {jobsLoading ? (
            <div className="text-center py-8 text-gray-500 dark:text-dark-400">Loading jobs...</div>
          ) : jobsData?.jobs && jobsData.jobs.length > 0 ? (
            <div className="space-y-4">
              {jobsData.jobs.map((job) => (
                <div key={job.id} className="bg-dark-700/50 rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="font-semibold text-gray-900 dark:text-white">{job.name}</h3>
                        <span className="text-xs text-gray-500 dark:text-dark-400 font-mono">{job.id}</span>
                      </div>
                      <div className="flex items-center gap-4 mt-2 text-sm text-gray-500 dark:text-dark-400">
                        <div className="flex items-center gap-1">
                          <ClockIcon className="w-4 h-4" />
                          Next run: <span className="text-dark-200">{formatNextRun(job.next_run_time)}</span>
                        </div>
                        <span>•</span>
                        <span>{formatDateTime(job.next_run_time)}</span>
                      </div>
                      <div className="text-xs text-dark-500 mt-1">Trigger: {job.trigger}</div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setSelectedJobId(job.id)}
                        className="px-3 py-1.5 text-sm bg-gray-200 dark:bg-dark-600 text-dark-200 rounded-lg hover:bg-dark-500 transition-colors"
                      >
                        View History
                      </button>
                      <button
                        onClick={() => triggerMutation.mutate(job.id)}
                        disabled={triggerMutation.isPending}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-primary-600 text-gray-900 dark:text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
                      >
                        <PlayIcon className="w-4 h-4" />
                        Trigger Now
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500 dark:text-dark-400">No jobs configured</div>
          )}
        </div>
      </div>

      {/* Recent Executions */}
      <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 shadow-lg">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-dark-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {selectedJobId ? `History: ${jobHistory?.[0]?.job_name || selectedJobId}` : 'Recent Executions'}
          </h2>
          {selectedJobId && (
            <button
              onClick={() => setSelectedJobId(null)}
              className="text-sm text-primary-400 hover:text-primary-300 mt-1"
            >
              ← Back to all executions
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-dark-700/50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 dark:text-dark-300 uppercase tracking-wider">Job</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 dark:text-dark-300 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 dark:text-dark-300 uppercase tracking-wider">Started</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 dark:text-dark-300 uppercase tracking-wider">Duration</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 dark:text-dark-300 uppercase tracking-wider">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-700">
              {executionsLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500 dark:text-dark-400">
                    Loading executions...
                  </td>
                </tr>
              ) : (selectedJobId ? jobHistory : recentExecutions)?.map((exec) => (
                <tr key={exec.id} className="hover:bg-dark-700/30">
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-gray-900 dark:text-white">{exec.job_name}</div>
                    <div className="text-xs text-gray-500 dark:text-dark-400 font-mono">{exec.job_id}</div>
                  </td>
                  <td className="px-6 py-4">{getStatusBadge(exec.status)}</td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-dark-300">{formatDateTime(exec.started_at)}</td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-dark-300">{formatDuration(exec.duration_seconds)}</td>
                  <td className="px-6 py-4">
                    {exec.error_message ? (
                      <div className="text-xs text-red-400 max-w-md truncate" title={exec.error_message}>
                        {exec.error_message}
                      </div>
                    ) : exec.details ? (
                      <div className="text-xs text-gray-500 dark:text-dark-400">
                        {Object.entries(exec.details).slice(0, 2).map(([key, value]) => (
                          <div key={key}>
                            {key}: <span className="text-gray-600 dark:text-dark-300">{JSON.stringify(value)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-dark-500">-</span>
                    )}
                  </td>
                </tr>
              )) || (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500 dark:text-dark-400">
                    No executions yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
