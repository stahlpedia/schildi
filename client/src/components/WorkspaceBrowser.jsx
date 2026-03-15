import React, { useEffect, useRef, useState } from 'react'

const API_BASE = '/api/workspace'
const getToken = () => localStorage.getItem('token')
const headers = () => ({ Authorization: 'Bearer ' + getToken() })

async function apiFetch(path, opts = {}) {
  const res = await fetch(API_BASE + path, { ...opts, headers: { ...headers(), ...opts.headers } })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText)
  return res.json()
}

const formatSize = (bytes) => {
  if (!bytes) return ''
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

const formatDate = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' }) + ' ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
}

const EXT_ICONS = {
  mp4: '🎬', webm: '🎬', avi: '🎬', mov: '🎬',
  mp3: '🎵', wav: '🎵', ogg: '🎵', m4a: '🎵',
  jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', webp: '🖼️', svg: '🖼️',
  pdf: '📕', md: '📝', txt: '📝', json: '📋', yml: '📋', yaml: '📋',
  js: '⚡', jsx: '⚡', ts: '⚡', tsx: '⚡', html: '🌐', css: '🎨',
}

const getIcon = (entry) => {
  if (entry.isDirectory) return '📁'
  const ext = (entry.name.split('.').pop() || '').toLowerCase()
  return EXT_ICONS[ext] || '📄'
}

const isImage = (name) => /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(name)
const isVideo = (name) => /\.(mp4|webm|avi|mov)$/i.test(name)
const isAudio = (name) => /\.(mp3|wav|ogg|m4a)$/i.test(name)
const isText = (name) => /\.(md|txt|json|yml|yaml|css|html|htm|js|jsx|ts|tsx|xml|csv|toml|ini|sh|py|sql|env|log)$/i.test(name)

export default function WorkspaceBrowser() {
  const [currentPath, setCurrentPath] = useState('')
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedEntry, setSelectedEntry] = useState(null)
  const [previewContent, setPreviewContent] = useState(null)
  const [error, setError] = useState(null)

  const loadDir = async (dirPath) => {
    setLoading(true)
    setError(null)
    try {
      const data = await apiFetch('/browse?path=' + encodeURIComponent(dirPath || ''))
      setEntries(data.entries || [])
      setCurrentPath(dirPath || '')
      setSelectedEntry(null)
      setPreviewContent(null)
    } catch (e) {
      setEntries([])
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadDir('') }, [])

  const navigate = (entry) => {
    if (entry.isDirectory) {
      loadDir(entry.path)
    } else {
      setSelectedEntry(entry)
      if (isText(entry.name)) {
        apiFetch('/text?path=' + encodeURIComponent(entry.path))
          .then(data => setPreviewContent(data.content))
          .catch(() => setPreviewContent(null))
      } else {
        setPreviewContent(null)
      }
    }
  }

  const goUp = () => {
    const parent = currentPath.split('/').slice(0, -1).join('/')
    loadDir(parent)
  }

  const fileUrl = (entryPath) => API_BASE + '/file?path=' + encodeURIComponent(entryPath) + '&token=' + getToken()

  const pathParts = currentPath ? currentPath.split('/') : []
  const breadcrumbs = [{ label: 'Workspace', path: '' }]
  pathParts.forEach((part, i) => {
    breadcrumbs.push({ label: part, path: pathParts.slice(0, i + 1).join('/') })
  })

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 170px)' }}>
      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 bg-gray-900 rounded-xl border border-gray-800 px-4 py-3 mb-4 shrink-0">
        <div className="flex items-center gap-2 flex-1 min-w-0 overflow-x-auto">
          {breadcrumbs.map((bc, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span className="text-gray-600 text-xs">/</span>}
              <button
                onClick={() => loadDir(bc.path)}
                className={`text-sm whitespace-nowrap transition-colors ${i === breadcrumbs.length - 1 ? 'text-white font-medium' : 'text-gray-400 hover:text-white'}`}
              >
                {bc.label}
              </button>
            </React.Fragment>
          ))}
        </div>
        <div className="text-xs text-gray-500 shrink-0">Readonly Einblick in OpenClaw</div>
      </div>

      {error && <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-2 rounded-lg text-sm mb-4">{error}</div>}

      <div className="flex gap-4 flex-1 min-h-0">
        <div className={`bg-gray-900 rounded-xl border border-gray-800 flex flex-col overflow-hidden ${selectedEntry && !selectedEntry.isDirectory ? 'hidden md:flex md:flex-1' : 'flex-1'}`}>
          {loading ? (
            <div className="flex-1 flex items-center justify-center text-gray-500">Lade...</div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              {currentPath && (
                <button onClick={goUp} className="w-full flex items-center gap-3 px-4 py-3 text-left border-b border-gray-800/50 hover:bg-gray-800/50 transition-colors text-gray-400">
                  <span className="text-lg">⬆️</span><span className="text-sm">..</span>
                </button>
              )}
              {entries.length === 0 && !currentPath && (
                <div className="flex flex-col items-center justify-center py-20 text-gray-500">
                  <div className="text-6xl mb-4">🐢</div>
                  <div className="text-lg">Workspace ist leer</div>
                </div>
              )}
              {entries.map(entry => (
                <div key={entry.path} onClick={() => navigate(entry)} className={`flex items-center gap-3 px-4 py-3 border-b border-gray-800/50 cursor-pointer hover:bg-gray-800/50 transition-colors ${selectedEntry?.path === entry.path ? 'bg-gray-800' : ''}`}>
                  <span className="text-lg shrink-0">{getIcon(entry)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white truncate">{entry.name}</div>
                    <div className="text-xs text-gray-500">
                      {entry.isDirectory ? 'Ordner' : formatSize(entry.size)}
                      {entry.modified && <span className="ml-2">{formatDate(entry.modified)}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {selectedEntry && !selectedEntry.isDirectory && (
          <div className="flex flex-1 md:flex-none md:w-96 bg-gray-900 rounded-xl border border-gray-800 flex-col overflow-hidden">
            <div className="p-4 border-b border-gray-800 flex items-center gap-3 justify-between">
              <button onClick={() => { setSelectedEntry(null); setPreviewContent(null) }}
                className="md:hidden flex items-center gap-2 text-gray-400 hover:text-white text-sm shrink-0">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Zurück
              </button>
              <h3 className="text-sm font-semibold text-white truncate flex-1">{selectedEntry.name}</h3>
              <button onClick={() => { setSelectedEntry(null); setPreviewContent(null) }} className="hidden md:block text-gray-400 hover:text-white text-sm">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto flex items-center justify-center bg-gray-800/50">
              {isImage(selectedEntry.name) ? (
                <img src={fileUrl(selectedEntry.path)} alt={selectedEntry.name} className="max-w-full max-h-full object-contain" />
              ) : isVideo(selectedEntry.name) ? (
                <video src={fileUrl(selectedEntry.path)} controls className="max-w-full max-h-full" />
              ) : isAudio(selectedEntry.name) ? (
                <div className="p-8 text-center"><div className="text-5xl mb-4">🎵</div><audio src={fileUrl(selectedEntry.path)} controls className="w-full" /></div>
              ) : previewContent !== null ? (
                <pre className="w-full h-full p-4 text-sm text-gray-300 font-mono overflow-auto whitespace-pre-wrap">{previewContent}</pre>
              ) : (
                <div className="text-center text-gray-500 p-8"><div className="text-5xl mb-4">{getIcon(selectedEntry)}</div><div className="text-sm">{selectedEntry.name}</div></div>
              )}
            </div>
            <div className="p-3 border-t border-gray-800 flex items-center justify-between text-xs text-gray-500">
              <span>{formatSize(selectedEntry.size)}</span>
              <a href={fileUrl(selectedEntry.path)} download={selectedEntry.name} className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-xs text-white transition-colors">Download</a>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
