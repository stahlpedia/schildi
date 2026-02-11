import React, { useState, useEffect, useRef } from 'react'
import { kanban, columns as columnsApi, boards } from '../api'

const DEFAULT_COLORS = [
  'border-gray-600', 'border-yellow-500', 'border-emerald-500',
  'border-blue-500', 'border-purple-500', 'border-red-500', 'border-orange-500'
]

export default function KanbanBoard() {
  const [cards, setCards] = useState([])
  const [cols, setCols] = useState([])
  const [boardsList, setBoardsList] = useState([])
  const [selectedBoard, setSelectedBoard] = useState(null)
  const [showForm, setShowForm] = useState(null)
  const [editCard, setEditCard] = useState(null)
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [labels, setLabels] = useState('')
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

  // Card CRUD
  const handleCreate = async (colName) => {
    if (!title.trim() || !selectedBoard) return
    await kanban.create({ title, description: desc, column_name: colName, labels: labels ? labels.split(',').map(l => l.trim()) : [], board_id: selectedBoard })
    setTitle(''); setDesc(''); setLabels(''); setShowForm(null); load()
  }

  const handleUpdate = async () => {
    if (!editCard) return
    await kanban.update(editCard.id, { title, description: desc, labels: labels ? labels.split(',').map(l => l.trim()) : [] })
    setEditCard(null); setTitle(''); setDesc(''); setLabels(''); load()
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
    setEditCard(card); setTitle(card.title); setDesc(card.description); setLabels((card.labels || []).join(', '))
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

  const colCards = (colName) => cards.filter(c => c.column_name === colName)

  const colorClass = (color) => {
    // Extract color for the dot preview
    const match = color.match(/border-(\w+)-(\d+)/)
    if (match) return `bg-${match[1]}-${match[2]}`
    return 'bg-gray-600'
  }

  return (
    <div>
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
              className="w-full mb-4 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-emerald-500" />
            <div className="flex gap-2">
              <button onClick={handleUpdate} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm font-medium transition-colors">Speichern</button>
              <button onClick={() => setEditCard(null)} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors">Abbrechen</button>
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
              <button onClick={() => { setShowForm(showForm === col.name ? null : col.name); setTitle(''); setDesc(''); setLabels('') }}
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
                <div className="flex gap-2">
                  <button onClick={() => handleCreate(col.name)} className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 rounded text-sm transition-colors">Erstellen</button>
                  <button onClick={() => setShowForm(null)} className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors">×</button>
                </div>
              </div>
            )}

            <div className="space-y-3">
              {colCards(col.name).map(card => (
                <div key={card.id} draggable onDragStart={e => onDragStart(e, card)}
                  className="bg-gray-800 p-3 rounded-lg border border-gray-700 cursor-grab hover:border-gray-600 transition-colors group">
                  <div className="flex justify-between items-start">
                    <h3 className="font-medium text-sm">{card.title}</h3>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => startEdit(card)} className="text-gray-500 hover:text-blue-400 text-xs">✏️</button>
                      <button onClick={() => handleDelete(card.id)} className="text-gray-500 hover:text-red-400 text-xs">🗑️</button>
                    </div>
                  </div>
                  {card.description && <p className="text-gray-400 text-xs mt-1">{card.description}</p>}
                  {card.labels?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {card.labels.map((l, i) => (
                        <span key={i} className="px-2 py-0.5 bg-emerald-900/50 text-emerald-300 text-xs rounded-full">{l}</span>
                      ))}
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
