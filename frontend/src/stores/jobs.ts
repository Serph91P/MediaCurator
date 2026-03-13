import { create } from 'zustand'

export interface JobProgress {
  job_id: string
  job_name: string
  step: string
  progress_percent: number | null
  current: number | null
  total: number | null
  started_at: string
  last_update: string
  details: Record<string, any>
}

export interface JobCompletedEvent {
  job_id: string
  job_name: string
  status: string
  duration: number | null
  error: string | null
  timestamp: string
}

export type WsConnectionStatus = 'connecting' | 'connected' | 'disconnected'

interface JobsState {
  /** Currently running jobs with live progress */
  runningJobs: Map<string, JobProgress>
  /** Count of running jobs (for badge) */
  runningCount: number
  /** Recent completion events (last 10) */
  recentCompletions: JobCompletedEvent[]
  /** WebSocket connection status */
  wsStatus: WsConnectionStatus

  // Actions
  setWsStatus: (status: WsConnectionStatus) => void
  jobStarted: (job_id: string, job_name: string, timestamp: string) => void
  jobProgress: (
    job_id: string,
    job_name: string,
    step: string,
    progress_percent: number | null,
    current: number | null,
    total: number | null,
    timestamp: string,
    details: Record<string, any>
  ) => void
  jobCompleted: (event: JobCompletedEvent) => void
  clearRunningJob: (job_id: string) => void
}

export const useJobsStore = create<JobsState>()((set) => ({
  runningJobs: new Map(),
  runningCount: 0,
  recentCompletions: [],
  wsStatus: 'disconnected',

  setWsStatus: (status) => set({ wsStatus: status }),

  jobStarted: (job_id, job_name, timestamp) =>
    set((state) => {
      const newMap = new Map(state.runningJobs)
      newMap.set(job_id, {
        job_id,
        job_name,
        step: 'Starting...',
        progress_percent: 0,
        current: null,
        total: null,
        started_at: timestamp,
        last_update: timestamp,
        details: {},
      })
      return { runningJobs: newMap, runningCount: newMap.size }
    }),

  jobProgress: (job_id, job_name, step, progress_percent, current, total, timestamp, details) =>
    set((state) => {
      const newMap = new Map(state.runningJobs)
      const existing = newMap.get(job_id)
      newMap.set(job_id, {
        job_id,
        job_name,
        step,
        progress_percent,
        current,
        total,
        started_at: existing?.started_at || timestamp,
        last_update: timestamp,
        details: details || existing?.details || {},
      })
      return { runningJobs: newMap, runningCount: newMap.size }
    }),

  jobCompleted: (event) =>
    set((state) => {
      const newMap = new Map(state.runningJobs)
      newMap.delete(event.job_id)
      return {
        runningJobs: newMap,
        runningCount: newMap.size,
        recentCompletions: [event, ...state.recentCompletions].slice(0, 10),
      }
    }),

  clearRunningJob: (job_id) =>
    set((state) => {
      const newMap = new Map(state.runningJobs)
      newMap.delete(job_id)
      return { runningJobs: newMap, runningCount: newMap.size }
    }),
}))
