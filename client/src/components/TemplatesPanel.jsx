import React, { useState, useEffect, useRef } from 'react'
import { templates } from '../api'
import CardModal from './CardModal'

function useCodeMirror(containerRef, value, onChange, mode, active) {
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
    const customCss = document.createElement('style')
    customCss.innerHTML = `.CodeMirror { color: #FFFFFF !important; background-color: #282a36 !important; } .CodeMirror-gutters { background-color: #282a36 !important; } .CodeMirror-linenumber { color: #6D8A88 !important; }`
    document.head.appendChild(customCss)
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
      mode: mode || 'htmlmixed', theme: 'dracula', lineNumbers: true, lineWrapping: true,
      tabSize: 2, indentWithTabs: false
    })
    cm.setValue(value || '')
    cm.on('change', () => onChange(cm.getValue()))
    cm.setSize('100%', '100%')
    editorRef.current = cm
    setTimeout(() => cm.refresh(), 50)
    return () => { if (editorRef.current) { editorRef.current.toTextArea(); editorRef.current = null } }
  }, [loaded, active, mode])

  useEffect(() => {
    if (editorRef.current && editorRef.current.getValue() !== value) {
      editorRef.current.setValue(value || '')
    }
  }, [value])

  return { loaded }
}

export default function TemplatesPanel({ projectId, onNavigateToKanban }) {
  const [templateList, setTemplateList] = useState([])
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [editing, setEditing] = useState(false)
  const [previewImage, setPreviewImage] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [showCreateTask, setShowCreateTask] = useState(false)

  const [form, setForm] = useState({ name: '', category: 'social', html: '', css: '', fields: [], width: 1080, height: 1080, preview_data: {} })
  const [fieldValues, setFieldValues] = useState({})
  const [editorTab, setEditorTab] = useState('html')
  const htmlRef = useRef(null)
  const cssRef = useRef(null)

  const { loaded: htmlLoaded } = useCodeMirror(htmlRef, form.html, (v) => setForm(f => ({ ...f, html: v })), 'htmlmixed', editing && editorTab === 'html')
  const { loaded: cssLoaded } = useCodeMirror(cssRef, form.css, (v) => setForm(f => ({ ...f, css: v })), 'css', editing && editorTab === 'css')

  useEffect(() => { if (projectId) loadTemplates() }, [projectId])

  const loadTemplates = async () => {
    try { setTemplateList(await templates.list(projectId)) } catch (e) { console.error(e) }
  }

  const selectTemplate = (tpl) => {
    setSelectedTemplate(tpl)
    setForm({
      name: tpl.name, category: tpl.category || 'social', html: tpl.html, css: tpl.css,
      fields: tpl.fields || [], width: tpl.width || 1080, height: tpl.height || 1080, preview_data: tpl.preview_data || {}
    })
    const vals = {}
    ;(tpl.fields || []).forEach(f => { vals[f.name] = (tpl.preview_data || {})[f.name] || f.default || '' })
    setFieldValues(vals)
    setEditing(false)
    setPreviewImage(null)
    setEditorTab('use')
  }

  const handleNew = () => {
    setSelectedTemplate(null)
    setForm({ name: '', category: 'social', html: '<div class="card">\n  <h1>{{title}}</h1>\n</div>', css: '.card {\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  width: 100%;\n  height: 100%;\n  background: #1a1a2e;\n  color: white;\n  font-family: sans-serif;\n}', fields: [{ name: 'title', type: 'text', label: 'Titel' }], width: 1080, height: 1080, preview_data: { title: 'Beispiel' } })
    setFieldValues({ title: 'Beispiel' })
    setEditing(true)
    setEditorTab('html')
    setPreviewImage(null)
  }

  const handleSave = async () => {
    if (!form.name.trim()) return alert('Name erforderlich')
    try {
      if (selectedTemplate) {
        const updated = await templates.update(projectId, selectedTemplate.id, { ...form, preview_data: fieldValues })
        setSelectedTemplate(updated)
      } else {
        const created = await templates.create(projectId, { ...form, preview_data: fieldValues })
        setSelectedTemplate(created)
      }
      setEditing(false)
      await loadTemplates()
    } catch (e) { alert('Fehler: ' + e.message) }
  }

  const handleDelete = async () => {
    if (!selectedTemplate || !confirm('Template löschen?')) return
    try {
      await templates.remove(projectId, selectedTemplate.id)
      setSelectedTemplate(null)
      setEditing(false)
      await loadTemplates()
    } catch (e) { alert(e.message) }
  }

  const handlePreview = async () => {
    setPreviewLoading(true)
    try {
      const result = await templates.preview(projectId, {
        template: selectedTemplate?.id || undefined,
        html: editing || !selectedTemplate ? form.html : undefined,
        css: editing || !selectedTemplate ? form.css : undefined,
        data: fieldValues, width: form.width, height: form.height,
      })
      setPreviewImage(result.image)
    } catch (e) { alert('Vorschau fehlgeschlagen: ' + e.message) }
    setPreviewLoading(false)
  }

  const addField = () => setForm(f => ({ ...f, fields: [...f.fields, { name: '', type: 'text', label: '' }] }))
  const updateField = (idx, key, value) => setForm(f => { const fields = [...f.fields]; fields[idx] = { ...fields[idx], [key]: value }; return { ...f, fields } })
  const removeField = (idx) => setForm(f => ({ ...f, fields: f.fields.filter((_, i) => i !== idx) }))

  const handleTaskSave = (task) => { setShowCreateTask(false); if (onNavigateToKanban && task) onNavigateToKanban(task.id) }

  if (!projectId) return null

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {/* Action bar */}
      <div className="flex items-center gap-2 mb-4 shrink-0">
        <div className="flex-1" />
        <button onClick={() => setShowCreateTask(true)}
          className="px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-xs font-medium transition-colors">📋 Task erstellen</button>
        <button onClick={handleNew}
          className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-xs font-medium transition-colors">+ Neues Template</button>
      </div>

      <div className="flex-1 flex gap-4 min-h-0 overflow-hidden">
        {/* Left: Template list */}
        <div className="w-64 shrink-0 bg-gray-900 rounded-xl border border-gray-800 flex flex-col overflow-hidden">
          <div className="p-3 border-b border-gray-800">
            <span className="text-sm font-semibold text-gray-300">Templates</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {templateList.map(tpl => (
              <div key={tpl.id} onClick={() => selectTemplate(tpl)}
                className={`px-4 py-3 cursor-pointer border-b border-gray-800/50 hover:bg-gray-800/50 transition-colors ${selectedTemplate?.id === tpl.id ? 'bg-gray-800' : ''}`}>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-white truncate flex-1">{tpl.name}</span>
                  {tpl.is_default ? <span className="text-[10px] text-gray-500">Standard</span> : null}
                </div>
                <div className="text-[10px] text-gray-500 mt-0.5">{tpl.width}x{tpl.height} · {tpl.category}</div>
              </div>
            ))}
            {templateList.length === 0 && <p className="text-gray-500 text-xs text-center py-8">Keine Templates</p>}
          </div>
        </div>

        {/* Right: Editor / Use */}
        <div className="flex-1 bg-gray-900 rounded-xl border border-gray-800 flex flex-col overflow-hidden">
          {selectedTemplate || editing ? (
            <>
              <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-800">
                <div className="flex bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
                  {['use', 'html', 'css', 'fields'].map(t => (
                    <button key={t} onClick={() => { setEditorTab(t); if (t !== 'use') setEditing(true) }}
                      className={`px-3 py-1.5 text-xs font-medium transition-colors ${editorTab === t ? 'bg-emerald-600 text-white' : 'text-gray-400 hover:text-white'}`}>
                      {t === 'use' ? 'Verwenden' : t === 'fields' ? 'Felder' : t.toUpperCase()}
                    </button>
                  ))}
                </div>
                <div className="flex-1" />
                {editing && (
                  <>
                    <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Template-Name"
                      className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-white w-40 focus:outline-none focus:border-emerald-500" />
                    <div className="flex gap-1">
                      <input type="number" value={form.width} onChange={e => setForm(f => ({ ...f, width: +e.target.value }))}
                        className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-white w-16 focus:outline-none" placeholder="W" />
                      <span className="text-gray-500 text-xs self-center">x</span>
                      <input type="number" value={form.height} onChange={e => setForm(f => ({ ...f, height: +e.target.value }))}
                        className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-white w-16 focus:outline-none" placeholder="H" />
                    </div>
                  </>
                )}
                <button onClick={handlePreview} disabled={previewLoading}
                  className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-lg text-xs font-medium transition-colors">
                  {previewLoading ? '⏳' : '👁️'} Vorschau
                </button>
                {editing && (
                  <button onClick={handleSave}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-xs font-medium transition-colors">💾 Speichern</button>
                )}
                {selectedTemplate && !selectedTemplate.is_default && (
                  <button onClick={handleDelete}
                    className="px-2 py-1.5 text-gray-500 hover:text-red-400 text-xs transition-colors">🗑️</button>
                )}
              </div>

              <div className="flex-1 flex min-h-0 overflow-hidden">
                <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                  {editorTab === 'use' && (
                    <div className="flex-1 overflow-y-auto p-4">
                      <h3 className="text-sm font-semibold text-gray-300 mb-3">Felder ausfüllen</h3>
                      <div className="space-y-3 max-w-md">
                        {(form.fields || []).map((field, i) => (
                          <div key={i}>
                            <label className="text-xs text-gray-400 block mb-1">{field.label || field.name}</label>
                            {field.type === 'textarea' ? (
                              <textarea value={fieldValues[field.name] || ''} onChange={e => setFieldValues(v => ({ ...v, [field.name]: e.target.value }))} rows={3}
                                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500" />
                            ) : field.type === 'color' ? (
                              <div className="flex items-center gap-2">
                                <input type="color" value={fieldValues[field.name] || field.default || '#6366f1'}
                                  onChange={e => setFieldValues(v => ({ ...v, [field.name]: e.target.value }))}
                                  className="w-10 h-10 bg-transparent border-0 rounded cursor-pointer p-0" />
                                <input value={fieldValues[field.name] || field.default || ''} onChange={e => setFieldValues(v => ({ ...v, [field.name]: e.target.value }))}
                                  className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm w-32 focus:outline-none focus:border-emerald-500" />
                              </div>
                            ) : (
                              <input value={fieldValues[field.name] || ''} onChange={e => setFieldValues(v => ({ ...v, [field.name]: e.target.value }))}
                                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500" />
                            )}
                          </div>
                        ))}
                        {(form.fields || []).length === 0 && <p className="text-gray-500 text-xs">Keine Felder definiert</p>}
                      </div>
                    </div>
                  )}
                  {editorTab === 'html' && (
                    <div className="flex-1 min-h-0 overflow-hidden" ref={htmlRef}>
                      {!htmlLoaded && <div className="flex items-center justify-center h-full text-gray-500 text-sm">Editor wird geladen...</div>}
                    </div>
                  )}
                  {editorTab === 'css' && (
                    <div className="flex-1 min-h-0 overflow-hidden" ref={cssRef}>
                      {!cssLoaded && <div className="flex items-center justify-center h-full text-gray-500 text-sm">Editor wird geladen...</div>}
                    </div>
                  )}
                  {editorTab === 'fields' && (
                    <div className="flex-1 overflow-y-auto p-4">
                      <div className="space-y-3">
                        {form.fields.map((field, i) => (
                          <div key={i} className="flex items-center gap-2 p-2 bg-gray-800 rounded-lg">
                            <input value={field.name} onChange={e => updateField(i, 'name', e.target.value)} placeholder="name"
                              className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-xs text-white w-24 focus:outline-none" />
                            <input value={field.label} onChange={e => updateField(i, 'label', e.target.value)} placeholder="Label"
                              className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-xs text-white flex-1 focus:outline-none" />
                            <select value={field.type} onChange={e => updateField(i, 'type', e.target.value)}
                              className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-xs text-white">
                              <option value="text">Text</option>
                              <option value="textarea">Textarea</option>
                              <option value="color">Farbe</option>
                            </select>
                            <input value={field.default || ''} onChange={e => updateField(i, 'default', e.target.value)} placeholder="Default"
                              className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-xs text-white w-20 focus:outline-none" />
                            <button onClick={() => removeField(i)} className="text-red-400 hover:text-red-300 text-xs">✕</button>
                          </div>
                        ))}
                        <button onClick={addField} className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-xs font-medium transition-colors">+ Feld hinzufügen</button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="w-80 shrink-0 border-l border-gray-800 flex flex-col overflow-hidden">
                  <div className="p-3 border-b border-gray-800">
                    <span className="text-xs font-semibold text-gray-400">Vorschau</span>
                  </div>
                  <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
                    {previewImage ? (
                      <img src={previewImage} alt="Preview" className="max-w-full max-h-full object-contain rounded-lg shadow-lg" />
                    ) : (
                      <div className="text-gray-600 text-xs text-center">
                        <div className="text-3xl mb-2">👁️</div>
                        Klicke "Vorschau" um das Template zu rendern
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <div className="text-4xl mb-3">🧩</div>
                <div>Wähle ein Template oder erstelle ein neues</div>
              </div>
            </div>
          )}
        </div>
      </div>

      <CardModal isOpen={showCreateTask} onClose={() => setShowCreateTask(false)} mode="create" defaultColumnName="backlog"
        defaultTitle={selectedTemplate ? `Template: ${selectedTemplate.name}` : ''} onSave={handleTaskSave} projectId={projectId} />
    </div>
  )
}
