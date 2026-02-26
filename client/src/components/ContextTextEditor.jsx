import React, { useState, useEffect, useRef } from 'react'
import { textfiles } from '../api'
import { marked } from 'marked'

export default function ContextTextEditor({ projectId, folderId, folderName }) {
  const [files, setFiles] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [content, setContent] = useState('')
  const [filename, setFilename] = useState('')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showNewFile, setShowNewFile] = useState(false)
  const [newFileName, setNewFileName] = useState('')
  const [viewMode, setViewMode] = useState('edit') // 'edit' | 'preview'
  const textareaRef = useRef(null)

  useEffect(() => {
    if (projectId && folderId) {
      loadFiles()
      setSelectedId(null)
      setContent('')
      setFilename('')
      setDirty(false)
    }
  }, [projectId, folderId])

  const loadFiles = async () => {
    try {
      const list = await textfiles.list(projectId, folderId)
      setFiles(list)
    } catch (e) { console.error('Fehler:', e) }
  }

  const selectFile = async (file) => {
    if (dirty && !confirm('Ungespeicherte Änderungen verwerfen?')) return
    setSelectedId(file.id)
    setFilename(file.filename)
    try {
      const data = await textfiles.get(projectId, file.id)
      setContent(data.content || '')
      setDirty(false)
      setViewMode('edit')
    } catch (e) { alert('Fehler beim Laden: ' + e.message) }
  }

  const handleSave = async () => {
    if (!selectedId) return
    setSaving(true)
    try {
      await textfiles.update(projectId, selectedId, { content })
      setDirty(false)
    } catch (e) { alert('Fehler beim Speichern: ' + e.message) }
    finally { setSaving(false) }
  }

  const handleCreateFile = async () => {
    if (!newFileName.trim()) return
    try {
      const file = await textfiles.create(projectId, folderId, { filename: newFileName.trim() })
      setNewFileName('')
      setShowNewFile(false)
      await loadFiles()
      selectFile(file)
    } catch (e) { alert('Fehler: ' + e.message) }
  }

  const handleDeleteFile = async () => {
    if (!selectedId) return
    if (!confirm(`"${filename}" wirklich löschen?`)) return
    try {
      await textfiles.remove(projectId, selectedId)
      setSelectedId(null)
      setContent('')
      setFilename('')
      setDirty(false)
      await loadFiles()
    } catch (e) { alert('Fehler: ' + e.message) }
  }

  const handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault()
      handleSave()
    }
    // Tab support
    if (e.key === 'Tab') {
      e.preventDefault()
      const ta = textareaRef.current
      const start = ta.selectionStart
      const end = ta.selectionEnd
      const newContent = content.substring(0, start) + '  ' + content.substring(end)
      setContent(newContent)
      setDirty(true)
      requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = start + 2 })
    }
  }

  return (
    <div className="flex gap-4 h-full min-h-0 overflow-hidden">
      {/* Left: File list */}
      <div className="w-64 shrink-0 bg-gray-900 rounded-xl border border-gray-800 flex flex-col overflow-hidden">
        <div className="p-3 border-b border-gray-800 flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-300 truncate">{folderName}</span>
          <button onClick={() => setShowNewFile(true)}
            className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 rounded text-xs font-medium transition-colors whitespace-nowrap">+ Datei</button>
        </div>

        {showNewFile && (
          <div className="p-2 border-b border-gray-800 flex gap-1">
            <input value={newFileName} onChange={e => setNewFileName(e.target.value)}
              placeholder="dateiname.md"
              className="flex-1 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-white focus:outline-none focus:border-emerald-500"
              onKeyDown={e => { if (e.key === 'Enter') handleCreateFile(); if (e.key === 'Escape') setShowNewFile(false) }}
              autoFocus />
            <button onClick={handleCreateFile} className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 rounded text-xs">OK</button>
            <button onClick={() => { setShowNewFile(false); setNewFileName('') }} className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs">✕</button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {files.map(f => (
            <button key={f.id} onClick={() => selectFile(f)}
              className={`w-full text-left px-4 py-2.5 border-b border-gray-800/50 hover:bg-gray-800/50 transition-colors ${
                selectedId === f.id ? 'bg-gray-800 text-emerald-300' : 'text-gray-300'
              }`}>
              <div className="text-sm truncate">{f.filename}</div>
            </button>
          ))}
          {files.length === 0 && (
            <div className="text-gray-500 text-xs text-center py-8">
              Noch keine Dateien
            </div>
          )}
        </div>
      </div>

      {/* Right: Editor */}
      <div className="flex-1 bg-gray-900 rounded-xl border border-gray-800 flex flex-col overflow-hidden">
        {selectedId ? (
          <>
            {/* Toolbar */}
            <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-800">
              <span className="text-sm text-gray-400 truncate">{filename}</span>
              {dirty && <span className="text-xs text-yellow-500">geändert</span>}
              <div className="flex-1" />
              <div className="flex bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
                <button onClick={() => setViewMode('edit')}
                  className={`px-3 py-1 text-xs font-medium transition-colors ${viewMode === 'edit' ? 'bg-emerald-600 text-white' : 'text-gray-400 hover:text-white'}`}>
                  Bearbeiten
                </button>
                <button onClick={() => setViewMode('preview')}
                  className={`px-3 py-1 text-xs font-medium transition-colors ${viewMode === 'preview' ? 'bg-emerald-600 text-white' : 'text-gray-400 hover:text-white'}`}>
                  Vorschau
                </button>
              </div>
              <button onClick={handleSave} disabled={!dirty || saving}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg text-xs font-medium transition-colors">
                {saving ? 'Speichern...' : 'Speichern'}
              </button>
              <button onClick={handleDeleteFile}
                className="p-1.5 text-gray-400 hover:text-red-400 transition-colors" title="Löschen">
                🗑️
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden">
              {viewMode === 'edit' ? (
                <textarea
                  ref={textareaRef}
                  value={content}
                  onChange={e => { setContent(e.target.value); setDirty(true) }}
                  onKeyDown={handleKeyDown}
                  className="w-full h-full p-4 bg-gray-950 text-gray-200 text-sm font-mono resize-none focus:outline-none"
                  placeholder="Markdown eingeben..."
                  spellCheck={false}
                />
              ) : (
                <div className="p-6 overflow-y-auto h-full">
                  <div className="prose prose-invert prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: marked(content || '') }} />
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <div className="text-4xl mb-3">📝</div>
              <div>Wähle eine Datei oder erstelle eine neue</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
