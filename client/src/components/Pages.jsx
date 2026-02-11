import React, { useState, useEffect, useRef, useCallback } from 'react'
import { pages } from '../api'

// Load CodeMirror from CDN
function useCodeMirror(containerRef, value, onChange, active) {
  const editorRef = useRef(null)
  const [loaded, setLoaded] = useState(!!window.CodeMirror)

  useEffect(() => {
    if (window.CodeMirror) { setLoaded(true); return }
    const css = document.createElement('link')
    css.rel = 'stylesheet'
    css.href = 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.18/codemirror.min.css'
    document.head.appendChild(css)
    const themeCss = document.createElement('link')
    themeCss.rel = 'stylesheet'
    themeCss.href = 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.18/theme/dracula.min.css'
    document.head.appendChild(themeCss)
    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.18/codemirror.min.js'
    script.onload = () => {
      const modes = ['xml', 'javascript', 'css', 'htmlmixed']
      let loadedCount = 0
      modes.forEach(m => {
        const s = document.createElement('script')
        s.src = `https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.18/mode/${m}/${m}.min.js`
        s.onload = () => { if (++loadedCount === modes.length) setLoaded(true) }
        document.head.appendChild(s)
      })
    }
    document.head.appendChild(script)
  }, [])

  useEffect(() => {
    if (!loaded || !active || !containerRef.current) return
    if (editorRef.current) { editorRef.current.toTextArea(); editorRef.current = null }
    const ta = document.createElement('textarea')
    containerRef.current.innerHTML = ''
    containerRef.current.appendChild(ta)
    const cm = window.CodeMirror.fromTextArea(ta, {
      mode: 'htmlmixed', theme: 'dracula', lineNumbers: true, lineWrapping: true,
      tabSize: 2, indentWithTabs: false
    })
    cm.setValue(value || '')
    cm.on('change', () => onChange(cm.getValue()))
    cm.setSize('100%', '100%')
    editorRef.current = cm
    // Force refresh after a tick to fix rendering
    setTimeout(() => cm.refresh(), 50)
    return () => { if (editorRef.current) { editorRef.current.toTextArea(); editorRef.current = null } }
  }, [loaded, active])

  // Update value from outside without triggering onChange loop
  useEffect(() => {
    if (editorRef.current && editorRef.current.getValue() !== value) {
      editorRef.current.setValue(value || '')
    }
  }, [value])

  return { loaded }
}

function DomainModal({ domain, onSave, onClose }) {
  const [form, setForm] = useState(domain || { name: '', host: '', port: 3000, api_key: '', public_url: '' })
  const set = (k, v) => setForm({ ...form, [k]: v })
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-96 space-y-4" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-white">{domain ? 'Domain bearbeiten' : 'Neue Domain'}</h3>
        {[['Name', 'name', 'text'], ['Host', 'host', 'text'], ['Port', 'port', 'number'], ['API Key', 'api_key', 'text'], ['Public URL', 'public_url', 'text']].map(([label, key, type]) => (
          <div key={key}>
            <label className="text-xs text-gray-400">{label}</label>
            <input value={form[key] || ''} onChange={e => set(key, type === 'number' ? +e.target.value : e.target.value)} type={type}
              placeholder={key === 'public_url' ? 'https://example.com (optional)' : ''}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500" />
          </div>
        ))}
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm">Abbrechen</button>
          <button onClick={() => onSave(form)} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm font-medium">Speichern</button>
        </div>
      </div>
    </div>
  )
}

function NewPageModal({ onSave, onClose }) {
  const [form, setForm] = useState({ title: '', slug: '', type: 'landing' })
  const set = (k, v) => setForm({ ...form, [k]: v })
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-96 space-y-4" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-white">Neue Page</h3>
        <div>
          <label className="text-xs text-gray-400">Titel</label>
          <input value={form.title} onChange={e => set('title', e.target.value)}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500" />
        </div>
        <div>
          <label className="text-xs text-gray-400">Slug</label>
          <input value={form.slug} onChange={e => set('slug', e.target.value)} placeholder="z.B. about-us"
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500" />
        </div>
        <div>
          <label className="text-xs text-gray-400">Typ</label>
          <select value={form.type} onChange={e => set('type', e.target.value)}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500">
            <option value="landing">Landing Page</option>
            <option value="slides">Slides</option>
          </select>
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm">Abbrechen</button>
          <button onClick={() => onSave(form)} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm font-medium">Erstellen</button>
        </div>
      </div>
    </div>
  )
}

export default function Pages() {
  const [domains, setDomains] = useState([])
  const [selectedDomain, setSelectedDomain] = useState(null)
  const [pageList, setPageList] = useState([])
  const [selectedPage, setSelectedPage] = useState(null)
  const [pageData, setPageData] = useState(null)
  const [showDomainModal, setShowDomainModal] = useState(false)
  const [editDomain, setEditDomain] = useState(null)
  const [showNewPage, setShowNewPage] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [editorContent, setEditorContent] = useState('')
  const [metaTitle, setMetaTitle] = useState('')
  const [metaDesc, setMetaDesc] = useState('')
  const [pageTitle, setPageTitle] = useState('')
  const [aiPrompt, setAiPrompt] = useState('')
  const cmRef = useRef(null)

  const { loaded: cmLoaded } = useCodeMirror(cmRef, editorContent, setEditorContent, !!pageData)

  const loadDomains = async () => {
    try {
      const list = await pages.domains()
      setDomains(list)
      if (list.length > 0 && !selectedDomain) setSelectedDomain(list[0].id)
    } catch (e) { setError(e.message) }
  }

  const loadPages = async (domainId) => {
    if (!domainId) { setPageList([]); return }
    try {
      const list = await pages.listPages(domainId)
      setPageList(Array.isArray(list) ? list : [])
    } catch { setPageList([]); setError('Pages-Container nicht erreichbar') }
  }

  const loadPage = async (slug) => {
    if (!selectedDomain || !slug) return
    try {
      const data = await pages.getPage(selectedDomain, slug)
      setPageData(data)
      setPageTitle(data.title || '')
      setMetaTitle(data.seo_title || data.meta?.title || '')
      setMetaDesc(data.seo_description || data.meta?.description || '')
      setAiPrompt(data.ai_prompt || '')
      // Content: for landing pages with sections array, serialize to HTML; for slides, use content directly
      if (data.type === 'landing' && Array.isArray(data.content)) {
        setEditorContent(data.content.map(s => `<!-- section: ${s.type || 'default'} -->\n${s.content || ''}`).join('\n\n'))
      } else if (typeof data.content === 'string') {
        setEditorContent(data.content)
      } else {
        setEditorContent(JSON.stringify(data.content, null, 2))
      }
    } catch (e) { setError(e.message) }
  }

  useEffect(() => { loadDomains() }, [])
  useEffect(() => { if (selectedDomain) loadPages(selectedDomain) }, [selectedDomain])

  const handleSaveDomain = async (form) => {
    try {
      if (editDomain) {
        await pages.updateDomain(editDomain.id, form)
      } else {
        await pages.createDomain(form)
      }
      setShowDomainModal(false)
      setEditDomain(null)
      loadDomains()
    } catch (e) { setError(e.message) }
  }

  const handleDeleteDomain = async () => {
    if (!selectedDomain || !confirm('Domain wirklich löschen?')) return
    await pages.deleteDomain(selectedDomain)
    setSelectedDomain(null)
    setPageList([])
    setPageData(null)
    loadDomains()
  }

  const handleCreatePage = async (form) => {
    if (!selectedDomain) return
    try {
      await pages.createPage(selectedDomain, form)
      setShowNewPage(false)
      loadPages(selectedDomain)
    } catch (e) { setError(e.message) }
  }

  const handleSavePage = async () => {
    if (!selectedDomain || !pageData) return
    setSaving(true)
    try {
      let content = editorContent
      // For landing pages, try to parse sections back
      if (pageData.type === 'landing') {
        const sections = editorContent.split(/<!-- section: (\w+) -->\n?/).filter(Boolean)
        if (sections.length >= 2) {
          const parsed = []
          for (let i = 0; i < sections.length; i += 2) {
            parsed.push({ type: sections[i].trim(), content: (sections[i + 1] || '').trim() })
          }
          content = parsed
        }
      }
      await pages.updatePage(selectedDomain, pageData.slug, {
        title: pageTitle,
        content,
        meta: { title: metaTitle, description: metaDesc },
        seo_title: metaTitle,
        seo_description: metaDesc,
        ai_prompt: aiPrompt,
      })
      setError(null)
    } catch (e) { setError(e.message) }
    setSaving(false)
  }

  const handleDeletePage = async () => {
    if (!selectedDomain || !pageData || !confirm('Page wirklich löschen?')) return
    await pages.deletePage(selectedDomain, pageData.slug)
    setPageData(null)
    setSelectedPage(null)
    loadPages(selectedDomain)
  }

  const handlePreview = () => {
    if (!pageData || !selectedDomain) return
    const domain = domains.find(d => d.id === selectedDomain)
    if (!domain) return
    if (domain.public_url) {
      const base = domain.public_url.replace(/\/+$/, '')
      window.open(`${base}/${pageData.slug}`, '_blank')
    } else {
      window.open(`http://${domain.host}:${domain.port}/${pageData.slug}`, '_blank')
    }
  }

  const currentDomain = domains.find(d => d.id === selectedDomain)

  return (
    <div className="flex flex-col gap-4" style={{ height: 'calc(100vh - 120px)' }}>
      {error && (
        <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-2 rounded-lg text-sm flex justify-between items-center">
          {error}
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-200 ml-4">✕</button>
        </div>
      )}

      {/* Top bar: Domain selector */}
      <div className="flex items-center gap-3 bg-gray-900 rounded-xl border border-gray-800 px-4 py-3">
        <span className="text-lg">🌐</span>
        <select value={selectedDomain || ''} onChange={e => { setSelectedDomain(+e.target.value); setPageData(null); setSelectedPage(null) }}
          className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500">
          <option value="">Domain wählen...</option>
          {domains.map(d => <option key={d.id} value={d.id}>{d.name} ({d.host}:{d.port})</option>)}
        </select>
        <button onClick={() => { setEditDomain(null); setShowDomainModal(true) }}
          className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-xs font-medium transition-colors">+ Domain</button>
        {currentDomain && (
          <>
            <button onClick={() => { setEditDomain(currentDomain); setShowDomainModal(true) }}
              className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-xs transition-colors">✏️ Bearbeiten</button>
            <button onClick={handleDeleteDomain}
              className="px-3 py-2 bg-gray-700 hover:bg-red-600 rounded-lg text-xs transition-colors">🗑️ Löschen</button>
          </>
        )}
      </div>

      {/* Main content */}
      <div className="flex gap-4 flex-1 min-h-0">
        {/* Left sidebar: Page list */}
        <div className="w-64 shrink-0 bg-gray-900 rounded-xl border border-gray-800 flex flex-col overflow-hidden">
          <div className="p-3 border-b border-gray-800 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-300">Pages</span>
            {selectedDomain && (
              <button onClick={() => setShowNewPage(true)} className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 rounded text-xs font-medium transition-colors">+ Neu</button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            {pageList.map(p => (
              <div key={p.slug} onClick={() => { setSelectedPage(p.slug); loadPage(p.slug) }}
                className={`px-3 py-2 cursor-pointer border-b border-gray-800/50 hover:bg-gray-800/50 transition-colors ${selectedPage === p.slug ? 'bg-gray-800' : ''}`}>
                <div className="text-xs text-white truncate">{p.title || p.slug}</div>
                <div className="text-[10px] text-gray-500">/{p.slug} · {p.type || '?'}</div>
              </div>
            ))}
            {selectedDomain && pageList.length === 0 && <p className="text-gray-500 text-center py-6 text-xs">Keine Pages</p>}
            {!selectedDomain && <p className="text-gray-500 text-center py-6 text-xs">Domain wählen</p>}
          </div>
        </div>

        {/* Right: Editor */}
        <div className="flex-1 bg-gray-900 rounded-xl border border-gray-800 flex flex-col overflow-hidden">
          {pageData ? (
            <>
              {/* Meta fields */}
              <div className="p-4 border-b border-gray-800 space-y-3">
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-[10px] text-gray-500 uppercase tracking-wide">Titel</label>
                    <input value={pageTitle} onChange={e => setPageTitle(e.target.value)}
                      className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-sm text-white focus:outline-none focus:border-emerald-500" />
                  </div>
                  <div className="w-40">
                    <label className="text-[10px] text-gray-500 uppercase tracking-wide">Slug</label>
                    <input value={pageData.slug} readOnly
                      className="w-full px-3 py-1.5 bg-gray-800/50 border border-gray-700/50 rounded text-sm text-gray-400" />
                  </div>
                  <div className="w-28">
                    <label className="text-[10px] text-gray-500 uppercase tracking-wide">Typ</label>
                    <input value={pageData.type || '?'} readOnly
                      className="w-full px-3 py-1.5 bg-gray-800/50 border border-gray-700/50 rounded text-sm text-gray-400" />
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-[10px] text-gray-500 uppercase tracking-wide">SEO Title</label>
                    <input value={metaTitle} onChange={e => setMetaTitle(e.target.value)}
                      className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-sm text-white focus:outline-none focus:border-emerald-500" />
                  </div>
                  <div className="flex-1">
                    <label className="text-[10px] text-gray-500 uppercase tracking-wide">SEO Description</label>
                    <input value={metaDesc} onChange={e => setMetaDesc(e.target.value)}
                      className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-sm text-white focus:outline-none focus:border-emerald-500" />
                  </div>
                </div>
                {/* AI Prompt */}
                <div>
                  <label className="text-[10px] text-gray-500 uppercase tracking-wide">🤖 AI-Prompt</label>
                  <textarea value={aiPrompt} onChange={e => setAiPrompt(e.target.value)}
                    placeholder="Prompt für KI-Generierung dieser Page (z.B. 'Erstelle eine Landing Page für...')"
                    rows={3}
                    className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-sm text-white focus:outline-none focus:border-emerald-500 resize-y" />
                </div>
              </div>

              {/* CodeMirror Editor */}
              <div className="flex-1 min-h-0 overflow-hidden" ref={cmRef}>
                {!cmLoaded && <div className="flex items-center justify-center h-full text-gray-500 text-sm">Editor wird geladen...</div>}
              </div>

              {/* Action buttons */}
              <div className="p-3 border-t border-gray-800 flex gap-2">
                <button onClick={handleSavePage} disabled={saving}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors">
                  {saving ? 'Speichert...' : 'Speichern'}
                </button>
                <button onClick={handlePreview}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors">👁️ Vorschau</button>
                <button onClick={handleDeletePage}
                  className="px-4 py-2 bg-gray-700 hover:bg-red-600 rounded-lg text-sm transition-colors ml-auto">🗑️ Löschen</button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
              {selectedDomain ? 'Wähle eine Page oder erstelle eine neue' : 'Wähle zuerst eine Domain'}
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {showDomainModal && <DomainModal domain={editDomain} onSave={handleSaveDomain} onClose={() => { setShowDomainModal(false); setEditDomain(null) }} />}
      {showNewPage && <NewPageModal onSave={handleCreatePage} onClose={() => setShowNewPage(false)} />}
    </div>
  )
}
