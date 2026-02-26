import React, { useState, useEffect } from 'react'
import { context } from '../api'
import SkillsViewer from './SkillsViewer'
import MemoryViewer from './MemoryViewer'
import TemplatesPanel from './TemplatesPanel'
import ContentProfilesPanel from './ContentProfilesPanel'
import ContextTextEditor from './ContextTextEditor'

const FIXED_SECTIONS = [
  { id: 'skills', label: 'Skills' },
  { id: 'memory', label: 'Memory' },
  { id: 'templates', label: 'Templates' },
  { id: 'profiles', label: 'Content-Profile' },
]

export default function Context({ projectId, onNavigateToKanban }) {
  const [activeSection, setActiveSection] = useState('skills')
  const [folders, setFolders] = useState([])
  
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [editingFolder, setEditingFolder] = useState(null)
  const [editFolderName, setEditFolderName] = useState('')

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

  const handleSectionChange = (sectionId) => {
    setActiveSection(sectionId)
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

  if (!projectId) return <div className="text-gray-500 text-center py-20">Bitte wähle ein Projekt aus.</div>

  // Build dropdown options: fixed sections + custom folders
  const allSections = [
    ...FIXED_SECTIONS,
    ...folders.map(f => ({ id: String(f.id), label: f.name, isFolder: true, folder: f }))
  ]

  const isFixedSection = FIXED_SECTIONS.some(s => s.id === activeSection)
  const isCustomFolder = !isFixedSection
  const currentFolder = isCustomFolder ? folders.find(f => String(f.id) === activeSection) : null

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
        {isCustomFolder && currentFolder && !currentFolder.is_system && (
          <div className="flex gap-1">
            {editingFolder === currentFolder.id ? (
              <div className="flex gap-1">
                <input value={editFolderName} onChange={e => setEditFolderName(e.target.value)}
                  className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-white focus:outline-none focus:border-emerald-500"
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveFolderEdit(); if (e.key === 'Escape') setEditingFolder(null) }} autoFocus />
                <button onClick={handleSaveFolderEdit} className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 rounded text-xs">OK</button>
                <button onClick={() => setEditingFolder(null)} className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs">✕</button>
              </div>
            ) : (
              <>
                <button onClick={(e) => handleEditFolder(currentFolder, e)}
                  className="px-2 py-1.5 text-gray-400 hover:text-blue-400 text-xs transition-colors" title="Umbenennen">✏️</button>
                <button onClick={(e) => handleDeleteFolder(currentFolder, e)}
                  className="px-2 py-1.5 text-gray-400 hover:text-red-400 text-xs transition-colors" title="Löschen">🗑️</button>
              </>
            )}
          </div>
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

        {activeSection === 'profiles' && (
          <ContentProfilesPanel projectId={projectId} />
        )}

        {isCustomFolder && currentFolder && (
          <ContextTextEditor projectId={projectId} folderId={currentFolder.id} folderName={currentFolder.name} />
        )}
      </div>
    </div>
  )
}
