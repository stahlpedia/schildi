import React, { useState, useEffect, useRef } from 'react'
import { kanban } from '../api'

const COLUMNS = [
  { id: 'backlog', label: 'Backlog', color: 'border-gray-600' },
  { id: 'in_progress', label: 'In Progress', color: 'border-yellow-500' },
  { id: 'done', label: 'Done', color: 'border-emerald-500' },
]

export default function KanbanBoard() {
  const [cards, setCards] = useState([])
  const [showForm, setShowForm] = useState(null)
  const [editCard, setEditCard] = useState(null)
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [labels, setLabels] = useState('')
  const dragItem = useRef(null)
  const dragOverCol = useRef(null)

  const load = async () => { setCards(await kanban.list()) }
  useEffect(() => { load() }, [])

  const handleCreate = async (col) => {
    if (!title.trim()) return
    await kanban.create({ title, description: desc, column_name: col, labels: labels ? labels.split(',').map(l => l.trim()) : [] })
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

  const onDragStart = (e, card) => { dragItem.current = card; e.dataTransfer.effectAllowed = 'move' }
  const onDragOver = (e, colId) => { e.preventDefault(); dragOverCol.current = colId }
  const onDrop = async (e, colId) => {
    e.preventDefault()
    if (dragItem.current && dragItem.current.column_name !== colId) {
      await kanban.update(dragItem.current.id, { column_name: colId })
      load()
    }
    dragItem.current = null
  }

  const startEdit = (card) => {
    setEditCard(card); setTitle(card.title); setDesc(card.description); setLabels((card.labels || []).join(', '))
  }

  const colCards = (colId) => cards.filter(c => c.column_name === colId)

  return (
    <div>
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {COLUMNS.map(col => (
          <div key={col.id} className={`bg-gray-900 rounded-xl border-t-4 ${col.color} p-4 min-h-[400px]`}
            onDragOver={e => onDragOver(e, col.id)} onDrop={e => onDrop(e, col.id)}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-lg">{col.label} <span className="text-gray-500 text-sm ml-1">{colCards(col.id).length}</span></h2>
              <button onClick={() => { setShowForm(showForm === col.id ? null : col.id); setTitle(''); setDesc(''); setLabels('') }}
                className="text-gray-500 hover:text-emerald-400 text-xl transition-colors">+</button>
            </div>

            {showForm === col.id && (
              <div className="mb-4 p-3 bg-gray-800 rounded-lg border border-gray-700">
                <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Titel"
                  className="w-full mb-2 px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm text-white focus:outline-none focus:border-emerald-500" autoFocus />
                <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="Beschreibung" rows={2}
                  className="w-full mb-2 px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm text-white focus:outline-none focus:border-emerald-500" />
                <input value={labels} onChange={e => setLabels(e.target.value)} placeholder="Labels (kommagetrennt)"
                  className="w-full mb-2 px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm text-white focus:outline-none focus:border-emerald-500" />
                <div className="flex gap-2">
                  <button onClick={() => handleCreate(col.id)} className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 rounded text-sm transition-colors">Erstellen</button>
                  <button onClick={() => setShowForm(null)} className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors">×</button>
                </div>
              </div>
            )}

            <div className="space-y-3">
              {colCards(col.id).map(card => (
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
