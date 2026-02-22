import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  PlayIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowPathIcon,
  MinusCircleIcon,
  PencilIcon,
  ServerIcon,
  SignalIcon,
  SignalSlashIcon,
} from '@heroicons/react/24/outline'
import api from '../lib/api'
import toast from 'react-hot-toast'
import { formatDateTime } from '../lib/utils'
import { useJobsStore, type JobProgress } from '../stores/jobs'
import ResponsiveTable from '../components/ResponsiveTable'

interface Job {
  id: string
  name: string
  next_run_time: string | null
  trigger: string
  interval_minutes: number | null
  interval_hours: number | null
  is_running: boolean
  running_since: string | null
  service_id?: number | null
  service_type?: string | null
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

interface ServiceConnection {
  id: number
  name: string
  service_type: string
  is_enabled: boolean
}

function ProgressBar({ progress }: { progress: JobProgress }) {
  const pct = progress.progress_percent ?? 0

  return (
    <div className="mt-3 space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-600 dark:text-dark-300 truncate max-w-[70%]">
          {progress.step}
        </span>
        <span className="text-gray-500 dark:text-dark-400 font-mono tabular-nums">
          {pct > 0 ? `${Math.round(pct)}%` : ''}
          {progress.current != null && progress.total != null && (
            <span className="ml-2">
              {progress.current}/{progress.total}
            </span>
          )}
        </span>
      </div>
      <div className="h-2 bg-gray-200 dark:bg-dark-600 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-500 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${Math.max(pct, 2)}%` }}
        />
      </div>
    </div>
  )
}

function ElapsedTime({ since }: { since: string }) {
  const [, setTick] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(interval)
  }, [])

  const start = new Date(since).getTime()
  const elapsed = Math.max(0, Math.floor((Date.now() - start) / 1000))

  if (elapsed < 60) return <span>{elapsed}s</span>
  if (elapsed < 3600)
    return (
      <span>
        {Math.floor(elapsed / 60)}m {elapsed % 60}s
      </span>
    )
  return (
    <span>
      {Math.floor(elapsed / 3600)}h {Math.floor((elapsed % 3600) / 60)}m
    </span>
  )
}

export default function Jobs() {
  const queryClient = useQueryClient()
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [editingJob, setEditingJob] = useState<Job | null>(null)
  const [editIntervalValue, setEditIntervalValue] = useState<number>(60)
  const [editIntervalUnit, setEditIntervalUnit] = useState<'minutes' | 'hours'>('minutes')

  // Live WebSocket state
  const runningJobs = useJobsStore((s) => s.runningJobs)
  const wsStatus = useJobsStore((s) => s.wsStatus)
  const recentCompletions = useJobsStore((s) => s.recentCompletions)

  // Invalidate queries when a job completes via WebSocket
  useEffect(() => {
    if (recentCompletions.length > 0) {
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
      queryClient.invalidateQueries({ queryKey: ['job-executions'] })
    }
  }, [recentCompletions.length, queryClient])

  const { data: jobsData, isLoading: jobsLoading } = useQuery({
    queryKey: ['jobs'],
    queryFn: async () => {
      const res = await api.get<{ running: boolean; jobs: Job[] }>('/jobs/')
      return res.data
    },
    refetchInterval: 15000, // Slower polling since WS provides live updates
  })

  const { data: services } = useQuery({
    queryKey: ['services'],
    queryFn: async () => {
      const res = await api.get<ServiceConnection[]>('/services/')
      return res.data
    },
  })

  const { data: recentExecutions, isLoading: executionsLoading } = useQuery({
    queryKey: ['job-executions'],
    queryFn: async () => {
      const res = await api.get<JobExecution[]>('/jobs/history/recent?limit=50')
      return res.data
    },
    refetchInterval: 15000,
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

  const triggerServiceSyncMutation = useMutation({
    mutationFn: async (serviceId: number) => {
      const res = await api.post(`/jobs/sync/service/${serviceId}`)
      return res.data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
      queryClient.invalidateQueries({ queryKey: ['job-executions'] })
      toast.success(`Sync started for ${data.service_name}`)
    },
    onError: (error: any) => {
      const message = error.response?.data?.detail || 'Failed to trigger sync'
      toast.error(message)
    },
  })

  const updateIntervalMutation = useMutation({
    mutationFn: async ({
      jobId,
      intervalMinutes,
      intervalHours,
    }: {
      jobId: string
      intervalMinutes?: number
      intervalHours?: number
    }) => {
      const res = await api.put(`/jobs/${jobId}/interval`, {
        interval_minutes: intervalMinutes,
        interval_hours: intervalHours,
      })
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
      toast.success('Job interval updated successfully')
      setEditingJob(null)
    },
    onError: () => toast.error('Failed to update job interval'),
  })

  const openEditDialog = (job: Job) => {
    setEditingJob(job)
    if (job.interval_hours && job.interval_hours >= 1) {
      setEditIntervalValue(job.interval_hours)
      setEditIntervalUnit('hours')
    } else if (job.interval_minutes) {
      setEditIntervalValue(job.interval_minutes)
      setEditIntervalUnit('minutes')
    } else {
      setEditIntervalValue(60)
      setEditIntervalUnit('minutes')
    }
  }

  const handleSaveInterval = () => {
    if (!editingJob) return
    if (editIntervalUnit === 'hours') {
      updateIntervalMutation.mutate({ jobId: editingJob.id, intervalHours: editIntervalValue })
    } else {
      updateIntervalMutation.mutate({ jobId: editingJob.id, intervalMinutes: editIntervalValue })
    }
  }

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

  // Merge scheduler jobs with live WebSocket running state
  const isJobRunningLive = (jobId: string): boolean => {
    return runningJobs.has(jobId)
  }

  const getJobProgress = (jobId: string): JobProgress | undefined => {
    return runningJobs.get(jobId)
  }

  // Collect all currently running jobs (from WS)
  const liveRunningJobs = Array.from(runningJobs.values())

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Scheduled Jobs</h1>
          <p className="text-gray-500 dark:text-dark-400 mt-1">
            Monitor and manage scheduled tasks
          </p>
        </div>
        {/* WebSocket Status Indicator */}
        <div className="flex items-center gap-2 text-sm">
          {wsStatus === 'connected' ? (
            <span className="inline-flex items-center gap-1.5 text-green-500">
              <SignalIcon className="w-4 h-4" />
              Live
            </span>
          ) : wsStatus === 'connecting' ? (
            <span className="inline-flex items-center gap-1.5 text-yellow-500">
              <ArrowPathIcon className="w-4 h-4 animate-spin" />
              Connecting
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-gray-400">
              <SignalSlashIcon className="w-4 h-4" />
              Offline
            </span>
          )}
        </div>
      </div>

      {/* Live Running Jobs Panel */}
      {liveRunningJobs.length > 0 && (
        <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl shadow-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-blue-500/20 bg-blue-500/10">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <ArrowPathIcon className="w-5 h-5 text-blue-400 animate-spin" />
              Running Now
              <span className="text-sm font-normal text-gray-500 dark:text-dark-400">
                ({liveRunningJobs.length} active)
              </span>
            </h2>
          </div>
          <div className="p-6 space-y-4">
            {liveRunningJobs.map((progress) => (
              <div
                key={progress.job_id}
                className="bg-white dark:bg-dark-800 rounded-lg p-4 border border-gray-200 dark:border-dark-700"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">
                      {progress.job_name}
                    </h3>
                    <span className="text-xs text-gray-500 dark:text-dark-400 font-mono">
                      {progress.job_id}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-sm text-gray-500 dark:text-dark-400 flex items-center gap-1">
                      <ClockIcon className="w-4 h-4" />
                      <ElapsedTime since={progress.started_at} />
                    </div>
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400">
                      <ArrowPathIcon className="w-3 h-3 animate-spin" />
                      Running
                    </span>
                  </div>
                </div>
                <ProgressBar progress={progress} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Scheduler Status */}
      {jobsData && (
        <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 shadow-lg p-6">
          <div className="flex items-center gap-3">
            <div
              className={`w-3 h-3 rounded-full ${
                jobsData.running ? 'bg-green-500 animate-pulse' : 'bg-red-500'
              }`}
            />
            <span className="text-gray-900 dark:text-white font-medium">
              Scheduler: {jobsData.running ? 'Running' : 'Stopped'}
            </span>
          </div>
        </div>
      )}

      {/* Service Sync Jobs */}
      {services && services.filter((s) => s.is_enabled).length > 0 && (
        <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 shadow-lg">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-dark-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <ServerIcon className="w-5 h-5" />
              Service Sync
            </h2>
            <p className="text-sm text-gray-500 dark:text-dark-400 mt-1">
              Trigger manual sync for individual services
            </p>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {services
                .filter((s) => s.is_enabled)
                .map((service) => {
                  const serviceJobId = `sync_service_${service.id}`
                  const isRunning =
                    isJobRunningLive(serviceJobId) ||
                    jobsData?.jobs?.some((j) => j.id === serviceJobId && j.is_running) ||
                    recentExecutions?.some(
                      (e) => e.job_id === serviceJobId && e.status === 'running'
                    )
                  const liveProgress = getJobProgress(serviceJobId)
                  const lastExecution = recentExecutions?.find(
                    (e) => e.job_id === serviceJobId && e.status !== 'running'
                  )

                  return (
                    <div
                      key={service.id}
                      className={`bg-gray-100 dark:bg-dark-700/50 rounded-lg p-4 ${
                        isRunning ? 'ring-2 ring-blue-500' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <h3 className="font-semibold text-gray-900 dark:text-white">
                            {service.name}
                          </h3>
                          <span className="text-xs text-gray-500 dark:text-dark-400 capitalize">
                            {service.service_type}
                          </span>
                        </div>
                        {isRunning && (
                          <ArrowPathIcon className="w-5 h-5 text-blue-400 animate-spin" />
                        )}
                      </div>

                      {/* Live progress bar for this service */}
                      {liveProgress && (
                        <div className="mb-3">
                          <div className="text-xs text-gray-500 dark:text-dark-400 truncate mb-1">
                            {liveProgress.step}
                          </div>
                          <div className="h-1.5 bg-gray-200 dark:bg-dark-600 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-500 rounded-full transition-all duration-500 ease-out"
                              style={{
                                width: `${Math.max(liveProgress.progress_percent ?? 0, 2)}%`,
                              }}
                            />
                          </div>
                        </div>
                      )}

                      {!isRunning && lastExecution && (
                        <div className="text-xs text-gray-500 dark:text-dark-400 mb-3">
                          Last:{' '}
                          {lastExecution.status === 'success'
                            ? `✓ ${formatDuration(lastExecution.duration_seconds)}`
                            : lastExecution.status === 'error'
                              ? '✗ Error'
                              : lastExecution.status}
                        </div>
                      )}

                      <button
                        onClick={() => triggerServiceSyncMutation.mutate(service.id)}
                        disabled={isRunning || triggerServiceSyncMutation.isPending}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {isRunning ? (
                          <>
                            <ArrowPathIcon className="w-4 h-4 animate-spin" />
                            Syncing...
                          </>
                        ) : (
                          <>
                            <PlayIcon className="w-4 h-4" />
                            Sync Now
                          </>
                        )}
                      </button>
                    </div>
                  )
                })}
            </div>
          </div>
        </div>
      )}

      {/* Scheduled Jobs */}
      <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 shadow-lg">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-dark-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Scheduled Jobs</h2>
        </div>
        <div className="p-6">
          {jobsLoading ? (
            <div className="text-center py-8 text-gray-500 dark:text-dark-400">
              Loading jobs...
            </div>
          ) : jobsData?.jobs && jobsData.jobs.length > 0 ? (
            <div className="space-y-4">
              {jobsData.jobs.map((job) => {
                const isRunning = job.is_running || isJobRunningLive(job.id)
                const liveProgress = getJobProgress(job.id)

                return (
                  <div
                    key={job.id}
                    className={`bg-gray-100 dark:bg-dark-700/50 rounded-lg p-4 ${
                      isRunning ? 'ring-2 ring-blue-500' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 flex-wrap">
                          <h3 className="font-semibold text-gray-900 dark:text-white">
                            {job.name}
                          </h3>
                          <span className="text-xs text-gray-500 dark:text-dark-400 font-mono">
                            {job.id}
                          </span>
                          {isRunning && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400">
                              <ArrowPathIcon className="w-3 h-3 animate-spin" />
                              Running
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-sm text-gray-500 dark:text-dark-400">
                          <div className="flex items-center gap-1">
                            <ClockIcon className="w-4 h-4" />
                            {isRunning ? (
                              <>
                                Elapsed:{' '}
                                <span className="text-blue-400">
                                  <ElapsedTime
                                    since={
                                      liveProgress?.started_at ||
                                      job.running_since ||
                                      new Date().toISOString()
                                    }
                                  />
                                </span>
                              </>
                            ) : (
                              <>
                                Next run:{' '}
                                <span className="text-gray-700 dark:text-dark-200">
                                  {formatNextRun(job.next_run_time)}
                                </span>
                              </>
                            )}
                          </div>
                          {!isRunning && (
                            <>
                              <span>•</span>
                              <span>{formatDateTime(job.next_run_time)}</span>
                            </>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-dark-500 mt-1">
                          Interval:{' '}
                          {job.interval_hours
                            ? `${job.interval_hours}h`
                            : job.interval_minutes
                              ? `${job.interval_minutes}m`
                              : job.trigger}
                        </div>

                        {/* Live progress bar */}
                        {liveProgress && <ProgressBar progress={liveProgress} />}
                      </div>
                      <div className="flex gap-2 ml-4 flex-shrink-0">
                        <button
                          onClick={() => openEditDialog(job)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-gray-200 dark:bg-dark-600 text-gray-700 dark:text-dark-200 rounded-lg hover:bg-gray-300 dark:hover:bg-dark-500 transition-colors"
                        >
                          <PencilIcon className="w-4 h-4" />
                          Edit
                        </button>
                        <button
                          onClick={() => setSelectedJobId(job.id)}
                          className="px-3 py-1.5 text-sm bg-gray-200 dark:bg-dark-600 text-gray-700 dark:text-dark-200 rounded-lg hover:bg-gray-300 dark:hover:bg-dark-500 transition-colors"
                        >
                          History
                        </button>
                        <button
                          onClick={() => triggerMutation.mutate(job.id)}
                          disabled={triggerMutation.isPending || isRunning}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
                        >
                          <PlayIcon className="w-4 h-4" />
                          {isRunning ? 'Running...' : 'Trigger'}
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500 dark:text-dark-400">
              No jobs configured
            </div>
          )}
        </div>
      </div>

      {/* Recent Executions */}
      <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 shadow-lg">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-dark-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {selectedJobId
              ? `History: ${jobHistory?.[0]?.job_name || selectedJobId}`
              : 'Recent Executions'}
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
          {executionsLoading ? (
            <div className="px-6 py-8 text-center text-gray-500 dark:text-dark-400">
              Loading executions...
            </div>
          ) : (() => {
            const executions = selectedJobId ? jobHistory : recentExecutions
            return executions && executions.length > 0 ? (
              <ResponsiveTable
                columns={[
                  {
                    header: 'Job',
                    accessor: 'job_name',
                    cell: (exec: JobExecution) => (
                      <div>
                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                          {exec.job_name}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-dark-400 font-mono">
                          {exec.job_id}
                        </div>
                      </div>
                    )
                  },
                  {
                    header: 'Status',
                    accessor: 'status',
                    cell: (exec: JobExecution) => getStatusBadge(exec.status)
                  },
                  {
                    header: 'Started',
                    accessor: 'started_at',
                    mobileHide: true,
                    cell: (exec: JobExecution) => (
                      <span className="text-sm text-gray-600 dark:text-dark-300">
                        {formatDateTime(exec.started_at)}
                      </span>
                    )
                  },
                  {
                    header: 'Duration',
                    accessor: 'duration_seconds',
                    cell: (exec: JobExecution) => (
                      <span className="text-sm text-gray-600 dark:text-dark-300">
                        {formatDuration(exec.duration_seconds)}
                      </span>
                    )
                  },
                  {
                    header: 'Details',
                    accessor: 'details',
                    mobileHide: true,
                    cell: (exec: JobExecution) => exec.error_message ? (
                      <div
                        className="text-xs text-red-400 max-w-md truncate"
                        title={exec.error_message}
                      >
                        {exec.error_message}
                      </div>
                    ) : exec.details ? (
                      <div className="text-xs text-gray-500 dark:text-dark-400">
                        {Object.entries(exec.details)
                          .slice(0, 2)
                          .map(([key, value]) => (
                            <div key={key}>
                              {key}:{' '}
                              <span className="text-gray-600 dark:text-dark-300">
                                {JSON.stringify(value)}
                              </span>
                            </div>
                          ))}
                      </div>
                    ) : (
                      <span className="text-gray-500 dark:text-dark-500">-</span>
                    )
                  }
                ]}
                data={executions}
                keyExtractor={(exec: JobExecution) => exec.id}
                emptyMessage="No executions yet"
              />
            ) : (
              <div className="px-6 py-8 text-center text-gray-500 dark:text-dark-400">
                No executions yet
              </div>
            )
          })()}
        </div>
      </div>

      {/* Edit Interval Modal */}
      {editingJob && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-dark-800 rounded-xl p-6 w-full max-w-md mx-4 border border-gray-200 dark:border-dark-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Edit Job Interval: {editingJob.name}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-300 mb-2">
                  Run every
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="1"
                    value={editIntervalValue}
                    onChange={(e) => setEditIntervalValue(parseInt(e.target.value) || 1)}
                    className="flex-1 px-3 py-2 bg-gray-100 dark:bg-dark-700 border border-gray-300 dark:border-dark-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500"
                  />
                  <select
                    value={editIntervalUnit}
                    onChange={(e) =>
                      setEditIntervalUnit(e.target.value as 'minutes' | 'hours')
                    }
                    className="px-3 py-2 bg-gray-100 dark:bg-dark-700 border border-gray-300 dark:border-dark-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="minutes">Minutes</option>
                    <option value="hours">Hours</option>
                  </select>
                </div>
              </div>

              <div className="text-sm text-gray-500 dark:text-dark-400">
                Current:{' '}
                {editingJob.interval_hours
                  ? `${editingJob.interval_hours} hours`
                  : editingJob.interval_minutes
                    ? `${editingJob.interval_minutes} minutes`
                    : editingJob.trigger}
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setEditingJob(null)}
                className="flex-1 px-4 py-2 bg-gray-200 dark:bg-dark-600 text-gray-700 dark:text-dark-200 rounded-lg hover:bg-gray-300 dark:hover:bg-dark-500 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveInterval}
                disabled={updateIntervalMutation.isPending}
                className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
              >
                {updateIntervalMutation.isPending ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
