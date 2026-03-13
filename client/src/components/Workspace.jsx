import React, { useState } from 'react'
import SkillsViewer from './SkillsViewer'
import MemoryViewer from './MemoryViewer'
import TemplatesPanel from './TemplatesPanel'
import ContentProfilesPanel from './ContentProfilesPanel'

const SECTIONS = [
  { id: 'skills', label: 'Skills' },
  { id: 'memory', label: 'Memory' },
  { id: 'templates', label: 'Templates' },
  { id: 'profiles', label: 'Content-Profile' },
]

export default function Workspace({ projectId, onNavigateToKanban }) {
  const [activeSection, setActiveSection] = useState('skills')

  return (
    <div className="flex flex-col gap-4" style={{ height: 'calc(100vh - 120px)' }}>
      <div className="flex items-center gap-3 bg-gray-900 rounded-xl border border-gray-800 px-4 py-3 shrink-0">
        <select
          value={activeSection}
          onChange={e => setActiveSection(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500"
        >
          {SECTIONS.map(section => (
            <option key={section.id} value={section.id}>{section.label}</option>
          ))}
        </select>
        <div className="flex-1" />
        <span className="text-xs text-gray-500">
          Readonly Einblick in Schildis Workspace
        </span>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {activeSection === 'skills' && (
          <SkillsViewer projectId={projectId} onNavigateToKanban={onNavigateToKanban} />
        )}

        {activeSection === 'memory' && (
          <div className="h-full">
            <MemoryViewer />
          </div>
        )}

        {activeSection === 'templates' && (
          <TemplatesPanel projectId={projectId} onNavigateToKanban={onNavigateToKanban} />
        )}

        {activeSection === 'profiles' && (
          <ContentProfilesPanel projectId={projectId} />
        )}
      </div>
    </div>
  )
}
