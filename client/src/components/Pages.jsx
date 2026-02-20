import React, { useState, useEffect, useRef, useCallback } from 'react'
import { pages, projectPages, context } from '../api'
import CardModal from './CardModal'

// Load CodeMirror from CDN
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
  const map = { html: 'htmlmixed', htm: 'htmlmixed', css: 'css', js: 'javascript', json: 'application/json', xml: 'xml', svg: 'xml' }
  return map[ext] || 'htmlmixed'
}

function getIcon(entry) {
  if (entry.type === 'directory') return '📁'
  const ext = (entry.name || '').split('.').pop().toLowerCase()
  if (ext === 'html' || ext === 'htm') return '📄'
  if (ext === 'css') return '🎨'
  if (ext === 'js') return '⚡'
  if (ext === 'json') return '📋'
  return '📄'
}

function FileTree({ tree, selected, onSelect, depth = 0 }) {
  const [expanded, setExpanded] = useState({})
  const toggle = (p) => setExpanded(prev => ({ ...prev, [p]: !prev[p] }))

  return (
    <div>
      {tree.map(entry => (
        <div key={entry.path}>
          <div
            onClick={() => entry.type === 'directory' ? toggle(entry.path) : onSelect(entry)}
            className={`flex items-center gap-1.5 px-2 py-1 cursor-pointer text-xs hover:bg-gray-800/50 transition-colors ${selected === entry.path ? 'bg-gray-800 text-white' : 'text-gray-300'}`}
            style={{ paddingLeft: `${depth * 16 + 8}px` }}
          >
            {entry.type === 'directory' && <span className="text-[10px] text-gray-500">{expanded[entry.path] ? '▼' : '▶'}</span>}
            <span>{getIcon(entry)}</span>
            <span className="truncate">{entry.name}</span>
          </div>
          {entry.type === 'directory' && expanded[entry.path] && entry.children && (
            <FileTree tree={entry.children} selected={selected} onSelect={onSelect} depth={depth + 1} />
          )}
        </div>
      ))}
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

export default function Pages({ projectId, onNavigateToKanban }) {
  const [domains, setDomains] = useState([])
  const [selectedDomain, setSelectedDomain] = useState('')
  const [fileTree, setFileTree] = useState([])
  const [selectedFile, setSelectedFile] = useState(null)
  const [fileContent, setFileContent] = useState('')
  const [editorContent, setEditorContent] = useState('')
  const [showNewDomain, setShowNewDomain] = useState(false)
  const [showNewFile, setShowNewFile] = useState(false)
  const [showCreateTask, setShowCreateTask] = useState(false)
  const [newDomainName, setNewDomainName] = useState('')
  const [newFilePath, setNewFilePath] = useState('')
  const [pagesBoardId, setPagesBoardId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showImagePanel, setShowImagePanel] = useState(false)
  const [contextFiles, setContextFiles] = useState([])
  const [contextFolders, setContextFolders] = useState([])
  const [selectedContextFolder, setSelectedContextFolder] = useState(null)
  const cmRef = useRef(null)

  const mode = selectedFile ? getMode(selectedFile.name) : 'htmlmixed'
  const { loaded: cmLoaded } = useCodeMirror(cmRef, editorContent, setEditorContent, mode, !!selectedFile)

  const pApi = projectId ? {
    domains: () => projectPages.domains(projectId),
    files: (d) => projectPages.files(projectId, d),
    readFile: (d, p) => projectPages.readFile(projectId, d, p),
    createDomain: (n) => projectPages.createDomain(projectId, n),
    deleteDomain: (n) => projectPages.deleteDomain(projectId, n),
    createFile: (d, p, c) => projectPages.createFile(projectId, d, p, c),
    updateFile: (d, p, c) => projectPages.updateFile(projectId, d, p, c),
    deleteFile: (d, p) => projectPages.deleteFile(projectId, d, p),
  } : pages

  const loadDomains = async () => {
    try {
      const list = await pApi.domains()
      // Normalize: project-scoped returns {domain, id, ...}, legacy returns {name}
      setDomains(list.map(d => ({ ...d, name: d.domain || d.name })))
    } catch (e) { setError(e.message) }
  }

  const loadFiles = async (domain) => {
    if (!domain) { setFileTree([]); return }
    try {
      const tree = await pApi.files(domain)
      setFileTree(tree)
    } catch (e) { setFileTree([]); setError(e.message) }
  }

  const loadFile = async (entry) => {
    if (!selectedDomain) return
    try {
      const data = await pApi.readFile(selectedDomain, entry.path)
      setSelectedFile(entry)
      setFileContent(data.content)
      setEditorContent(data.content)
    } catch (e) { setError(e.message) }
  }

  const loadPagesBoard = async () => {
    try {
      const response = await fetch('/api/kanban/boards', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      })
      const boards = await response.json()
      const pagesBoard = boards.find(b => b.slug === 'pages')
      if (pagesBoard) {
        setPagesBoardId(pagesBoard.id)
      }
    } catch (e) {
      console.error('Failed to load Pages board:', e)
    }
  }

  const loadContextFolders = async () => {
    if (!projectId) return
    try {
      const list = await context.folders(projectId)
      setContextFolders(list)
      if (list.length > 0) {
        setSelectedContextFolder(list[0].id)
        loadContextFiles(list[0].id)
      }
    } catch (e) { console.error(e) }
  }

  const loadContextFiles = async (folderId) => {
    if (!projectId || !folderId) return
    try {
      const files = await context.files(projectId, { folder_id: folderId })
      setContextFiles(files.filter(f => f.mimetype?.startsWith('image/')))
    } catch (e) { console.error(e) }
  }

  const handleInsertImage = (file) => {
    const url = `/api/media/file/${file.id}`
    const tag = `<img src="${url}" alt="${file.alt_text || file.filename}" />`
    setEditorContent(prev => prev + '\n' + tag)
  }

  useEffect(() => { setSelectedDomain(null); setSelectedFile(null); setFileTree([]); loadDomains(); loadPagesBoard() }, [projectId])
  useEffect(() => { if (selectedDomain) { loadFiles(selectedDomain); setSelectedFile(null) } }, [selectedDomain])

  const handleCreateDomain = async () => {
    if (!newDomainName.trim()) return
    try {
      await pApi.createDomain(newDomainName.trim())
      setShowNewDomain(false)
      setNewDomainName('')
      await loadDomains()
      setSelectedDomain(newDomainName.trim())
    } catch (e) { setError(e.message) }
  }

  const handleDeleteDomain = async () => {
    if (!selectedDomain || !confirm(`Domain "${selectedDomain}" wirklich löschen?`)) return
    try {
      await pApi.deleteDomain(selectedDomain)
      setSelectedDomain('')
      setFileTree([])
      setSelectedFile(null)
      loadDomains()
    } catch (e) { setError(e.message) }
  }

  const handleCreateFile = async () => {
    if (!selectedDomain || !newFilePath.trim()) return
    try {
      await pApi.createFile(selectedDomain, newFilePath.trim(), '')
      setShowNewFile(false)
      setNewFilePath('')
      loadFiles(selectedDomain)
    } catch (e) { setError(e.message) }
  }

  const handleSaveFile = async () => {
    if (!selectedDomain || !selectedFile) return
    setSaving(true)
    try {
      await pApi.updateFile(selectedDomain, selectedFile.path, editorContent)
      setFileContent(editorContent)
      setError(null)
    } catch (e) { setError(e.message) }
    setSaving(false)
  }

  const handleDeleteFile = async () => {
    if (!selectedDomain || !selectedFile || !confirm(`"${selectedFile.path}" wirklich löschen?`)) return
    try {
      await pApi.deleteFile(selectedDomain, selectedFile.path)
      setSelectedFile(null)
      loadFiles(selectedDomain)
    } catch (e) { setError(e.message) }
  }

  const hasChanges = selectedFile && editorContent !== fileContent

  const handlePreviewDomain = () => {
    if (selectedDomain) {
      window.open(`https://${selectedDomain}`, '_blank')
    }
  }

  const handleTaskSave = (task) => {
    setShowCreateTask(false)
    // Navigate to Kanban with the new task highlighted
    if (onNavigateToKanban && task) {
      onNavigateToKanban(task.id, pagesBoardId)
    }
  }

  return (
    <div className="flex flex-col gap-4" style={{ height: 'calc(100vh - 120px)' }}>
      {error && (
        <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-2 rounded-lg text-sm flex justify-between items-center">
          {error}
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-200 ml-4">✕</button>
        </div>
      )}

      {/* Top bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 bg-gray-900 rounded-xl border border-gray-800 px-4 py-3">
        <div className="flex items-center gap-3 flex-1">
          <button 
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="md:hidden p-2 text-gray-400 hover:text-white transition-colors"
            title="File Tree toggle"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="text-lg">🌐</span>
          <select value={selectedDomain} onChange={e => setSelectedDomain(e.target.value)}
            className="flex-1 md:flex-none px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500">
            <option value="">Domain wählen...</option>
            {domains.map(d => <option key={d.domain || d.name} value={d.domain || d.name}>{d.domain || d.name}</option>)}
          </select>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setShowCreateTask(true)}
            className="px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-xs font-medium transition-colors">📋 Task erstellen</button>
          {selectedDomain && (
            <button onClick={handlePreviewDomain}
              className="px-3 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-xs font-medium transition-colors">👁️ Vorschau</button>
          )}
          <button onClick={() => setShowNewDomain(true)}
            className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-xs font-medium transition-colors">+ Neue Domain</button>
          {selectedDomain && (
            <button onClick={handleDeleteDomain}
              className="px-3 py-2 bg-gray-700 hover:bg-red-600 rounded-lg text-xs transition-colors">🗑️ Domain löschen</button>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex gap-4 flex-1 min-h-0 relative">
        {/* Desktop sidebar: File tree */}
        <div className="hidden md:flex w-64 shrink-0 bg-gray-900 rounded-xl border border-gray-800 flex-col overflow-hidden">
          <div className="p-3 border-b border-gray-800 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-300">Dateien</span>
            {selectedDomain && (
              <button onClick={() => setShowNewFile(true)} className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 rounded text-xs font-medium transition-colors">+ Neue Datei</button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            {fileTree.length > 0 ? (
              <FileTree tree={fileTree} selected={selectedFile?.path} onSelect={loadFile} />
            ) : (
              <p className="text-gray-500 text-center py-6 text-xs">
                {selectedDomain ? 'Keine Dateien' : 'Domain wählen'}
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
                <div className="flex gap-2">
                  {selectedDomain && (
                    <button onClick={() => setShowNewFile(true)} className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 rounded text-xs font-medium transition-colors">+ Neue Datei</button>
                  )}
                  <button onClick={() => setSidebarOpen(false)} className="text-gray-400 hover:text-white">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                {fileTree.length > 0 ? (
                  <FileTree tree={fileTree} selected={selectedFile?.path} onSelect={(file) => { loadFile(file); setSidebarOpen(false); }} />
                ) : (
                  <p className="text-gray-500 text-center py-6 text-xs">
                    {selectedDomain ? 'Keine Dateien' : 'Domain wählen'}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Right: Editor */}
        <div className="flex-1 bg-gray-900 rounded-xl border border-gray-800 flex flex-col overflow-hidden">
          {selectedFile ? (
            <>
              <div className="p-3 border-b border-gray-800 flex items-center gap-2">
                <span className="text-xs text-gray-500">{getIcon(selectedFile)}</span>
                <span className="text-sm text-gray-300 font-mono">{selectedFile.path}</span>
                {hasChanges && <span className="text-xs text-yellow-500">● ungespeichert</span>}
              </div>
              <div className="flex-1 min-h-0 overflow-hidden" ref={cmRef}>
                {!cmLoaded && <div className="flex items-center justify-center h-full text-gray-500 text-sm">Editor wird geladen...</div>}
              </div>
              <div className="p-3 border-t border-gray-800 flex flex-col md:flex-row gap-2">
                <div className="flex gap-2">
                  <button onClick={handleSaveFile} disabled={saving}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors">
                    {saving ? 'Speichert...' : 'Speichern'}
                  </button>
                  {selectedDomain && (
                    <button onClick={handlePreviewDomain}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-sm font-medium transition-colors">Vorschau</button>
                  )}
                  <button onClick={() => { if (!showImagePanel) loadContextFolders(); setShowImagePanel(!showImagePanel) }}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${showImagePanel ? 'bg-blue-600 hover:bg-blue-500' : 'bg-gray-700 hover:bg-gray-600'}`}>
                    Bilder
                  </button>
                </div>
                <button onClick={handleDeleteFile}
                  className="px-4 py-2 bg-gray-700 hover:bg-red-600 rounded-lg text-sm transition-colors md:ml-auto">Datei löschen</button>
              </div>
              {/* Bilder Panel */}
              {showImagePanel && (
                <div className="border-t border-gray-800 p-3">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-sm font-semibold text-gray-300">Bilder aus Kontext</span>
                    <select value={selectedContextFolder || ''} onChange={e => { setSelectedContextFolder(+e.target.value); loadContextFiles(+e.target.value) }}
                      className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-white focus:outline-none focus:border-emerald-500">
                      {contextFolders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                    {contextFiles.length === 0 ? (
                      <span className="text-xs text-gray-500">Keine Bilder in diesem Ordner</span>
                    ) : contextFiles.map(file => (
                      <div key={file.id} onClick={() => handleInsertImage(file)}
                        className="w-16 h-16 rounded-lg border border-gray-700 overflow-hidden cursor-pointer hover:border-emerald-500 transition-colors group relative">
                        <img src={`/api/media/file/${file.id}`} alt={file.filename} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <span className="text-[10px] text-white">Einfügen</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
              {selectedDomain ? 'Wähle eine Datei oder erstelle eine neue' : 'Wähle zuerst eine Domain'}
            </div>
          )}
        </div>
      </div>

      {/* New Domain Modal */}
      {showNewDomain && (
        <Modal title="Neue Domain" onClose={() => setShowNewDomain(false)}>
          <div>
            <label className="text-xs text-gray-400">Domain-Name</label>
            <input value={newDomainName} onChange={e => setNewDomainName(e.target.value)} placeholder="z.B. info.transloggpt.de"
              onKeyDown={e => e.key === 'Enter' && handleCreateDomain()}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500" />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowNewDomain(false)} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm">Abbrechen</button>
            <button onClick={handleCreateDomain} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm font-medium">Erstellen</button>
          </div>
        </Modal>
      )}

      {/* New File Modal */}
      {showNewFile && (
        <Modal title="Neue Datei" onClose={() => setShowNewFile(false)}>
          <div>
            <label className="text-xs text-gray-400">Dateipfad</label>
            <input value={newFilePath} onChange={e => setNewFilePath(e.target.value)} placeholder="z.B. index.html oder css/style.css"
              onKeyDown={e => e.key === 'Enter' && handleCreateFile()}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500" />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowNewFile(false)} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm">Abbrechen</button>
            <button onClick={handleCreateFile} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm font-medium">Erstellen</button>
          </div>
        </Modal>
      )}

      {/* Create Task Modal */}
      <CardModal 
        isOpen={showCreateTask}
        onClose={() => setShowCreateTask(false)}
        mode="create"
        defaultBoardId={pagesBoardId}
        defaultColumnName="backlog"
        defaultTitle={selectedFile ? selectedFile.name.replace(/\.[^/.]+$/, '') : ''}
        onSave={handleTaskSave}
      />
    </div>
  )
}
