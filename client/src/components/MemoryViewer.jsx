import React, { useState, useEffect } from 'react'
import { marked } from 'marked'
import { memory } from '../api'

export default function MemoryViewer() {
  const [files, setFiles] = useState([])
  const [selected, setSelected] = useState(null)
  const [content, setContent] = useState('')

  useEffect(() => { memory.files().then(setFiles) }, [])

  const loadFile = async (f) => {
    setSelected(f.path)
    const data = await memory.file(f.path)
    setContent(data.content)
  }

  return (
    <div className="flex gap-6 h-[calc(100vh-140px)]">
      <div className="w-64 shrink-0 bg-gray-900 rounded-xl p-4 overflow-y-auto border border-gray-800">
        <h2 className="font-bold mb-3 text-sm text-gray-400 uppercase tracking-wider">Dateien</h2>
        {files.map(f => (
          <button key={f.path} onClick={() => loadFile(f)}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm mb-1 transition-colors ${
              selected === f.path ? 'bg-emerald-900/50 text-emerald-300' : 'text-gray-300 hover:bg-gray-800'
            }`}>{f.name}</button>
        ))}
      </div>
      <div className="flex-1 bg-gray-900 rounded-xl p-6 overflow-y-auto border border-gray-800">
        {selected ? (
          <div className="prose prose-invert prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: marked(content) }} />
        ) : (
          <p className="text-gray-500 text-center mt-20">Wähle eine Datei aus der Liste</p>
        )}
      </div>
    </div>
  )
}
