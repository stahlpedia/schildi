import React, { useState, useEffect, useRef } from 'react'
import { context } from '../api'
import SkillsViewer from './SkillsViewer'
import MemoryViewer from './MemoryViewer'
import TemplatesPanel from './TemplatesPanel'

const FIXED_SECTIONS = [
  { id: 'skills', label: 'Skills' },
  { id: 'memory', label: 'Memory' },
  { id: 'templates', label: 'Templates' },
]

export default function Context({ projectId, onNavigateToKanban }) {
  const [activeSection, setActiveSection] = useState('skills')
  const [folders, setFolders] = useState([])
  const [files, setFiles] = useState([])
  const [selectedFolder, setSelectedFolder] = useState(null)
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [editingFolder, setEditingFolder] = useState(null)
  const [editFolderName, setEditFolderName] = useState('')
  
  const [selectedFile, setSelectedFile] = useState(null)
  const [showFileModal, setShowFileModal] = useState(false)
  const [editingFile, setEditingFile] = useState(null)
  const [fileEditTags, setFileEditTags] = useState('')
  const [fileEditAltText, setFileEditAltText] = useState('')
  
  const fileInputRef = useRef(null)

  // Load context folders for custom sections
  useEffect(() => {
    if (projectId && !['skills', 'memory', 'templates'].includes(activeSection)) {
      loadFiles()
    }
  }, [selectedFolder, searchTerm, projectId])

  useEffect(() => {
    if (projectId) loadFolders()
  }, [projectId])

  const loadFolders = async () => {
    try {
      const folderList = await context.folders(projectId, 'context')
      setFolders(folderList)
    } catch (error) {
      console.error('Fehler beim Laden der Ordner:', error)
    }
  }

  const loadFiles = async () => {
    if (!selectedFolder) return
    try {
      const fileList = await context.files(projectId, { folder_id: selectedFolder, search: searchTerm || undefined })
      setFiles(fileList)
    } catch (error) {
      console.error('Fehler beim Laden der Dateien:', error)
    }
  }

  const handleSectionChange = (sectionId) => {
    setActiveSection(sectionId)
    setSearchTerm('')
    // If it's a folder section, select that folder
    if (!['skills', 'memory', 'templates'].includes(sectionId)) {
      setSelectedFolder(+sectionId)
    }
  }

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return
    try {
      await context.createFolder(projectId, { name: newFolderName, parent_id: null, category: 'context' })
      setNewFolderName('')
      setShowNewFolder(false)
      await loadFolders()
    } catch (error) { alert('Fehler: ' + error.message) }
  }

  const handleEditFolder = (folder, e) => {
    e.stopPropagation()
    setEditingFolder(folder.id)
    setEditFolderName(folder.name)
  }

  const handleSaveFolderEdit = async () => {
    if (!editFolderName.trim() || !editingFolder) return
    try {
      await context.updateFolder(projectId, editingFolder, { name: editFolderName })
      setEditingFolder(null)
      setEditFolderName('')
      await loadFolders()
    } catch (error) { alert('Fehler: ' + error.message) }
  }

  const handleDeleteFolder = async (folder, e) => {
    e.stopPropagation()
    if (folder.is_system) { alert('System-Ordner können nicht gelöscht werden'); return }
    if (!confirm(`Ordner "${folder.name}" löschen?`)) return
    try {
      await context.deleteFolder(projectId, folder.id, folder.file_count > 0)
      if (activeSection === String(folder.id)) setActiveSection('skills')
      await loadFolders()
    } catch (error) { alert('Fehler: ' + error.message) }
  }

  const handleFileUpload = async (event) => {
    const file = event.target.files[0]
    if (!file || !selectedFolder) return
    setUploading(true)
    try {
      await context.upload(projectId, file, selectedFolder, [])
      await loadFiles()
    } catch (error) { alert('Fehler beim Upload: ' + error.message) }
    finally { setUploading(false); fileInputRef.current.value = '' }
  }

  const handleFileClick = (file) => {
    setSelectedFile(file)
    setShowFileModal(true)
    setFileEditTags(JSON.parse(file.tags || '[]').join(', '))
    setFileEditAltText(file.alt_text || '')
  }

  const handleEditFile = (file) => {
    setEditingFile(file.id)
    setFileEditTags(JSON.parse(file.tags || '[]').join(', '))
    setFileEditAltText(file.alt_text || '')
  }

  const handleSaveFileEdit = async () => {
    if (!editingFile) return
    try {
      const tags = fileEditTags.split(',').map(t => t.trim()).filter(t => t)
      await context.updateFile(projectId, editingFile, { tags, alt_text: fileEditAltText })
      setEditingFile(null)
      await loadFiles()
    } catch (error) { alert('Fehler: ' + error.message) }
  }

  const handleDeleteFile = async (file) => {
    if (!confirm(`Datei "${file.filename}" löschen?`)) return
    try {
      await context.deleteFile(projectId, file.id)
      if (selectedFile?.id === file.id) { setSelectedFile(null); setShowFileModal(false) }
      await loadFiles()
    } catch (error) { alert('Fehler: ' + error.message) }
  }

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 B'
    const k = 1024, sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const isImage = (mimetype) => mimetype?.startsWith('image/')
  const serveUrl = (id) => context.serve(id)

  if (!projectId) return <div className="text-gray-500 text-center py-20">Bitte wähle ein Projekt aus.</div>

  // Build dropdown options: fixed sections + custom folders
  const allSections = [
    ...FIXED_SECTIONS,
    ...folders.map(f => ({ id: String(f.id), label: f.name, isFolder: true, folder: f }))
  ]

  const isCustomFolder = !['skills', 'memory', 'templates'].includes(activeSection)
  const currentLabel = allSections.find(s => s.id === activeSection)?.label || 'Kontext'

  return (
    <div className="flex flex-col gap-4" style={{ height: 'calc(100vh - 120px)' }}>
      {/* Top Bar with Dropdown */}
      <div className="flex items-center gap-3 bg-gray-900 rounded-xl border border-gray-800 px-4 py-3 shrink-0">
        <select 
          value={activeSection} 
          onChange={e => handleSectionChange(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500"
        >
          <optgroup label="Fest">
            {FIXED_SECTIONS.map(s => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </optgroup>
          {folders.length > 0 && (
            <optgroup label="Ordner">
              {folders.map(f => (
                <option key={f.id} value={String(f.id)}>{f.name}</option>
              ))}
            </optgroup>
          )}
        </select>
        <div className="flex-1" />
        {isCustomFolder && (
          <>
            <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.txt,.md,.mp3,.wav,.ogg,.mp4,.webm" />
            <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg text-xs font-medium transition-colors">
              {uploading ? 'Upload...' : 'Upload'}
            </button>
          </>
        )}
        <button onClick={() => setShowNewFolder(true)}
          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-xs font-medium transition-colors">+ Ordner</button>
      </div>

      {/* New Folder Inline */}
      {showNewFolder && (
        <div className="flex gap-2 bg-gray-900 rounded-xl border border-gray-800 px-4 py-3 shrink-0">
          <input value={newFolderName} onChange={e => setNewFolderName(e.target.value)} placeholder="Neuer Ordner-Name"
            className="flex-1 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500"
            onKeyDown={e => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') setShowNewFolder(false) }} autoFocus />
          <button onClick={handleCreateFolder} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-xs font-medium">Erstellen</button>
          <button onClick={() => setShowNewFolder(false)} className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-xs font-medium">Abbrechen</button>
        </div>
      )}

      {/* Content Area */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeSection === 'skills' && (
          <SkillsViewer projectId={projectId} onNavigateToKanban={onNavigateToKanban} />
        )}
        
        {activeSection === 'memory' && (
          <div className="h-full">
            <MemoryViewer />
          </div>
        )}
        
        {activeSection === 'templates' && (
          <TemplatesPanel projectId={projectId} onNavigateToKanban={onNavigateToKanban} />
        )}

        {isCustomFolder && (
          <div className="h-full bg-gray-900 rounded-xl border border-gray-800 flex flex-col overflow-hidden">
            {/* Folder management bar */}
            <div className="p-4 border-b border-gray-800 flex flex-col md:flex-row gap-3 md:items-center">
              <div className="flex-1 flex items-center gap-2">
                <h3 className="text-lg font-semibold text-gray-300">{currentLabel}</h3>
                {(() => {
                  const folderObj = allSections.find(s => s.id === activeSection)?.folder
                  if (folderObj && !folderObj.is_system) return (
                    <div className="flex gap-1">
                      <button onClick={(e) => handleEditFolder(folderObj, e)} className="text-gray-400 hover:text-blue-400 text-xs px-1" title="Umbenennen">✏️</button>
                      <button onClick={(e) => handleDeleteFolder(folderObj, e)} className="text-gray-400 hover:text-red-400 text-xs px-1" title="Löschen">🗑️</button>
                    </div>
                  )
                  return null
                })()}
              </div>
              <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Dateien durchsuchen..."
                className="flex-1 md:w-64 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500" />
            </div>

            {/* Rename inline */}
            {editingFolder && (
              <div className="px-4 py-2 border-b border-gray-800 flex gap-2">
                <input value={editFolderName} onChange={e => setEditFolderName(e.target.value)}
                  className="flex-1 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-sm text-white focus:outline-none focus:border-emerald-500"
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveFolderEdit(); if (e.key === 'Escape') setEditingFolder(null) }} autoFocus />
                <button onClick={handleSaveFolderEdit} className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 rounded text-xs">OK</button>
                <button onClick={() => setEditingFolder(null)} className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs">✕</button>
              </div>
            )}

            {/* File grid */}
            <div className="flex-1 overflow-y-auto p-4">
              {files.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-gray-500">
                  <div className="text-6xl mb-4">📁</div>
                  <div className="text-lg">Noch keine Dateien</div>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {files.map(file => (
                    <div key={file.id} onClick={() => handleFileClick(file)}
                      className="group relative bg-gray-800 rounded-lg border border-gray-700 overflow-hidden cursor-pointer hover:border-gray-600 transition-colors">
                      <div className="aspect-square bg-gray-700 flex items-center justify-center">
                        {isImage(file.mimetype) ? (
                          <img src={serveUrl(file.id)} alt={file.alt_text || file.filename} className="w-full h-full object-cover" loading="lazy" />
                        ) : (
                          <div className="text-center">
                            <div className="text-3xl">📄</div>
                            <div className="text-[10px] text-gray-400 mt-1 px-2 truncate">{file.filename?.split('.').pop()?.toUpperCase()}</div>
                          </div>
                        )}
                      </div>
                      <div className="p-2">
                        <div className="text-xs text-white truncate" title={file.filename}>{file.filename}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          {formatFileSize(file.size)}
                          {file.width && file.height && <span> • {file.width}×{file.height}</span>}
                        </div>
                      </div>
                      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={(e) => { e.stopPropagation(); handleDeleteFile(file) }}
                          className="p-1 bg-gray-900/80 rounded text-red-400 hover:text-red-300 text-xs">🗑️</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* File Detail Modal */}
      {showFileModal && selectedFile && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setShowFileModal(false)}>
          <div className="bg-gray-900 rounded-xl border border-gray-700 max-w-4xl w-full max-h-[90vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-800 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">{selectedFile.filename}</h3>
              <button onClick={() => setShowFileModal(false)} className="text-gray-400 hover:text-white">✕</button>
            </div>
            <div className="flex flex-col md:flex-row max-h-[calc(90vh-80px)]">
              <div className="flex-1 flex items-center justify-center bg-gray-800 min-h-64">
                {isImage(selectedFile.mimetype) ? (
                  <img src={serveUrl(selectedFile.id)} alt={selectedFile.alt_text || selectedFile.filename} className="max-w-full max-h-full object-contain" />
                ) : (
                  <div className="text-center">
                    <div className="text-6xl mb-4">📄</div>
                    <div className="text-gray-400">{selectedFile.filename}</div>
                    <div className="text-gray-500 text-sm mt-2">{selectedFile.mimetype}</div>
                    <div className="text-gray-500 text-sm">{formatFileSize(selectedFile.size)}</div>
                  </div>
                )}
              </div>
              <div className="w-full md:w-80 p-4 border-t md:border-t-0 md:border-l border-gray-800 overflow-y-auto">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Dateiname</label>
                    <div className="text-sm text-white">{selectedFile.filename}</div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Größe</label>
                    <div className="text-sm text-white">
                      {formatFileSize(selectedFile.size)}
                      {selectedFile.width && selectedFile.height && <span className="block text-gray-400">{selectedFile.width} × {selectedFile.height} px</span>}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Alt-Text</label>
                    {editingFile === selectedFile.id ? (
                      <textarea value={fileEditAltText} onChange={e => setFileEditAltText(e.target.value)}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-white focus:outline-none focus:border-emerald-500" rows={3} />
                    ) : (
                      <div className="text-sm text-white">{selectedFile.alt_text || 'Kein Alt-Text'}</div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Tags</label>
                    {editingFile === selectedFile.id ? (
                      <input value={fileEditTags} onChange={e => setFileEditTags(e.target.value)} placeholder="Tags, durch Komma getrennt"
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-white focus:outline-none focus:border-emerald-500" />
                    ) : (
                      <div className="text-sm text-white">
                        {JSON.parse(selectedFile.tags || '[]').length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {JSON.parse(selectedFile.tags).map((tag, idx) => (
                              <span key={idx} className="px-2 py-1 bg-blue-900/50 text-blue-300 rounded text-xs">{tag}</span>
                            ))}
                          </div>
                        ) : 'Keine Tags'}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">URL</label>
                    <input value={serveUrl(selectedFile.id)} readOnly
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-xs text-gray-400 focus:outline-none" onClick={e => e.target.select()} />
                  </div>
                  <div className="flex gap-2 pt-4">
                    {editingFile === selectedFile.id ? (
                      <>
                        <button onClick={handleSaveFileEdit} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded text-sm font-medium transition-colors">Speichern</button>
                        <button onClick={() => setEditingFile(null)} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors">Abbrechen</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => handleEditFile(selectedFile)} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm font-medium transition-colors">Bearbeiten</button>
                        <a href={serveUrl(selectedFile.id)} download={selectedFile.filename}
                          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm font-medium transition-colors">Download</a>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
