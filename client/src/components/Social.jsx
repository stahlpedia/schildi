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
  // Channel state
  const [channels, setChannels] = useState([])
  const [selectedChannelId, setSelectedChannelId] = useState(null)
  const [showChannelForm, setShowChannelForm] = useState(false)
  const [editingChannel, setEditingChannel] = useState(null)
  const [channelForm, setChannelForm] = useState({ name: '', type: 'LinkedIn', config: '' })
  const [showChannelDropdown, setShowChannelDropdown] = useState(false)

  // Sub-view: 'content' | 'profile'
  const [subView, setSubView] = useState('content')

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
  const [profileForm, setProfileForm] = useState({ topics: '', target_audience: '', tone: '', notes: '' })

  // Mobile: show detail panel
  const [mobileShowDetail, setMobileShowDetail] = useState(false)

  const selectedChannel = channels.find(c => c.id === selectedChannelId)

  useEffect(() => {
    if (!projectId) return
    loadChannels()
  }, [projectId])

  useEffect(() => {
    if (selectedChannelId && projectId) {
      loadFolders()
      loadProfile()
    }
  }, [selectedChannelId, projectId])

  useEffect(() => {
    if (selectedFolder && projectId) loadAssets()
  }, [selectedFolder, projectId])

  const loadChannels = async () => {
    try {
      const list = await social.channels(projectId)
      setChannels(list)
      if (list.length > 0 && !selectedChannelId) setSelectedChannelId(list[0].id)
    } catch (e) { console.error(e) }
  }

  const loadFolders = async () => {
    try {
      const list = await social.folders(projectId, selectedChannelId)
      setFolders(list)
      setSelectedFolder(null)
      setAssets([])
    } catch (e) { console.error(e) }
  }

  const loadAssets = async () => {
    try { setAssets(await social.assets(projectId, selectedFolder)) } catch (e) { console.error(e) }
  }

  const loadProfile = async () => {
    try {
      const p = await social.profile(projectId)
      setProfileForm({
        topics: Array.isArray(p.topics) ? p.topics.join(', ') : (p.topics || ''),
        target_audience: p.targetAudience || p.target_audience || '',
        tone: p.tone || '',
        notes: p.notes || ''
      })
    } catch {
      setProfileForm({ topics: '', target_audience: '', tone: '', notes: '' })
    }
  }

  // Channel CRUD
  const handleSaveChannel = async () => {
    if (!channelForm.name.trim()) return
    try {
      if (editingChannel) {
        await social.updateChannel(projectId, editingChannel.id, channelForm)
      } else {
        const created = await social.createChannel(projectId, channelForm)
        setSelectedChannelId(created.id)
      }
      setShowChannelForm(false)
      setEditingChannel(null)
      setChannelForm({ name: '', type: 'LinkedIn', config: '' })
      await loadChannels()
    } catch (e) { alert('Fehler: ' + e.message) }
  }

  const handleDeleteChannel = async (id) => {
    if (!confirm('Kanal löschen?')) return
    try {
      await social.deleteChannel(projectId, id)
      if (selectedChannelId === id) setSelectedChannelId(null)
      await loadChannels()
    } catch (e) { alert(e.message) }
  }

  // Folder CRUD
  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return
    try {
      await social.createFolder(projectId, { name: newFolderName, channel_id: selectedChannelId })
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
      content_text: asset.content_text || asset.content || '',
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

  const handleSaveProfile = async () => {
    try {
      await social.updateProfile(projectId, {
        topics: profileForm.topics.split(',').map(t => t.trim()).filter(Boolean),
        targetAudience: profileForm.target_audience,
        tone: profileForm.tone,
        notes: profileForm.notes
      })
    } catch (e) { alert(e.message) }
  }

  if (!projectId) return <div className="text-gray-500 text-center py-20">Bitte wähle ein Projekt aus.</div>

  return (
    <div className="w-full max-w-full overflow-hidden flex flex-col" style={{ height: 'calc(100vh - 120px)' }}>
      {/* Top Bar: Channel selector + sub-view tabs */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 bg-gray-900 rounded-xl border border-gray-800 px-4 py-3 mb-4 shrink-0">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* Channel Selector */}
          <div className="relative flex-1 min-w-0">
            <button
              onClick={() => setShowChannelDropdown(!showChannelDropdown)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white hover:border-gray-600 transition-colors"
            >
              <span className="truncate">{selectedChannel ? selectedChannel.name : 'Kanal wählen...'}</span>
              <svg className="w-3 h-3 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showChannelDropdown && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowChannelDropdown(false)} />
                <div className="absolute top-full left-0 mt-1 w-full bg-gray-800 border border-gray-700 rounded-xl shadow-xl z-50 py-1 max-h-80 overflow-y-auto">
                  {channels.map(ch => (
                    <button key={ch.id}
                      onClick={() => { setSelectedChannelId(ch.id); setShowChannelDropdown(false); setSelectedFolder(null); setAssets([]) }}
                      className={`w-full flex items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-gray-700 transition-colors ${
                        selectedChannelId === ch.id ? 'bg-gray-700/50 text-emerald-300' : 'text-gray-200'
                      }`}>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="truncate">{ch.name}</span>
                        <span className="text-xs text-gray-500">{ch.type}</span>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button onClick={(e) => { e.stopPropagation(); setEditingChannel(ch); setChannelForm({ name: ch.name, type: ch.type, config: ch.config || '' }); setShowChannelForm(true); setShowChannelDropdown(false) }}
                          className="text-gray-500 hover:text-blue-400 p-1">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); handleDeleteChannel(ch.id); setShowChannelDropdown(false) }}
                          className="text-gray-500 hover:text-red-400 p-1">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                        </button>
                      </div>
                    </button>
                  ))}
                  <div className="border-t border-gray-700 mt-1 pt-1">
                    <button onClick={() => { setShowChannelDropdown(false); setEditingChannel(null); setChannelForm({ name: '', type: 'LinkedIn', config: '' }); setShowChannelForm(true) }}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-left text-sm text-emerald-400 hover:bg-gray-700 transition-colors">
                      <span className="text-lg leading-none">+</span>
                      <span>Neuer Kanal</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Sub-view tabs */}
        {selectedChannel && (
          <div className="flex bg-gray-800 rounded-lg border border-gray-700 overflow-hidden shrink-0">
            <button onClick={() => setSubView('content')}
              className={`px-4 py-2 text-xs font-medium transition-colors ${subView === 'content' ? 'bg-emerald-600 text-white' : 'text-gray-400 hover:text-white'}`}>
              Content
            </button>
            <button onClick={() => setSubView('profile')}
              className={`px-4 py-2 text-xs font-medium transition-colors ${subView === 'profile' ? 'bg-emerald-600 text-white' : 'text-gray-400 hover:text-white'}`}>
              Content-Profil
            </button>
          </div>
        )}
      </div>

      {/* Main content area */}
      {!selectedChannel ? (
        <div className="flex-1 flex items-center justify-center text-gray-500 bg-gray-900 rounded-xl border border-gray-800">
          <div className="text-center">
            <div className="text-4xl mb-3">📱</div>
            <div>Wähle oder erstelle einen Kanal</div>
          </div>
        </div>
      ) : subView === 'profile' ? (
        /* Profile Editor */
        <div className="flex-1 bg-gray-900 rounded-xl border border-gray-800 p-4 md:p-6 overflow-y-auto">
          <h3 className="text-lg font-bold mb-4 text-white">Content-Profil: {selectedChannel.name}</h3>
          <div className="space-y-4 max-w-2xl">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Themen (kommagetrennt)</label>
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
            <button onClick={handleSaveProfile}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm font-medium transition-colors">Speichern</button>
          </div>
        </div>
      ) : (
        /* Content: Folders + Assets */
        <div className="flex-1 flex gap-4 min-h-0 overflow-hidden">
          {/* Left: Folders */}
          <div className={`${mobileShowDetail ? 'hidden' : 'flex'} md:flex w-full md:w-80 md:shrink-0 bg-gray-900 rounded-xl border border-gray-800 flex-col overflow-hidden`}>
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
            <div className="flex-1 overflow-y-auto">
              {folders.map(f => (
                <div key={f.id} onClick={() => { setSelectedFolder(f.id); setMobileShowDetail(true) }}
                  className={`px-4 py-3 cursor-pointer border-b border-gray-800/50 flex items-center gap-2 hover:bg-gray-800/50 transition-colors group ${selectedFolder === f.id ? 'bg-gray-800' : ''}`}>
                  <svg className="w-4 h-4 text-gray-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>
                  <span className="flex-1 text-sm text-white truncate">{f.name}</span>
                  <span className="text-xs text-gray-500">{f.asset_count || 0}</span>
                  <button onClick={(e) => { e.stopPropagation(); handleDeleteFolder(f.id) }}
                    className="text-gray-600 hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                  </button>
                </div>
              ))}
              {folders.length === 0 && <p className="text-gray-500 text-xs text-center py-8">Keine Ordner in diesem Kanal</p>}
            </div>
          </div>

          {/* Right: Assets */}
          <div className={`${!mobileShowDetail ? 'hidden' : 'flex'} md:flex flex-1 bg-gray-900 rounded-xl border border-gray-800 flex-col overflow-hidden`}>
            {selectedFolder ? (
              <>
                <div className="p-4 border-b border-gray-800 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <button onClick={() => setMobileShowDetail(false)} className="md:hidden text-gray-400 hover:text-white shrink-0">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
                    </button>
                    <h3 className="text-lg font-semibold text-gray-300 truncate">
                      {folders.find(f => f.id === selectedFolder)?.name || 'Assets'}
                    </h3>
                  </div>
                  <button onClick={openNewAsset}
                    className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-xs font-medium transition-colors shrink-0">+ Asset</button>
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
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <h4 className="text-sm font-medium text-white truncate">{asset.title}</h4>
                                <span className={`text-[10px] px-2 py-0.5 rounded-full border ${STATUS_COLORS[asset.status] || STATUS_COLORS.draft}`}>
                                  {asset.status}
                                </span>
                              </div>
                              {(asset.content_text || asset.content) && (
                                <p className="text-xs text-gray-400 line-clamp-2">{asset.content_text || asset.content}</p>
                              )}
                            </div>
                            <button onClick={(e) => { e.stopPropagation(); handleDeleteAsset(asset.id) }}
                              className="text-gray-600 hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-500">
                <div className="text-center">
                  <button onClick={() => setMobileShowDetail(false)} className="md:hidden mb-4 text-gray-400 hover:text-white">
                    <svg className="w-5 h-5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
                  </button>
                  <div className="text-4xl mb-3">📂</div>
                  <div>Wähle einen Ordner</div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

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
    </div>
  )
}
