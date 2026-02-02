import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  FilmIcon,
  TvIcon,
  PlayIcon,
  ClockIcon,
  FolderIcon,
  ArrowLeftIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';
import api from '../lib/api';

interface LibraryDetails {
  id: number;
  name: string;
  type: string;
  media_type: string;
  is_enabled: boolean;
  path: string;
  service_name: string | null;
  external_id: string;
  last_synced_at: string | null;
  total_items: number;
  total_size_bytes: number;
  total_plays: number;
  item_breakdown: {
    movies: number;
    series: number;
    seasons: number;
    episodes: number;
  };
  stats: {
    plays_24h: number;
    plays_7d: number;
    plays_30d: number;
    watch_time_24h: number;
    watch_time_7d: number;
    watch_time_30d: number;
  };
  top_users: Array<{
    user_id: string;
    plays: number;
    watch_time_seconds: number;
  }>;
  recently_watched: Array<{
    id: number;
    title: string;
    media_type: string;
    last_watched_at: string | null;
    watch_count: number;
  }>;
  active_sessions: number;
}

interface MediaItem {
  id: number;
  title: string;
  media_type: string;
  external_id: string;
  added_at: string | null;
  last_watched_at: string | null;
  watch_count: number;
  size_bytes: number;
  year: number | null;
}

interface ActivityItem {
  id: number;
  user_id: string;
  media_title: string;
  client_name: string;
  device_name: string;
  play_method: string;
  is_transcoding: boolean;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number;
  played_percentage: number;
  is_active: boolean;
}

type TabType = 'overview' | 'media' | 'activity';

export default function LibraryDetail() {
  const { libraryId } = useParams<{ libraryId: string }>();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [details, setDetails] = useState<LibraryDetails | null>(null);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Media pagination
  const [mediaPage, setMediaPage] = useState(1);
  const [mediaTotalPages, setMediaTotalPages] = useState(1);
  const [mediaSearch, setMediaSearch] = useState('');
  const [mediaSortBy, setMediaSortBy] = useState('title');
  const [mediaSortOrder, setMediaSortOrder] = useState('asc');
  
  // Activity pagination
  const [activityPage, setActivityPage] = useState(1);
  const [activityTotalPages, setActivityTotalPages] = useState(1);

  useEffect(() => {
    fetchDetails();
  }, [libraryId]);

  useEffect(() => {
    if (activeTab === 'media') {
      fetchMedia();
    } else if (activeTab === 'activity') {
      fetchActivity();
    }
  }, [activeTab, mediaPage, mediaSearch, mediaSortBy, mediaSortOrder, activityPage]);

  async function fetchDetails() {
    if (!libraryId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await api.get(`/api/libraries/${libraryId}/details`);
      setDetails(response.data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load library details';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function fetchMedia() {
    if (!libraryId) return;
    try {
      const params = new URLSearchParams({
        page: mediaPage.toString(),
        page_size: '50',
        sort_by: mediaSortBy,
        sort_order: mediaSortOrder,
      });
      if (mediaSearch) {
        params.append('search', mediaSearch);
      }
      const response = await api.get(`/api/libraries/${libraryId}/media?${params}`);
      setMedia(response.data.items);
      setMediaTotalPages(response.data.total_pages);
    } catch (err) {
      console.error('Failed to fetch media:', err);
    }
  }

  async function fetchActivity() {
    if (!libraryId) return;
    try {
      const response = await api.get(`/api/libraries/${libraryId}/activity?page=${activityPage}&page_size=50`);
      setActivity(response.data.items);
      setActivityTotalPages(response.data.total_pages);
    } catch (err) {
      console.error('Failed to fetch activity:', err);
    }
  }

  function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  function formatDuration(seconds: number): string {
    if (!seconds) return '0m';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleString();
  }

  function formatRelativeTime(dateStr: string | null): string {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }

  const tabs = [
    { id: 'overview' as TabType, name: 'Overview' },
    { id: 'media' as TabType, name: 'Media' },
    { id: 'activity' as TabType, name: 'Activity' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  if (error || !details) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400">
        {error || 'Library not found'}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link 
          to="/libraries"
          className="p-2 hover:bg-dark-700 rounded-lg transition-colors"
        >
          <ArrowLeftIcon className="w-5 h-5" />
        </Link>
        <div className="flex items-center gap-3">
          {details.media_type === 'movie' ? (
            <FilmIcon className="w-8 h-8 text-primary-500" />
          ) : (
            <TvIcon className="w-8 h-8 text-primary-500" />
          )}
          <div>
            <h1 className="text-2xl font-bold">{details.name}</h1>
            <p className="text-dark-400 text-sm">
              {details.service_name} • {details.type}
              {details.active_sessions > 0 && (
                <span className="ml-2 text-green-400">
                  • {details.active_sessions} active session{details.active_sessions !== 1 ? 's' : ''}
                </span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-dark-700">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === tab.id
                  ? 'border-primary-500 text-primary-500'
                  : 'border-transparent text-dark-400 hover:text-dark-200 hover:border-dark-600'
              }`}
            >
              {tab.name}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-dark-800 rounded-xl p-4 border border-dark-700">
              <div className="flex items-center gap-2 text-dark-400 text-sm mb-1">
                <FolderIcon className="w-4 h-4" />
                Total Items
              </div>
              <p className="text-2xl font-bold">{details.total_items.toLocaleString()}</p>
            </div>
            <div className="bg-dark-800 rounded-xl p-4 border border-dark-700">
              <div className="flex items-center gap-2 text-dark-400 text-sm mb-1">
                <PlayIcon className="w-4 h-4" />
                Total Plays
              </div>
              <p className="text-2xl font-bold">{details.total_plays.toLocaleString()}</p>
            </div>
            <div className="bg-dark-800 rounded-xl p-4 border border-dark-700">
              <div className="flex items-center gap-2 text-dark-400 text-sm mb-1">
                Size
              </div>
              <p className="text-2xl font-bold">{formatBytes(details.total_size_bytes)}</p>
            </div>
            <div className="bg-dark-800 rounded-xl p-4 border border-dark-700">
              <div className="flex items-center gap-2 text-dark-400 text-sm mb-1">
                Status
              </div>
              <p className={`text-lg font-bold ${details.is_enabled ? 'text-green-400' : 'text-red-400'}`}>
                {details.is_enabled ? 'Enabled' : 'Disabled'}
              </p>
            </div>
          </div>

          {/* Time-based Stats */}
          <div className="bg-dark-800 rounded-xl p-6 border border-dark-700">
            <h3 className="text-lg font-semibold mb-4">Activity Summary</h3>
            <div className="grid grid-cols-3 gap-6">
              <div className="text-center">
                <p className="text-dark-400 text-sm mb-1">Last 24 Hours</p>
                <p className="text-xl font-bold text-primary-400">{details.stats.plays_24h} plays</p>
                <p className="text-sm text-dark-400">{formatDuration(details.stats.watch_time_24h)}</p>
              </div>
              <div className="text-center">
                <p className="text-dark-400 text-sm mb-1">Last 7 Days</p>
                <p className="text-xl font-bold text-primary-400">{details.stats.plays_7d} plays</p>
                <p className="text-sm text-dark-400">{formatDuration(details.stats.watch_time_7d)}</p>
              </div>
              <div className="text-center">
                <p className="text-dark-400 text-sm mb-1">Last 30 Days</p>
                <p className="text-xl font-bold text-primary-400">{details.stats.plays_30d} plays</p>
                <p className="text-sm text-dark-400">{formatDuration(details.stats.watch_time_30d)}</p>
              </div>
            </div>
          </div>

          {/* Item Breakdown (for Series) */}
          {details.media_type === 'series' && (
            <div className="bg-dark-800 rounded-xl p-6 border border-dark-700">
              <h3 className="text-lg font-semibold mb-4">Content Breakdown</h3>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                  <p className="text-2xl font-bold">{details.item_breakdown.series}</p>
                  <p className="text-dark-400 text-sm">Series</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold">{details.item_breakdown.seasons}</p>
                  <p className="text-dark-400 text-sm">Seasons</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold">{details.item_breakdown.episodes}</p>
                  <p className="text-dark-400 text-sm">Episodes</p>
                </div>
              </div>
            </div>
          )}

          {/* Recently Watched */}
          {details.recently_watched.length > 0 && (
            <div className="bg-dark-800 rounded-xl p-6 border border-dark-700">
              <h3 className="text-lg font-semibold mb-4">Recently Watched</h3>
              <div className="space-y-3">
                {details.recently_watched.map((item) => (
                  <div 
                    key={item.id}
                    className="flex items-center justify-between p-3 bg-dark-700/50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      {item.media_type === 'movie' ? (
                        <FilmIcon className="w-5 h-5 text-dark-400" />
                      ) : (
                        <TvIcon className="w-5 h-5 text-dark-400" />
                      )}
                      <span className="font-medium">{item.title}</span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-dark-400">
                      <span>{item.watch_count} plays</span>
                      <span>{formatRelativeTime(item.last_watched_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Library Info */}
          <div className="bg-dark-800 rounded-xl p-6 border border-dark-700">
            <h3 className="text-lg font-semibold mb-4">Library Information</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-dark-400">Path</span>
                <span className="font-mono">{details.path}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-dark-400">External ID</span>
                <span className="font-mono">{details.external_id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-dark-400">Last Synced</span>
                <span>{formatDate(details.last_synced_at)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'media' && (
        <div className="space-y-4">
          {/* Search and Sort */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-dark-400" />
              <input
                type="text"
                placeholder="Search media..."
                value={mediaSearch}
                onChange={(e) => {
                  setMediaSearch(e.target.value);
                  setMediaPage(1);
                }}
                className="w-full pl-10 pr-4 py-2 bg-dark-800 border border-dark-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <select
              value={`${mediaSortBy}-${mediaSortOrder}`}
              onChange={(e) => {
                const [field, order] = e.target.value.split('-');
                setMediaSortBy(field);
                setMediaSortOrder(order);
                setMediaPage(1);
              }}
              className="px-4 py-2 bg-dark-800 border border-dark-600 rounded-lg focus:ring-2 focus:ring-primary-500"
            >
              <option value="title-asc">Title (A-Z)</option>
              <option value="title-desc">Title (Z-A)</option>
              <option value="added_at-desc">Recently Added</option>
              <option value="added_at-asc">Oldest Added</option>
              <option value="last_watched_at-desc">Recently Watched</option>
              <option value="watch_count-desc">Most Watched</option>
              <option value="size_bytes-desc">Largest</option>
              <option value="size_bytes-asc">Smallest</option>
            </select>
          </div>

          {/* Media Table */}
          <div className="bg-dark-800 rounded-xl border border-dark-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-dark-700 text-left text-sm text-dark-400">
                    <th className="px-4 py-3 font-medium">Title</th>
                    <th className="px-4 py-3 font-medium">Year</th>
                    <th className="px-4 py-3 font-medium">Size</th>
                    <th className="px-4 py-3 font-medium">Plays</th>
                    <th className="px-4 py-3 font-medium">Last Watched</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-700">
                  {media.map((item) => (
                    <tr key={item.id} className="hover:bg-dark-700/50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {item.media_type === 'movie' ? (
                            <FilmIcon className="w-4 h-4 text-dark-400" />
                          ) : (
                            <TvIcon className="w-4 h-4 text-dark-400" />
                          )}
                          <span className="font-medium">{item.title}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-dark-400">{item.year || '-'}</td>
                      <td className="px-4 py-3 text-dark-400">{formatBytes(item.size_bytes)}</td>
                      <td className="px-4 py-3">{item.watch_count}</td>
                      <td className="px-4 py-3 text-dark-400">
                        {formatRelativeTime(item.last_watched_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Media Pagination */}
          {mediaTotalPages > 1 && (
            <div className="flex justify-center items-center gap-2">
              <button
                onClick={() => setMediaPage(p => Math.max(1, p - 1))}
                disabled={mediaPage === 1}
                className="p-2 rounded-lg bg-dark-700 hover:bg-dark-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeftIcon className="w-5 h-5" />
              </button>
              <span className="text-sm text-dark-400">
                Page {mediaPage} of {mediaTotalPages}
              </span>
              <button
                onClick={() => setMediaPage(p => Math.min(mediaTotalPages, p + 1))}
                disabled={mediaPage === mediaTotalPages}
                className="p-2 rounded-lg bg-dark-700 hover:bg-dark-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRightIcon className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'activity' && (
        <div className="space-y-4">
          {/* Activity Table */}
          <div className="bg-dark-800 rounded-xl border border-dark-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-dark-700 text-left text-sm text-dark-400">
                    <th className="px-4 py-3 font-medium">Title</th>
                    <th className="px-4 py-3 font-medium">User</th>
                    <th className="px-4 py-3 font-medium">Client</th>
                    <th className="px-4 py-3 font-medium">Played</th>
                    <th className="px-4 py-3 font-medium">Duration</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-700">
                  {activity.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-dark-400">
                        No activity recorded yet
                      </td>
                    </tr>
                  ) : (
                    activity.map((item) => (
                      <tr key={item.id} className="hover:bg-dark-700/50">
                        <td className="px-4 py-3 font-medium">{item.media_title}</td>
                        <td className="px-4 py-3 text-dark-400">
                          <Link 
                            to={`/users/${item.user_id}`}
                            className="hover:text-primary-400 transition-colors"
                          >
                            {item.user_id.slice(0, 8)}...
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-dark-400">
                          {item.client_name || item.device_name || 'Unknown'}
                        </td>
                        <td className="px-4 py-3 text-dark-400">
                          {formatRelativeTime(item.started_at)}
                        </td>
                        <td className="px-4 py-3 text-dark-400">
                          {formatDuration(item.duration_seconds)}
                          {item.played_percentage > 0 && (
                            <span className="ml-1 text-xs">
                              ({Math.round(item.played_percentage)}%)
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {item.is_active ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded-full">
                              <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></span>
                              Playing
                            </span>
                          ) : (
                            <span className="text-dark-400 text-sm">
                              {item.is_transcoding ? 'Transcoded' : 'Direct'}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Activity Pagination */}
          {activityTotalPages > 1 && (
            <div className="flex justify-center items-center gap-2">
              <button
                onClick={() => setActivityPage(p => Math.max(1, p - 1))}
                disabled={activityPage === 1}
                className="p-2 rounded-lg bg-dark-700 hover:bg-dark-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeftIcon className="w-5 h-5" />
              </button>
              <span className="text-sm text-dark-400">
                Page {activityPage} of {activityTotalPages}
              </span>
              <button
                onClick={() => setActivityPage(p => Math.min(activityTotalPages, p + 1))}
                disabled={activityPage === activityTotalPages}
                className="p-2 rounded-lg bg-dark-700 hover:bg-dark-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRightIcon className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
