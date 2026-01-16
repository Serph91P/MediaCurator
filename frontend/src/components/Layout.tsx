import { NavLink, Outlet } from 'react-router-dom'
import { useAuthStore } from '../stores/auth'
import {
  HomeIcon,
  ServerStackIcon,
  ClipboardDocumentListIcon,
  FolderIcon,
  FilmIcon,
  BellIcon,
  Cog6ToothIcon,
  ClockIcon,
  ArrowRightOnRectangleIcon,
  EyeIcon,
} from '@heroicons/react/24/outline'

const navigation = [
  { name: 'Dashboard', href: '/', icon: HomeIcon },
  { name: 'Services', href: '/services', icon: ServerStackIcon },
  { name: 'Rules', href: '/rules', icon: ClipboardDocumentListIcon },
  { name: 'Libraries', href: '/libraries', icon: FolderIcon },
  { name: 'Media', href: '/media', icon: FilmIcon },
  { name: 'Preview', href: '/preview', icon: EyeIcon },
  { name: 'Notifications', href: '/notifications', icon: BellIcon },
  { name: 'History', href: '/history', icon: ClockIcon },
  { name: 'Settings', href: '/settings', icon: Cog6ToothIcon },
]

export default function Layout() {
  const { user, logout } = useAuthStore()

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
              <h1 className="text-lg font-bold text-white">MediaCleaner</h1>
              <p className="text-xs text-dark-400">v0.1.0</p>
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
        <div className="p-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
