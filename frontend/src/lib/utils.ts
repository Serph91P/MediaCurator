/**
 * Utility functions for the frontend
 */

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes === 0) return '0 B'
  
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${units[i]}`
}

/**
 * Format date to relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(date: string | Date | null | undefined): string {
  if (!date) return 'Never'
  
  const now = new Date()
  const then = new Date(date)
  const diffMs = now.getTime() - then.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)
  const diffWeek = Math.floor(diffDay / 7)
  const diffMonth = Math.floor(diffDay / 30)
  const diffYear = Math.floor(diffDay / 365)

  if (diffSec < 60) return 'Just now'
  if (diffMin < 60) return `${diffMin} minute${diffMin !== 1 ? 's' : ''} ago`
  if (diffHour < 24) return `${diffHour} hour${diffHour !== 1 ? 's' : ''} ago`
  if (diffDay < 7) return `${diffDay} day${diffDay !== 1 ? 's' : ''} ago`
  if (diffWeek < 4) return `${diffWeek} week${diffWeek !== 1 ? 's' : ''} ago`
  if (diffMonth < 12) return `${diffMonth} month${diffMonth !== 1 ? 's' : ''} ago`
  return `${diffYear} year${diffYear !== 1 ? 's' : ''} ago`
}

/**
 * Format duration in seconds to human-readable string
 */
export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds === 0) return '0m'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  return `${minutes}m`
}

/**
 * Format duration in seconds with seconds precision (e.g., "2h 15m 30s")
 */
export function formatDurationLong(seconds: number | null | undefined): string {
  if (!seconds || seconds === 0) return '0s'
  
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`
  }
  return `${secs}s`
}

/**
 * Format watch time to human-readable string (e.g., "3 Days 5 Hours 20 Minutes")
 */
export function formatWatchTime(seconds: number | null | undefined): string {
  if (!seconds || seconds === 0) return '0 Minutes'
  
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  
  const parts: string[] = []
  if (days > 0) parts.push(`${days} Day${days !== 1 ? 's' : ''}`)
  if (hours > 0) parts.push(`${hours} Hour${hours !== 1 ? 's' : ''}`)
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes} Minute${minutes !== 1 ? 's' : ''}`)
  
  return parts.join(' ')
}

/**
 * Format date to localized string
 */
export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '-'
  
  // Ensure the date is treated as UTC if no timezone indicator
  const dateStr = typeof date === 'string' ? date : date.toISOString()
  const isoDate = dateStr.includes('Z') || dateStr.includes('+') ? dateStr : dateStr + 'Z'
  
  return new Date(isoDate).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Format datetime to localized string with time
 */
export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return '-'
  
  // Ensure the date is treated as UTC if no timezone indicator
  const dateStr = typeof date === 'string' ? date : date.toISOString()
  const isoDate = dateStr.includes('Z') || dateStr.includes('+') ? dateStr : dateStr + 'Z'
  
  return new Date(isoDate).toLocaleString('en-US', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

/**
 * Truncate string to max length with ellipsis
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str
  return str.substring(0, maxLength - 3) + '...'
}

/**
 * Class name helper for conditional classes
 */
export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ')
}
