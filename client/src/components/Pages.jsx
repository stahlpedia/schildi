import React, { useState, useEffect, useRef, useCallback } from 'react'
import { pages } from '../api'

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
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-96 space-y-4" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-white">{title}</h3>
        {children}
      </div>
    </div>
  )
}

export default function Pages() {
  const [domains, setDomains] = useState([])
  const [selectedDomain, setSelectedDomain] = useState('')
  const [fileTree, setFileTree] = useState([])
  const [selectedFile, setSelectedFile] = useState(null)
  const [fileContent, setFileContent] = useState('')
  const [editorContent, setEditorContent] = useState('')
  const [showNewDomain, setShowNewDomain] = useState(false)
  const [showNewFile, setShowNewFile] = useState(false)
  const [newDomainName, setNewDomainName] = useState('')
  const [newFilePath, setNewFilePath] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const cmRef = useRef(null)

  const mode = selectedFile ? getMode(selectedFile.name) : 'htmlmixed'
  const { loaded: cmLoaded } = useCodeMirror(cmRef, editorContent, setEditorContent, mode, !!selectedFile)

  const loadDomains = async () => {
    try {
      const list = await pages.domains()
      setDomains(list)
    } catch (e) { setError(e.message) }
  }

  const loadFiles = async (domain) => {
    if (!domain) { setFileTree([]); return }
    try {
      const tree = await pages.files(domain)
      setFileTree(tree)
    } catch (e) { setFileTree([]); setError(e.message) }
  }

  const loadFile = async (entry) => {
    if (!selectedDomain) return
    try {
      const data = await pages.readFile(selectedDomain, entry.path)
      setSelectedFile(entry)
      setFileContent(data.content)
      setEditorContent(data.content)
    } catch (e) { setError(e.message) }
  }

  useEffect(() => { loadDomains() }, [])
  useEffect(() => { if (selectedDomain) { loadFiles(selectedDomain); setSelectedFile(null) } }, [selectedDomain])

  const handleCreateDomain = async () => {
    if (!newDomainName.trim()) return
    try {
      await pages.createDomain(newDomainName.trim())
      setShowNewDomain(false)
      setNewDomainName('')
      await loadDomains()
      setSelectedDomain(newDomainName.trim())
    } catch (e) { setError(e.message) }
  }

  const handleDeleteDomain = async () => {
    if (!selectedDomain || !confirm(`Domain "${selectedDomain}" wirklich löschen?`)) return
    try {
      await pages.deleteDomain(selectedDomain)
      setSelectedDomain('')
      setFileTree([])
      setSelectedFile(null)
      loadDomains()
    } catch (e) { setError(e.message) }
  }

  const handleCreateFile = async () => {
    if (!selectedDomain || !newFilePath.trim()) return
    try {
      await pages.createFile(selectedDomain, newFilePath.trim(), '')
      setShowNewFile(false)
      setNewFilePath('')
      loadFiles(selectedDomain)
    } catch (e) { setError(e.message) }
  }

  const handleSaveFile = async () => {
    if (!selectedDomain || !selectedFile) return
    setSaving(true)
    try {
      await pages.updateFile(selectedDomain, selectedFile.path, editorContent)
      setFileContent(editorContent)
      setError(null)
    } catch (e) { setError(e.message) }
    setSaving(false)
  }

  const handleDeleteFile = async () => {
    if (!selectedDomain || !selectedFile || !confirm(`"${selectedFile.path}" wirklich löschen?`)) return
    try {
      await pages.deleteFile(selectedDomain, selectedFile.path)
      setSelectedFile(null)
      loadFiles(selectedDomain)
    } catch (e) { setError(e.message) }
  }

  const hasChanges = selectedFile && editorContent !== fileContent

  return (
    <div className="flex flex-col gap-4" style={{ height: 'calc(100vh - 120px)' }}>
      {error && (
        <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-2 rounded-lg text-sm flex justify-between items-center">
          {error}
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-200 ml-4">✕</button>
        </div>
      )}

      {/* Top bar */}
      <div className="flex items-center gap-3 bg-gray-900 rounded-xl border border-gray-800 px-4 py-3">
        <span className="text-lg">🌐</span>
        <select value={selectedDomain} onChange={e => setSelectedDomain(e.target.value)}
          className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500">
          <option value="">Domain wählen...</option>
          {domains.map(d => <option key={d.name} value={d.name}>{d.name}</option>)}
        </select>
        <button onClick={() => setShowNewDomain(true)}
          className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-xs font-medium transition-colors">+ Neue Domain</button>
        {selectedDomain && (
          <button onClick={handleDeleteDomain}
            className="px-3 py-2 bg-gray-700 hover:bg-red-600 rounded-lg text-xs transition-colors">🗑️ Domain löschen</button>
        )}
      </div>

      {/* Main content */}
      <div className="flex gap-4 flex-1 min-h-0">
        {/* Left sidebar: File tree */}
        <div className="w-64 shrink-0 bg-gray-900 rounded-xl border border-gray-800 flex flex-col overflow-hidden">
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
              <div className="p-3 border-t border-gray-800 flex gap-2">
                <button onClick={handleSaveFile} disabled={saving}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors">
                  {saving ? 'Speichert...' : 'Speichern'}
                </button>
                <button onClick={handleDeleteFile}
                  className="px-4 py-2 bg-gray-700 hover:bg-red-600 rounded-lg text-sm transition-colors ml-auto">🗑️ Datei löschen</button>
              </div>
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
    </div>
  )
}
