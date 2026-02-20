import React, { useState, useEffect, useRef } from 'react'
import { kanban, columns as columnsApi, boards, projectBoards, attachments } from '../api'

export default function CardModal({
  isOpen,
  onClose,
  mode,
  card,
  defaultColumnName = '',
  defaultBoardId = null,
  defaultTitle = '',
  defaultDescription = '',
  onSave,
  onExecute,
  projectId
}) {
  const [boardsList, setBoardsList] = useState([])
  const [selectedBoard, setSelectedBoard] = useState(defaultBoardId)
  const [cols, setCols] = useState([])
  const [columnName, setColumnName] = useState(defaultColumnName)
  const [title, setTitle] = useState(defaultTitle)
  const [desc, setDesc] = useState(defaultDescription)
  const [labels, setLabels] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [onHold, setOnHold] = useState(false)
  const [executeDirectly, setExecuteDirectly] = useState(false)
  const [cardAttachments, setCardAttachments] = useState([])
  const [pendingAttachments, setPendingAttachments] = useState([])
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef(null)

  const loadBoards = async () => {
    const list = projectId ? await projectBoards(projectId) : await boards.list()
    setBoardsList(list)
    if (list.length > 0 && !selectedBoard) {
      setSelectedBoard(list[0].id)
    }
  }

  const loadColumns = async (boardId) => {
    if (!boardId) return
    const columns = await columnsApi.list(boardId)
    setCols(columns)
  }

  // Initialize data
  useEffect(() => {
    if (isOpen) {
      loadBoards()
    }
  }, [isOpen])

  // Load columns when board changes
  useEffect(() => {
    if (selectedBoard) {
      loadColumns(selectedBoard)
    }
  }, [selectedBoard])

  // Set initial values based on mode and props
  useEffect(() => {
    if (!isOpen) return

    if (mode === 'edit' && card) {
      setTitle(card.title)
      setDesc(card.description)
      setLabels((card.labels || []).join(', '))
      setDueDate(card.due_date || '')
      setOnHold(card.on_hold === 1)
      setExecuteDirectly(false)
      setPendingAttachments([])
      
      // Load attachments for edit mode
      const loadAttachments = async () => {
        try {
          const attachmentsList = await attachments.list('card', card.id)
          setCardAttachments(attachmentsList)
        } catch (e) {
          console.error('Failed to load attachments:', e)
          setCardAttachments([])
        }
      }
      loadAttachments()
    } else {
      // Create mode
      setTitle(defaultTitle)
      setDesc(defaultDescription)
      setLabels('')
      setDueDate('')
      setOnHold(false)
      setExecuteDirectly(false)
      setCardAttachments([])
      setPendingAttachments([])
    }

    setSelectedBoard(defaultBoardId)
    setColumnName(defaultColumnName)
  }, [isOpen, mode, card, defaultTitle, defaultDescription, defaultBoardId, defaultColumnName])

  const handleFileUpload = async (event) => {
    const file = event.target.files[0]
    if (!file) return

    // In create mode: add to pending attachments
    if (mode === 'create') {
      setPendingAttachments(prev => [...prev, file])
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      return
    }

    // In edit mode: upload immediately
    if (mode === 'edit' && card) {
      setUploading(true)
      try {
        const attachment = await attachments.upload(file, 'card', card.id)
        setCardAttachments(prev => [attachment, ...prev])
      } catch (e) {
        alert('Upload fehlgeschlagen: ' + e.message)
      }
      setUploading(false)
      
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleDeleteAttachment = async (attachmentId) => {
    if (!confirm('Datei wirklich löschen?')) return
    
    try {
      await attachments.remove(attachmentId)
      setCardAttachments(prev => prev.filter(a => a.id !== attachmentId))
    } catch (e) {
      alert('Löschen fehlgeschlagen: ' + e.message)
    }
  }

  const handleDeletePendingAttachment = (index) => {
    setPendingAttachments(prev => prev.filter((_, i) => i !== index))
  }

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const handleSave = async () => {
    if (!title.trim() || !selectedBoard || !columnName) return

    try {
      let cardData

      if (mode === 'create') {
        const response = await kanban.create({
          title,
          description: desc,
          column_name: columnName,
          labels: labels ? labels.split(',').map(l => l.trim()) : [],
          board_id: selectedBoard,
          due_date: dueDate || null,
          on_hold: onHold ? 1 : 0
        })
        
        cardData = response

        // Upload pending attachments if any
        if (response?.id && pendingAttachments.length > 0) {
          setUploading(true)
          try {
            for (const file of pendingAttachments) {
              await attachments.upload(file, 'card', response.id)
            }
          } catch (e) {
            alert('Einige Anhänge konnten nicht hochgeladen werden: ' + e.message)
          }
          setUploading(false)
        }
      } else if (mode === 'edit' && card) {
        await kanban.update(card.id, {
          title,
          description: desc,
          labels: labels ? labels.split(',').map(l => l.trim()) : [],
          due_date: dueDate || null,
          on_hold: onHold ? 1 : 0
        })
        cardData = { ...card, title, description: desc }
      }

      const shouldExecute = executeDirectly && mode === 'edit'
      
      // Reset form
      setTitle('')
      setDesc('')
      setLabels('')
      setDueDate('')
      setOnHold(false)
      setExecuteDirectly(false)
      setPendingAttachments([])
      setCardAttachments([])
      
      onClose()
      
      // Call callbacks
      if (onSave) onSave(cardData)
      if (shouldExecute && onExecute && cardData) {
        setTimeout(() => onExecute(cardData), 500)
      }
      
    } catch (e) {
      alert('Speichern fehlgeschlagen: ' + e.message)
    }
  }

  const handleExecute = async () => {
    if (!card || mode !== 'edit') return
    
    onClose() // Close dialog immediately
    if (onExecute) {
      onExecute(card)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-3 md:p-0" onClick={onClose}>
      <div className="bg-gray-900 p-4 md:p-6 rounded-xl border border-gray-700 w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold mb-4">{mode === 'edit' ? 'Karte bearbeiten' : 'Neue Karte'}</h3>
        
        {/* Board Selection */}
        <div className="mb-3">
          <label className="text-xs text-gray-400 block mb-1">Board</label>
          <select value={selectedBoard || ''} onChange={e => setSelectedBoard(+e.target.value || null)}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-emerald-500">
            <option value="">Board wählen...</option>
            {boardsList.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>

        {/* Column Selection */}
        <div className="mb-3">
          <label className="text-xs text-gray-400 block mb-1">Spalte</label>
          <select value={columnName} onChange={e => setColumnName(e.target.value)}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-emerald-500">
            <option value="">Spalte wählen...</option>
            {cols.map(col => <option key={col.id} value={col.name}>{col.label}</option>)}
          </select>
        </div>

        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Titel"
          className="w-full mb-3 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-emerald-500" />
        <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="Beschreibung" rows={3}
          className="w-full mb-3 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-emerald-500" />
        <input value={labels} onChange={e => setLabels(e.target.value)} placeholder="Labels (kommagetrennt)"
          className="w-full mb-3 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-emerald-500" />
        <div className="flex gap-3 mb-3">
          <div className="flex-1">
            <label className="text-xs text-gray-400 block mb-1">Fälligkeitsdatum</label>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-emerald-500" />
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={onHold} onChange={e => setOnHold(e.target.checked)}
                className="rounded bg-gray-800 border-gray-700 text-yellow-500 focus:ring-yellow-500 focus:ring-offset-gray-900" />
              <label className="text-sm text-gray-300">On Hold</label>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={executeDirectly} onChange={e => setExecuteDirectly(e.target.checked)}
                className="rounded bg-gray-800 border-gray-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-900" />
              <label className="text-sm text-blue-300">🐢 Direkt ausführen</label>
            </div>
          </div>
        </div>

        {/* Attachments Section */}
        <div className="border-t border-gray-700 pt-4 mb-4">
          <h4 className="text-sm font-semibold text-gray-300 mb-2">📎 Datei-Anhänge</h4>
          
          {/* Upload Button */}
          <div className="mb-3">
            <input 
              type="file" 
              ref={fileInputRef}
              onChange={handleFileUpload}
              className="hidden"
              multiple={false}
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
            >
              {uploading ? '⏳ Lädt hoch...' : '📎 Datei anhängen'}
            </button>
          </div>

          {/* Attachments List */}
          <div className="space-y-2 max-h-32 overflow-y-auto">
            {/* Real attachments (edit mode) */}
            {cardAttachments.map(attachment => (
              <div key={attachment.id} className="flex items-center justify-between p-2 bg-gray-800 rounded text-xs">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="text-gray-400">📄</span>
                  <span className="truncate">{attachment.filename}</span>
                  <span className="text-gray-500 shrink-0">({formatFileSize(attachment.size)})</span>
                </div>
                <div className="flex gap-1">
                  <a 
                    href={attachments.download(attachment.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 px-1"
                    title="Download"
                  >
                    ⬇️
                  </a>
                  <button 
                    onClick={() => handleDeleteAttachment(attachment.id)}
                    className="text-red-400 hover:text-red-300 px-1"
                    title="Löschen"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
            {/* Pending attachments (create mode) */}
            {pendingAttachments.map((file, index) => (
              <div key={index} className="flex items-center justify-between p-2 bg-blue-900/30 border border-blue-700/50 rounded text-xs">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="text-blue-400">📄</span>
                  <span className="truncate">{file.name}</span>
                  <span className="text-blue-500 shrink-0">({formatFileSize(file.size)})</span>
                  <span className="text-blue-400 text-xs">(Upload nach Erstellung)</span>
                </div>
                <button 
                  onClick={() => handleDeletePendingAttachment(index)}
                  className="text-red-400 hover:text-red-300 px-1"
                  title="Löschen"
                >
                  🗑️
                </button>
              </div>
            ))}
            {cardAttachments.length === 0 && pendingAttachments.length === 0 && (
              <p className="text-gray-500 text-xs text-center py-2">Keine Anhänge</p>
            )}
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-2">
          <button 
            onClick={handleSave} 
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm font-medium transition-colors"
          >
            {mode === 'edit' ? 'Speichern' : 'Erstellen'}
          </button>
          {mode === 'edit' && (
            <button onClick={handleExecute}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium transition-colors"
              title="Task wird von Schildi bearbeitet. Dialog schließt automatisch.">
              🐢 Jetzt ausführen
            </button>
          )}
          <button onClick={onClose} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors">Schließen</button>
        </div>
      </div>
    </div>
  )
}