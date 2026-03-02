import React, { useState, useEffect, useRef } from 'react'
import { kanban, columns as columnsApi, boards, projectBoards, projectCalendar } from '../api'
import CardModal from './CardModal'

function ResultBlock({ result }) {
  const [expanded, setExpanded] = useState(false)
  const isLong = result && result.length > 200
  return (
    <div className="mt-2 p-2 bg-blue-900/30 border border-blue-700/50 rounded text-xs">
      <div className="text-blue-400 font-medium mb-1">🐢 Schildi Ergebnis:</div>
      <div className={`text-blue-200 whitespace-pre-wrap break-words ${!expanded && isLong ? 'line-clamp-3' : ''}`}>{result}</div>
      {isLong && (
        <button onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}
          className="text-blue-400 hover:text-blue-300 mt-1 text-[10px] font-medium">
          {expanded ? '▲ Weniger' : '▼ Mehr anzeigen'}
        </button>
      )}
    </div>
  )
}

const DEFAULT_COLORS = [
  'border-gray-600', 'border-yellow-500', 'border-emerald-500',
  'border-blue-500', 'border-purple-500', 'border-red-500', 'border-orange-500'
]

export default function KanbanBoard(props = {}) {
  const { projectId } = props
  const [cards, setCards] = useState([])
  const [cols, setCols] = useState([])
  const [boardsList, setBoardsList] = useState([])
  const [selectedBoard, setSelectedBoard] = useState(null)
  const [createForColumn, setCreateForColumn] = useState(null)
  const [editCard, setEditCard] = useState(null)
  const [executing, setExecuting] = useState(null)
  const [showColManager, setShowColManager] = useState(false)
  const [newColLabel, setNewColLabel] = useState('')
  const [newColColor, setNewColColor] = useState('border-gray-600')
  const [editCol, setEditCol] = useState(null)
  const [editColLabel, setEditColLabel] = useState('')
  const [editColColor, setEditColColor] = useState('')
  const [showBoardModal, setShowBoardModal] = useState(false)
  const [newBoardName, setNewBoardName] = useState('')
  const [executeMsg, setExecuteMsg] = useState(null)
  // Calendar view
  const [viewMode, setViewMode] = useState('board') // 'board' | 'calendar'
  const [calendarDate, setCalendarDate] = useState(new Date())
  const [calendarCards, setCalendarCards] = useState([])
  const fileInputRef = useRef(null)
  const dragItem = useRef(null)

  const loadBoards = async () => {
    try {
      const list = projectId ? await projectBoards(projectId) : await boards.list()
      setBoardsList(list)
      if (list.length > 0) setSelectedBoard(list[0].id)
    } catch (e) {
      // Fallback to global boards
      const list = await boards.list()
      setBoardsList(list)
      if (list.length > 0 && !selectedBoard) setSelectedBoard(list[0].id)
    }
  }

  const load = async () => {
    if (!selectedBoard) return
    const [c, co] = await Promise.all([kanban.list(selectedBoard), columnsApi.list(selectedBoard)])
    setCards(c)
    setCols(co)
  }

  const loadCalendar = async () => {
    if (!projectId) return
    const month = `${calendarDate.getFullYear()}-${String(calendarDate.getMonth() + 1).padStart(2, '0')}`
    try {
      const data = await projectCalendar(projectId, month)
      // Filter by selected board if one is active
      setCalendarCards(selectedBoard ? data.filter(c => c.board_id === selectedBoard) : data)
    } catch (e) {
      // Fallback: filter local cards by due_date
      setCalendarCards(cards.filter(c => c.due_date))
    }
  }

  // SSE: auto-refresh on kanban changes
  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.type === 'kanban') load();
    };
    window.addEventListener('sse-event', handler);
    return () => window.removeEventListener('sse-event', handler);
  }, [selectedBoard])

  useEffect(() => { setSelectedBoard(null); loadBoards() }, [projectId])
  useEffect(() => { if (selectedBoard) load() }, [selectedBoard])
  useEffect(() => { if (viewMode === 'calendar') loadCalendar() }, [viewMode, calendarDate, projectId, selectedBoard])
  
  useEffect(() => {
    if (props.selectedBoardId && !selectedBoard) setSelectedBoard(props.selectedBoardId)
  }, [props.selectedBoardId])

  useEffect(() => {
    if (props.highlightTaskId && cards.length > 0) {
      const highlightedCard = cards.find(c => c.id === props.highlightTaskId)
      if (highlightedCard) {
        setTimeout(() => {
          startEdit(highlightedCard)
          if (props.onTaskHighlighted) props.onTaskHighlighted()
        }, 500)
      }
    }
  }, [props.highlightTaskId, cards])

  const handleExecuteById = async (cardId) => {
    if (executing === cardId) return
    setExecuting(cardId)
    setExecuteMsg({ id: cardId, text: '🐢 Schildi arbeitet an diesem Task...', type: 'loading' })
    try {
      const response = await fetch(`/api/kanban/tasks/${cardId}/execute`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' }
      })
      const result = await response.json()
      if (response.ok) {
        setExecuteMsg({ id: cardId, text: '✅ Schildi hat den Task bearbeitet!', type: 'success' })
        load()
        setTimeout(() => setExecuteMsg(null), 4000)
      } else {
        setExecuteMsg({ id: cardId, text: '❌ Fehler: ' + result.error, type: 'error' })
        setTimeout(() => setExecuteMsg(null), 5000)
      }
    } catch (e) {
      setExecuteMsg({ id: cardId, text: '❌ Verbindungsfehler: ' + e.message, type: 'error' })
      setTimeout(() => setExecuteMsg(null), 5000)
    }
    setExecuting(null)
  }

  const handleDelete = async (id) => { await kanban.remove(id); load() }

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

  const startEdit = (card) => setEditCard(card)
  const startCreate = (colName) => setCreateForColumn(colName)

  const handleCreateCol = async () => {
    if (!newColLabel.trim() || !selectedBoard) return
    await columnsApi.create({ name: newColLabel, label: newColLabel, color: newColColor, board_id: selectedBoard })
    setNewColLabel(''); setNewColColor('border-gray-600'); load()
  }

  const handleCreateBoard = async () => {
    if (!newBoardName.trim()) return
    try {
      const board = await boards.create({ name: newBoardName, project_id: projectId })
      setNewBoardName(''); setShowBoardModal(false)
      await loadBoards()
      if (board?.id) setSelectedBoard(board.id)
    } catch (e) { alert('Board erstellen fehlgeschlagen: ' + e.message) }
  }

  const handleDeleteBoard = async () => {
    if (!selectedBoard || !confirm('Board wirklich löschen?')) return
    await boards.remove(selectedBoard)
    setSelectedBoard(null); loadBoards()
  }

  const handleUpdateCol = async () => {
    if (!editCol) return
    await columnsApi.update(editCol.id, { label: editColLabel, color: editColColor })
    setEditCol(null); load()
  }

  const handleDeleteCol = async (id) => {
    if (!confirm('Spalte löschen?')) return
    await columnsApi.remove(id); load()
  }

  const handleExecute = async (card) => {
    if (executing === card.id) return
    setExecuting(card.id)
    setEditCard(null)
    setExecuteMsg({ id: card.id, text: '🐢 Schildi arbeitet an diesem Task...', type: 'loading' })
    try {
      const response = await fetch(`/api/kanban/tasks/${card.id}/execute`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' }
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

  const moveCard = async (card, direction) => {
    const currentColIndex = cols.findIndex(col => col.name === card.column_name)
    if (direction === 'left' && currentColIndex > 0) {
      await kanban.update(card.id, { column_name: cols[currentColIndex - 1].name }); load()
    } else if (direction === 'right' && currentColIndex < cols.length - 1) {
      await kanban.update(card.id, { column_name: cols[currentColIndex + 1].name }); load()
    }
  }

  // Calendar helpers
  const getMonthDays = () => {
    const year = calendarDate.getFullYear()
    const month = calendarDate.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const startDate = new Date(firstDay)
    startDate.setDate(startDate.getDate() - ((firstDay.getDay() + 6) % 7)) // Start on Monday
    const days = []
    const current = new Date(startDate)
    while (current <= lastDay || days.length % 7 !== 0) {
      days.push(new Date(current))
      current.setDate(current.getDate() + 1)
    }
    return days
  }

  const getCardsForDate = (date) => {
    const dateStr = date.toISOString().split('T')[0]
    const source = calendarCards.length > 0 ? calendarCards : cards
    return source.filter(c => c.due_date && c.due_date.startsWith(dateStr))
  }

  const isToday = (date) => date.toDateString() === new Date().toDateString()
  const isCurrentMonth = (date) => date.getMonth() === calendarDate.getMonth()

  const handleCalendarCardClick = (card) => startEdit(card)
  const handleCalendarDayClick = (date) => {
    setCreateForColumn(cols[0]?.name || 'backlog')
    // The CardModal will be opened; we set a default due_date via a workaround
  }

  return (
    <div>
      {executeMsg && (
        <div className={`fixed top-4 right-4 z-[60] px-4 py-3 rounded-lg shadow-lg border max-w-sm animate-pulse ${
          executeMsg.type === 'loading' ? 'bg-blue-900/90 border-blue-700 text-blue-200' :
          executeMsg.type === 'success' ? 'bg-emerald-900/90 border-emerald-700 text-emerald-200' :
          'bg-red-900/90 border-red-700 text-red-200'
        }`}>
          <p className="text-sm font-medium">{executeMsg.text}</p>
        </div>
      )}

      <CardModal 
        isOpen={!!(editCard || createForColumn)}
        onClose={() => { setEditCard(null); setCreateForColumn(null) }}
        mode={editCard ? 'edit' : 'create'}
        card={editCard}
        defaultColumnName={createForColumn}
        defaultBoardId={selectedBoard}
        projectId={projectId}
        onSave={() => { load(); if (viewMode === 'calendar') loadCalendar() }}
        onExecute={(card) => handleExecuteById(card.id)}
      />

      {/* Column manager modal */}
      {showColManager && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-3 md:p-0" onClick={() => { setShowColManager(false); setEditCol(null) }}>
          <div className="bg-gray-900 p-4 md:p-6 rounded-xl border border-gray-700 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">Spalten verwalten</h3>
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

      {showBoardModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-3 md:p-0" onClick={() => setShowBoardModal(false)}>
          <div className="bg-gray-900 p-4 md:p-6 rounded-xl border border-gray-700 w-full max-w-md" onClick={e => e.stopPropagation()}>
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

      {/* Board selector + View Toggle */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 bg-gray-900 rounded-xl border border-gray-800 px-4 py-3 mb-4">
        <div className="flex items-center gap-3 flex-1">
          <span className="text-lg">🗂️</span>
          <select value={selectedBoard || ''} onChange={e => setSelectedBoard(+e.target.value || null)}
            className="flex-1 md:flex-none px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500">
            <option value="">Board wählen...</option>
            {boardsList.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          {/* View Toggle */}
          <div className="flex bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
            <button onClick={() => setViewMode('board')}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === 'board' ? 'bg-emerald-600 text-white' : 'text-gray-400 hover:text-white'}`}>
              Board
            </button>
            <button onClick={() => setViewMode('calendar')}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === 'calendar' ? 'bg-emerald-600 text-white' : 'text-gray-400 hover:text-white'}`}>
              Kalender
            </button>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setShowBoardModal(true)}
            className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-xs font-medium transition-colors">+ Board</button>
          {selectedBoard && boardsList.find(b => b.id === selectedBoard)?.type === 'custom' && (
            <button onClick={handleDeleteBoard}
              className="px-3 py-2 bg-gray-700 hover:bg-red-600 rounded-lg text-xs transition-colors">🗑️ Löschen</button>
          )}
          <button onClick={() => setShowColManager(true)}
            className="px-3 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-xs text-gray-300 transition-colors">
            ⚙️ Spalten verwalten
          </button>
        </div>
      </div>

      {viewMode === 'board' ? (
        <>
          {/* Desktop Board */}
          <div className="hidden md:grid gap-6 overflow-x-auto" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(280px, 1fr))` }}>
            {cols.map(col => (
              <div key={col.id} className={`bg-gray-900 rounded-xl border-t-4 ${col.color} p-4 min-h-[400px]`}
                onDragOver={onDragOver} onDrop={e => onDrop(e, col.name)}>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-bold text-lg">{col.label} <span className="text-gray-500 text-sm ml-1">{colCards(col.name).length}</span></h2>
                  <button onClick={() => startCreate(col.name)} className="text-gray-500 hover:text-emerald-400 text-xl transition-colors">+</button>
                </div>
                <div className="space-y-3">
                  {colCards(col.name).map(card => (
                    <div key={card.id} draggable onDragStart={e => onDragStart(e, card)}
                      className={`bg-gray-800 p-3 rounded-lg border cursor-grab hover:border-gray-600 transition-colors group ${card.on_hold ? 'border-yellow-500/50 bg-gray-800/50' : 'border-gray-700'}`}>
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
                        <p className="text-orange-400 text-xs mt-1 flex items-center gap-1">📅 {new Date(card.due_date).toLocaleDateString('de-DE')}</p>
                      )}
                      {card.labels?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {card.labels.map((l, i) => (
                            <span key={i} className="px-2 py-0.5 bg-emerald-900/50 text-emerald-300 text-xs rounded-full">{l}</span>
                          ))}
                        </div>
                      )}
                      {card.result && <ResultBlock result={card.result} />}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Mobile Board */}
          <div className="md:hidden">
            <div className="flex gap-4 overflow-x-auto pb-4" style={{ scrollbarWidth: 'thin' }}>
              {cols.map(col => (
                <div key={col.id} className={`bg-gray-900 rounded-xl border-t-4 ${col.color} p-4 min-h-[400px] flex-shrink-0 w-80`}
                  onDragOver={onDragOver} onDrop={e => onDrop(e, col.name)}>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="font-bold text-base">{col.label} <span className="text-gray-500 text-sm ml-1">{colCards(col.name).length}</span></h2>
                    <button onClick={() => startCreate(col.name)} className="text-gray-500 hover:text-emerald-400 text-xl transition-colors">+</button>
                  </div>
                  <div className="space-y-3">
                    {colCards(col.name).map((card) => {
                      const currentColIndex = cols.findIndex(c => c.name === col.name)
                      const canMoveLeft = currentColIndex > 0
                      const canMoveRight = currentColIndex < cols.length - 1
                      return (
                        <div key={card.id} className={`bg-gray-800 p-3 rounded-lg border transition-colors ${card.on_hold ? 'border-yellow-500/50 bg-gray-800/50' : 'border-gray-700'}`}>
                          <div className="flex justify-between items-start mb-2">
                            <h3 className="font-medium text-sm flex items-center gap-2 flex-1">
                              {card.title}
                              {card.on_hold && <span className="text-yellow-500 text-xs">⏸️</span>}
                            </h3>
                          </div>
                          <div className="flex gap-1 mb-2">
                            {canMoveLeft && (
                              <button onClick={() => moveCard(card, 'left')}
                                className="px-2 py-1 bg-blue-600 hover:bg-blue-500 rounded text-xs font-medium transition-colors">
                                ← {cols[currentColIndex - 1].label}
                              </button>
                            )}
                            {canMoveRight && (
                              <button onClick={() => moveCard(card, 'right')}
                                className="px-2 py-1 bg-blue-600 hover:bg-blue-500 rounded text-xs font-medium transition-colors">
                                {cols[currentColIndex + 1].label} →
                              </button>
                            )}
                          </div>
                          <div className="flex gap-1 mb-2">
                            <button onClick={() => handleExecute(card)} disabled={executing === card.id || card.on_hold}
                              className="px-2 py-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded text-xs font-medium transition-colors">
                              {executing === card.id ? '⏳' : '🐢 Ausführen'}
                            </button>
                            <button onClick={() => startEdit(card)} className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs transition-colors">✏️ Edit</button>
                            <button onClick={() => handleDelete(card.id)} className="px-2 py-1 bg-red-700 hover:bg-red-600 rounded text-xs transition-colors">🗑️</button>
                          </div>
                          {card.description && <p className="text-gray-400 text-xs mt-2">{card.description}</p>}
                          {card.due_date && <p className="text-orange-400 text-xs mt-1">📅 {new Date(card.due_date).toLocaleDateString('de-DE')}</p>}
                          {card.labels?.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {card.labels.map((l, i) => <span key={i} className="px-2 py-0.5 bg-emerald-900/50 text-emerald-300 text-xs rounded-full">{l}</span>)}
                            </div>
                          )}
                          {card.result && <ResultBlock result={card.result} />}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        /* Calendar View */
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1))}
              className="px-3 py-1 text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors">←</button>
            <span className="text-lg font-medium">
              {calendarDate.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}
            </span>
            <button onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1))}
              className="px-3 py-1 text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors">→</button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-2">
            {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(d => (
              <div key={d} className="p-2 text-center text-sm font-medium text-gray-400">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {getMonthDays().map((date, idx) => {
              const dayCards = getCardsForDate(date)
              return (
                <div key={idx}
                  onClick={() => handleCalendarDayClick(date)}
                  className={`min-h-[100px] p-2 border border-gray-800 rounded cursor-pointer hover:bg-gray-800/50 transition-colors ${
                    isToday(date) ? 'bg-emerald-900/20 border-emerald-700/50' : 'bg-gray-900'
                  } ${!isCurrentMonth(date) ? 'opacity-40' : ''}`}>
                  <div className={`text-sm font-medium mb-1 ${isToday(date) ? 'text-emerald-300' : 'text-gray-300'}`}>
                    {date.getDate()}
                  </div>
                  <div className="space-y-1">
                    {dayCards.slice(0, 3).map(card => (
                      <div key={card.id} onClick={(e) => { e.stopPropagation(); handleCalendarCardClick(card) }}
                        className="text-[10px] px-1.5 py-0.5 bg-emerald-800/50 text-emerald-200 rounded truncate hover:bg-emerald-700/50 transition-colors"
                        title={card.title}>
                        {card.title}
                      </div>
                    ))}
                    {dayCards.length > 3 && <div className="text-[10px] text-gray-500">+{dayCards.length - 3} weitere</div>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
