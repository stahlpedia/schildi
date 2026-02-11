import React, { useState, useEffect, useRef } from 'react'
import { channel, chatChannels } from '../api'

export default function Channel({ onUpdate }) {
  const [channels, setChannels] = useState([])
  const [selectedChannel, setSelectedChannel] = useState(null)
  const [convos, setConvos] = useState([])
  const [selected, setSelected] = useState(null)
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [taskRef, setTaskRef] = useState('')
  const [editMsg, setEditMsg] = useState(null)
  const [editText, setEditText] = useState('')
  const [sending, setSending] = useState(false)
  // Channel creation
  const [showChannelModal, setShowChannelModal] = useState(false)
  const [newChName, setNewChName] = useState('')
  const [newChModelId, setNewChModelId] = useState('')
  const [models, setModels] = useState([])
  const bottomRef = useRef(null)

  const loadChannels = async () => {
    const list = await chatChannels.list()
    setChannels(list)
    if (list.length > 0 && !selectedChannel) {
      setSelectedChannel(list[0].id)
    }
  }

  const loadModels = async () => {
    try { const m = await chatChannels.models(); setModels(m) } catch {}
  }

  const loadConvos = async () => {
    if (!selectedChannel) return
    const list = await channel.conversations(selectedChannel)
    setConvos(list)
  }

  const loadMessages = async (id) => {
    const msgs = await channel.messages(id)
    setMessages(msgs)
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  useEffect(() => { loadChannels(); loadModels() }, [])
  useEffect(() => { if (selectedChannel) { setSelected(null); setMessages([]); loadConvos() } }, [selectedChannel])
  useEffect(() => { if (selected) loadMessages(selected) }, [selected])

  const currentChannel = channels.find(c => c.id === selectedChannel)

  // Channel CRUD
  const handleCreateChannel = async () => {
    if (!newChName.trim() || !newChModelId) return
    try {
      const ch = await chatChannels.create({ name: newChName, type: 'model', model_id: newChModelId })
      setNewChName(''); setNewChModelId(''); setShowChannelModal(false)
      await loadChannels()
      if (ch?.id) setSelectedChannel(ch.id)
    } catch (e) {
      alert('Channel erstellen fehlgeschlagen: ' + e.message)
    }
  }

  const handleDeleteChannel = async () => {
    if (!selectedChannel || !confirm('Channel löschen? Unterhaltungen werden nach Schildi verschoben.')) return
    try {
      await chatChannels.remove(selectedChannel)
      setSelectedChannel(null)
      await loadChannels()
    } catch (e) {
      alert('Fehler: ' + e.message)
    }
  }

  // Conversation CRUD
  const handleNewConvo = async () => {
    const convo = await channel.createConversation(newTitle, selectedChannel)
    setNewTitle('')
    setShowNew(false)
    await loadConvos()
    setSelected(convo.id)
  }

  const handleSend = async (e) => {
    e.preventDefault()
    if (!text.trim() || !selected || sending) return
    setSending(true)
    await channel.sendMessage(selected, 'user', text, taskRef || undefined)
    setText('')
    setTaskRef('')
    await loadMessages(selected)
    // For model channels, wait then reload to get AI response
    if (currentChannel?.type === 'model') {
      setTimeout(async () => {
        await loadMessages(selected)
        setSending(false)
      }, 500)
    } else {
      setSending(false)
    }
    loadConvos()
    onUpdate?.()
  }

  const handleDeleteConvo = async (id) => {
    if (!confirm('Unterhaltung löschen? Alle Nachrichten gehen verloren.')) return
    await channel.deleteConversation(id)
    if (selected === id) { setSelected(null); setMessages([]) }
    loadConvos()
    onUpdate?.()
  }

  const handleEditMsg = async (msg) => {
    setEditMsg(msg)
    setEditText(msg.text)
  }

  const handleSaveEdit = async () => {
    if (!editMsg || !editText.trim()) return
    await channel.editMessage(editMsg.id, editText)
    setEditMsg(null)
    setEditText('')
    loadMessages(selected)
  }

  const handleDeleteMsg = async (msgId) => {
    if (!confirm('Nachricht löschen?')) return
    await channel.deleteMessage(msgId)
    loadMessages(selected)
  }

  return (
    <div>
      {/* Channel selector bar */}
      <div className="flex items-center gap-3 bg-gray-900 rounded-xl border border-gray-800 px-4 py-3 mb-4">
        <span className="text-lg">💬</span>
        <select value={selectedChannel || ''} onChange={e => setSelectedChannel(+e.target.value || null)}
          className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500">
          <option value="">Channel wählen...</option>
          {channels.map(ch => (
            <option key={ch.id} value={ch.id}>{ch.type === 'model' ? '🤖' : '🐢'} {ch.name}</option>
          ))}
        </select>
        <button onClick={() => setShowChannelModal(true)}
          className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-xs font-medium transition-colors">+ Channel</button>
        {selectedChannel && currentChannel && !currentChannel.is_default && (
          <button onClick={handleDeleteChannel}
            className="px-3 py-2 bg-gray-700 hover:bg-red-600 rounded-lg text-xs transition-colors">🗑️ Löschen</button>
        )}
        {currentChannel?.model_id && (
          <span className="ml-auto text-[10px] bg-blue-900/50 text-blue-300 px-2 py-1 rounded-full">{currentChannel.model_id}</span>
        )}
      </div>

      {/* Channel creation modal */}
      {showChannelModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowChannelModal(false)}>
          <div className="bg-gray-900 p-6 rounded-xl border border-gray-700 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">Neuer Channel</h3>
            <input value={newChName} onChange={e => setNewChName(e.target.value)} placeholder="Channel Name"
              className="w-full mb-3 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-emerald-500" autoFocus />
            <select value={newChModelId} onChange={e => setNewChModelId(e.target.value)}
              className="w-full mb-4 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-emerald-500">
              <option value="">Modell wählen...</option>
              {models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <div className="flex gap-2">
              <button onClick={handleCreateChannel} disabled={!newChName.trim() || !newChModelId}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors">Erstellen</button>
              <button onClick={() => setShowChannelModal(false)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors">Abbrechen</button>
            </div>
          </div>
        </div>
      )}

      {/* Main chat layout */}
      {selectedChannel && (
        <div className="flex gap-4" style={{ height: 'calc(100vh - 180px)' }}>
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
                  className={`px-3 py-2 cursor-pointer border-b border-gray-800/50 flex items-center gap-2 hover:bg-gray-800/50 transition-colors group ${selected === c.id ? 'bg-gray-800' : ''}`}>
                  {c.has_unanswered === 1 && <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-white truncate">{c.title}</div>
                    <div className="text-[10px] text-gray-500">{new Date(c.created_at + 'Z').toLocaleString('de-DE')}</div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); handleDeleteConvo(c.id) }}
                    className="text-gray-600 hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity">🗑️</button>
                </div>
              ))}
              {convos.length === 0 && <p className="text-gray-500 text-center py-6 text-xs">Keine Unterhaltungen</p>}
            </div>
          </div>

          {/* Chat area */}
          <div className="flex-1 bg-gray-900 rounded-xl border border-gray-800 flex flex-col overflow-hidden">
            {selected ? (
              <>
                <div className="p-3 border-b border-gray-800 flex items-center gap-2">
                  <span className="text-sm">{currentChannel?.type === 'model' ? '🤖' : '🐢'}</span>
                  <h3 className="text-sm font-semibold text-gray-300 truncate flex-1">{convos.find(c => c.id === selected)?.title}</h3>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {messages.map(m => (
                    <div key={m.id} className={`flex ${m.author === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[75%] px-3 py-2 rounded-xl text-sm group relative ${m.author === 'user' ? 'bg-emerald-700/40 text-emerald-100' : 'bg-gray-800 text-gray-200'}`}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-semibold uppercase tracking-wide opacity-60">
                            {m.author === 'user' ? '👤 Mensch' : (currentChannel?.type === 'model' ? '🤖 KI' : '🐢 Agent')}
                          </span>
                          {m.task_ref && <span className="text-[10px] bg-yellow-900/50 text-yellow-300 px-1.5 rounded">Task #{m.task_ref}</span>}
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-auto">
                            <button onClick={() => handleEditMsg(m)} className="text-gray-400 hover:text-blue-400 text-[10px]">✏️</button>
                            <button onClick={() => handleDeleteMsg(m.id)} className="text-gray-400 hover:text-red-400 text-[10px]">🗑️</button>
                          </div>
                        </div>

                        {editMsg?.id === m.id ? (
                          <div className="space-y-2">
                            <textarea value={editText} onChange={e => setEditText(e.target.value)} rows={3}
                              className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-white focus:outline-none focus:border-emerald-500" autoFocus />
                            <div className="flex gap-1">
                              <button onClick={handleSaveEdit} className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-500 rounded text-xs">Speichern</button>
                              <button onClick={() => setEditMsg(null)} className="px-2 py-0.5 bg-gray-700 hover:bg-gray-600 rounded text-xs">Abbrechen</button>
                            </div>
                          </div>
                        ) : (
                          <p className="whitespace-pre-wrap">{m.text}</p>
                        )}

                        <div className="text-[10px] text-gray-500 mt-1">{new Date(m.created_at + 'Z').toLocaleString('de-DE')}</div>
                      </div>
                    </div>
                  ))}
                  <div ref={bottomRef} />
                  {messages.length === 0 && <p className="text-gray-500 text-center py-10 text-sm">Noch keine Nachrichten</p>}
                </div>
                <form onSubmit={handleSend} className="p-3 border-t border-gray-800 flex gap-2">
                  {currentChannel?.type === 'agent' && (
                    <input value={taskRef} onChange={e => setTaskRef(e.target.value)} placeholder="Task #"
                      className="w-16 px-2 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white focus:outline-none focus:border-yellow-500" />
                  )}
                  <input value={text} onChange={e => setText(e.target.value)} placeholder="Nachricht schreiben..."
                    className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500" />
                  <button type="submit" disabled={sending}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors">
                    {sending ? '⏳' : 'Senden'}
                  </button>
                </form>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
                Wähle eine Unterhaltung oder erstelle eine neue
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
