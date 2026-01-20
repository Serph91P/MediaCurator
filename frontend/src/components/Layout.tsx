import { NavLink, Outlet } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../stores/auth'
import api from '../lib/api'
import {
  HomeIcon,
  ServerStackIcon,
  ClipboardDocumentListIcon,
  FolderIcon,
  BellIcon,
  Cog6ToothIcon,
  ClockIcon,
  ArrowRightOnRectangleIcon,
  EyeIcon,
  CpuChipIcon,
  ArchiveBoxIcon,
} from '@heroicons/react/24/outline'

const navigation = [
  { name: 'Dashboard', href: '/', icon: HomeIcon },
  { name: 'Services', href: '/services', icon: ServerStackIcon },
  { name: 'Rules', href: '/rules', icon: ClipboardDocumentListIcon },
  { name: 'Libraries', href: '/libraries', icon: FolderIcon },
  { name: 'Preview', href: '/preview', icon: EyeIcon },
  { name: 'Staging', href: '/staging', icon: ArchiveBoxIcon },
  { name: 'Jobs', href: '/jobs', icon: CpuChipIcon },
  { name: 'Notifications', href: '/notifications', icon: BellIcon },
  { name: 'History', href: '/history', icon: ClockIcon },
  { name: 'Settings', href: '/settings', icon: Cog6ToothIcon },
]

export default function Layout() {
  const { user, logout } = useAuthStore()

  // Fetch system health/version info
  const { data: healthData } = useQuery({
    queryKey: ['systemHealth'],
    queryFn: async () => {
      const res = await api.get('/system/health')
      return res.data as { status: string; version: string; database: string; scheduler: string }
    },
    refetchInterval: 60000, // Refresh every minute
    retry: false,
  })

  // Check for updates
  const { data: updateData } = useQuery({
    queryKey: ['systemUpdates'],
    queryFn: async () => {
      const res = await api.get('/system/check-updates')
      return res.data as {
        update_available: boolean
        latest_commit: string | null
        commits_behind: number
        error: string | null
        current_version: string
        current_commit: string
      }
    },
    refetchInterval: 300000, // Check every 5 minutes
    retry: false,
  })

  return (
    <div className="flex h-screen bg-dark-900">
      {/* Sidebar */}
      <aside className="w-64 bg-dark-800 border-r border-dark-700 flex flex-col">
        {/* Logo */}
        <div className="p-6 border-b border-dark-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-600 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-white">MediaCleaner</h1>
                {updateData?.update_available && (
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-primary-500"></span>
                  </span>
                )}
              </div>
              <p className="text-xs text-dark-400">
                {healthData?.version || 'v0.1.0'}
                {healthData?.database === 'unhealthy' && (
                  <span className="ml-2 text-red-400" title="Database connection issue">⚠</span>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1">
          {navigation.map((item) => (
            <NavLink
              key={item.name}
              to={item.href}
              className={({ isActive }) =>
                `sidebar-link ${isActive ? 'active' : ''}`
              }
            >
              <item.icon className="w-5 h-5" />
              {item.name}
            </NavLink>
          ))}
        </nav>

        {/* User section */}
        <div className="p-4 border-t border-dark-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center">
                <span className="text-sm font-medium text-white">
                  {user?.username?.charAt(0).toUpperCase() || 'U'}
                </span>
              </div>
              <div>
                <p className="text-sm font-medium text-dark-100">{user?.username || 'User'}</p>
                <p className="text-xs text-dark-400">{user?.is_admin ? 'Admin' : 'User'}</p>
              </div>
            </div>
            <button
              onClick={logout}
              className="p-2 text-dark-400 hover:text-dark-100 hover:bg-dark-700 rounded-lg transition-colors"
              title="Logout"
            >
              <ArrowRightOnRectangleIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {/* Update Banner */}
        {updateData?.update_available && (
          <div className="bg-primary-600 border-b border-primary-500 px-6 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-white">
                    Update verfügbar! 
                    {updateData.commits_behind > 0 && (
                      <span className="ml-2">
                        {updateData.commits_behind} neue{updateData.commits_behind === 1 ? 'r' : ''} Commit{updateData.commits_behind === 1 ? '' : 's'}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-primary-100">
                    Aktuelle Version: {updateData.current_commit} → Neueste: {updateData.latest_commit}
                  </p>
                </div>
              </div>
              <a
                href={`https://github.com/${healthData?.version?.includes('github.com') ? '' : 'Serph91P/MediaCleanup'}/commits`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-white text-primary-600 rounded-lg hover:bg-primary-50 transition-colors"
              >
                Changelog ansehen
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          </div>
        )}
        
        <div className="p-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
