import React, { useState, useEffect, useRef } from 'react'
import { channel, chatChannels, attachments } from '../api'
import CardModal from './CardModal'

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1024 / 1024).toFixed(1) + ' MB'
}

export default function Channel({ projectId, onUpdate }) {
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
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  // OpenClaw agents (auto-detected)
  const [ocAgents, setOcAgents] = useState([])
  const [loadingAgents, setLoadingAgents] = useState(false)
  // Add agent modal
  const [showAddModal, setShowAddModal] = useState(false)
  const [addAgentId, setAddAgentId] = useState('')
  const [addAgentName, setAddAgentName] = useState('')
  // CardModal
  const [showCreateTask, setShowCreateTask] = useState(false)
  const [taskFromMessage, setTaskFromMessage] = useState('')
  const [taskTitle, setTaskTitle] = useState('')
  const fileInputRef = useRef(null)
  const bottomRef = useRef(null)

  const loadChannels = async () => {
    const list = await chatChannels.list(projectId)
    setChannels(list)
    if (list.length > 0 && !selectedChannel) {
      setSelectedChannel(list[0].id)
    }
  }

  // Load OpenClaw agents from /api/channels/models (filtered to openclaw-agent source)
  const loadOcAgents = async () => {
    setLoadingAgents(true)
    try {
      const models = await chatChannels.models()
      const agents = models.filter(m => m.source === 'openclaw-agent')
      setOcAgents(agents)
    } catch {}
    setLoadingAgents(false)
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

  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.type === 'channel') {
        if (selected && e.detail.data?.conversationId === selected) loadMessages(selected)
        loadConvos()
      }
    }
    window.addEventListener('sse-event', handler)
    return () => window.removeEventListener('sse-event', handler)
  }, [selected, selectedChannel])

  useEffect(() => {
    setSelectedChannel(null)
    setSelected(null)
    setMessages([])
    loadChannels()
    loadOcAgents()
  }, [projectId])

  useEffect(() => {
    if (selectedChannel) { setSelected(null); setMessages([]); loadConvos() }
  }, [selectedChannel])

  useEffect(() => { if (selected) loadMessages(selected) }, [selected])

  const currentChannel = channels.find(c => c.id === selectedChannel)

  // Auto-create channel for an OpenClaw agent if it doesn't exist yet, then select it
  const handleSelectAgent = async (agent) => {
    // agent.id is e.g. "agent:video" or "agent:main"
    const rawId = agent.id.replace(/^agent:/, '')
    const existing = channels.find(c => c.model_id === agent.id || c.model_id === rawId)
    if (existing) {
      setSelectedChannel(existing.id)
      return
    }
    try {
      const ch = await chatChannels.create({
        name: agent.name || rawId,
        type: 'agent',
        model_id: agent.id,
        project_id: projectId
      })
      await loadChannels()
      if (ch?.id) setSelectedChannel(ch.id)
    } catch (e) {
      alert('Fehler: ' + e.message)
    }
  }

  const handleAddManual = async () => {
    if (!addAgentId.trim()) return
    const id = addAgentId.trim().startsWith('agent:') ? addAgentId.trim() : `agent:${addAgentId.trim()}`
    const name = addAgentName.trim() || addAgentId.trim()
    try {
      const ch = await chatChannels.create({ name, type: 'agent', model_id: id, project_id: projectId })
      setShowAddModal(false)
      setAddAgentId('')
      setAddAgentName('')
      await loadChannels()
      await loadOcAgents()
      if (ch?.id) setSelectedChannel(ch.id)
    } catch (e) {
      alert('Fehler: ' + e.message)
    }
  }

  const handleDeleteChannel = async () => {
    if (!selectedChannel || !confirm('Agent-Channel löschen?')) return
    try {
      await chatChannels.remove(selectedChannel)
      setSelectedChannel(null)
      await loadChannels()
    } catch (e) {
      alert('Fehler: ' + e.message)
    }
  }

  const handleNewConvo = async () => {
    const convo = await channel.createConversation(newTitle, selectedChannel)
    setNewTitle('')
    setShowNew(false)
    await loadConvos()
    setSelected(convo.id)
  }

  const handleDeleteConvo = async (id) => {
    if (!confirm('Unterhaltung löschen?')) return
    await channel.deleteConversation(id)
    if (selected === id) { setSelected(null); setMessages([]) }
    await loadConvos()
  }

  const handleDeleteMsg = async (id) => {
    await channel.deleteMessage(id)
    if (selected) loadMessages(selected)
  }

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0]
    if (file) setSelectedFile(file)
  }

  const handleSend = async (e) => {
    e.preventDefault()
    if ((!text.trim() && !selectedFile) || !selected || sending) return
    setSending(true)
    try {
      if (selectedFile) {
        setUploading(true)
        const formData = new FormData()
        formData.append('file', selectedFile)
        formData.append('conversation_id', selected)
        if (text.trim()) formData.append('text', text.trim())
        if (taskRef.trim()) formData.append('task_ref', taskRef.trim())
        await attachments.upload(formData)
        setUploading(false)
        setSelectedFile(null)
        if (fileInputRef.current) fileInputRef.current.value = ''
      } else {
        await channel.sendMessage(selected, 'user', text.trim(), taskRef || null)
      }
      setText('')
      setTaskRef('')
      await loadMessages(selected)
    } catch (err) {
      alert('Fehler: ' + err.message)
    }
    setSending(false)
  }

  const handleEditMsg = async (msg) => { setEditMsg(msg); setEditText(msg.text) }
  const handleSaveEdit = async () => {
    if (!editMsg || !editText.trim()) return
    await channel.editMessage(editMsg.id, editText)
    setEditMsg(null); setEditText('')
    if (selected) loadMessages(selected)
  }

  const handleCreateTaskFromMessage = (message) => {
    const lines = message.text.split('\n').filter(l => l.trim())
    const firstLine = lines[0] || message.text
    setTaskTitle(firstLine.length > 60 ? firstLine.substring(0, 60) + '...' : firstLine)
    setTaskFromMessage(message.text)
    setShowCreateTask(true)
  }

  // Which agent IDs are already linked to a channel
  const linkedAgentIds = channels.map(c => c.model_id).filter(Boolean)
  const unlinkedAgents = ocAgents.filter(a => !linkedAgentIds.includes(a.id) && !linkedAgentIds.includes(a.id.replace(/^agent:/, '')))

  return (
    <div>
      {/* Agent selector bar */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 px-4 py-3 mb-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="md:hidden p-2 text-gray-400 hover:text-white transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </button>
            <span className="text-sm font-semibold text-gray-300">Agents</span>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { loadOcAgents() }} title="Aktualisieren"
              className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-xs transition-colors">
              {loadingAgents ? '⏳' : '↻'}
            </button>
            <button onClick={() => setShowAddModal(true)}
              className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-xs font-medium transition-colors">
              + Agent
            </button>
            {selectedChannel && currentChannel && !currentChannel.is_default && (
              <button onClick={handleDeleteChannel}
                className="px-3 py-2 bg-gray-700 hover:bg-red-600 rounded-lg text-xs transition-colors">
                🗑️
              </button>
            )}
          </div>
        </div>

        {/* Agent pills */}
        <div className="flex flex-wrap gap-2">
          {/* Existing channels */}
          {channels.map(ch => {
            const label = ch.model_id ? ch.model_id.replace(/^(agent:|openclaw:)/, '') : ch.name
            const isSelected = selectedChannel === ch.id
            return (
              <button
                key={ch.id}
                onClick={() => setSelectedChannel(ch.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                  isSelected
                    ? 'bg-teal-600 border-teal-500 text-white'
                    : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-teal-600 hover:text-white'
                }`}
              >
                <span>{ch.is_default ? '🐢' : '🎬'}</span>
                <span>{ch.name}</span>
                {!ch.is_default && <span className="text-[9px] opacity-60 ml-1">{label}</span>}
              </button>
            )
          })}

          {/* Unlinked OpenClaw agents — quick-add */}
          {unlinkedAgents.map(a => (
            <button
              key={a.id}
              onClick={() => handleSelectAgent(a)}
              title={`Agent ${a.id} hinzufügen`}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border border-dashed border-gray-600 text-gray-500 hover:border-teal-500 hover:text-teal-300"
            >
              <span>＋</span>
              <span>{a.name}</span>
            </button>
          ))}

          {!loadingAgents && ocAgents.length === 0 && channels.length === 0 && (
            <span className="text-xs text-gray-500">Keine Agents gefunden. Gateway erreichbar?</span>
          )}
        </div>
      </div>

      {/* Add Agent Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-3" onClick={() => setShowAddModal(false)}>
          <div className="bg-gray-900 p-5 rounded-xl border border-gray-700 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold mb-4">Agent hinzufügen</h3>
            <input
              value={addAgentId}
              onChange={e => setAddAgentId(e.target.value)}
              placeholder="Agent-ID (z.B. video, main)"
              className="w-full mb-3 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-teal-500"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleAddManual()}
            />
            <input
              value={addAgentName}
              onChange={e => setAddAgentName(e.target.value)}
              placeholder="Anzeigename (optional)"
              className="w-full mb-4 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-teal-500"
              onKeyDown={e => e.key === 'Enter' && handleAddManual()}
            />
            <div className="flex gap-2">
              <button onClick={handleAddManual} disabled={!addAgentId.trim()}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors">
                Hinzufügen
              </button>
              <button onClick={() => setShowAddModal(false)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors">
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main chat layout */}
      {selectedChannel && (
        <div className="flex gap-4 relative" style={{ height: 'calc(100vh - 220px)' }}>
          {/* Desktop Sidebar */}
          <div className="hidden md:flex w-64 shrink-0 bg-gray-900 rounded-xl border border-gray-800 flex-col overflow-hidden">
            <div className="p-3 border-b border-gray-800 flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-300 truncate">{currentChannel?.name}</span>
              <button onClick={() => setShowNew(!showNew)}
                className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 rounded text-xs font-medium transition-colors shrink-0">
                + Neu
              </button>
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

          {/* Mobile Sidebar Overlay */}
          {sidebarOpen && (
            <div className="fixed inset-0 bg-black/60 z-50 md:hidden" onClick={() => setSidebarOpen(false)}>
              <div className="absolute top-0 left-0 w-80 max-w-[90vw] h-full bg-gray-900 border-r border-gray-800 flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="p-3 border-b border-gray-800 flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-300">{currentChannel?.name}</span>
                  <div className="flex gap-2">
                    <button onClick={() => setShowNew(!showNew)} className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 rounded text-xs font-medium">+ Neu</button>
                    <button onClick={() => setSidebarOpen(false)} className="text-gray-400 hover:text-white">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
                {showNew && (
                  <div className="p-3 border-b border-gray-800 flex gap-2">
                    <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Titel (optional)"
                      className="flex-1 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-white focus:outline-none focus:border-emerald-500"
                      onKeyDown={e => e.key === 'Enter' && handleNewConvo()} />
                    <button onClick={handleNewConvo} className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 rounded text-xs">OK</button>
                  </div>
                )}
                <div className="flex-1 overflow-y-auto">
                  {convos.map(c => (
                    <div key={c.id} onClick={() => { setSelected(c.id); setSidebarOpen(false) }}
                      className={`px-3 py-2 cursor-pointer border-b border-gray-800/50 flex items-center gap-2 hover:bg-gray-800/50 group ${selected === c.id ? 'bg-gray-800' : ''}`}>
                      {c.has_unanswered === 1 && <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-white truncate">{c.title}</div>
                        <div className="text-[10px] text-gray-500">{new Date(c.created_at + 'Z').toLocaleString('de-DE')}</div>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); handleDeleteConvo(c.id) }}
                        className="text-gray-600 hover:text-red-400 text-xs opacity-0 group-hover:opacity-100">🗑️</button>
                    </div>
                  ))}
                  {convos.length === 0 && <p className="text-gray-500 text-center py-6 text-xs">Keine Unterhaltungen</p>}
                </div>
              </div>
            </div>
          )}

          {/* Chat area */}
          <div className="flex-1 bg-gray-900 rounded-xl border border-gray-800 flex flex-col overflow-hidden">
            {selected ? (
              <>
                <div className="p-3 border-b border-gray-800 flex items-center gap-2">
                  <span className="text-sm">🐢</span>
                  <h3 className="text-sm font-semibold text-gray-300 truncate flex-1">{convos.find(c => c.id === selected)?.title}</h3>
                  {currentChannel?.model_id && (
                    <span className="text-[10px] bg-teal-900/50 text-teal-300 px-2 py-0.5 rounded-full">
                      {currentChannel.model_id.replace(/^agent:/, '')}
                    </span>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {messages.map(m => (
                    <div key={m.id} className={`flex ${m.author === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[75%] px-3 py-2 rounded-xl text-sm group relative ${m.author === 'user' ? 'bg-emerald-700/40 text-emerald-100' : 'bg-gray-800 text-gray-200'}`}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-semibold uppercase tracking-wide opacity-60">
                            {m.author === 'user' ? '👤 Du' : '🐢 Agent'}
                          </span>
                          {m.task_ref && <span className="text-[10px] bg-yellow-900/50 text-yellow-300 px-1.5 rounded">Task #{m.task_ref}</span>}
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-auto">
                            {m.author !== 'user' && (
                              <button onClick={() => handleCreateTaskFromMessage(m)} className="text-gray-400 hover:text-blue-400 text-[10px]" title="Task erstellen">📋</button>
                            )}
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
                <form onSubmit={handleSend} className="p-3 border-t border-gray-800 space-y-2">
                  {selectedFile && (
                    <div className="flex items-center gap-2 p-2 bg-gray-800 rounded-lg text-xs">
                      <span className="text-gray-400">📄</span>
                      <span className="flex-1 truncate">{selectedFile.name}</span>
                      <span className="text-gray-500">({formatFileSize(selectedFile.size)})</span>
                      <button type="button" onClick={() => { setSelectedFile(null); fileInputRef.current.value = '' }} className="text-red-400 hover:text-red-300 px-1">✕</button>
                    </div>
                  )}
                  <div className="flex flex-col md:flex-row gap-2">
                    <div className="flex gap-2 flex-1">
                      <input value={taskRef} onChange={e => setTaskRef(e.target.value)} placeholder="Task #"
                        className="w-16 px-2 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white focus:outline-none focus:border-yellow-500" />
                      <input value={text} onChange={e => setText(e.target.value)} placeholder="Nachricht schreiben..."
                        className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500" />
                      <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" />
                      <button type="button" onClick={() => fileInputRef.current?.click()}
                        className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors" title="Datei anhängen">📎</button>
                    </div>
                    <button type="submit" disabled={sending}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors">
                      {sending ? '⏳' : 'Senden'}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-500 text-sm p-6 text-center">
                <span className="text-3xl">🐢</span>
                <p>Wähle einen Agent und starte eine Unterhaltung</p>
                {convos.length === 0 && (
                  <button onClick={() => setShowNew(true)} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-xs font-medium text-white transition-colors">
                    + Neue Unterhaltung
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <CardModal
        isOpen={showCreateTask}
        onClose={() => setShowCreateTask(false)}
        mode="create"
        defaultColumnName="backlog"
        defaultTitle={taskTitle}
        defaultDescription={taskFromMessage}
        onSave={() => { setShowCreateTask(false); setTaskFromMessage(''); setTaskTitle('') }}
      />
    </div>
  )
}
