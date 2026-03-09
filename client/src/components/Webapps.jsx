import React, { useState, useEffect, useRef, useCallback } from 'react'
import { apps } from '../api'

// CodeMirror Hook (gleiche Logik wie in Pages.jsx)
function useCodeMirror(containerRef, value, onChange, mode, active) {
  const editorRef = useRef(null)
  const [loaded, setLoaded] = useState(!!window.CodeMirror)

  useEffect(() => {
    if (window.CodeMirror) { setLoaded(true); return }
    const css = document.createElement('link')
    css.rel = 'stylesheet'
    css.href = 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.18/codemirror.min.css'
    document.head.appendChild(css)
    const themeCss = document.createElement('link')
    themeCss.rel = 'stylesheet'
    themeCss.href = 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.18/theme/dracula.min.css'
    document.head.appendChild(themeCss)
    const customCss = document.createElement('style')
    customCss.innerHTML = `.CodeMirror { color: #FFFFFF !important; background-color: #282a36 !important; } .CodeMirror-gutters { background-color: #282a36 !important; } .CodeMirror-linenumber { color: #6D8A88 !important; }`
    document.head.appendChild(customCss)
    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.18/codemirror.min.js'
    script.onload = () => {
      const modes = ['xml', 'javascript', 'css', 'htmlmixed']
      let loadedCount = 0
      modes.forEach(m => {
        const s = document.createElement('script')
        s.src = `https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.18/mode/${m}/${m}.min.js`
        s.onload = () => { if (++loadedCount === modes.length) setLoaded(true) }
        document.head.appendChild(s)
      })
    }
    document.head.appendChild(script)
  }, [])

  useEffect(() => {
    if (!loaded || !active || !containerRef.current) return
    if (editorRef.current) { editorRef.current.toTextArea(); editorRef.current = null }
    const ta = document.createElement('textarea')
    containerRef.current.innerHTML = ''
    containerRef.current.appendChild(ta)
    const cm = window.CodeMirror.fromTextArea(ta, {
      mode: mode || 'htmlmixed', theme: 'dracula', lineNumbers: true, lineWrapping: true,
      tabSize: 2, indentWithTabs: false
    })
    cm.setValue(value || '')
    cm.on('change', () => onChange(cm.getValue()))
    cm.setSize('100%', '100%')
    editorRef.current = cm
    setTimeout(() => cm.refresh(), 50)
    return () => { if (editorRef.current) { editorRef.current.toTextArea(); editorRef.current = null } }
  }, [loaded, active, mode])

  useEffect(() => {
    if (editorRef.current && editorRef.current.getValue() !== value) {
      editorRef.current.setValue(value || '')
    }
  }, [value])

  return { loaded }
}

function getMode(filename) {
  const ext = (filename || '').split('.').pop().toLowerCase()
  const map = { html: 'htmlmixed', htm: 'htmlmixed', css: 'css', js: 'javascript', json: 'application/json', xml: 'xml', svg: 'xml', mjs: 'javascript', jsx: 'javascript' }
  return map[ext] || 'htmlmixed'
}

function getIcon(entry) {
  if (entry.type === 'directory') return '📁'
  const ext = (entry.name || '').split('.').pop().toLowerCase()
  if (ext === 'html' || ext === 'htm') return '📄'
  if (ext === 'css') return '🎨'
  if (ext === 'js' || ext === 'mjs' || ext === 'jsx') return '⚡'
  if (ext === 'json') return '📋'
  return '📄'
}

function FileTree({ tree, selected, onSelect, depth = 0, basePath = '' }) {
  const [expanded, setExpanded] = useState({})
  const toggle = (key) => setExpanded(prev => ({ ...prev, [key]: !prev[key] }))

  if (!tree || !tree.children) return null

  return (
    <div>
      {tree.children.map(entry => {
        const entryPath = basePath ? `${basePath}/${entry.name}` : entry.name
        return (
          <div key={entryPath}>
            <div
              onClick={() => entry.type === 'directory' ? toggle(entryPath) : onSelect(entry, entryPath)}
              className={`flex items-center gap-1.5 px-2 py-1 cursor-pointer text-xs hover:bg-gray-800/50 transition-colors ${selected === entryPath ? 'bg-gray-800 text-white' : 'text-gray-300'}`}
              style={{ paddingLeft: `${depth * 16 + 8}px` }}
            >
              {entry.type === 'directory' && <span className="text-[10px] text-gray-500">{expanded[entryPath] ? '▼' : '▶'}</span>}
              <span>{getIcon(entry)}</span>
              <span className="truncate flex-1">{entry.name}</span>
              {entry.size != null && entry.type === 'file' && <span className="text-[10px] text-gray-600">{(entry.size / 1024).toFixed(1)}k</span>}
            </div>
            {entry.type === 'directory' && expanded[entryPath] && (
              <FileTree tree={entry} selected={selected} onSelect={onSelect} depth={depth + 1} basePath={entryPath} />
            )}
          </div>
        )
      })}
    </div>
  )
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-3 md:p-0" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 md:p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-white">{title}</h3>
        {children}
      </div>
    </div>
  )
}

function StatusDot({ status }) {
  const color = status === 'running' ? 'bg-green-500' : status === 'error' ? 'bg-red-500' : 'bg-gray-500'
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${color}`} title={status} />
}

export default function Webapps({ projectId }) {
  const [appList, setAppList] = useState([])
  const [selectedApp, setSelectedApp] = useState('')
  const [appDetail, setAppDetail] = useState(null)
  const [fileTree, setFileTree] = useState(null)
  const [selectedFile, setSelectedFile] = useState(null)
  const [selectedPath, setSelectedPath] = useState('')
  const [fileContent, setFileContent] = useState('')
  const [editorContent, setEditorContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [actionLoading, setActionLoading] = useState(null)
  const [showNewApp, setShowNewApp] = useState(false)
  const [showImportApp, setShowImportApp] = useState(false)
  const [showNewFile, setShowNewFile] = useState(false)
  const [newAppName, setNewAppName] = useState('')
  const [importGitUrl, setImportGitUrl] = useState('')
  const [importAppName, setImportAppName] = useState('')
  const [importDomain, setImportDomain] = useState('')
  const [importMode, setImportMode] = useState('import')
  const [newAppTemplate, setNewAppTemplate] = useState('basic')
  const [newAppDomain, setNewAppDomain] = useState('')
  const [newFilePath, setNewFilePath] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [logsOpen, setLogsOpen] = useState(false)
  const [logs, setLogs] = useState([])
  const logsEndRef = useRef(null)
  const cmRef = useRef(null)

  const mode = selectedFile ? getMode(selectedFile.name) : 'javascript'
  const { loaded: cmLoaded } = useCodeMirror(cmRef, editorContent, setEditorContent, mode, !!selectedFile)

  const appStatus = appDetail?.data?.status?.status || appDetail?.data?.status || 'stopped'
  const appPort = appDetail?.data?.status?.port || appDetail?.data?.persisted?.port || null
  const appDomain = appDetail?.data?.config?.domain || null

  // Apps laden
  const loadApps = useCallback(async () => {
    try {
      const res = await apps.list()
      setAppList(res.data || [])
    } catch (e) { setError(e.message) }
  }, [])

  // App-Detail laden
  const loadAppDetail = useCallback(async (name) => {
    if (!name) { setAppDetail(null); return }
    try {
      const res = await apps.get(name)
      setAppDetail(res)
      if (res.data?.logs) setLogs(res.data.logs)
    } catch (e) { setError(e.message) }
  }, [])

  // Dateibaum laden
  const loadTree = useCallback(async (name) => {
    if (!name) { setFileTree(null); return }
    try {
      const tree = await apps.tree(name)
      setFileTree(tree)
    } catch (e) { setFileTree(null) }
  }, [])

  // Datei laden
  const loadFile = async (entry, filePath) => {
    if (!selectedApp) return
    try {
      const data = await apps.readFile(selectedApp, filePath)
      setSelectedFile(entry)
      setSelectedPath(filePath)
      setFileContent(data.content)
      setEditorContent(data.content)
    } catch (e) { setError(e.message) }
  }

  // App-Aktion ausfuehren
  const runAction = async (action) => {
    if (!selectedApp) return
    setActionLoading(action)
    setSuccess(null)
    try {
      if (action === 'start') await apps.start(selectedApp)
      else if (action === 'stop') await apps.stop(selectedApp)
      else if (action === 'restart') await apps.restart(selectedApp)
      else if (action === 'install') await apps.install(selectedApp)
      await loadAppDetail(selectedApp)
      await loadApps()
    } catch (e) { setError(e.message) }
    setActionLoading(null)
  }

  const handleExportApp = async () => {
    if (!selectedApp) return
    setActionLoading('export')
    setError(null)
    setSuccess(null)
    try {
      const result = await apps.export(selectedApp, { include_db: false })
      if (result.method === 'github' && result.repo_url) {
        setSuccess(`Export erfolgreich. Repo: ${result.repo_url}`)
      } else if (result.download_path) {
        setSuccess(`Export erfolgreich. Datei: ${result.download_path}`)
      } else {
        setSuccess('Export erfolgreich.')
      }
    } catch (e) {
      setError(e.message || 'Export fehlgeschlagen')
    }
    setActionLoading(null)
  }

  // Speichern
  const handleSaveFile = async () => {
    if (!selectedApp || !selectedPath) return
    setSaving(true)
    try {
      await apps.writeFile(selectedApp, selectedPath, editorContent)
      setFileContent(editorContent)
      setError(null)
    } catch (e) { setError(e.message) }
    setSaving(false)
  }

  // Datei loeschen
  const handleDeleteFile = async () => {
    if (!selectedApp || !selectedPath || !confirm(`"${selectedPath}" wirklich loeschen?`)) return
    try {
      await apps.deleteFile(selectedApp, selectedPath)
      setSelectedFile(null)
      setSelectedPath('')
      loadTree(selectedApp)
    } catch (e) { setError(e.message) }
  }

  // Neue Datei erstellen
  const handleCreateFile = async () => {
    if (!selectedApp || !newFilePath.trim()) return
    try {
      await apps.writeFile(selectedApp, newFilePath.trim(), '')
      setShowNewFile(false)
      setNewFilePath('')
      loadTree(selectedApp)
    } catch (e) { setError(e.message) }
  }

  // Neue App erstellen
  const handleCreateApp = async () => {
    const name = newAppName.trim()
    if (!name) return
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(name)) {
      setError('App-Name: nur a-z, 0-9, Bindestrich, Unterstrich. Max 64 Zeichen.')
      return
    }
    try {
      await apps.create(name, newAppTemplate, newAppDomain.trim() || undefined, projectId)
      setShowNewApp(false)
      setNewAppName('')
      setNewAppTemplate('basic')
      setNewAppDomain('')
      await loadApps()
      setSelectedApp(name)
    } catch (e) { setError(e.message) }
  }

  const handleImportApp = async () => {
    const git_url = importGitUrl.trim()
    if (!git_url) {
      setError('GitHub URL ist erforderlich')
      return
    }
    try {
      setActionLoading('import')
      setError(null)
      setSuccess(null)
      const payload = {
        git_url,
        name: importAppName.trim() || undefined,
        domain: importDomain.trim() || undefined,
        project_id: projectId,
        install: true,
      }
      const result = importMode === 'migrate'
        ? await apps.importMigrate({ ...payload, source: 'github' })
        : await apps.importFromGit(payload)

      if (result?.report) {
        setSuccess(`Import erfolgreich. Analyse: ${result.report.filesWithHits} Dateien mit Treffern bei ${result.report.filesScanned} geprueften Dateien.`)
      } else {
        setSuccess('Import erfolgreich.')
      }

      setShowImportApp(false)
      setImportGitUrl('')
      setImportAppName('')
      setImportDomain('')
      setImportMode('import')

      await loadApps()
      if (result?.name) setSelectedApp(result.name)
    } catch (e) {
      setError(e.message || 'Import fehlgeschlagen')
    }
    setActionLoading(null)
  }

  // App loeschen
  const handleDeleteApp = async () => {
    if (!selectedApp || !confirm(`App "${selectedApp}" wirklich komplett loeschen?`)) return
    try {
      await apps.remove(selectedApp)
      setSelectedApp('')
      setAppDetail(null)
      setFileTree(null)
      setSelectedFile(null)
      loadApps()
    } catch (e) { setError(e.message) }
  }

  // Logs polling (alle 5s wenn Panel offen und App running)
  useEffect(() => {
    if (!logsOpen || !selectedApp || appStatus !== 'running') return
    const interval = setInterval(async () => {
      try {
        const res = await apps.get(selectedApp)
        if (res.data?.logs) setLogs(res.data.logs)
      } catch (_) {}
    }, 5000)
    return () => clearInterval(interval)
  }, [logsOpen, selectedApp, appStatus])

  // Auto-scroll Logs
  useEffect(() => {
    if (logsEndRef.current) logsEndRef.current.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  // SSE Events
  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.type === 'apps') {
        loadApps()
        if (selectedApp) loadAppDetail(selectedApp)
      }
    }
    window.addEventListener('sse-event', handler)
    return () => window.removeEventListener('sse-event', handler)
  }, [selectedApp, loadApps, loadAppDetail])

  // Init + App-Wechsel
  useEffect(() => { loadApps() }, [loadApps])
  useEffect(() => {
    if (selectedApp) {
      loadAppDetail(selectedApp)
      loadTree(selectedApp)
      setSelectedFile(null)
      setSelectedPath('')
    }
  }, [selectedApp, loadAppDetail, loadTree])

  const hasChanges = selectedFile && editorContent !== fileContent

  // Finde Status fuer eine App in der Liste
  const getAppStatus = (name) => {
    const app = appList.find(a => a.name === name)
    return app?.status?.status || 'stopped'
  }

  return (
    <div className="flex flex-col gap-4" style={{ height: 'calc(100vh - 120px)' }}>
      {error && (
        <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-2 rounded-lg text-sm flex justify-between items-center">
          {error}
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-200 ml-4">✕</button>
        </div>
      )}
      {success && (
        <div className="bg-emerald-900/40 border border-emerald-700 text-emerald-200 px-4 py-2 rounded-lg text-sm flex justify-between items-center">
          {success}
          <button onClick={() => setSuccess(null)} className="text-emerald-400 hover:text-emerald-200 ml-4">✕</button>
        </div>
      )}

      {/* Top bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 bg-gray-900 rounded-xl border border-gray-800 px-4 py-3">
        <div className="flex items-center gap-3 flex-1">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="md:hidden p-2 text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <select value={selectedApp} onChange={e => setSelectedApp(e.target.value)}
            className="flex-1 md:flex-none md:min-w-[200px] px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500">
            <option value="">App waehlen...</option>
            {appList.map(a => (
              <option key={a.name} value={a.name}>{a.name}</option>
            ))}
          </select>
          {selectedApp && <StatusDot status={appStatus} />}
          {selectedApp && appPort && (
            <span className="text-xs text-gray-500">Port {appPort}</span>
          )}
          {selectedApp && appDomain && (
            <a href={`https://${appDomain}`} target="_blank" rel="noopener noreferrer"
              className="text-xs text-emerald-400 hover:text-emerald-300 truncate max-w-[200px]">{appDomain}</a>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          {selectedApp && (
            <>
              <button onClick={() => runAction('start')} disabled={actionLoading || appStatus === 'running'}
                className="px-3 py-2 bg-green-700 hover:bg-green-600 disabled:opacity-40 rounded-lg text-xs font-medium transition-colors">
                {actionLoading === 'start' ? '...' : 'Start'}
              </button>
              <button onClick={() => runAction('stop')} disabled={actionLoading || appStatus === 'stopped'}
                className="px-3 py-2 bg-red-700 hover:bg-red-600 disabled:opacity-40 rounded-lg text-xs font-medium transition-colors">
                {actionLoading === 'stop' ? '...' : 'Stop'}
              </button>
              <button onClick={() => runAction('restart')} disabled={actionLoading}
                className="px-3 py-2 bg-yellow-700 hover:bg-yellow-600 disabled:opacity-40 rounded-lg text-xs font-medium transition-colors">
                {actionLoading === 'restart' ? '...' : 'Restart'}
              </button>
              <button onClick={() => runAction('install')} disabled={actionLoading}
                className="px-3 py-2 bg-blue-700 hover:bg-blue-600 disabled:opacity-40 rounded-lg text-xs font-medium transition-colors">
                {actionLoading === 'install' ? '...' : 'Install'}
              </button>
              <button onClick={handleExportApp} disabled={actionLoading}
                className="px-3 py-2 bg-indigo-700 hover:bg-indigo-600 disabled:opacity-40 rounded-lg text-xs font-medium transition-colors">
                {actionLoading === 'export' ? '...' : 'Export'}
              </button>
              <button onClick={() => setLogsOpen(!logsOpen)}
                className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${logsOpen ? 'bg-purple-600 hover:bg-purple-500' : 'bg-gray-700 hover:bg-gray-600'}`}>
                Logs
              </button>
            </>
          )}
          <button onClick={() => setShowImportApp(true)}
            className="px-3 py-2 bg-cyan-700 hover:bg-cyan-600 rounded-lg text-xs font-medium transition-colors">Import</button>
          <button onClick={() => setShowNewApp(true)}
            className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-xs font-medium transition-colors">+ Neue App</button>
          {selectedApp && (
            <button onClick={handleDeleteApp}
              className="px-3 py-2 bg-gray-700 hover:bg-red-600 rounded-lg text-xs transition-colors">Loeschen</button>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex gap-4 flex-1 min-h-0 relative">
        {/* Desktop sidebar: File tree */}
        <div className="hidden md:flex w-64 shrink-0 bg-gray-900 rounded-xl border border-gray-800 flex-col overflow-hidden">
          <div className="p-3 border-b border-gray-800 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-300">Dateien</span>
            {selectedApp && (
              <button onClick={() => setShowNewFile(true)} className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 rounded text-xs font-medium transition-colors">+ Neu</button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            {fileTree ? (
              <FileTree tree={fileTree} selected={selectedPath} onSelect={loadFile} />
            ) : (
              <p className="text-gray-500 text-center py-6 text-xs">
                {selectedApp ? 'Lade...' : 'App waehlen'}
              </p>
            )}
          </div>
        </div>

        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <div className="fixed inset-0 bg-black/60 z-50 md:hidden" onClick={() => setSidebarOpen(false)}>
            <div className="absolute top-0 left-0 w-80 max-w-[90vw] h-full bg-gray-900 border-r border-gray-800 flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="p-3 border-b border-gray-800 flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-300">Dateien</span>
                <button onClick={() => setSidebarOpen(false)} className="text-gray-400 hover:text-white">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                {fileTree ? (
                  <FileTree tree={fileTree} selected={selectedPath} onSelect={(e, p) => { loadFile(e, p); setSidebarOpen(false) }} />
                ) : (
                  <p className="text-gray-500 text-center py-6 text-xs">App waehlen</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Center: Editor */}
        <div className={`flex-1 bg-gray-900 rounded-xl border border-gray-800 flex flex-col overflow-hidden ${logsOpen ? '' : ''}`}>
          {selectedFile ? (
            <>
              <div className="p-3 border-b border-gray-800 flex items-center gap-2">
                <span className="text-xs text-gray-500">{getIcon(selectedFile)}</span>
                <span className="text-sm text-gray-300 font-mono">{selectedPath}</span>
                {hasChanges && <span className="text-xs text-yellow-500">● ungespeichert</span>}
              </div>
              <div className="flex-1 min-h-0 overflow-hidden" ref={cmRef}>
                {!cmLoaded && <div className="flex items-center justify-center h-full text-gray-500 text-sm">Editor wird geladen...</div>}
              </div>
              <div className="p-3 border-t border-gray-800 flex gap-2">
                <button onClick={handleSaveFile} disabled={saving}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors">
                  {saving ? 'Speichert...' : 'Speichern'}
                </button>
                <button onClick={handleDeleteFile}
                  className="px-4 py-2 bg-gray-700 hover:bg-red-600 rounded-lg text-sm transition-colors ml-auto">Datei loeschen</button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
              {selectedApp ? 'Datei aus dem Baum waehlen' : 'Zuerst eine App waehlen'}
            </div>
          )}
        </div>

        {/* Right: Logs Panel */}
        {logsOpen && selectedApp && (
          <div className="hidden md:flex w-80 shrink-0 bg-gray-900 rounded-xl border border-gray-800 flex-col overflow-hidden">
            <div className="p-3 border-b border-gray-800 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-300">Logs</span>
              <div className="flex items-center gap-2">
                {appStatus === 'running' && <span className="text-[10px] text-green-400 animate-pulse">live</span>}
                <button onClick={() => setLogsOpen(false)} className="text-gray-400 hover:text-white text-xs">✕</button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 font-mono text-[11px] leading-relaxed">
              {logs.length === 0 ? (
                <p className="text-gray-600 text-center py-4">Keine Logs</p>
              ) : (
                logs.map((entry, i) => (
                  <div key={i} className={`${entry.source === 'stderr' ? 'text-red-400' : entry.source === 'system' ? 'text-yellow-400' : 'text-gray-300'}`}>
                    <span className="text-gray-600">{entry.ts?.slice(11, 19)} </span>
                    {entry.line}
                  </div>
                ))
              )}
              <div ref={logsEndRef} />
            </div>
          </div>
        )}
      </div>

      {/* Import Modal */}
      {showImportApp && (
        <Modal title="App importieren" onClose={() => setShowImportApp(false)}>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-400">GitHub URL</label>
              <input value={importGitUrl} onChange={e => setImportGitUrl(e.target.value)} placeholder="https://github.com/owner/repo.git"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500" />
            </div>
            <div>
              <label className="text-xs text-gray-400">Name optional</label>
              <input value={importAppName} onChange={e => setImportAppName(e.target.value)} placeholder="z.B. meine-importierte-app"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500" />
            </div>
            <div>
              <label className="text-xs text-gray-400">Domain optional</label>
              <input value={importDomain} onChange={e => setImportDomain(e.target.value)} placeholder="z.B. app.stahlpedia.de"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500" />
            </div>
            <div>
              <label className="text-xs text-gray-400">Modus</label>
              <div className="flex gap-4 mt-1">
                <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                  <input type="radio" name="import-mode" value="import" checked={importMode === 'import'} onChange={() => setImportMode('import')} className="text-cyan-500" />
                  Import
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                  <input type="radio" name="import-mode" value="migrate" checked={importMode === 'migrate'} onChange={() => setImportMode('migrate')} className="text-cyan-500" />
                  Import + Analyse (S9)
                </label>
              </div>
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <button onClick={() => setShowImportApp(false)} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm">Abbrechen</button>
            <button onClick={handleImportApp} disabled={actionLoading === 'import'} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-60 rounded-lg text-sm font-medium">
              {actionLoading === 'import' ? 'Import laeuft...' : 'Import starten'}
            </button>
          </div>
        </Modal>
      )}

      {/* New App Modal */}
      {showNewApp && (
        <Modal title="Neue App erstellen" onClose={() => setShowNewApp(false)}>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-400">App-Name</label>
              <input value={newAppName} onChange={e => setNewAppName(e.target.value)} placeholder="z.B. meine-app"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500" />
              <p className="text-[10px] text-gray-600 mt-1">Nur Buchstaben, Zahlen, Bindestrich, Unterstrich</p>
            </div>
            <div>
              <label className="text-xs text-gray-400">Template</label>
              <div className="flex gap-4 mt-1">
                <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                  <input type="radio" name="template" value="basic" checked={newAppTemplate === 'basic'} onChange={() => setNewAppTemplate('basic')}
                    className="text-emerald-500" />
                  Basic (Express + Vanilla JS)
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                  <input type="radio" name="template" value="react" checked={newAppTemplate === 'react'} onChange={() => setNewAppTemplate('react')}
                    className="text-emerald-500" />
                  React (Express + Vite)
                </label>
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-400">Domain (optional)</label>
              <input value={newAppDomain} onChange={e => setNewAppDomain(e.target.value)} placeholder="z.B. app.stahlpedia.de"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500" />
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <button onClick={() => setShowNewApp(false)} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm">Abbrechen</button>
            <button onClick={handleCreateApp} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm font-medium">Erstellen</button>
          </div>
        </Modal>
      )}

      {/* New File Modal */}
      {showNewFile && (
        <Modal title="Neue Datei" onClose={() => setShowNewFile(false)}>
          <div>
            <label className="text-xs text-gray-400">Dateipfad</label>
            <input value={newFilePath} onChange={e => setNewFilePath(e.target.value)} placeholder="z.B. routes/users.js"
              onKeyDown={e => e.key === 'Enter' && handleCreateFile()}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500" />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowNewFile(false)} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm">Abbrechen</button>
            <button onClick={handleCreateFile} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm font-medium">Erstellen</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
