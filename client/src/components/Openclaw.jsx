import React, { useState } from 'react'
import WorkspaceBrowser from './WorkspaceBrowser'
import Plugins from './Plugins'

const SECTIONS = [
  { id: 'workspace', label: 'Workspace' },
  { id: 'plugins', label: 'Plugins' },
]

export default function Openclaw() {
  const [activeSection, setActiveSection] = useState('workspace')

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
        <span className="text-xs text-gray-500">OpenClaw Bereich</span>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {activeSection === 'workspace' && <WorkspaceBrowser />}
        {activeSection === 'plugins' && <Plugins />}
      </div>
    </div>
  )
}
