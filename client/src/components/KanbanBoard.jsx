import React, { useState, useEffect, useRef } from 'react'
import { kanban, columns as columnsApi, boards } from '../api'

const DEFAULT_COLORS = [
  'border-gray-600', 'border-yellow-500', 'border-emerald-500',
  'border-blue-500', 'border-purple-500', 'border-red-500', 'border-orange-500'
]

export default function KanbanBoard(props = {}) {
  const [cards, setCards] = useState([])
  const [cols, setCols] = useState([])
  const [boardsList, setBoardsList] = useState([])
  const [selectedBoard, setSelectedBoard] = useState(null)
  const [showForm, setShowForm] = useState(null)
  const [editCard, setEditCard] = useState(null)
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [labels, setLabels] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [onHold, setOnHold] = useState(false)
  const [executing, setExecuting] = useState(null)
  const [showColManager, setShowColManager] = useState(false)
  const [newColLabel, setNewColLabel] = useState('')
  const [newColColor, setNewColColor] = useState('border-gray-600')
  const [editCol, setEditCol] = useState(null)
  const [editColLabel, setEditColLabel] = useState('')
  const [editColColor, setEditColColor] = useState('')
  const [showBoardModal, setShowBoardModal] = useState(false)
  const [newBoardName, setNewBoardName] = useState('')
  const dragItem = useRef(null)

  const loadBoards = async () => {
    const list = await boards.list()
    setBoardsList(list)
    if (list.length > 0 && !selectedBoard) {
      setSelectedBoard(list[0].id)
    }
  }

  const load = async () => {
    if (!selectedBoard) return
    const [c, co] = await Promise.all([kanban.list(selectedBoard), columnsApi.list(selectedBoard)])
    setCards(c)
    setCols(co)
  }

  useEffect(() => { loadBoards() }, [])
  useEffect(() => { if (selectedBoard) load() }, [selectedBoard])
  
  // Handle navigation from Pages component
  useEffect(() => {
    if (props.selectedBoardId && !selectedBoard) {
      setSelectedBoard(props.selectedBoardId)
    }
  }, [props.selectedBoardId])

  // Handle task highlighting
  useEffect(() => {
    if (props.highlightTaskId && cards.length > 0) {
      const highlightedCard = cards.find(c => c.id === props.highlightTaskId)
      if (highlightedCard) {
        // Auto-open the edit dialog for the highlighted task
        setTimeout(() => {
          startEdit(highlightedCard)
          if (props.onTaskHighlighted) props.onTaskHighlighted()
        }, 500)
      }
    }
  }, [props.highlightTaskId, cards])

  // Card CRUD
  const handleCreate = async (colName) => {
    if (!title.trim() || !selectedBoard) return
    await kanban.create({ 
      title, 
      description: desc, 
      column_name: colName, 
      labels: labels ? labels.split(',').map(l => l.trim()) : [], 
      board_id: selectedBoard,
      due_date: dueDate || null,
      on_hold: onHold ? 1 : 0
    })
    setTitle(''); setDesc(''); setLabels(''); setDueDate(''); setOnHold(false); setShowForm(null); load()
  }

  const handleUpdate = async () => {
    if (!editCard) return
    await kanban.update(editCard.id, { 
      title, 
      description: desc, 
      labels: labels ? labels.split(',').map(l => l.trim()) : [],
      due_date: dueDate || null,
      on_hold: onHold ? 1 : 0
    })
    setEditCard(null); setTitle(''); setDesc(''); setLabels(''); setDueDate(''); setOnHold(false); load()
  }

  const handleDelete = async (id) => {
    await kanban.remove(id); load()
  }

  // Drag & drop
  const onDragStart = (e, card) => { dragItem.current = card; e.dataTransfer.effectAllowed = 'move' }
  const onDragOver = (e) => { e.preventDefault() }
  const onDrop = async (e, colName) => {
    e.preventDefault()
    if (dragItem.current && dragItem.current.column_name !== colName) {
      await kanban.update(dragItem.current.id, { column_name: colName })
      load()
    }
    dragItem.current = null
  }

  const startEdit = (card) => {
    setEditCard(card); 
    setTitle(card.title); 
    setDesc(card.description); 
    setLabels((card.labels || []).join(', '));
    setDueDate(card.due_date || '');
    setOnHold(card.on_hold === 1);
  }

  // Column management
  const handleCreateCol = async () => {
    if (!newColLabel.trim() || !selectedBoard) return
    await columnsApi.create({ name: newColLabel, label: newColLabel, color: newColColor, board_id: selectedBoard })
    setNewColLabel(''); setNewColColor('border-gray-600'); load()
  }

  // Board management
  const handleCreateBoard = async () => {
    if (!newBoardName.trim()) return
    try {
      const board = await boards.create({ name: newBoardName })
      setNewBoardName(''); setShowBoardModal(false)
      await loadBoards()
      if (board?.id) setSelectedBoard(board.id)
    } catch (e) {
      alert('Board erstellen fehlgeschlagen: ' + e.message)
    }
  }

  const handleDeleteBoard = async () => {
    if (!selectedBoard || !confirm('Board wirklich löschen? Karten werden nach General verschoben.')) return
    await boards.remove(selectedBoard)
    setSelectedBoard(null); loadBoards()
  }

  const handleUpdateCol = async () => {
    if (!editCol) return
    await columnsApi.update(editCol.id, { label: editColLabel, color: editColColor })
    setEditCol(null); load()
  }

  const handleDeleteCol = async (id) => {
    if (!confirm('Spalte löschen? Karten werden nach Backlog verschoben.')) return
    await columnsApi.remove(id); load()
  }

  const [executeMsg, setExecuteMsg] = useState(null)

  const handleExecute = async (card) => {
    if (executing === card.id) return
    setExecuting(card.id)
    setEditCard(null) // Dialog sofort schließen
    setExecuteMsg({ id: card.id, text: '🐢 Schildi arbeitet an diesem Task...', type: 'loading' })
    try {
      const response = await fetch(`/api/kanban/tasks/${card.id}/execute`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        }
      })
      const result = await response.json()
      if (response.ok) {
        setExecuteMsg({ id: card.id, text: '✅ Schildi hat den Task bearbeitet!', type: 'success' })
        load()
        setTimeout(() => setExecuteMsg(null), 4000)
      } else {
        setExecuteMsg({ id: card.id, text: '❌ Fehler: ' + result.error, type: 'error' })
        setTimeout(() => setExecuteMsg(null), 5000)
      }
    } catch (e) {
      setExecuteMsg({ id: card.id, text: '❌ Verbindungsfehler: ' + e.message, type: 'error' })
      setTimeout(() => setExecuteMsg(null), 5000)
    }
    setExecuting(null)
  }

  const colCards = (colName) => cards.filter(c => c.column_name === colName)

  const colorClass = (color) => {
    // Extract color for the dot preview
    const match = color.match(/border-(\w+)-(\d+)/)
    if (match) return `bg-${match[1]}-${match[2]}`
    return 'bg-gray-600'
  }

  return (
    <div>
      {/* Toast notification */}
      {executeMsg && (
        <div className={`fixed top-4 right-4 z-[60] px-4 py-3 rounded-lg shadow-lg border max-w-sm animate-pulse ${
          executeMsg.type === 'loading' ? 'bg-blue-900/90 border-blue-700 text-blue-200' :
          executeMsg.type === 'success' ? 'bg-emerald-900/90 border-emerald-700 text-emerald-200' :
          'bg-red-900/90 border-red-700 text-red-200'
        }`}>
          <p className="text-sm font-medium">{executeMsg.text}</p>
        </div>
      )}

      {/* Edit card modal */}
      {editCard && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setEditCard(null)}>
          <div className="bg-gray-900 p-6 rounded-xl border border-gray-700 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">Karte bearbeiten</h3>
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
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={onHold} onChange={e => setOnHold(e.target.checked)}
                  className="rounded bg-gray-800 border-gray-700 text-yellow-500 focus:ring-yellow-500 focus:ring-offset-gray-900" />
                <label className="text-sm text-gray-300">On Hold</label>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={handleUpdate} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm font-medium transition-colors">Speichern</button>
              <button onClick={() => handleExecute(editCard)} disabled={executing === editCard.id || editCard.on_hold}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors"
                title="Task wird von Schildi bearbeitet. Dialog schließt automatisch.">
                {executing === editCard.id ? '⏳ Schildi arbeitet...' : '🐢 Jetzt ausführen'}
              </button>
              <button onClick={() => setEditCard(null)} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors">Schließen</button>
            </div>
          </div>
        </div>
      )}

      {/* Column manager modal */}
      {showColManager && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => { setShowColManager(false); setEditCol(null) }}>
          <div className="bg-gray-900 p-6 rounded-xl border border-gray-700 w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">Spalten verwalten</h3>
            
            {/* Existing columns */}
            <div className="space-y-2 mb-4">
              {cols.map(col => (
                <div key={col.id} className="flex items-center gap-2 p-2 bg-gray-800 rounded-lg">
                  {editCol?.id === col.id ? (
                    <>
                      <input value={editColLabel} onChange={e => setEditColLabel(e.target.value)}
                        className="flex-1 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-white focus:outline-none focus:border-emerald-500" />
                      <select value={editColColor} onChange={e => setEditColColor(e.target.value)}
                        className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-white">
                        {DEFAULT_COLORS.map(c => <option key={c} value={c}>{c.replace('border-', '').replace('-', ' ')}</option>)}
                      </select>
                      <button onClick={handleUpdateCol} className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 rounded text-xs">✓</button>
                      <button onClick={() => setEditCol(null)} className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs">✕</button>
                    </>
                  ) : (
                    <>
                      <div className={`w-3 h-3 rounded-full border-2 ${col.color}`}></div>
                      <span className="flex-1 text-sm">{col.label}</span>
                      <span className="text-gray-500 text-xs">{colCards(col.name).length} Karten</span>
                      <button onClick={() => { setEditCol(col); setEditColLabel(col.label); setEditColColor(col.color) }}
                        className="text-gray-500 hover:text-blue-400 text-xs">✏️</button>
                      <button onClick={() => handleDeleteCol(col.id)}
                        className="text-gray-500 hover:text-red-400 text-xs">🗑️</button>
                    </>
                  )}
                </div>
              ))}
            </div>

            {/* New column */}
            <div className="flex gap-2 items-center border-t border-gray-700 pt-4">
              <input value={newColLabel} onChange={e => setNewColLabel(e.target.value)} placeholder="Neue Spalte..."
                className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500" />
              <select value={newColColor} onChange={e => setNewColColor(e.target.value)}
                className="px-2 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white">
                {DEFAULT_COLORS.map(c => <option key={c} value={c}>{c.replace('border-', '').replace('-', ' ')}</option>)}
              </select>
              <button onClick={handleCreateCol} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm font-medium transition-colors">+</button>
            </div>

            <div className="flex justify-end mt-4">
              <button onClick={() => { setShowColManager(false); setEditCol(null) }}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors">Schließen</button>
            </div>
          </div>
        </div>
      )}

      {/* Board modal */}
      {showBoardModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowBoardModal(false)}>
          <div className="bg-gray-900 p-6 rounded-xl border border-gray-700 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">Neues Board</h3>
            <input value={newBoardName} onChange={e => setNewBoardName(e.target.value)} placeholder="Board Name"
              className="w-full mb-4 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-emerald-500" autoFocus />
            <div className="flex gap-2">
              <button onClick={handleCreateBoard} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm font-medium transition-colors">Erstellen</button>
              <button onClick={() => setShowBoardModal(false)} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors">Abbrechen</button>
            </div>
          </div>
        </div>
      )}

      {/* Board selector */}
      <div className="flex items-center gap-3 bg-gray-900 rounded-xl border border-gray-800 px-4 py-3 mb-4">
        <span className="text-lg">🗂️</span>
        <select value={selectedBoard || ''} onChange={e => setSelectedBoard(+e.target.value || null)}
          className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500">
          <option value="">Board wählen...</option>
          {boardsList.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <button onClick={() => setShowBoardModal(true)}
          className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-xs font-medium transition-colors">+ Board</button>
        {selectedBoard && boardsList.find(b => b.id === selectedBoard)?.type === 'custom' && (
          <button onClick={handleDeleteBoard}
            className="px-3 py-2 bg-gray-700 hover:bg-red-600 rounded-lg text-xs transition-colors">🗑️ Löschen</button>
        )}
        <div className="flex-1" />
        <button onClick={() => setShowColManager(true)}
          className="px-3 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-xs text-gray-300 transition-colors">
          ⚙️ Spalten verwalten
        </button>
      </div>

      {/* Board */}
      <div className="grid gap-6" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr))` }}>
        {cols.map(col => (
          <div key={col.id} className={`bg-gray-900 rounded-xl border-t-4 ${col.color} p-4 min-h-[400px]`}
            onDragOver={onDragOver} onDrop={e => onDrop(e, col.name)}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-lg">{col.label} <span className="text-gray-500 text-sm ml-1">{colCards(col.name).length}</span></h2>
              <button onClick={() => { setShowForm(showForm === col.name ? null : col.name); setTitle(''); setDesc(''); setLabels(''); setDueDate(''); setOnHold(false) }}
                className="text-gray-500 hover:text-emerald-400 text-xl transition-colors">+</button>
            </div>

            {showForm === col.name && (
              <div className="mb-4 p-3 bg-gray-800 rounded-lg border border-gray-700">
                <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Titel"
                  className="w-full mb-2 px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm text-white focus:outline-none focus:border-emerald-500" autoFocus />
                <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="Beschreibung" rows={2}
                  className="w-full mb-2 px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm text-white focus:outline-none focus:border-emerald-500" />
                <input value={labels} onChange={e => setLabels(e.target.value)} placeholder="Labels (kommagetrennt)"
                  className="w-full mb-2 px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm text-white focus:outline-none focus:border-emerald-500" />
                <div className="flex gap-2 mb-2">
                  <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} placeholder="Fällig am"
                    className="flex-1 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-xs text-white focus:outline-none focus:border-emerald-500" />
                  <label className="flex items-center gap-1 text-xs text-gray-300">
                    <input type="checkbox" checked={onHold} onChange={e => setOnHold(e.target.checked)}
                      className="rounded bg-gray-700 border-gray-600 text-yellow-500" />
                    On Hold
                  </label>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleCreate(col.name)} className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 rounded text-sm transition-colors">Erstellen</button>
                  <button onClick={() => setShowForm(null)} className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors">×</button>
                </div>
              </div>
            )}

            <div className="space-y-3">
              {colCards(col.name).map(card => (
                <div key={card.id} draggable onDragStart={e => onDragStart(e, card)}
                  className={`bg-gray-800 p-3 rounded-lg border cursor-grab hover:border-gray-600 transition-colors group ${
                    card.on_hold ? 'border-yellow-500/50 bg-gray-800/50' : 'border-gray-700'
                  }`}>
                  <div className="flex justify-between items-start">
                    <h3 className="font-medium text-sm flex items-center gap-2">
                      {card.title}
                      {card.on_hold && <span className="text-yellow-500 text-xs">⏸️</span>}
                    </h3>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => handleExecute(card)} disabled={executing === card.id || card.on_hold}
                        className="text-gray-500 hover:text-blue-400 disabled:opacity-40 text-xs" title="🐢 Schildi ausführen">
                        {executing === card.id ? '⏳' : '🐢'}
                      </button>
                      <button onClick={() => startEdit(card)} className="text-gray-500 hover:text-blue-400 text-xs">✏️</button>
                      <button onClick={() => handleDelete(card.id)} className="text-gray-500 hover:text-red-400 text-xs">🗑️</button>
                    </div>
                  </div>
                  {card.description && <p className="text-gray-400 text-xs mt-1">{card.description}</p>}
                  {card.due_date && (
                    <p className="text-orange-400 text-xs mt-1 flex items-center gap-1">
                      📅 {new Date(card.due_date).toLocaleDateString('de-DE')}
                    </p>
                  )}
                  {card.labels?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {card.labels.map((l, i) => (
                        <span key={i} className="px-2 py-0.5 bg-emerald-900/50 text-emerald-300 text-xs rounded-full">{l}</span>
                      ))}
                    </div>
                  )}
                  {card.result && (
                    <div className="mt-2 p-2 bg-blue-900/30 border border-blue-700/50 rounded text-xs">
                      <div className="text-blue-400 font-medium mb-1">🐢 Schildi Ergebnis:</div>
                      <div className="text-blue-200 line-clamp-3">{card.result}</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
