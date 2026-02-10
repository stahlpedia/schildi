import React, { useState, useEffect } from 'react'
import { log } from '../api'

export default function Logbuch() {
  const [entries, setEntries] = useState([])
  const [message, setMessage] = useState('')
  const [category, setCategory] = useState('')

  const load = async () => { setEntries(await log.list(100)) }
  useEffect(() => { load() }, [])

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!message.trim()) return
    await log.create(message, category)
    setMessage(''); setCategory(''); load()
  }

  const handleDelete = async (id) => { await log.remove(id); load() }

  const catColor = (cat) => {
    const colors = { info: 'bg-blue-900/50 text-blue-300', task: 'bg-yellow-900/50 text-yellow-300', done: 'bg-emerald-900/50 text-emerald-300', error: 'bg-red-900/50 text-red-300' }
    return colors[cat?.toLowerCase()] || 'bg-gray-800 text-gray-400'
  }

  return (
    <div className="max-w-3xl mx-auto">
      <form onSubmit={handleCreate} className="bg-gray-900 p-4 rounded-xl border border-gray-800 mb-6 flex gap-3">
        <input value={message} onChange={e => setMessage(e.target.value)} placeholder="Neuer Eintrag..."
          className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500" />
        <input value={category} onChange={e => setCategory(e.target.value)} placeholder="Kategorie"
          className="w-32 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500" />
        <button type="submit" className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm font-medium transition-colors">+</button>
      </form>

      <div className="space-y-2">
        {entries.map(e => (
          <div key={e.id} className="bg-gray-900 px-4 py-3 rounded-lg border border-gray-800 flex items-center gap-3 group">
            <span className="text-xs text-gray-600 shrink-0 font-mono">{new Date(e.created_at + 'Z').toLocaleString('de-DE')}</span>
            {e.category && <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${catColor(e.category)}`}>{e.category}</span>}
            <span className="text-sm flex-1">{e.message}</span>
            <button onClick={() => handleDelete(e.id)} className="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all text-xs">🗑️</button>
          </div>
        ))}
        {entries.length === 0 && <p className="text-gray-500 text-center py-10">Noch keine Einträge</p>}
      </div>
    </div>
  )
}
