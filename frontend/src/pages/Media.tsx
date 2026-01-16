import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { MagnifyingGlassIcon, TrashIcon, EyeIcon, FilmIcon, TvIcon } from '@heroicons/react/24/outline'
import api from '../lib/api'
import toast from 'react-hot-toast'
import { formatBytes, formatRelativeTime } from '../lib/utils'
import type { MediaItem, MediaType, Library } from '../types'

export default function Media() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [mediaType, setMediaType] = useState<MediaType | ''>('')
  const [libraryId, setLibraryId] = useState<number | ''>('')
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null)

  const { data: libraries } = useQuery({
    queryKey: ['libraries'],
    queryFn: async () => {
      const res = await api.get<Library[]>('/libraries/')
      return res.data
    },
  })

  const { data: media, isLoading } = useQuery({
    queryKey: ['media', { search, mediaType, libraryId }],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (search) params.append('search', search)
      if (mediaType) params.append('media_type', mediaType)
      if (libraryId) params.append('library_id', libraryId.toString())
      params.append('skip', '0')
      params.append('limit', '50')
      const res = await api.get<MediaItem[]>(`/media/?${params}`)
      return res.data
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/media/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['media'] })
      toast.success('Media item deleted')
    },
    onError: () => toast.error('Failed to delete media'),
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Media</h1>
        <p className="text-dark-400 mt-1">Browse and manage your media library</p>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="card-body">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <MagnifyingGlassIcon className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-dark-400" />
              <input
                type="text"
                className="input pl-10"
                placeholder="Search media..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              className="input md:w-40"
              value={mediaType}
              onChange={(e) => setMediaType(e.target.value as MediaType | '')}
            >
              <option value="">All Types</option>
              <option value="movie">Movies</option>
              <option value="series">Series</option>
              <option value="episode">Episodes</option>
            </select>
            <select
              className="input md:w-48"
              value={libraryId}
              onChange={(e) => setLibraryId(e.target.value ? parseInt(e.target.value) : '')}
            >
              <option value="">All Libraries</option>
              {libraries?.map((lib) => (
                <option key={lib.id} value={lib.id}>{lib.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Media List */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="card animate-pulse">
              <div className="card-body h-16" />
            </div>
          ))}
        </div>
      ) : media && media.length > 0 ? (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-dark-800/50">
                <tr>
                  <th className="text-left px-6 py-3 text-xs font-medium text-dark-400 uppercase tracking-wider">
                    Title
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-dark-400 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-dark-400 uppercase tracking-wider">
                    Size
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-dark-400 uppercase tracking-wider">
                    Last Watched
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-dark-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-dark-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-700">
                {media.map((item) => (
                  <tr key={item.id} className="hover:bg-dark-800/30">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded flex items-center justify-center ${
                          item.media_type === 'movie' ? 'bg-blue-600/20' : 'bg-green-600/20'
                        }`}>
                          {item.media_type === 'movie' ? (
                            <FilmIcon className="w-4 h-4 text-blue-400" />
                          ) : (
                            <TvIcon className="w-4 h-4 text-green-400" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-white">{item.title}</p>
                          {item.year && (
                            <p className="text-sm text-dark-400">{item.year}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`badge ${
                        item.media_type === 'movie' ? 'badge-info' :
                        item.media_type === 'series' ? 'badge-success' :
                        'badge-warning'
                      }`}>
                        {item.media_type}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-dark-300">
                      {item.size_bytes ? formatBytes(item.size_bytes) : '-'}
                    </td>
                    <td className="px-6 py-4 text-dark-300">
                      {item.last_watched
                        ? formatRelativeTime(item.last_watched)
                        : <span className="text-dark-500">Never</span>
                      }
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {item.is_watched && (
                          <span className="badge badge-success">Watched</span>
                        )}
                        {item.is_favorite && (
                          <span className="badge badge-warning">Favorite</span>
                        )}
                        {item.marked_for_deletion && (
                          <span className="badge badge-danger">Pending Deletion</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setSelectedMedia(item)}
                          className="btn-ghost text-dark-400 hover:text-white"
                        >
                          <EyeIcon className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => deleteMutation.mutate(item.id)}
                          className="btn-ghost text-red-400 hover:text-red-300"
                        >
                          <TrashIcon className="w-5 h-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="card-body text-center py-12">
            <FilmIcon className="w-12 h-12 mx-auto text-dark-500" />
            <p className="text-dark-400 mt-4">No media found</p>
            <p className="text-sm text-dark-500 mt-1">
              {search ? 'Try adjusting your search' : 'Sync your libraries to see media'}
            </p>
          </div>
        </div>
      )}

      {/* Media Detail Modal */}
      {selectedMedia && (
        <MediaDetailModal
          media={selectedMedia}
          onClose={() => setSelectedMedia(null)}
        />
      )}
    </div>
  )
}

function MediaDetailModal({
  media,
  onClose,
}: {
  media: MediaItem
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="card w-full max-w-lg mx-4">
        <div className="card-header">
          <h2 className="text-lg font-semibold text-white">{media.title}</h2>
        </div>
        <div className="card-body space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-dark-400">Type</span>
              <p className="text-white">{media.media_type}</p>
            </div>
            <div>
              <span className="text-dark-400">Year</span>
              <p className="text-white">{media.year || '-'}</p>
            </div>
            <div>
              <span className="text-dark-400">Size</span>
              <p className="text-white">{media.size_bytes ? formatBytes(media.size_bytes) : '-'}</p>
            </div>
            <div>
              <span className="text-dark-400">Added</span>
              <p className="text-white">{media.added_at ? formatRelativeTime(media.added_at) : '-'}</p>
            </div>
            <div>
              <span className="text-dark-400">Last Watched</span>
              <p className="text-white">{media.last_watched ? formatRelativeTime(media.last_watched) : 'Never'}</p>
            </div>
            <div>
              <span className="text-dark-400">Play Count</span>
              <p className="text-white">{media.play_count || 0}</p>
            </div>
            {media.path && (
              <div className="col-span-2">
                <span className="text-dark-400">Path</span>
                <p className="text-white break-all text-xs font-mono bg-dark-800 p-2 rounded mt-1">
                  {media.path}
                </p>
              </div>
            )}
          </div>

          {media.genres && media.genres.length > 0 && (
            <div>
              <span className="text-sm text-dark-400">Genres</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {media.genres.map((genre) => (
                  <span key={genre} className="badge bg-dark-700 text-dark-300">
                    {genre}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {media.is_watched && <span className="badge badge-success">Watched</span>}
            {media.is_favorite && <span className="badge badge-warning">Favorite</span>}
            {media.marked_for_deletion && <span className="badge badge-danger">Pending Deletion</span>}
          </div>

          {media.sonarr_id && (
            <p className="text-xs text-dark-500">Sonarr ID: {media.sonarr_id}</p>
          )}
          {media.radarr_id && (
            <p className="text-xs text-dark-500">Radarr ID: {media.radarr_id}</p>
          )}
          {media.emby_id && (
            <p className="text-xs text-dark-500">Emby ID: {media.emby_id}</p>
          )}
        </div>
        <div className="px-6 py-4 border-t border-dark-700 flex justify-end">
          <button onClick={onClose} className="btn-secondary">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
