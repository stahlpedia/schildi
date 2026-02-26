import React, { useState, useEffect, useRef } from 'react'
import { context } from '../api'
import CardModal from './CardModal'

export default function Content({ projectId, onNavigateToKanban }) {
  // Channel state
  const [channels, setChannels] = useState([])
  const [selectedChannelId, setSelectedChannelId] = useState(null)
  const [showChannelDropdown, setShowChannelDropdown] = useState(false)
  const [showChannelForm, setShowChannelForm] = useState(false)
  const [editingChannel, setEditingChannel] = useState(null)
  const [channelForm, setChannelForm] = useState({ name: '' })

  // File browser state
  const [folders, setFolders] = useState([])
  const [files, setFiles] = useState([])
  const [selectedFolder, setSelectedFolder] = useState(null)
  const [loading, setLoading] = useState(true)
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

  // Text file editor state
  const [fileContent, setFileContent] = useState('')
  const [fileContentOriginal, setFileContentOriginal] = useState('')
  const [isEditingContent, setIsEditingContent] = useState(false)
  const [loadingContent, setLoadingContent] = useState(false)
  const [savingContent, setSavingContent] = useState(false)

  const fileInputRef = useRef(null)

  // Task creation
  const [showCreateTask, setShowCreateTask] = useState(false)

  const selectedChannel = channels.find(c => c.id === selectedChannelId)

  useEffect(() => {
    if (projectId) {
      setLoading(true)
      loadChannels()
    }
  }, [projectId])

  useEffect(() => {
    if (projectId) {
      setSelectedFolder(null)
      setFiles([])
      loadFolders()
    }
  }, [selectedChannelId, projectId])

  useEffect(() => {
    if (selectedFolder && projectId) loadFiles()
  }, [selectedFolder, searchTerm, projectId])

  const loadChannels = async () => {
    try {
      const list = await context.contentChannels(projectId)
      setChannels(list)
      if (list.length > 0 && !selectedChannelId) setSelectedChannelId(list[0].id)
    } catch (error) {
      console.error('Fehler beim Laden der Kanäle:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadFolders = async () => {
    try {
      const folderList = await context.folders(projectId, 'content', selectedChannelId || undefined)
      setFolders(folderList)
      if (folderList.length > 0 && !selectedFolder) setSelectedFolder(folderList[0].id)
    } catch (error) {
      console.error('Fehler beim Laden der Ordner:', error)
    } finally {
      setLoading(false)
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

  // Channel CRUD
  const handleSaveChannel = async () => {
    if (!channelForm.name.trim()) return
    try {
      if (editingChannel) {
        await context.updateContentChannel(projectId, editingChannel.id, channelForm)
      } else {
        const created = await context.createContentChannel(projectId, channelForm)
        setSelectedChannelId(created.id)
      }
      setShowChannelForm(false)
      setEditingChannel(null)
      setChannelForm({ name: '' })
      await loadChannels()
    } catch (e) { alert(e.message) }
  }

  const handleDeleteChannel = async (id) => {
    if (!confirm('Kanal löschen? Ordner bleiben erhalten.')) return
    try {
      await context.deleteContentChannel(projectId, id)
      if (selectedChannelId === id) setSelectedChannelId(channels.find(c => c.id !== id)?.id || null)
      await loadChannels()
    } catch (e) { alert(e.message) }
  }

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return
    try {
      await context.createFolder(projectId, { name: newFolderName, parent_id: null, category: 'content', channel_id: selectedChannelId || undefined })
      setNewFolderName('')
      setShowNewFolder(false)
      await loadFolders()
    } catch (error) { alert('Fehler: ' + error.message) }
  }

  const handleEditFolder = (folder) => {
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

  const handleDeleteFolder = async (folder) => {
    if (folder.is_system) { alert('System-Ordner können nicht gelöscht werden'); return }
    if (!confirm(`Ordner "${folder.name}" löschen?`)) return
    try {
      await context.deleteFolder(projectId, folder.id, folder.file_count > 0)
      if (selectedFolder === folder.id) setSelectedFolder(folders[0]?.id || null)
      await loadFolders()
    } catch (error) { alert('Fehler: ' + error.message) }
  }

  const handleFileUpload = async (event) => {
    const uploadFiles = Array.from(event.target.files)
    if (!uploadFiles.length || !selectedFolder) return
    setUploading(true)
    try {
      for (const file of uploadFiles) {
        await context.upload(projectId, file, selectedFolder, [])
      }
      await loadFiles()
    } catch (error) { alert('Fehler beim Upload: ' + error.message) }
    finally { setUploading(false); fileInputRef.current.value = '' }
  }

  const handleFileClick = async (file) => {
    setSelectedFile(file)
    setShowFileModal(true)
    setFileEditTags(JSON.parse(file.tags || '[]').join(', '))
    setFileEditAltText(file.alt_text || '')
    setFileContent('')
    setFileContentOriginal('')
    setIsEditingContent(false)

    if (isTextFile(file.filename)) {
      setLoadingContent(true)
      try {
        const data = await context.fileContent(file.id)
        setFileContent(data.content)
        setFileContentOriginal(data.content)
      } catch (e) { console.error('Fehler beim Laden des Dateiinhalts:', e) }
      finally { setLoadingContent(false) }
    }
  }

  const handleSaveContent = async () => {
    if (!selectedFile) return
    setSavingContent(true)
    try {
      await context.saveFileContent(selectedFile.id, fileContent)
      setFileContentOriginal(fileContent)
      setIsEditingContent(false)
      await loadFiles()
    } catch (e) { alert('Fehler beim Speichern: ' + e.message) }
    finally { setSavingContent(false) }
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
      if (selectedFile?.id === editingFile) {
        const updated = files.find(f => f.id === editingFile)
        if (updated) setSelectedFile({ ...updated, tags: JSON.stringify(tags), alt_text: fileEditAltText })
      }
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
  const isVideo = (mimetype) => mimetype?.startsWith('video/')
  const isAudio = (mimetype) => mimetype?.startsWith('audio/')
  const TEXT_EXTENSIONS = new Set(['md', 'txt', 'json', 'yml', 'yaml', 'css', 'html', 'htm', 'js', 'jsx', 'ts', 'tsx', 'xml', 'csv', 'svg', 'toml', 'ini', 'cfg', 'sh', 'bash', 'py', 'rb', 'php', 'sql', 'env', 'log'])
  const isTextFile = (filename) => { const ext = (filename || '').split('.').pop().toLowerCase(); return TEXT_EXTENSIONS.has(ext) }
  const serveUrl = (id) => context.serve(id)

  if (!projectId) return <div className="text-gray-500 text-center py-20">Bitte wähle ein Projekt aus.</div>

  if (loading) return <div className="flex items-center justify-center py-20"><div className="text-gray-500">Lade Content...</div></div>

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 120px)' }}>
      {/* Top bar: Channel selector + task button */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 bg-gray-900 rounded-xl border border-gray-800 px-4 py-3 mb-4 shrink-0">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* Channel Selector */}
          <div className="relative flex-1 min-w-0 max-w-xs">
            <button
              onClick={() => setShowChannelDropdown(!showChannelDropdown)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white hover:border-gray-600 transition-colors"
            >
              <span className="truncate">{selectedChannel ? selectedChannel.name : 'Kanal wählen...'}</span>
              <svg className="w-3 h-3 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showChannelDropdown && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowChannelDropdown(false)} />
                <div className="absolute top-full left-0 mt-1 w-full bg-gray-800 border border-gray-700 rounded-xl shadow-xl z-50 py-1 max-h-80 overflow-y-auto">
                  {channels.map(ch => (
                    <button key={ch.id}
                      onClick={() => { setSelectedChannelId(ch.id); setShowChannelDropdown(false) }}
                      className={`w-full flex items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-gray-700 transition-colors ${
                        selectedChannelId === ch.id ? 'bg-gray-700/50 text-emerald-300' : 'text-gray-200'
                      }`}>
                      <span className="truncate">{ch.name}</span>
                      <div className="flex gap-1 shrink-0">
                        <button onClick={(e) => { e.stopPropagation(); setEditingChannel(ch); setChannelForm({ name: ch.name }); setShowChannelForm(true); setShowChannelDropdown(false) }}
                          className="text-gray-500 hover:text-blue-400 p-1">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); handleDeleteChannel(ch.id); setShowChannelDropdown(false) }}
                          className="text-gray-500 hover:text-red-400 p-1">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                        </button>
                      </div>
                    </button>
                  ))}
                  <div className="border-t border-gray-700 mt-1 pt-1">
                    <button onClick={() => { setShowChannelDropdown(false); setEditingChannel(null); setChannelForm({ name: '' }); setShowChannelForm(true) }}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-left text-sm text-emerald-400 hover:bg-gray-700 transition-colors">
                      <span className="text-lg leading-none">+</span>
                      <span>Neuer Kanal</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <button onClick={() => setShowCreateTask(true)}
          className="px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-xs font-medium transition-colors shrink-0">Task erstellen</button>
      </div>

      {/* Channel Form Modal */}
      {showChannelForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowChannelForm(false)}>
          <div className="bg-gray-900 rounded-xl border border-gray-700 p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-4">{editingChannel ? 'Kanal bearbeiten' : 'Neuer Kanal'}</h3>
            <input value={channelForm.name} onChange={e => setChannelForm({ ...channelForm, name: e.target.value })} placeholder="Kanal-Name"
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-emerald-500 mb-4"
              onKeyDown={e => { if (e.key === 'Enter') handleSaveChannel() }}
              autoFocus />
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setShowChannelForm(false); setEditingChannel(null) }}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors">Abbrechen</button>
              <button onClick={handleSaveChannel}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm font-medium transition-colors">Speichern</button>
            </div>
          </div>
        </div>
      )}

      {/* File Browser */}
      <div className="flex gap-4 relative flex-1 min-h-0">
        {/* Desktop Sidebar */}
        <div className="hidden md:flex w-80 shrink-0 bg-gray-900 rounded-xl border border-gray-800 flex-col overflow-hidden">
          <div className="p-4 border-b border-gray-800 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-300">Ordner</h3>
            <button onClick={() => setShowNewFolder(true)}
              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 rounded text-xs font-medium transition-colors">+ Ordner</button>
          </div>

          {showNewFolder && (
            <div className="p-3 border-b border-gray-800 flex gap-2">
              <input value={newFolderName} onChange={e => setNewFolderName(e.target.value)} placeholder="Ordner-Name"
                className="flex-1 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-white focus:outline-none focus:border-emerald-500"
                onKeyDown={e => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') setShowNewFolder(false) }} autoFocus />
              <button onClick={handleCreateFolder} className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 rounded text-xs">OK</button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            {folders.map(folder => (
              <div key={folder.id} onClick={() => setSelectedFolder(folder.id)}
                className={`px-4 py-3 cursor-pointer border-b border-gray-800/50 flex items-center gap-3 hover:bg-gray-800/50 transition-colors group ${selectedFolder === folder.id ? 'bg-gray-800' : ''}`}>
                <span className="text-lg">{folder.is_system ? '🔒' : '📁'}</span>
                <div className="flex-1 min-w-0">
                  {editingFolder === folder.id ? (
                    <input value={editFolderName} onChange={e => setEditFolderName(e.target.value)}
                      className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-white focus:outline-none focus:border-emerald-500"
                      onKeyDown={e => { if (e.key === 'Enter') handleSaveFolderEdit(); if (e.key === 'Escape') setEditingFolder(null) }}
                      onBlur={handleSaveFolderEdit} autoFocus onClick={e => e.stopPropagation()} />
                  ) : (
                    <>
                      <div className="text-sm text-white truncate">{folder.name}</div>
                      <div className="text-xs text-gray-500">{folder.file_count} Dateien</div>
                    </>
                  )}
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {!folder.is_system && (
                    <>
                      <button onClick={(e) => { e.stopPropagation(); handleEditFolder(folder) }} className="text-gray-400 hover:text-blue-400 text-xs px-1">✏️</button>
                      <button onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folder) }} className="text-gray-400 hover:text-red-400 text-xs px-1">🗑️</button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Mobile Sidebar Toggle */}
        <button onClick={() => setSidebarOpen(!sidebarOpen)}
          className="md:hidden fixed top-20 left-4 z-40 p-2 bg-gray-900 border border-gray-800 rounded-lg text-gray-400 hover:text-white transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        {sidebarOpen && (
          <div className="fixed inset-0 bg-black/60 z-50 md:hidden" onClick={() => setSidebarOpen(false)}>
            <div className="absolute top-0 left-0 w-80 max-w-[90vw] h-full bg-gray-900 border-r border-gray-800 flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="p-4 border-b border-gray-800 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-300">Ordner</h3>
                <button onClick={() => setSidebarOpen(false)} className="text-gray-400 hover:text-white">✕</button>
              </div>
              <div className="flex-1 overflow-y-auto">
                {folders.map(folder => (
                  <div key={folder.id} onClick={() => { setSelectedFolder(folder.id); setSidebarOpen(false) }}
                    className={`px-4 py-3 cursor-pointer border-b border-gray-800/50 flex items-center gap-3 hover:bg-gray-800/50 transition-colors ${selectedFolder === folder.id ? 'bg-gray-800' : ''}`}>
                    <span className="text-lg">{folder.is_system ? '🔒' : '📁'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white truncate">{folder.name}</div>
                      <div className="text-xs text-gray-500">{folder.file_count} Dateien</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="flex-1 bg-gray-900 rounded-xl border border-gray-800 flex flex-col overflow-hidden">
          {selectedFolder ? (
            <>
              <div className="p-4 border-b border-gray-800 flex flex-col md:flex-row gap-3 md:items-center">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-300">{folders.find(f => f.id === selectedFolder)?.name || 'Content'}</h3>
                </div>
                <div className="flex flex-col md:flex-row gap-3 md:items-center">
                  <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Dateien durchsuchen..."
                    className="flex-1 md:w-64 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500" />
                  <div className="flex gap-2">
                    <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" multiple />
                    <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors">
                      {uploading ? 'Upload...' : 'Upload'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                {files.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-gray-500">
                    <div className="text-6xl mb-4">📁</div>
                    <div className="text-lg">Noch keine Dateien</div>
                    <p className="text-sm mt-2">Lade Dateien hoch oder lass Content generieren</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {files.map(file => (
                      <div key={file.id} onClick={() => handleFileClick(file)}
                        className="group relative bg-gray-800 rounded-lg border border-gray-700 overflow-hidden cursor-pointer hover:border-gray-600 transition-colors">
                        <div className="aspect-square bg-gray-700 flex items-center justify-center">
                          {isImage(file.mimetype) ? (
                            <img src={serveUrl(file.id)} alt={file.alt_text || file.filename} className="w-full h-full object-cover" loading="lazy" />
                          ) : isVideo(file.mimetype) ? (
                            <div className="text-center">
                              <div className="text-3xl">🎬</div>
                              <div className="text-[10px] text-gray-400 mt-1 px-2 truncate">MP4</div>
                            </div>
                          ) : isAudio(file.mimetype) ? (
                            <div className="text-center">
                              <div className="text-3xl">🎵</div>
                              <div className="text-[10px] text-gray-400 mt-1 px-2 truncate">{file.filename?.split('.').pop()?.toUpperCase()}</div>
                            </div>
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
                            {file.width && file.height && <span> | {file.width}x{file.height}</span>}
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
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <div className="text-6xl mb-4">{channels.length === 0 ? '📱' : '📂'}</div>
                <div className="text-lg">{channels.length === 0 ? 'Erstelle einen Kanal um loszulegen' : 'Wähle einen Ordner'}</div>
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
                  ) : isVideo(selectedFile.mimetype) ? (
                    <video src={serveUrl(selectedFile.id)} controls className="max-w-full max-h-full" />
                  ) : isAudio(selectedFile.mimetype) ? (
                    <div className="text-center p-8">
                      <div className="text-6xl mb-4">🎵</div>
                      <audio src={serveUrl(selectedFile.id)} controls className="w-full max-w-md" />
                    </div>
                  ) : isTextFile(selectedFile.filename) ? (
                    <div className="w-full h-full flex flex-col">
                      {loadingContent ? (
                        <div className="flex-1 flex items-center justify-center text-gray-500">Lade Inhalt...</div>
                      ) : isEditingContent ? (
                        <textarea
                          value={fileContent}
                          onChange={e => setFileContent(e.target.value)}
                          className="flex-1 w-full p-4 bg-gray-800 text-gray-200 text-sm font-mono resize-none focus:outline-none"
                          spellCheck={false}
                        />
                      ) : (
                        <pre className="flex-1 w-full p-4 bg-gray-800 text-gray-200 text-sm font-mono overflow-auto whitespace-pre-wrap">{fileContent}</pre>
                      )}
                      <div className="flex items-center gap-2 p-3 border-t border-gray-700 bg-gray-850">
                        {isEditingContent ? (
                          <>
                            <button onClick={handleSaveContent} disabled={savingContent}
                              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded text-sm font-medium transition-colors">
                              {savingContent ? 'Speichern...' : 'Speichern'}
                            </button>
                            <button onClick={() => { setFileContent(fileContentOriginal); setIsEditingContent(false) }}
                              className="px-4 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors">Abbrechen</button>
                            {fileContent !== fileContentOriginal && <span className="text-xs text-yellow-400 ml-2">Ungespeicherte Änderungen</span>}
                          </>
                        ) : (
                          <button onClick={() => setIsEditingContent(true)}
                            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-sm font-medium transition-colors">Bearbeiten</button>
                        )}
                      </div>
                    </div>
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
                        {selectedFile.width && selectedFile.height && <span className="block text-gray-400">{selectedFile.width} x {selectedFile.height} px</span>}
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

      {/* Create Task Modal */}
      <CardModal
        isOpen={showCreateTask}
        onClose={() => setShowCreateTask(false)}
        mode="create"
        defaultColumnName="backlog"
        defaultTitle=""
        onSave={(task) => { setShowCreateTask(false); if (onNavigateToKanban && task) onNavigateToKanban(task.id) }}
        projectId={projectId}
      />
    </div>
  )
}
