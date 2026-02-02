import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { 
  UserIcon, 
  MagnifyingGlassIcon, 
  PlayIcon,
  ClockIcon,
  ShieldCheckIcon,
  EyeSlashIcon
} from '@heroicons/react/24/outline'
import api from '../lib/api'
import { formatRelativeTime } from '../lib/utils'

interface MediaServerUser {
  id: number
  external_id: string
  name: string
  is_admin: boolean
  is_hidden: boolean
  total_plays: number
  total_watch_time_seconds: number
  last_activity_at: string | null
  last_watched: {
    title: string
    client: string
    device: string
  } | null
}

interface UsersResponse {
  items: MediaServerUser[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

// Format seconds to readable time
function formatWatchTime(seconds: number): string {
  if (!seconds || seconds === 0) return '0 Minutes'
  
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  
  if (hours > 0) {
    return `${hours} Hours ${minutes} Minutes`
  }
  return `${minutes} Minutes`
}

export default function Users() {
  const [page, setPage] = useState(1)
  const [pageSize] = useState(25)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [includeHidden, setIncludeHidden] = useState(false)

  // Debounce search
  const handleSearchChange = (value: string) => {
    setSearch(value)
    setTimeout(() => {
      setDebouncedSearch(value)
      setPage(1)
    }, 300)
  }

  const { data, isLoading } = useQuery({
    queryKey: ['mediaUsers', page, pageSize, debouncedSearch, includeHidden],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        page_size: pageSize.toString(),
        include_hidden: includeHidden.toString()
      })
      if (debouncedSearch) {
        params.append('search', debouncedSearch)
      }
      const res = await api.get<UsersResponse>(`/users/?${params}`)
      return res.data
    }
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Users</h1>
          <p className="text-gray-500 dark:text-dark-400 mt-1">
            Media server users and their watch statistics
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-dark-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search users..."
              className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-dark-700 border border-gray-200 dark:border-dark-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-dark-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* Include Hidden Toggle */}
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-dark-400 cursor-pointer">
            <input
              type="checkbox"
              checked={includeHidden}
              onChange={(e) => setIncludeHidden(e.target.checked)}
              className="rounded border-gray-300 dark:border-dark-600 text-primary-600 focus:ring-primary-500"
            />
            Show hidden users
          </label>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 dark:bg-dark-700/50 border-b border-gray-200 dark:border-dark-700">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-dark-400 uppercase tracking-wider">
                  User
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-dark-400 uppercase tracking-wider">
                  Last Watched
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-dark-400 uppercase tracking-wider hidden md:table-cell">
                  Last Client
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-dark-400 uppercase tracking-wider">
                  Plays
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-dark-400 uppercase tracking-wider hidden lg:table-cell">
                  Watch Time
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-dark-400 uppercase tracking-wider">
                  Last Seen
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-dark-700">
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-4 py-4"><div className="h-4 bg-gray-200 dark:bg-dark-700 rounded w-32" /></td>
                    <td className="px-4 py-4"><div className="h-4 bg-gray-200 dark:bg-dark-700 rounded w-48" /></td>
                    <td className="px-4 py-4 hidden md:table-cell"><div className="h-4 bg-gray-200 dark:bg-dark-700 rounded w-32" /></td>
                    <td className="px-4 py-4"><div className="h-4 bg-gray-200 dark:bg-dark-700 rounded w-12 ml-auto" /></td>
                    <td className="px-4 py-4 hidden lg:table-cell"><div className="h-4 bg-gray-200 dark:bg-dark-700 rounded w-24 ml-auto" /></td>
                    <td className="px-4 py-4"><div className="h-4 bg-gray-200 dark:bg-dark-700 rounded w-20 ml-auto" /></td>
                  </tr>
                ))
              ) : data?.items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <UserIcon className="w-12 h-12 mx-auto text-gray-400 dark:text-dark-500 mb-4" />
                    <p className="text-gray-500 dark:text-dark-400">No users found</p>
                    <p className="text-sm text-gray-400 dark:text-dark-500 mt-1">
                      Users will appear after syncing with your media server
                    </p>
                  </td>
                </tr>
              ) : (
                data?.items.map((user) => (
                  <tr 
                    key={user.id} 
                    className="hover:bg-gray-50 dark:hover:bg-dark-700/50 transition-colors"
                  >
                    <td className="px-4 py-4">
                      <Link 
                        to={`/users/${user.id}`}
                        className="flex items-center gap-3 group"
                      >
                        <div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-500/20 flex items-center justify-center">
                          <UserIcon className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                              {user.name}
                            </span>
                            {user.is_admin && (
                              <ShieldCheckIcon className="w-4 h-4 text-yellow-500" title="Admin" />
                            )}
                            {user.is_hidden && (
                              <EyeSlashIcon className="w-4 h-4 text-gray-400" title="Hidden" />
                            )}
                          </div>
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-sm text-gray-600 dark:text-dark-300 truncate block max-w-xs">
                        {user.last_watched?.title || 'Never'}
                      </span>
                    </td>
                    <td className="px-4 py-4 hidden md:table-cell">
                      <span className="text-sm text-gray-500 dark:text-dark-400">
                        {user.last_watched ? (
                          <>
                            {user.last_watched.client}
                            {user.last_watched.device && ` - ${user.last_watched.device}`}
                          </>
                        ) : (
                          'N/A'
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <span className="font-semibold text-primary-600 dark:text-primary-400">
                        {user.total_plays.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right hidden lg:table-cell">
                      <span className="text-sm text-gray-600 dark:text-dark-300">
                        {formatWatchTime(user.total_watch_time_seconds)}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <span className="text-sm text-gray-500 dark:text-dark-400">
                        {user.last_activity_at 
                          ? formatRelativeTime(user.last_activity_at)
                          : 'Never'
                        }
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && data.total_pages > 1 && (
          <div className="px-4 py-3 border-t border-gray-200 dark:border-dark-700 flex items-center justify-between">
            <div className="text-sm text-gray-500 dark:text-dark-400">
              Showing {((page - 1) * pageSize) + 1} to {Math.min(page * pageSize, data.total)} of {data.total}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 text-sm bg-gray-100 dark:bg-dark-700 text-gray-700 dark:text-dark-300 rounded hover:bg-gray-200 dark:hover:bg-dark-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="px-3 py-1 text-sm text-gray-600 dark:text-dark-400">
                {page} of {data.total_pages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(data.total_pages, p + 1))}
                disabled={page === data.total_pages}
                className="px-3 py-1 text-sm bg-gray-100 dark:bg-dark-700 text-gray-700 dark:text-dark-300 rounded hover:bg-gray-200 dark:hover:bg-dark-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
