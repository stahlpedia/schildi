import React, { useState, useEffect } from 'react'
import { skills } from '../api'
import { marked } from 'marked'
import CardModal from './CardModal'

export default function SkillsViewer({ projectId, onNavigateToKanban }) {
  const [skillList, setSkillList] = useState([])
  const [selected, setSelected] = useState(null)
  const [detail, setDetail] = useState(null)
  const [activeFile, setActiveFile] = useState('SKILL.md')
  const [fileContent, setFileContent] = useState('')
  const [showCreateTask, setShowCreateTask] = useState(false)

  useEffect(() => { skills.list().then(setSkillList) }, [])

  const selectSkill = async (skill) => {
    setSelected(skill.id)
    const d = await skills.get(skill.id)
    setDetail(d)
    setActiveFile('SKILL.md')
    setFileContent(d.content)
  }

  const loadFile = async (filePath) => {
    setActiveFile(filePath)
    if (filePath === 'SKILL.md') {
      setFileContent(detail.content)
    } else {
      const data = await skills.file(selected, filePath)
      setFileContent(data.content)
    }
  }

  const handleTaskSave = (task) => {
    setShowCreateTask(false)
    if (onNavigateToKanban && task) onNavigateToKanban(task.id)
  }

  return (
    <div className="flex gap-4 h-full min-h-0 overflow-hidden">
      {/* Left: Skill list */}
      <div className="w-64 shrink-0 bg-gray-900 rounded-xl border border-gray-800 flex flex-col overflow-hidden">
        <div className="p-3 border-b border-gray-800">
          <span className="text-sm font-semibold text-gray-300">Agent Skills</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          {skillList.map(s => (
            <div key={s.id} onClick={() => selectSkill(s)}
              className={`px-4 py-3 cursor-pointer border-b border-gray-800/50 hover:bg-gray-800/50 transition-colors ${selected === s.id ? 'bg-gray-800' : ''}`}>
              <div className="text-sm text-white">{s.name}</div>
              <div className="text-[10px] text-gray-500 mt-0.5 line-clamp-2">{s.description}</div>
            </div>
          ))}
          {skillList.length === 0 && <p className="text-gray-500 text-xs text-center py-8">Keine Skills gefunden</p>}
        </div>
      </div>

      {/* Right: Detail */}
      <div className="flex-1 bg-gray-900 rounded-xl border border-gray-800 flex flex-col overflow-hidden">
        {detail ? (
          <>
            {/* Header with file tabs and task button */}
            <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-800">
              <div className="flex bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
                {detail.files.map(f => (
                  <button key={f} onClick={() => loadFile(f)}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${activeFile === f ? 'bg-emerald-600 text-white' : 'text-gray-400 hover:text-white'}`}>
                    {f}
                  </button>
                ))}
              </div>
              <div className="flex-1" />
              <button onClick={() => setShowCreateTask(true)}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-xs font-medium transition-colors">
                📋 Änderung vorschlagen
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="prose prose-invert prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: marked(fileContent || '') }} />
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <div className="text-4xl mb-3">🐢</div>
              <div>Wähle einen Skill aus der Liste</div>
            </div>
          </div>
        )}
      </div>

      {/* Task Modal */}
      <CardModal
        isOpen={showCreateTask}
        onClose={() => setShowCreateTask(false)}
        mode="create"
        defaultColumnName="backlog"
        defaultTitle={selected ? `Skill-Änderung: ${detail?.id || selected}` : ''}
        defaultDescription={selected ? `Änderungen am Skill "${detail?.id || selected}":\n\n` : ''}
        onSave={handleTaskSave}
        projectId={projectId}
      />
    </div>
  )
}
