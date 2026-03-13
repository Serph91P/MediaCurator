import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import {
  SignalIcon,
  ClockIcon,
  ChartBarIcon,
  FireIcon,
  UsersIcon,
  FilmIcon,
  TvIcon,
} from '@heroicons/react/24/outline'
import {
  ResponsiveContainer,
  BarChart, Bar,
  AreaChart, Area,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import api from '../lib/api'
import { formatBytes, formatDuration } from '../lib/utils'

// ─── Types ───────────────────────────────────────────────────────

interface ConcurrentStreamsResponse {
  period_days: number
  overall_peak: number
  overall_peak_time: string | null
  daily_peaks: Array<{
    date: string
    peak_concurrent: number
    peak_time: string
  }>
  hourly_avg_concurrent: Array<{
    hour: number
    avg_concurrent: number
  }>
}

interface DurationStatsResponse {
  period_days: number
  total_sessions: number
  avg_duration_seconds: number
  median_duration_seconds: number
  total_watch_time_seconds: number
  by_type: Record<string, {
    count: number
    avg_duration_seconds: number
    median_duration_seconds: number
    total_watch_time_seconds: number
  }>
  distribution: Array<{ label: string; count: number }>
}

interface CompletionRatesResponse {
  period_days: number
  total_plays: number
  overall: {
    completed: number
    completed_pct: number
    partial: number
    partial_pct: number
    abandoned: number
    abandoned_pct: number
  }
  by_type: Record<string, {
    total: number
    completed: number
    completed_pct: number
    partial: number
    partial_pct: number
    abandoned: number
    abandoned_pct: number
  }>
  most_abandoned: Array<{
    media_id: number
    title: string
    media_type: string
    abandoned_count: number
    total_plays: number
  }>
}

interface BingeStatsResponse {
  period_days: number
  min_episodes: number
  total_binge_sessions: number
  recent_binges: Array<{
    user_name: string
    series: string
    episode_count: number
    started_at: string | null
    ended_at: string | null
    total_duration_seconds: number
  }>
  top_binged_series: Array<{ series: string; binge_count: number }>
  top_bingers: Array<{ user_name: string; binges: number; total_episodes: number }>
}

interface ContentReachResponse {
  total_items: number
  shared: { count: number; pct: number; size_bytes: number }
  solo: { count: number; pct: number; size_bytes: number }
  unwatched: { count: number; pct: number; size_bytes: number }
  top_shared: Array<{
    media_id: number
    title: string
    media_type: string
    size_bytes: number
    viewer_count: number
  }>
  top_solo_large: Array<{
    media_id: number
    title: string
    media_type: string
    size_bytes: number
    viewer_count: number
  }>
}

// ─── Constants ───────────────────────────────────────────────────

type TabType = 'concurrent' | 'duration' | 'completion' | 'binge' | 'reach'

const PIE_COLORS = ['#10b981', '#f59e0b', '#ef4444']

const tooltipStyle = {
  backgroundColor: 'var(--color-dark-800)',
  border: '1px solid var(--color-dark-700)',
  borderRadius: '0.5rem',
  color: '#fff',
  fontSize: '0.875rem',
}

// ─── Component ───────────────────────────────────────────────────

export default function Analytics() {
  const [activeTab, setActiveTab] = useState<TabType>('concurrent')
  const [days, setDays] = useState(30)

  // Queries
  const { data: concurrent } = useQuery<ConcurrentStreamsResponse>({
    queryKey: ['analytics-concurrent', days],
    queryFn: async () => (await api.get(`/activity/concurrent-streams?days=${days}`)).data,
    enabled: activeTab === 'concurrent',
  })

  const { data: duration } = useQuery<DurationStatsResponse>({
    queryKey: ['analytics-duration', days],
    queryFn: async () => (await api.get(`/activity/duration-stats?days=${days}`)).data,
    enabled: activeTab === 'duration',
  })

  const { data: completion } = useQuery<CompletionRatesResponse>({
    queryKey: ['analytics-completion', days],
    queryFn: async () => (await api.get(`/activity/completion-rates?days=${days}`)).data,
    enabled: activeTab === 'completion',
  })

  const { data: binge } = useQuery<BingeStatsResponse>({
    queryKey: ['analytics-binge', days],
    queryFn: async () => (await api.get(`/activity/binge-stats?days=${days}`)).data,
    enabled: activeTab === 'binge',
  })

  const { data: reach } = useQuery<ContentReachResponse>({
    queryKey: ['analytics-reach'],
    queryFn: async () => (await api.get('/media/content-reach')).data,
    enabled: activeTab === 'reach',
  })

  const tabs = [
    { id: 'concurrent' as TabType, name: 'Concurrent Streams', icon: SignalIcon },
    { id: 'duration' as TabType, name: 'Duration', icon: ClockIcon },
    { id: 'completion' as TabType, name: 'Completion', icon: ChartBarIcon },
    { id: 'binge' as TabType, name: 'Binge Watch', icon: FireIcon },
    { id: 'reach' as TabType, name: 'Content Reach', icon: UsersIcon },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Advanced Analytics</h1>
          <p className="text-sm text-gray-500 dark:text-dark-400">
            Deep insights into viewing patterns and content performance
          </p>
        </div>
        {activeTab !== 'reach' && (
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="px-3 py-2 bg-gray-50 dark:bg-dark-800 border border-gray-200 dark:border-dark-600 rounded-lg text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500"
          >
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={180}>Last 180 days</option>
            <option value={365}>Last year</option>
          </select>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-dark-700 overflow-x-auto">
        <nav className="-mb-px flex space-x-6">
          {tabs.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 py-3 px-1 border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-primary-500 text-primary-500'
                    : 'border-transparent text-gray-500 dark:text-dark-400 hover:text-gray-700 dark:hover:text-dark-200 hover:border-gray-300 dark:hover:border-dark-600'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.name}
              </button>
            )
          })}
        </nav>
      </div>

      {/* ═══════════ CONCURRENT STREAMS ═══════════ */}
      {activeTab === 'concurrent' && concurrent && (
        <div className="space-y-6">
          {/* Peak Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-dark-800 rounded-xl p-5 border border-gray-200 dark:border-dark-700">
              <p className="text-sm text-gray-500 dark:text-dark-400">Overall Peak</p>
              <p className="text-3xl font-bold text-primary-600 dark:text-primary-400 mt-1">
                {concurrent.overall_peak}
              </p>
              <p className="text-xs text-gray-400 dark:text-dark-500 mt-1">
                concurrent streams
              </p>
            </div>
            <div className="bg-white dark:bg-dark-800 rounded-xl p-5 border border-gray-200 dark:border-dark-700">
              <p className="text-sm text-gray-500 dark:text-dark-400">Peak Time</p>
              <p className="text-lg font-bold text-gray-900 dark:text-white mt-1">
                {concurrent.overall_peak_time
                  ? new Date(concurrent.overall_peak_time).toLocaleString('en-US', {
                      weekday: 'short', month: 'short', day: 'numeric',
                      hour: 'numeric', minute: '2-digit',
                    })
                  : 'N/A'}
              </p>
            </div>
            <div className="bg-white dark:bg-dark-800 rounded-xl p-5 border border-gray-200 dark:border-dark-700">
              <p className="text-sm text-gray-500 dark:text-dark-400">Avg Daily Peak</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">
                {concurrent.daily_peaks.length > 0
                  ? (concurrent.daily_peaks.reduce((s, d) => s + d.peak_concurrent, 0) / concurrent.daily_peaks.length).toFixed(1)
                  : '0'}
              </p>
            </div>
          </div>

          {/* Daily Peaks Chart */}
          <div className="bg-white dark:bg-dark-800 rounded-xl p-6 border border-gray-200 dark:border-dark-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Daily Peak Concurrent Streams
            </h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={[...concurrent.daily_peaks].reverse()}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-gray-200)" className="dark:opacity-20" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: 'var(--color-gray-500)' }}
                    tickFormatter={(d: string) => d.slice(5)}
                  />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--color-gray-500)' }} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Area
                    type="monotone"
                    dataKey="peak_concurrent"
                    name="Peak Streams"
                    stroke="var(--color-primary-500)"
                    fill="var(--color-primary-500)"
                    fillOpacity={0.2}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Hourly Average Concurrency */}
          <div className="bg-white dark:bg-dark-800 rounded-xl p-6 border border-gray-200 dark:border-dark-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Average Concurrent Streams by Hour
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={concurrent.hourly_avg_concurrent}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-gray-200)" className="dark:opacity-20" />
                  <XAxis
                    dataKey="hour"
                    tick={{ fontSize: 11, fill: 'var(--color-gray-500)' }}
                    tickFormatter={(h: number) => `${h}:00`}
                  />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--color-gray-500)' }} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value: number) => [value.toFixed(2), 'Avg Concurrent']}
                  />
                  <Bar dataKey="avg_concurrent" fill="var(--color-primary-500)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ DURATION STATS ═══════════ */}
      {activeTab === 'duration' && duration && (
        <div className="space-y-6">
          {/* Summary Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-dark-800 rounded-xl p-5 border border-gray-200 dark:border-dark-700">
              <p className="text-sm text-gray-500 dark:text-dark-400">Total Sessions</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                {duration.total_sessions.toLocaleString()}
              </p>
            </div>
            <div className="bg-white dark:bg-dark-800 rounded-xl p-5 border border-gray-200 dark:border-dark-700">
              <p className="text-sm text-gray-500 dark:text-dark-400">Avg Duration</p>
              <p className="text-2xl font-bold text-primary-600 dark:text-primary-400 mt-1">
                {formatDuration(duration.avg_duration_seconds)}
              </p>
            </div>
            <div className="bg-white dark:bg-dark-800 rounded-xl p-5 border border-gray-200 dark:border-dark-700">
              <p className="text-sm text-gray-500 dark:text-dark-400">Median Duration</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                {formatDuration(duration.median_duration_seconds)}
              </p>
            </div>
            <div className="bg-white dark:bg-dark-800 rounded-xl p-5 border border-gray-200 dark:border-dark-700">
              <p className="text-sm text-gray-500 dark:text-dark-400">Total Watch Time</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                {formatDuration(duration.total_watch_time_seconds)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Duration Distribution */}
            <div className="bg-white dark:bg-dark-800 rounded-xl p-6 border border-gray-200 dark:border-dark-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Session Length Distribution
              </h3>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={duration.distribution}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-gray-200)" className="dark:opacity-20" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: 'var(--color-gray-500)' }}
                      angle={-30}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--color-gray-500)' }} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="count" name="Sessions" fill="var(--color-primary-500)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* By Type Comparison */}
            <div className="bg-white dark:bg-dark-800 rounded-xl p-6 border border-gray-200 dark:border-dark-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Duration by Content Type
              </h3>
              <div className="space-y-4">
                {Object.entries(duration.by_type).map(([type, stats]) => (
                  <div
                    key={type}
                    className="p-4 bg-gray-50 dark:bg-dark-700/50 rounded-lg"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      {type === 'movie' ? (
                        <FilmIcon className="w-5 h-5 text-primary-500" />
                      ) : (
                        <TvIcon className="w-5 h-5 text-primary-500" />
                      )}
                      <span className="font-medium text-gray-900 dark:text-white capitalize">{type}</span>
                      <span className="text-sm text-gray-500 dark:text-dark-400 ml-auto">
                        {stats.count.toLocaleString()} sessions
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <p className="text-gray-500 dark:text-dark-400">Average</p>
                        <p className="font-semibold text-gray-900 dark:text-white">
                          {formatDuration(stats.avg_duration_seconds)}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500 dark:text-dark-400">Median</p>
                        <p className="font-semibold text-gray-900 dark:text-white">
                          {formatDuration(stats.median_duration_seconds)}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500 dark:text-dark-400">Total</p>
                        <p className="font-semibold text-gray-900 dark:text-white">
                          {formatDuration(stats.total_watch_time_seconds)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
                {Object.keys(duration.by_type).length === 0 && (
                  <p className="text-gray-500 dark:text-dark-400 text-center py-4">No data available</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ COMPLETION RATES ═══════════ */}
      {activeTab === 'completion' && completion && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Pie Chart */}
            <div className="bg-white dark:bg-dark-800 rounded-xl p-6 border border-gray-200 dark:border-dark-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Overall Completion Rates
              </h3>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Completed (>90%)', value: completion.overall.completed },
                        { name: 'Partial (25-90%)', value: completion.overall.partial },
                        { name: 'Abandoned (<25%)', value: completion.overall.abandoned },
                      ]}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {PIE_COLORS.map((color, i) => (
                        <Cell key={i} fill={color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-3 gap-4 mt-4 text-center text-sm">
                <div>
                  <p className="text-green-500 font-bold text-lg">{completion.overall.completed_pct}%</p>
                  <p className="text-gray-500 dark:text-dark-400">Completed</p>
                </div>
                <div>
                  <p className="text-yellow-500 font-bold text-lg">{completion.overall.partial_pct}%</p>
                  <p className="text-gray-500 dark:text-dark-400">Partial</p>
                </div>
                <div>
                  <p className="text-red-500 font-bold text-lg">{completion.overall.abandoned_pct}%</p>
                  <p className="text-gray-500 dark:text-dark-400">Abandoned</p>
                </div>
              </div>
            </div>

            {/* By Type Breakdown */}
            <div className="bg-white dark:bg-dark-800 rounded-xl p-6 border border-gray-200 dark:border-dark-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Completion by Content Type
              </h3>
              <div className="space-y-4">
                {Object.entries(completion.by_type).map(([type, stats]) => (
                  <div key={type} className="p-4 bg-gray-50 dark:bg-dark-700/50 rounded-lg">
                    <div className="flex items-center gap-2 mb-3">
                      {type === 'movie' ? (
                        <FilmIcon className="w-5 h-5 text-primary-500" />
                      ) : (
                        <TvIcon className="w-5 h-5 text-primary-500" />
                      )}
                      <span className="font-medium text-gray-900 dark:text-white capitalize">{type}</span>
                      <span className="text-sm text-gray-500 dark:text-dark-400 ml-auto">
                        {stats.total} plays
                      </span>
                    </div>
                    {/* Stacked bar */}
                    <div className="flex h-4 rounded-full overflow-hidden bg-gray-200 dark:bg-dark-600">
                      <div
                        className="bg-green-500 transition-all"
                        style={{ width: `${stats.completed_pct}%` }}
                        title={`Completed: ${stats.completed_pct}%`}
                      />
                      <div
                        className="bg-yellow-500 transition-all"
                        style={{ width: `${stats.partial_pct}%` }}
                        title={`Partial: ${stats.partial_pct}%`}
                      />
                      <div
                        className="bg-red-500 transition-all"
                        style={{ width: `${stats.abandoned_pct}%` }}
                        title={`Abandoned: ${stats.abandoned_pct}%`}
                      />
                    </div>
                    <div className="flex justify-between text-xs mt-1.5 text-gray-500 dark:text-dark-400">
                      <span>{stats.completed_pct}% completed</span>
                      <span>{stats.abandoned_pct}% abandoned</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Most Abandoned */}
          {completion.most_abandoned.length > 0 && (
            <div className="bg-white dark:bg-dark-800 rounded-xl p-6 border border-gray-200 dark:border-dark-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Most Frequently Abandoned Content
              </h3>
              <div className="space-y-2">
                {completion.most_abandoned.map((item, i) => (
                  <div
                    key={item.media_id}
                    className="flex items-center justify-between p-3 bg-gray-50 dark:bg-dark-700/50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-mono text-gray-400 dark:text-dark-500 w-6 text-center">
                        {i + 1}
                      </span>
                      {item.media_type === 'movie' ? (
                        <FilmIcon className="w-4 h-4 text-gray-400 dark:text-dark-400" />
                      ) : (
                        <TvIcon className="w-4 h-4 text-gray-400 dark:text-dark-400" />
                      )}
                      <span className="font-medium text-gray-900 dark:text-white">{item.title}</span>
                    </div>
                    <span className="text-sm text-red-500">
                      {item.abandoned_count} abandoned
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════ BINGE WATCH ═══════════ */}
      {activeTab === 'binge' && binge && (
        <div className="space-y-6">
          {/* Summary */}
          <div className="bg-white dark:bg-dark-800 rounded-xl p-5 border border-gray-200 dark:border-dark-700">
            <div className="flex items-center gap-3">
              <FireIcon className="w-8 h-8 text-orange-500" />
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {binge.total_binge_sessions} binge session{binge.total_binge_sessions !== 1 ? 's' : ''}
                </p>
                <p className="text-sm text-gray-500 dark:text-dark-400">
                  detected in the last {binge.period_days} days ({binge.min_episodes}+ episodes)
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Binged Series */}
            <div className="bg-white dark:bg-dark-800 rounded-xl p-6 border border-gray-200 dark:border-dark-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Most Binged Series
              </h3>
              {binge.top_binged_series.length > 0 ? (
                <div className="space-y-3">
                  {binge.top_binged_series.map((s, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-dark-700/50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-bold text-primary-500 w-6 text-center">
                          {i + 1}
                        </span>
                        <TvIcon className="w-4 h-4 text-gray-400 dark:text-dark-400" />
                        <span className="font-medium text-gray-900 dark:text-white">{s.series}</span>
                      </div>
                      <span className="text-sm text-orange-500 font-semibold">
                        {s.binge_count} binge{s.binge_count !== 1 ? 's' : ''}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 dark:text-dark-400 text-center py-8">No binge sessions detected</p>
              )}
            </div>

            {/* Top Bingers */}
            <div className="bg-white dark:bg-dark-800 rounded-xl p-6 border border-gray-200 dark:border-dark-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Top Binge Watchers
              </h3>
              {binge.top_bingers.length > 0 ? (
                <div className="space-y-3">
                  {binge.top_bingers.map((u, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-dark-700/50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-bold text-primary-500 w-6 text-center">
                          {i + 1}
                        </span>
                        <UsersIcon className="w-4 h-4 text-gray-400 dark:text-dark-400" />
                        <span className="font-medium text-gray-900 dark:text-white">{u.user_name}</span>
                      </div>
                      <div className="text-right text-sm">
                        <span className="text-orange-500 font-semibold">{u.binges} binge{u.binges !== 1 ? 's' : ''}</span>
                        <span className="text-gray-400 dark:text-dark-500 ml-2">({u.total_episodes} eps)</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 dark:text-dark-400 text-center py-8">No bingers found</p>
              )}
            </div>
          </div>

          {/* Recent Binge Sessions */}
          {binge.recent_binges.length > 0 && (
            <div className="bg-white dark:bg-dark-800 rounded-xl p-6 border border-gray-200 dark:border-dark-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Recent Binge Sessions
              </h3>
              <div className="space-y-3">
                {binge.recent_binges.slice(0, 15).map((b, i) => (
                  <div
                    key={i}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-gray-50 dark:bg-dark-700/50 rounded-lg gap-2"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <FireIcon className="w-5 h-5 text-orange-500 shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 dark:text-white truncate">
                          {b.user_name} binged {b.series}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-dark-400">
                          {b.started_at ? new Date(b.started_at).toLocaleDateString('en-US', {
                            month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
                          }) : 'Unknown date'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-sm shrink-0">
                      <span className="text-primary-500 font-semibold">
                        {b.episode_count} episodes
                      </span>
                      <span className="text-gray-500 dark:text-dark-400">
                        {formatDuration(b.total_duration_seconds)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════ CONTENT REACH ═══════════ */}
      {activeTab === 'reach' && reach && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-dark-800 rounded-xl p-5 border border-gray-200 dark:border-dark-700">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 dark:text-dark-400">Shared</p>
                  <p className="text-2xl font-bold text-green-500 mt-1">{reach.shared.count}</p>
                  <p className="text-xs text-gray-400 dark:text-dark-500">{reach.shared.pct}% &middot; {formatBytes(reach.shared.size_bytes)}</p>
                </div>
                <UsersIcon className="w-8 h-8 text-green-500/30" />
              </div>
              <p className="text-xs text-gray-400 dark:text-dark-500 mt-2">Watched by 2+ users</p>
            </div>
            <div className="bg-white dark:bg-dark-800 rounded-xl p-5 border border-gray-200 dark:border-dark-700">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 dark:text-dark-400">Solo</p>
                  <p className="text-2xl font-bold text-yellow-500 mt-1">{reach.solo.count}</p>
                  <p className="text-xs text-gray-400 dark:text-dark-500">{reach.solo.pct}% &middot; {formatBytes(reach.solo.size_bytes)}</p>
                </div>
                <UsersIcon className="w-8 h-8 text-yellow-500/30" />
              </div>
              <p className="text-xs text-gray-400 dark:text-dark-500 mt-2">Watched by 1 user only</p>
            </div>
            <div className="bg-white dark:bg-dark-800 rounded-xl p-5 border border-gray-200 dark:border-dark-700">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 dark:text-dark-400">Unwatched</p>
                  <p className="text-2xl font-bold text-red-500 mt-1">{reach.unwatched.count}</p>
                  <p className="text-xs text-gray-400 dark:text-dark-500">{reach.unwatched.pct}% &middot; {formatBytes(reach.unwatched.size_bytes)}</p>
                </div>
                <UsersIcon className="w-8 h-8 text-red-500/30" />
              </div>
              <p className="text-xs text-gray-400 dark:text-dark-500 mt-2">Not watched by anyone</p>
            </div>
          </div>

          {/* Pie Chart */}
          <div className="bg-white dark:bg-dark-800 rounded-xl p-6 border border-gray-200 dark:border-dark-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Content Reach Distribution
            </h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: 'Shared (2+ users)', value: reach.shared.count },
                      { name: 'Solo (1 user)', value: reach.solo.count },
                      { name: 'Unwatched', value: reach.unwatched.count },
                    ]}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {PIE_COLORS.map((color, i) => (
                      <Cell key={i} fill={color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Shared */}
            {reach.top_shared.length > 0 && (
              <div className="bg-white dark:bg-dark-800 rounded-xl p-6 border border-gray-200 dark:border-dark-700">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Most Shared Content
                </h3>
                <div className="space-y-2">
                  {reach.top_shared.map((item, i) => (
                    <div key={item.media_id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-dark-700/50 rounded-lg">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-sm font-mono text-gray-400 dark:text-dark-500 w-5 text-center">{i + 1}</span>
                        {item.media_type === 'movie' ? (
                          <FilmIcon className="w-4 h-4 text-gray-400 dark:text-dark-400 shrink-0" />
                        ) : (
                          <TvIcon className="w-4 h-4 text-gray-400 dark:text-dark-400 shrink-0" />
                        )}
                        <span className="font-medium text-gray-900 dark:text-white truncate">{item.title}</span>
                      </div>
                      <span className="text-sm text-green-500 font-semibold shrink-0 ml-2">
                        {item.viewer_count} viewers
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Top Solo (Large) - Cleanup Candidates */}
            {reach.top_solo_large.length > 0 && (
              <div className="bg-white dark:bg-dark-800 rounded-xl p-6 border border-gray-200 dark:border-dark-700">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Solo Content — Largest Files
                  <span className="text-sm font-normal text-gray-500 dark:text-dark-400 ml-2">(cleanup candidates)</span>
                </h3>
                <div className="space-y-2">
                  {reach.top_solo_large.map((item, i) => (
                    <div key={item.media_id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-dark-700/50 rounded-lg">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-sm font-mono text-gray-400 dark:text-dark-500 w-5 text-center">{i + 1}</span>
                        {item.media_type === 'movie' ? (
                          <FilmIcon className="w-4 h-4 text-gray-400 dark:text-dark-400 shrink-0" />
                        ) : (
                          <TvIcon className="w-4 h-4 text-gray-400 dark:text-dark-400 shrink-0" />
                        )}
                        <span className="font-medium text-gray-900 dark:text-white truncate">{item.title}</span>
                      </div>
                      <span className="text-sm text-yellow-500 font-semibold shrink-0 ml-2">
                        {formatBytes(item.size_bytes)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* No data states */}
      {activeTab === 'concurrent' && !concurrent && (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
        </div>
      )}
      {activeTab === 'duration' && !duration && (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
        </div>
      )}
      {activeTab === 'completion' && !completion && (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
        </div>
      )}
      {activeTab === 'binge' && !binge && (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
        </div>
      )}
      {activeTab === 'reach' && !reach && (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
        </div>
      )}
    </div>
  )
}
