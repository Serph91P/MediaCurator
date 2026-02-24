import { useEffect, useRef, useCallback } from 'react'
import toast from 'react-hot-toast'
import { useJobsStore } from '../stores/jobs'
import { getToken } from '../lib/api'

/**
 * Global WebSocket hook for real-time job status updates.
 * Should be used once in Layout.tsx to maintain a single connection.
 * Shows toast notifications on all pages for job lifecycle events.
 */
export function useJobWebSocket() {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const reconnectAttempts = useRef(0)
  const maxReconnectAttempts = 20
  const mountedRef = useRef(true)

  const setWsStatus = useJobsStore((s) => s.setWsStatus)
  const jobStarted = useJobsStore((s) => s.jobStarted)
  const jobProgressFn = useJobsStore((s) => s.jobProgress)
  const jobCompleted = useJobsStore((s) => s.jobCompleted)

  const getWsUrl = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    // Build WebSocket URL to match the API base
    const apiBase = (import.meta as any).env?.VITE_API_URL || '/api'
    if (apiBase.startsWith('http')) {
      // Absolute URL: convert http(s) to ws(s)
      return apiBase.replace(/^http/, 'ws') + '/ws/jobs'
    }
    // Relative URL
    return `${protocol}//${host}${apiBase}/ws/jobs`
  }, [])

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return ''
    if (seconds < 60) return ` (${seconds.toFixed(1)}s)`
    if (seconds < 3600) return ` (${(seconds / 60).toFixed(1)}m)`
    return ` (${(seconds / 3600).toFixed(1)}h)`
  }

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data)

        switch (data.type) {
          case 'job_started':
            jobStarted(data.job_id, data.job_name, data.timestamp)
            toast(data.job_name + ' started', {
              icon: '🔄',
              duration: 3000,
            })
            break

          case 'job_progress':
            jobProgressFn(
              data.job_id,
              data.job_name,
              data.step,
              data.progress_percent,
              data.current,
              data.total,
              data.timestamp,
              data.details || {}
            )
            break

          case 'job_completed':
            jobCompleted({
              job_id: data.job_id,
              job_name: data.job_name,
              status: data.status,
              duration: data.duration,
              error: data.error,
              timestamp: data.timestamp,
            })

            if (data.status === 'success') {
              toast.success(
                data.job_name + ' completed' + formatDuration(data.duration),
                { duration: 5000 }
              )
            } else if (data.status === 'error') {
              toast.error(
                data.job_name + ' failed' + (data.error ? `: ${data.error}` : ''),
                { duration: 8000 }
              )
            } else if (data.status === 'skipped') {
              toast(data.job_name + ' skipped', {
                icon: '⏭️',
                duration: 3000,
              })
            }
            break

          case 'pong':
            // Heartbeat response, ignore
            break

          default:
            // Future: handle other message types (notifications, etc.)
            console.debug('Unknown WS message type:', data.type)
        }
      } catch {
        console.warn('Failed to parse WebSocket message:', event.data)
      }
    },
    [jobStarted, jobProgressFn, jobCompleted]
  )

  const connect = useCallback(() => {
    if (!mountedRef.current) return
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const token = getToken()
    if (!token) {
      // Not authenticated, don't connect
      return
    }

    setWsStatus('connecting')
    const baseUrl = getWsUrl()
    const url = `${baseUrl}?token=${encodeURIComponent(token)}`

    try {
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        if (!mountedRef.current) {
          ws.close()
          return
        }
        setWsStatus('connected')
        reconnectAttempts.current = 0
      }

      ws.onmessage = handleMessage

      ws.onclose = (event) => {
        setWsStatus('disconnected')
        wsRef.current = null

        if (!mountedRef.current) return
        if (event.code === 1000) return // Normal close
        if (event.code === 4001) return // Auth failure — don't reconnect

        // Exponential backoff reconnect
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000)
        if (reconnectAttempts.current < maxReconnectAttempts) {
          reconnectAttempts.current++
          reconnectTimeoutRef.current = setTimeout(connect, delay)
        }
      }

      ws.onerror = () => {
        // onclose will fire after this
      }
    } catch {
      setWsStatus('disconnected')
    }
  }, [getWsUrl, handleMessage, setWsStatus])

  // Ping to keep connection alive
  useEffect(() => {
    const interval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }))
      }
    }, 30000)

    return () => clearInterval(interval)
  }, [])

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    mountedRef.current = true
    connect()

    return () => {
      mountedRef.current = false
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      if (wsRef.current) {
        wsRef.current.close(1000)
        wsRef.current = null
      }
    }
  }, [connect])

  // Reconnect when token changes (login/logout)
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'auth_token') {
        if (e.newValue) {
          // Token appeared -> connect
          connect()
        } else {
          // Token removed -> disconnect
          if (wsRef.current) {
            wsRef.current.close(1000)
            wsRef.current = null
          }
        }
      }
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [connect])

  return {
    reconnect: connect,
  }
}
