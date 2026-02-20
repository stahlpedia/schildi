import React, { useState, useEffect, useRef } from 'react'
import { channel, chatChannels, attachments } from '../api'
import CardModal from './CardModal'

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
  // Channel creation
  const [showChannelModal, setShowChannelModal] = useState(false)
  const [newChName, setNewChName] = useState('')
  const [newChModelId, setNewChModelId] = useState('')
  const [models, setModels] = useState([])
  // Channel editing
  const [editingChannel, setEditingChannel] = useState(null)
  const [editChannelName, setEditChannelName] = useState('')
  // CardModal for creating tasks from messages
  const [showCreateTask, setShowCreateTask] = useState(false)
  const [taskFromMessage, setTaskFromMessage] = useState('')
  const [taskTitle, setTaskTitle] = useState('')
  const fileInputRef = useRef(null)
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

  const handleEditChannel = (channel) => {
    setEditingChannel(channel.id)
    setEditChannelName(channel.name)
  }

  const handleSaveChannelEdit = async () => {
    if (!editChannelName.trim() || !editingChannel) return
    try {
      await chatChannels.update(editingChannel, { name: editChannelName })
      setEditingChannel(null)
      setEditChannelName('')
      await loadChannels()
    } catch (e) {
      alert('Fehler beim Umbenennen: ' + e.message)
    }
  }

  const handleCancelChannelEdit = () => {
    setEditingChannel(null)
    setEditChannelName('')
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
    if ((!text.trim() && !selectedFile) || !selected || sending) return
    setSending(true)
    
    try {
      // Send message first
      const response = await channel.sendMessage(selected, 'user', text || 'Datei gesendet', taskRef || undefined)
      
      // If there's a file and we got a message ID, upload the attachment
      if (selectedFile && response?.id) {
        await attachments.upload(selectedFile, 'message', response.id)
      }
      
      setText('')
      setTaskRef('')
      setSelectedFile(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      
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
    } catch (error) {
      setSending(false)
      alert('Fehler beim Senden: ' + error.message)
    }
  }

  const handleFileSelect = (event) => {
    const file = event.target.files[0]
    if (file) {
      setSelectedFile(file)
    }
  }

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
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

  const handleCreateTaskFromMessage = (message) => {
    const lines = message.text.split('\n')
    const firstLine = lines[0] || message.text
    const title = firstLine.length > 60 ? firstLine.substring(0, 60) + '...' : firstLine
    
    setTaskTitle(title)
    setTaskFromMessage(message.text)
    setShowCreateTask(true)
  }

  const handleTaskSave = () => {
    setShowCreateTask(false)
    setTaskFromMessage('')
    setTaskTitle('')
  }

  return (
    <div>
      {/* Channel selector bar */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 px-4 py-3 mb-4">
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 mb-3">
          <div className="flex items-center gap-3 flex-1">
            <button 
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="md:hidden p-2 text-gray-400 hover:text-white transition-colors"
              title="Conversations toggle"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </button>
            <span className="text-lg">💬</span>
            <span className="text-sm font-semibold text-gray-300">Channels</span>
            {currentChannel?.model_id && (
              <span className="hidden md:inline text-[10px] bg-blue-900/50 text-blue-300 px-2 py-1 rounded-full">{currentChannel.model_id}</span>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setShowChannelModal(true)}
              className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-xs font-medium transition-colors">+ Channel</button>
            {selectedChannel && currentChannel && !currentChannel.is_default && (
              <button onClick={handleDeleteChannel}
                className="px-3 py-2 bg-gray-700 hover:bg-red-600 rounded-lg text-xs transition-colors">🗑️ Löschen</button>
            )}
          </div>
        </div>
        
        {/* Channel Dropdown Selector */}
        <div className="flex items-center gap-2">
          {editingChannel ? (
            <div className="flex items-center gap-2 flex-1">
              <input
                value={editChannelName}
                onChange={e => setEditChannelName(e.target.value)}
                className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500"
                onKeyDown={e => {
                  if (e.key === 'Enter') handleSaveChannelEdit()
                  if (e.key === 'Escape') handleCancelChannelEdit()
                }}
                autoFocus
              />
              <button onClick={handleSaveChannelEdit} className="text-emerald-400 hover:text-emerald-300 text-sm px-2" title="Speichern">✓</button>
              <button onClick={handleCancelChannelEdit} className="text-gray-400 hover:text-gray-300 text-sm px-2" title="Abbrechen">✕</button>
            </div>
          ) : (
            <>
              <select
                value={selectedChannel || ''}
                onChange={e => setSelectedChannel(Number(e.target.value))}
                className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500 appearance-none cursor-pointer"
              >
                {channels.map(ch => (
                  <option key={ch.id} value={ch.id}>
                    {ch.type === 'model' ? '🤖' : '🐢'} {ch.name}
                  </option>
                ))}
              </select>
              {currentChannel && !currentChannel.is_default && currentChannel.type !== 'agent' && (
                <button onClick={() => handleEditChannel(currentChannel)} className="text-gray-400 hover:text-blue-400 text-sm px-2" title="Umbenennen">✏️</button>
              )}
            </>
          )}
        </div>
        
        {currentChannel?.model_id && (
          <span className="md:hidden text-[10px] bg-blue-900/50 text-blue-300 px-2 py-1 rounded-full text-center mt-2 inline-block">{currentChannel.model_id}</span>
        )}
      </div>

      {/* Channel creation modal */}
      {showChannelModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-3 md:p-0" onClick={() => setShowChannelModal(false)}>
          <div className="bg-gray-900 p-4 md:p-6 rounded-xl border border-gray-700 w-full max-w-md" onClick={e => e.stopPropagation()}>
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
        <div className="flex gap-4 relative" style={{ height: 'calc(100vh - 180px)' }}>
          {/* Desktop Sidebar */}
          <div className="hidden md:flex w-72 shrink-0 bg-gray-900 rounded-xl border border-gray-800 flex-col overflow-hidden">
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

          {/* Mobile Sidebar Overlay */}
          {sidebarOpen && (
            <div className="fixed inset-0 bg-black/60 z-50 md:hidden" onClick={() => setSidebarOpen(false)}>
              <div className="absolute top-0 left-0 w-80 max-w-[90vw] h-full bg-gray-900 border-r border-gray-800 flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="p-3 border-b border-gray-800 flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-300">Unterhaltungen</span>
                  <div className="flex gap-2">
                    <button onClick={() => setShowNew(!showNew)} className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 rounded text-xs font-medium transition-colors">+ Neu</button>
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
                    <button onClick={handleNewConvo} className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 rounded text-xs transition-colors">OK</button>
                  </div>
                )}
                <div className="flex-1 overflow-y-auto">
                  {convos.map(c => (
                    <div key={c.id} onClick={() => { setSelected(c.id); setSidebarOpen(false); }}
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
            </div>
          )}

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
                  {/* File Selection Display */}
                  {selectedFile && (
                    <div className="flex items-center gap-2 p-2 bg-gray-800 rounded-lg text-xs">
                      <span className="text-gray-400">📄</span>
                      <span className="flex-1 truncate">{selectedFile.name}</span>
                      <span className="text-gray-500">({formatFileSize(selectedFile.size)})</span>
                      <button 
                        type="button"
                        onClick={() => {setSelectedFile(null); fileInputRef.current.value = ''}}
                        className="text-red-400 hover:text-red-300 px-1"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                  
                  {/* Input Area */}
                  <div className="flex flex-col md:flex-row gap-2">
                    <div className="flex gap-2 flex-1">
                      {currentChannel?.type === 'agent' && (
                        <input value={taskRef} onChange={e => setTaskRef(e.target.value)} placeholder="Task #"
                          className="w-16 px-2 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white focus:outline-none focus:border-yellow-500" />
                      )}
                      <input value={text} onChange={e => setText(e.target.value)} placeholder="Nachricht schreiben..."
                        className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500" />
                      
                      {/* File Upload Button */}
                      <input 
                        type="file" 
                        ref={fileInputRef}
                        onChange={handleFileSelect}
                        className="hidden"
                      />
                      <button 
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors"
                        title="Datei anhängen"
                      >
                        📎
                      </button>
                    </div>
                    <button type="submit" disabled={sending}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors">
                      {sending ? '⏳' : 'Senden'}
                    </button>
                  </div>
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

      {/* CardModal for creating tasks from messages */}
      <CardModal 
        isOpen={showCreateTask}
        onClose={() => setShowCreateTask(false)}
        mode="create"
        defaultColumnName="backlog"
        defaultTitle={taskTitle}
        defaultDescription={taskFromMessage}
        onSave={handleTaskSave}
      />
    </div>
  )
}
