import React, { useState, useEffect } from 'react'
import { social, context } from '../api'

const CHANNEL_TYPES = ['LinkedIn', 'Instagram', 'X', 'Newsletter', 'Blog', 'TikTok', 'YouTube', 'Sonstiges']
const STATUS_OPTIONS = ['draft', 'ready', 'published']
const STATUS_COLORS = {
  draft: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  ready: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  published: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
}

export default function Social({ projectId }) {
  const [leftView, setLeftView] = useState('channels') // 'channels' | 'folders'
  // Channels
  const [channels, setChannels] = useState([])
  const [editingChannel, setEditingChannel] = useState(null)
  const [channelForm, setChannelForm] = useState({ name: '', type: 'LinkedIn', config: '' })
  const [showChannelForm, setShowChannelForm] = useState(false)
  // Folders & Assets
  const [folders, setFolders] = useState([])
  const [selectedFolder, setSelectedFolder] = useState(null)
  const [assets, setAssets] = useState([])
  const [selectedAsset, setSelectedAsset] = useState(null)
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  // Asset form
  const [assetForm, setAssetForm] = useState({ title: '', content_text: '', image_prompt: '', status: 'draft', notes: '', target_channels: [] })
  const [showAssetForm, setShowAssetForm] = useState(false)
  // Profile
  const [profile, setProfile] = useState(null)
  const [profileForm, setProfileForm] = useState({ topics: '', target_audience: '', tone: '', notes: '' })
  const [showProfile, setShowProfile] = useState(false)

  useEffect(() => {
    if (!projectId) return
    loadChannels()
    loadFolders()
  }, [projectId])

  useEffect(() => {
    if (selectedFolder && projectId) loadAssets()
  }, [selectedFolder, projectId])

  const loadChannels = async () => {
    try { setChannels(await social.channels(projectId)) } catch (e) { console.error(e) }
  }
  const loadFolders = async () => {
    try { setFolders(await social.folders(projectId)) } catch (e) { console.error(e) }
  }
  const loadAssets = async () => {
    try { setAssets(await social.assets(projectId, selectedFolder)) } catch (e) { console.error(e) }
  }

  // Channel CRUD
  const handleSaveChannel = async () => {
    if (!channelForm.name.trim()) return
    try {
      if (editingChannel) {
        await social.updateChannel(projectId, editingChannel.id, channelForm)
      } else {
        await social.createChannel(projectId, channelForm)
      }
      setShowChannelForm(false)
      setEditingChannel(null)
      setChannelForm({ name: '', type: 'LinkedIn', config: '' })
      await loadChannels()
    } catch (e) { alert('Fehler: ' + e.message) }
  }

  const handleDeleteChannel = async (id) => {
    if (!confirm('Kanal löschen?')) return
    try { await social.deleteChannel(projectId, id); await loadChannels() } catch (e) { alert(e.message) }
  }

  const startEditChannel = (ch) => {
    setEditingChannel(ch)
    setChannelForm({ name: ch.name, type: ch.type, config: ch.config || '' })
    setShowChannelForm(true)
  }

  // Folder CRUD
  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return
    try {
      await social.createFolder(projectId, { name: newFolderName })
      setNewFolderName('')
      setShowNewFolder(false)
      await loadFolders()
    } catch (e) { alert(e.message) }
  }

  const handleDeleteFolder = async (id) => {
    if (!confirm('Ordner löschen?')) return
    try {
      await social.deleteFolder(projectId, id)
      if (selectedFolder === id) { setSelectedFolder(null); setAssets([]) }
      await loadFolders()
    } catch (e) { alert(e.message) }
  }

  // Asset CRUD
  const openNewAsset = () => {
    setSelectedAsset(null)
    setAssetForm({ title: '', content_text: '', image_prompt: '', status: 'draft', notes: '', target_channels: [] })
    setShowAssetForm(true)
  }

  const openEditAsset = (asset) => {
    setSelectedAsset(asset)
    setAssetForm({
      title: asset.title || '',
      content_text: asset.content_text || '',
      image_prompt: asset.image_prompt || '',
      status: asset.status || 'draft',
      notes: asset.notes || '',
      target_channels: asset.target_channels || []
    })
    setShowAssetForm(true)
  }

  const handleSaveAsset = async () => {
    if (!assetForm.title.trim()) return
    try {
      const data = { ...assetForm, folder_id: selectedFolder }
      if (selectedAsset) {
        await social.updateAsset(projectId, selectedAsset.id, data)
      } else {
        await social.createAsset(projectId, data)
      }
      setShowAssetForm(false)
      setSelectedAsset(null)
      await loadAssets()
    } catch (e) { alert(e.message) }
  }

  const handleDeleteAsset = async (id) => {
    if (!confirm('Asset löschen?')) return
    try {
      await social.deleteAsset(projectId, id)
      setShowAssetForm(false)
      setSelectedAsset(null)
      await loadAssets()
    } catch (e) { alert(e.message) }
  }

  const toggleTargetChannel = (chId) => {
    setAssetForm(prev => ({
      ...prev,
      target_channels: prev.target_channels.includes(chId)
        ? prev.target_channels.filter(id => id !== chId)
        : [...prev.target_channels, chId]
    }))
  }

  if (!projectId) return <div className="text-gray-500 text-center py-20">Bitte wähle ein Projekt aus.</div>

  return (
    <div className="flex gap-4" style={{ height: 'calc(100vh - 120px)' }}>
      {/* Left Panel */}
      <div className="w-80 shrink-0 bg-gray-900 rounded-xl border border-gray-800 flex flex-col overflow-hidden">
        {/* View Switcher */}
        <div className="p-3 border-b border-gray-800">
          <select value={leftView} onChange={e => setLeftView(e.target.value)}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500">
            <option value="channels">Kanäle</option>
            <option value="folders">Ordner & Assets</option>
          </select>
        </div>

        {leftView === 'channels' ? (
          /* Channels View */
          <div className="flex-1 overflow-y-auto">
            <div className="p-3 border-b border-gray-800 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-300">Kanäle</span>
              <button onClick={() => { setEditingChannel(null); setChannelForm({ name: '', type: 'LinkedIn', config: '' }); setShowChannelForm(true) }}
                className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 rounded text-xs font-medium transition-colors">+ Kanal</button>
            </div>
            <div className="space-y-1 p-2">
              {channels.map(ch => (
                <div key={ch.id} className="flex items-center gap-2 p-2 bg-gray-800 rounded-lg group">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white truncate">{ch.name}</div>
                    <div className="text-xs text-gray-500">{ch.type}</div>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => startEditChannel(ch)} className="text-gray-400 hover:text-blue-400 text-xs">✏️</button>
                    <button onClick={() => handleDeleteChannel(ch.id)} className="text-gray-400 hover:text-red-400 text-xs">🗑️</button>
                  </div>
                </div>
              ))}
              {channels.length === 0 && <p className="text-gray-500 text-xs text-center py-4">Keine Kanäle</p>}
            </div>
            {/* Profile Button */}
            <div className="p-3 border-t border-gray-800">
              <button onClick={async () => {
                try {
                  const p = await social.profile(projectId)
                  setProfile(p)
                  setProfileForm({ topics: p.topics || '', target_audience: p.target_audience || '', tone: p.tone || '', notes: p.notes || '' })
                } catch { setProfileForm({ topics: '', target_audience: '', tone: '', notes: '' }) }
                setShowProfile(true)
              }} className="w-full px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs text-gray-300 transition-colors">
                Content-Profil bearbeiten
              </button>
            </div>
          </div>
        ) : (
          /* Folders View */
          <div className="flex-1 overflow-y-auto">
            <div className="p-3 border-b border-gray-800 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-300">Ordner</span>
              <button onClick={() => setShowNewFolder(true)}
                className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 rounded text-xs font-medium transition-colors">+ Ordner</button>
            </div>
            {showNewFolder && (
              <div className="p-3 border-b border-gray-800 flex gap-2">
                <input value={newFolderName} onChange={e => setNewFolderName(e.target.value)} placeholder="Ordner-Name"
                  className="flex-1 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-white focus:outline-none focus:border-emerald-500"
                  onKeyDown={e => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') setShowNewFolder(false) }} autoFocus />
                <button onClick={handleCreateFolder} className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 rounded text-xs">OK</button>
              </div>
            )}
            <div className="space-y-0">
              {folders.map(f => (
                <div key={f.id} onClick={() => setSelectedFolder(f.id)}
                  className={`px-4 py-3 cursor-pointer border-b border-gray-800/50 flex items-center gap-2 hover:bg-gray-800/50 transition-colors group ${selectedFolder === f.id ? 'bg-gray-800' : ''}`}>
                  <span className="text-sm">📁</span>
                  <span className="flex-1 text-sm text-white truncate">{f.name}</span>
                  <button onClick={(e) => { e.stopPropagation(); handleDeleteFolder(f.id) }}
                    className="text-gray-600 hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity">🗑️</button>
                </div>
              ))}
              {folders.length === 0 && <p className="text-gray-500 text-xs text-center py-4">Keine Ordner</p>}
            </div>
          </div>
        )}
      </div>

      {/* Right Panel */}
      <div className="flex-1 bg-gray-900 rounded-xl border border-gray-800 flex flex-col overflow-hidden">
        {leftView === 'folders' && selectedFolder ? (
          <>
            <div className="p-4 border-b border-gray-800 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-300">
                {folders.find(f => f.id === selectedFolder)?.name || 'Assets'}
              </h3>
              <button onClick={openNewAsset}
                className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-xs font-medium transition-colors">+ Neues Asset</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {assets.length === 0 ? (
                <div className="text-center text-gray-500 py-20">
                  <div className="text-4xl mb-3">📦</div>
                  <div>Keine Assets in diesem Ordner</div>
                </div>
              ) : (
                <div className="space-y-3">
                  {assets.map(asset => (
                    <div key={asset.id} onClick={() => openEditAsset(asset)}
                      className="p-4 bg-gray-800 rounded-lg border border-gray-700 hover:border-gray-600 cursor-pointer transition-colors group">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="text-sm font-medium text-white truncate">{asset.title}</h4>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full border ${STATUS_COLORS[asset.status] || STATUS_COLORS.draft}`}>
                              {asset.status}
                            </span>
                          </div>
                          {asset.content_text && (
                            <p className="text-xs text-gray-400 line-clamp-2">{asset.content_text}</p>
                          )}
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); handleDeleteAsset(asset.id) }}
                          className="text-gray-600 hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity ml-2">🗑️</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : leftView === 'channels' ? (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <div className="text-4xl mb-3">📱</div>
              <div>Kanäle verwalten</div>
              <div className="text-xs mt-1">Erstelle und bearbeite Social-Media-Kanäle</div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <div className="text-4xl mb-3">📂</div>
              <div>Wähle einen Ordner</div>
            </div>
          </div>
        )}
      </div>

      {/* Channel Form Modal */}
      {showChannelForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-3" onClick={() => setShowChannelForm(false)}>
          <div className="bg-gray-900 p-6 rounded-xl border border-gray-700 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">{editingChannel ? 'Kanal bearbeiten' : 'Neuer Kanal'}</h3>
            <input value={channelForm.name} onChange={e => setChannelForm({ ...channelForm, name: e.target.value })} placeholder="Name"
              className="w-full mb-3 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-emerald-500" autoFocus />
            <select value={channelForm.type} onChange={e => setChannelForm({ ...channelForm, type: e.target.value })}
              className="w-full mb-3 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-emerald-500">
              {CHANNEL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <textarea value={channelForm.config} onChange={e => setChannelForm({ ...channelForm, config: e.target.value })} placeholder="Konfiguration / Notizen (optional)" rows={3}
              className="w-full mb-4 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-emerald-500" />
            <div className="flex gap-2">
              <button onClick={handleSaveChannel} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm font-medium transition-colors">Speichern</button>
              <button onClick={() => setShowChannelForm(false)} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors">Abbrechen</button>
            </div>
          </div>
        </div>
      )}

      {/* Asset Form Modal */}
      {showAssetForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-3" onClick={() => setShowAssetForm(false)}>
          <div className="bg-gray-900 p-6 rounded-xl border border-gray-700 w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">{selectedAsset ? 'Asset bearbeiten' : 'Neues Asset'}</h3>
            
            <input value={assetForm.title} onChange={e => setAssetForm({ ...assetForm, title: e.target.value })} placeholder="Titel"
              className="w-full mb-3 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-emerald-500" autoFocus />
            
            <div className="mb-3">
              <label className="text-xs text-gray-400 block mb-1">Content</label>
              <textarea value={assetForm.content_text} onChange={e => setAssetForm({ ...assetForm, content_text: e.target.value })} placeholder="Content-Text..." rows={6}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-emerald-500" />
            </div>

            <div className="mb-3">
              <label className="text-xs text-gray-400 block mb-1">Bild-Prompt</label>
              <input value={assetForm.image_prompt} onChange={e => setAssetForm({ ...assetForm, image_prompt: e.target.value })} placeholder="Beschreibung für Bildgenerierung..."
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-emerald-500" />
            </div>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Status</label>
                <select value={assetForm.status} onChange={e => setAssetForm({ ...assetForm, status: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-emerald-500">
                  {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            {/* Target Channels */}
            <div className="mb-3">
              <label className="text-xs text-gray-400 block mb-1">Ziel-Kanäle</label>
              <div className="flex flex-wrap gap-2">
                {channels.map(ch => (
                  <button key={ch.id} onClick={() => toggleTargetChannel(ch.id)}
                    className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                      assetForm.target_channels.includes(ch.id) 
                        ? 'bg-emerald-600 border-emerald-500 text-white' 
                        : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
                    }`}>
                    {ch.name}
                  </button>
                ))}
                {channels.length === 0 && <span className="text-xs text-gray-500">Keine Kanäle vorhanden</span>}
              </div>
            </div>

            <div className="mb-4">
              <label className="text-xs text-gray-400 block mb-1">Notizen</label>
              <textarea value={assetForm.notes} onChange={e => setAssetForm({ ...assetForm, notes: e.target.value })} placeholder="Interne Notizen..." rows={2}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-emerald-500" />
            </div>

            <div className="flex justify-between">
              <div>
                {selectedAsset && (
                  <button onClick={() => handleDeleteAsset(selectedAsset.id)}
                    className="px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-sm transition-colors">Löschen</button>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowAssetForm(false)} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors">Abbrechen</button>
                <button onClick={handleSaveAsset} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm font-medium transition-colors">Speichern</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Profile Modal */}
      {showProfile && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-3" onClick={() => setShowProfile(false)}>
          <div className="bg-gray-900 p-6 rounded-xl border border-gray-700 w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">Content-Profil</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Themen</label>
                <input value={profileForm.topics} onChange={e => setProfileForm({ ...profileForm, topics: e.target.value })} placeholder="Technologie, Marketing, ..."
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-emerald-500" />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Zielgruppe</label>
                <textarea value={profileForm.target_audience} onChange={e => setProfileForm({ ...profileForm, target_audience: e.target.value })} rows={2}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-emerald-500" />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Tonalität</label>
                <input value={profileForm.tone} onChange={e => setProfileForm({ ...profileForm, tone: e.target.value })} placeholder="Professionell, Locker, ..."
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-emerald-500" />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Notizen</label>
                <textarea value={profileForm.notes} onChange={e => setProfileForm({ ...profileForm, notes: e.target.value })} rows={3}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-emerald-500" />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={async () => {
                try { await social.updateProfile(projectId, profileForm); setShowProfile(false) } catch (e) { alert(e.message) }
              }} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm font-medium transition-colors">Speichern</button>
              <button onClick={() => setShowProfile(false)} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors">Abbrechen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
