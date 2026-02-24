import { NavLink, Outlet } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../stores/auth'
import { useThemeStore } from '../stores/theme'
import { useJobsStore } from '../stores/jobs'
import { useJobWebSocket } from '../hooks/useJobWebSocket'
import api from '../lib/api'
import { useState, useEffect } from 'react'
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
  Bars3Icon,
  XMarkIcon,
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
  SunIcon,
  MoonIcon,
  ComputerDesktopIcon,
  UsersIcon,
  ChartBarIcon,
  ChartPieIcon,
} from '@heroicons/react/24/outline'

const navigation = [
  { name: 'Dashboard', href: '/', icon: HomeIcon },
  { name: 'Libraries', href: '/libraries', icon: FolderIcon },
  { name: 'Users', href: '/users', icon: UsersIcon },
  { name: 'Activity', href: '/activity', icon: ChartBarIcon },
  { name: 'Analytics', href: '/analytics', icon: ChartPieIcon },
  { name: 'Services', href: '/services', icon: ServerStackIcon },
  { name: 'Rules', href: '/rules', icon: ClipboardDocumentListIcon },
  { name: 'Preview', href: '/preview', icon: EyeIcon },
  { name: 'Staging', href: '/staging', icon: ArchiveBoxIcon },
  { name: 'Jobs', href: '/jobs', icon: CpuChipIcon },
  { name: 'Notifications', href: '/notifications', icon: BellIcon },
  { name: 'History', href: '/history', icon: ClockIcon },
  { name: 'Settings', href: '/settings', icon: Cog6ToothIcon },
]

export default function Layout() {
  const { user, logout } = useAuthStore()
  const { theme, setTheme } = useThemeStore()
  const runningCount = useJobsStore((s) => s.runningCount)
  useJobWebSocket() // Global WebSocket connection for all pages
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const stored = localStorage.getItem('sidebarCollapsed')
    return stored === 'true'
  })

  const cycleTheme = () => {
    const themes: Array<'light' | 'dark' | 'system'> = ['light', 'dark', 'system']
    const currentIndex = themes.indexOf(theme)
    const nextIndex = (currentIndex + 1) % themes.length
    setTheme(themes[nextIndex])
  }

  const ThemeIcon = theme === 'light' ? SunIcon : theme === 'dark' ? MoonIcon : ComputerDesktopIcon
  const themeLabel = theme === 'light' ? 'Light' : theme === 'dark' ? 'Dark' : 'System'

  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', String(sidebarCollapsed))
  }, [sidebarCollapsed])

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
        latest_version: string | null
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
    <div className="flex h-screen bg-gray-100 dark:bg-dark-900">
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed lg:static inset-y-0 left-0 z-50 ${sidebarCollapsed ? 'lg:w-16' : 'w-64 sm:w-72'} bg-white dark:bg-dark-800 border-r border-gray-200 dark:border-dark-700 flex flex-col transform transition-all duration-300 lg:translate-x-0 ${
        sidebarOpen ? 'translate-x-0 w-64 sm:w-72' : '-translate-x-full'
      }`}>
        {/* Logo */}
        <div className={`p-4 sm:p-6 border-b border-gray-200 dark:border-dark-700 ${sidebarCollapsed && !sidebarOpen ? 'flex justify-center' : ''}`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 min-w-[2.5rem] bg-primary-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            {(!sidebarCollapsed || sidebarOpen) && (
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-bold text-gray-900 dark:text-white">MediaCurator</h1>
                  {updateData?.update_available && (
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-primary-500"></span>
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 dark:text-dark-400">
                  {healthData?.version || 'v0.1.0'}
                  {healthData?.database === 'unhealthy' && (
                    <span className="ml-2 text-red-400 font-bold" title="Database connection issue">DB!</span>
                  )}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2 sm:px-3 py-4 space-y-1 overflow-y-auto">
          {navigation.map((item) => (
            <NavLink
              key={item.name}
              to={item.href}
              onClick={() => setSidebarOpen(false)}
              title={sidebarCollapsed && !sidebarOpen ? item.name : undefined}
              className={({ isActive }) =>
                `group flex items-center gap-3 px-3 sm:px-3 py-3 sm:py-2.5 rounded-lg text-sm sm:text-sm font-medium transition-all duration-200 active:scale-95 ${
                  sidebarCollapsed && !sidebarOpen ? 'justify-center' : ''
                } ${
                  isActive
                    ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/50'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-dark-300 dark:hover:text-white dark:hover:bg-dark-700'
                }`
              }
            >
              <div className="relative flex-shrink-0">
                <item.icon className="w-5 h-5 sm:w-5 sm:h-5" />
                {item.name === 'Jobs' && runningCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                    <span className="relative inline-flex items-center justify-center h-4 w-4 rounded-full bg-blue-500 text-[10px] font-bold text-white">
                      {runningCount}
                    </span>
                  </span>
                )}
              </div>
              {(!sidebarCollapsed || sidebarOpen) && <span>{item.name}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Theme Toggle & Collapse - grouped at bottom */}
        <div className="mt-auto px-3 py-2 space-y-1">
          {/* Theme Toggle */}
          <button
            onClick={cycleTheme}
            className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-dark-300 dark:hover:text-white dark:hover:bg-dark-700 transition-colors ${
              sidebarCollapsed && !sidebarOpen ? 'justify-center' : ''
            }`}
            title={`Theme: ${themeLabel}`}
          >
            <ThemeIcon className="w-5 h-5 flex-shrink-0" />
            {(!sidebarCollapsed || sidebarOpen) && <span>{themeLabel}</span>}
          </button>

          {/* Collapse Button (Desktop only) */}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className={`hidden lg:flex items-center w-full px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-dark-400 dark:hover:text-white dark:hover:bg-dark-700 transition-colors ${
              sidebarCollapsed && !sidebarOpen ? 'justify-center' : ''
            }`}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? (
              <ChevronDoubleRightIcon className="w-5 h-5" />
            ) : (
              <>
                <ChevronDoubleLeftIcon className="w-5 h-5" />
                <span className="ml-2">Collapse</span>
              </>
            )}
          </button>
        </div>

        {/* User section */}
        <div className={`${sidebarCollapsed && !sidebarOpen ? 'p-2' : 'p-4'} border-t border-gray-200 dark:border-dark-700`}>
          <div className={`flex items-center ${sidebarCollapsed && !sidebarOpen ? 'flex-col gap-2' : 'justify-between'}`}>
            <div className={`flex items-center ${sidebarCollapsed && !sidebarOpen ? '' : 'gap-3'}`}>
              <button
                onClick={logout}
                className="w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center flex-shrink-0 hover:bg-primary-700 transition-colors"
                title={sidebarCollapsed && !sidebarOpen ? 'Logout' : undefined}
              >
                <span className="text-sm font-medium text-white">
                  {user?.username?.charAt(0).toUpperCase() || 'U'}
                </span>
              </button>
              {(!sidebarCollapsed || sidebarOpen) && (
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-dark-100">{user?.username || 'User'}</p>
                  <p className="text-xs text-gray-500 dark:text-dark-400">{user?.is_admin ? 'Admin' : 'User'}</p>
                </div>
              )}
            </div>
            {(!sidebarCollapsed || sidebarOpen) && (
              <button
                onClick={logout}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-dark-400 dark:hover:text-dark-100 dark:hover:bg-dark-700 rounded-lg transition-colors"
                title="Logout"
              >
                <ArrowRightOnRectangleIcon className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {/* Mobile Header with Hamburger */}
        <div className="lg:hidden sticky top-0 z-30 bg-white dark:bg-dark-800 border-b border-gray-200 dark:border-dark-700 px-3 sm:px-4 py-3 flex items-center justify-between safe-top">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2.5 sm:p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-dark-300 dark:hover:text-white dark:hover:bg-dark-700 rounded-lg transition-colors active:scale-95"
            aria-label="Open menu"
          >
            <Bars3Icon className="w-6 h-6" />
          </button>
          <h1 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white">MediaCurator</h1>
          <div className="w-11 sm:w-10" /> {/* Spacer for centering */}
        </div>

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
                    Update available! 
                    {updateData.commits_behind > 0 && (
                      <span className="ml-2">
                        {updateData.commits_behind} new commit{updateData.commits_behind === 1 ? '' : 's'}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-primary-100">
                    Current: {updateData.current_version?.split('-')[0] || updateData.current_commit} → Latest: {updateData.latest_version || updateData.latest_commit}
                  </p>
                </div>
              </div>
              <a
                href="https://github.com/Serph91P/MediaCurator/releases"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-white text-primary-600 rounded-lg hover:bg-primary-50 transition-colors"
              >
                View Changelog
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          </div>
        )}
        
        <div className="p-3 sm:p-4 md:p-6 lg:p-8 safe-bottom">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
