import React, { useState, useEffect } from 'react'
import { contentProfiles } from '../api'

export default function ContentProfilesPanel({ projectId }) {
  const [profiles, setProfiles] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [form, setForm] = useState({ name: '', topics: '', target_audience: '', tone: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (projectId) loadProfiles()
  }, [projectId])

  const loadProfiles = async () => {
    try {
      const list = await contentProfiles.list(projectId)
      setProfiles(list)
      if (list.length > 0 && !selectedId) {
        selectProfile(list[0])
      }
    } catch (e) { console.error('Fehler:', e) }
  }

  const selectProfile = (profile) => {
    setSelectedId(profile.id)
    const topics = typeof profile.topics === 'string' ? JSON.parse(profile.topics || '[]') : (profile.topics || [])
    setForm({
      name: profile.name || '',
      topics: topics.join(', '),
      target_audience: profile.target_audience || '',
      tone: profile.tone || '',
      notes: profile.notes || ''
    })
    setDirty(false)
  }

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }))
    setDirty(true)
  }

  const handleSave = async () => {
    if (!selectedId) return
    setSaving(true)
    try {
      const data = {
        name: form.name,
        topics: form.topics.split(',').map(t => t.trim()).filter(Boolean),
        target_audience: form.target_audience,
        tone: form.tone,
        notes: form.notes
      }
      await contentProfiles.update(projectId, selectedId, data)
      setDirty(false)
      await loadProfiles()
    } catch (e) { alert('Fehler beim Speichern: ' + e.message) }
    finally { setSaving(false) }
  }

  const handleCreate = async () => {
    try {
      const profile = await contentProfiles.create(projectId, { name: 'Neues Profil' })
      await loadProfiles()
      selectProfile(profile)
    } catch (e) { alert('Fehler: ' + e.message) }
  }

  const handleDelete = async () => {
    if (!selectedId) return
    if (profiles.length <= 1) { alert('Mindestens ein Profil muss existieren'); return }
    if (!confirm('Profil wirklich löschen?')) return
    try {
      await contentProfiles.remove(projectId, selectedId)
      setSelectedId(null)
      const list = await contentProfiles.list(projectId)
      setProfiles(list)
      if (list.length > 0) selectProfile(list[0])
    } catch (e) { alert('Fehler: ' + e.message) }
  }

  return (
    <div className="flex gap-4 h-full min-h-0 overflow-hidden">
      {/* Left: Profile list */}
      <div className="w-64 shrink-0 bg-gray-900 rounded-xl border border-gray-800 flex flex-col overflow-hidden">
        <div className="p-3 border-b border-gray-800 flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-300">Profile</span>
          <button onClick={handleCreate}
            className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 rounded text-xs font-medium transition-colors">+ Profil</button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {profiles.map(p => (
            <button key={p.id} onClick={() => selectProfile(p)}
              className={`w-full text-left px-4 py-3 border-b border-gray-800/50 hover:bg-gray-800/50 transition-colors ${
                selectedId === p.id ? 'bg-gray-800 text-emerald-300' : 'text-gray-300'
              }`}>
              <div className="text-sm font-medium truncate">{p.name}</div>
              <div className="text-[10px] text-gray-500 mt-0.5 truncate">
                {(() => {
                  const topics = typeof p.topics === 'string' ? JSON.parse(p.topics || '[]') : (p.topics || [])
                  return topics.length > 0 ? topics.join(', ') : 'Keine Themen'
                })()}
              </div>
            </button>
          ))}
          {profiles.length === 0 && (
            <div className="text-gray-500 text-xs text-center py-8">
              Noch keine Profile. Erstelle eins!
            </div>
          )}
        </div>
      </div>

      {/* Right: Profile form */}
      <div className="flex-1 bg-gray-900 rounded-xl border border-gray-800 flex flex-col overflow-hidden">
        {selectedId ? (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="space-y-4 max-w-2xl">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Profilname</label>
                <input value={form.name} onChange={e => handleChange('name', e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-emerald-500" />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Themen (kommagetrennt)</label>
                <input value={form.topics} onChange={e => handleChange('topics', e.target.value)}
                  placeholder="AI Leadership, Changemanagement, ..."
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-emerald-500" />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Zielgruppe</label>
                <textarea value={form.target_audience} onChange={e => handleChange('target_audience', e.target.value)} rows={2}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-emerald-500" />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Tonalität</label>
                <input value={form.tone} onChange={e => handleChange('tone', e.target.value)}
                  placeholder="Professionell, Locker, ..."
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-emerald-500" />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Notizen</label>
                <textarea value={form.notes} onChange={e => handleChange('notes', e.target.value)} rows={3}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-emerald-500" />
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={handleSave} disabled={!dirty || saving}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors">
                  {saving ? 'Speichern...' : 'Speichern'}
                </button>
                <button onClick={handleDelete}
                  className="px-4 py-2 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded-lg text-sm transition-colors">
                  Löschen
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <div className="text-4xl mb-3">📋</div>
              <div>Wähle ein Profil oder erstelle ein neues</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
