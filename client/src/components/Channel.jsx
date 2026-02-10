import React, { useState, useEffect, useRef } from 'react'
import { channel } from '../api'

export default function Channel({ onUpdate }) {
  const [convos, setConvos] = useState([])
  const [selected, setSelected] = useState(null)
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [taskRef, setTaskRef] = useState('')
  const bottomRef = useRef(null)

  const loadConvos = async () => {
    const list = await channel.conversations()
    setConvos(list)
  }

  const loadMessages = async (id) => {
    const msgs = await channel.messages(id)
    setMessages(msgs)
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  useEffect(() => { loadConvos() }, [])
  useEffect(() => { if (selected) loadMessages(selected) }, [selected])

  const handleNewConvo = async () => {
    const convo = await channel.createConversation(newTitle)
    setNewTitle('')
    setShowNew(false)
    await loadConvos()
    setSelected(convo.id)
  }

  const handleSend = async (e) => {
    e.preventDefault()
    if (!text.trim() || !selected) return
    await channel.sendMessage(selected, 'user', text, taskRef || undefined)
    setText('')
    setTaskRef('')
    loadMessages(selected)
    loadConvos()
    onUpdate?.()
  }

  const handleDelete = async (id) => {
    await channel.deleteConversation(id)
    if (selected === id) { setSelected(null); setMessages([]) }
    loadConvos()
  }

  return (
    <div className="max-w-5xl mx-auto flex gap-4" style={{ height: 'calc(100vh - 120px)' }}>
      {/* Sidebar */}
      <div className="w-72 shrink-0 bg-gray-900 rounded-xl border border-gray-800 flex flex-col overflow-hidden">
        <div className="p-3 border-b border-gray-800 flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-300">Unterhaltungen</span>
          <button onClick={() => setShowNew(!showNew)} className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 rounded text-xs font-medium transition-colors">+ Neu</button>
        </div>
        {showNew && (
          <div className="p-3 border-b border-gray-800 flex gap-2">
            <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Titel (optional)"
              className="flex-1 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-white focus:outline-none focus:border-emerald-500"
              onKeyDown={e => e.key === 'Enter' && handleNewConvo()} />
            <button onClick={handleNewConvo} className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 rounded text-xs transition-colors">OK</button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto">
          {convos.map(c => (
            <div key={c.id} onClick={() => setSelected(c.id)}
              className={`px-3 py-2 cursor-pointer border-b border-gray-800/50 flex items-center gap-2 hover:bg-gray-800/50 transition-colors ${selected === c.id ? 'bg-gray-800' : ''}`}>
              {c.has_unanswered === 1 && <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="text-xs text-white truncate">{c.title}</div>
                <div className="text-[10px] text-gray-500">{new Date(c.created_at + 'Z').toLocaleString('de-DE')}</div>
              </div>
              <button onClick={(e) => { e.stopPropagation(); handleDelete(c.id) }} className="text-gray-600 hover:text-red-400 text-xs opacity-0 group-hover:opacity-100">🗑️</button>
            </div>
          ))}
          {convos.length === 0 && <p className="text-gray-500 text-center py-6 text-xs">Keine Unterhaltungen</p>}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 bg-gray-900 rounded-xl border border-gray-800 flex flex-col overflow-hidden">
        {selected ? (
          <>
            <div className="p-3 border-b border-gray-800">
              <h3 className="text-sm font-semibold text-gray-300 truncate">{convos.find(c => c.id === selected)?.title}</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map(m => (
                <div key={m.id} className={`flex ${m.author === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] px-3 py-2 rounded-xl text-sm ${m.author === 'user' ? 'bg-emerald-700/40 text-emerald-100' : 'bg-gray-800 text-gray-200'}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wide opacity-60">{m.author === 'user' ? '👤 Mensch' : '🐢 Agent'}</span>
                      {m.task_ref && <span className="text-[10px] bg-yellow-900/50 text-yellow-300 px-1.5 rounded">Task #{m.task_ref}</span>}
                    </div>
                    <p className="whitespace-pre-wrap">{m.text}</p>
                    <div className="text-[10px] text-gray-500 mt-1">{new Date(m.created_at + 'Z').toLocaleString('de-DE')}</div>
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
              {messages.length === 0 && <p className="text-gray-500 text-center py-10 text-sm">Noch keine Nachrichten</p>}
            </div>
            <form onSubmit={handleSend} className="p-3 border-t border-gray-800 flex gap-2">
              <input value={taskRef} onChange={e => setTaskRef(e.target.value)} placeholder="Task #"
                className="w-16 px-2 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white focus:outline-none focus:border-yellow-500" />
              <input value={text} onChange={e => setText(e.target.value)} placeholder="Nachricht schreiben..."
                className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500" />
              <button type="submit" className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm font-medium transition-colors">Senden</button>
            </form>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
            Wähle eine Unterhaltung oder erstelle eine neue
          </div>
        )}
      </div>
    </div>
  )
}
