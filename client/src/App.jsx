import React, { useState, useEffect } from 'react'
import { isLoggedIn, login as doLogin, logout, channel, admin, projects as projectsApi } from './api'
import Login from './components/Login'
import KanbanBoard from './components/KanbanBoard'
import Admin from './components/Admin'
import Channel from './components/Channel'
import Pages from './components/Pages'
import Context from './components/Context'
import Social from './components/Social'

const TABS = ['Kanban', 'Social', 'Pages', 'Kontext', 'Channels', 'Admin']

export default function App() {
  const [loggedIn, setLoggedIn] = useState(isLoggedIn())
  const [tab, setTab] = useState('Kanban')
  const [unansweredCount, setUnansweredCount] = useState(0)
  const [highlightTaskId, setHighlightTaskId] = useState(null)
  const [selectedBoardId, setSelectedBoardId] = useState(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [branding, setBranding] = useState({ title: 'Schildi Dashboard', logoUrl: null })
  
  // Project state
  const [projectsList, setProjectsList] = useState([])
  const [currentProject, setCurrentProject] = useState(null)
  const [showProjectDropdown, setShowProjectDropdown] = useState(false)
  const [showNewProject, setShowNewProject] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [newProjectColor, setNewProjectColor] = useState('#10b981')

  const checkUnanswered = async () => {
    try {
      const list = await channel.unanswered()
      setUnansweredCount(list.length)
    } catch {}
  }

  const loadBranding = async () => {
    try {
      const brandingData = await admin.branding()
      setBranding(brandingData)
    } catch (error) {
      console.error('Failed to load branding:', error)
    }
  }

  const loadProjects = async () => {
    try {
      const list = await projectsApi.list()
      setProjectsList(list)
      if (list.length > 0) {
        const savedId = localStorage.getItem('currentProjectId')
        const saved = savedId ? list.find(p => p.id === +savedId) : null
        setCurrentProject(saved || list[0])
      }
    } catch (error) {
      console.error('Failed to load projects:', error)
    }
  }

  useEffect(() => {
    if (!loggedIn) return
    checkUnanswered()
    loadBranding()
    loadProjects()
    const interval = setInterval(checkUnanswered, 15000)
    const handleBrandingUpdate = () => loadBranding()
    window.addEventListener('brandingUpdated', handleBrandingUpdate)
    return () => {
      clearInterval(interval)
      window.removeEventListener('brandingUpdated', handleBrandingUpdate)
    }
  }, [loggedIn])

  useEffect(() => {
    if (tab === 'Channels') checkUnanswered()
  }, [tab])

  useEffect(() => {
    if (currentProject) {
      localStorage.setItem('currentProjectId', currentProject.id)
    }
  }, [currentProject])

  const handleNavigateToKanban = (taskId, boardId) => {
    setHighlightTaskId(taskId)
    setSelectedBoardId(boardId)
    setTab('Kanban')
  }

  const handleTabChange = (newTab) => {
    setTab(newTab)
    setMobileMenuOpen(false)
  }

  const handleSelectProject = (project) => {
    setCurrentProject(project)
    setShowProjectDropdown(false)
  }

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return
    try {
      const project = await projectsApi.create({ name: newProjectName, color: newProjectColor })
      setNewProjectName('')
      setNewProjectColor('#10b981')
      setShowNewProject(false)
      await loadProjects()
      if (project?.id) {
        const list = await projectsApi.list()
        const created = list.find(p => p.id === project.id)
        if (created) setCurrentProject(created)
      }
    } catch (e) {
      alert('Projekt erstellen fehlgeschlagen: ' + e.message)
    }
  }

  if (!loggedIn) return <Login onLogin={() => setLoggedIn(true)} />

  const projectId = currentProject?.id

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="bg-gray-900 border-b border-gray-800 px-4 md:px-6 py-3 md:py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {branding.logoUrl ? (
            <img 
              src={branding.logoUrl} 
              alt="Logo" 
              className="h-8 md:h-9 max-w-[200px] object-contain"
              onError={(e) => {
                e.target.style.display = 'none'
                const emoji = document.createElement('span')
                emoji.className = 'text-2xl md:text-3xl'
                emoji.textContent = '🐢'
                e.target.parentNode.insertBefore(emoji, e.target)
              }}
            />
          ) : (
            <span className="text-2xl md:text-3xl">🐢</span>
          )}
          <h1 className="text-lg md:text-xl font-bold hidden sm:block">{branding.title}</h1>
          
          {/* Project Switcher */}
          <div className="relative ml-2">
            <button 
              onClick={() => setShowProjectDropdown(!showProjectDropdown)}
              className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm hover:border-gray-600 transition-colors"
            >
              {currentProject && (
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: currentProject.color || '#10b981' }} />
              )}
              <span className="max-w-[120px] truncate">{currentProject?.name || 'Projekt...'}</span>
              <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            {showProjectDropdown && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowProjectDropdown(false)} />
                <div className="absolute top-full left-0 mt-1 w-64 bg-gray-800 border border-gray-700 rounded-xl shadow-xl z-50 py-1 max-h-80 overflow-y-auto">
                  {projectsList.map(p => (
                    <button key={p.id} onClick={() => handleSelectProject(p)}
                      className={`w-full flex items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-gray-700 transition-colors ${
                        currentProject?.id === p.id ? 'bg-gray-700/50 text-emerald-300' : 'text-gray-200'
                      }`}>
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color || '#10b981' }} />
                      <span className="truncate">{p.name}</span>
                    </button>
                  ))}
                  <div className="border-t border-gray-700 mt-1 pt-1">
                    <button onClick={() => { setShowProjectDropdown(false); setShowNewProject(true) }}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-left text-sm text-emerald-400 hover:bg-gray-700 transition-colors">
                      <span className="text-lg leading-none">+</span>
                      <span>Neues Projekt</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
        
        {/* Desktop Navigation */}
        <div className="hidden md:flex items-center gap-4">
          <nav className="flex gap-1">
            {TABS.map(t => (
              <button key={t} onClick={() => handleTabChange(t)}
                className={`relative px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  tab === t ? 'bg-emerald-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}>
                {t === 'Admin' ? '⚙️' : t}
                {t === 'Channels' && unansweredCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[10px] font-bold flex items-center justify-center text-white">
                    {unansweredCount}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* Mobile Hamburger */}
        <div className="md:hidden flex items-center gap-2">
          <button 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={mobileMenuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
            </svg>
          </button>
        </div>

        {/* Mobile Menu Overlay */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 bg-black/60 z-50 md:hidden" onClick={() => setMobileMenuOpen(false)}>
            <div className="absolute top-16 right-4 left-4 bg-gray-900 border border-gray-700 rounded-xl shadow-xl py-2" onClick={e => e.stopPropagation()}>
              {TABS.map(t => (
                <button key={t} onClick={() => handleTabChange(t)}
                  className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors ${
                    tab === t ? 'bg-emerald-600 text-white' : 'text-gray-300 hover:bg-gray-800'
                  }`}>
                  <span className="font-medium">
                    {t === 'Admin' ? '⚙️ Admin' : t}
                  </span>
                  {t === 'Channels' && unansweredCount > 0 && (
                    <span className="w-5 h-5 bg-red-500 rounded-full text-xs font-bold flex items-center justify-center text-white">
                      {unansweredCount}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </header>
      
      <main className="p-3 md:p-6">
        <div style={{ display: tab === 'Kanban' ? 'block' : 'none' }}>
          <KanbanBoard projectId={projectId} highlightTaskId={highlightTaskId} selectedBoardId={selectedBoardId} onTaskHighlighted={() => setHighlightTaskId(null)} />
        </div>
        <div style={{ display: tab === 'Social' ? 'block' : 'none' }}><Social projectId={projectId} /></div>
        <div style={{ display: tab === 'Pages' ? 'block' : 'none' }}><Pages projectId={projectId} onNavigateToKanban={handleNavigateToKanban} /></div>
        <div style={{ display: tab === 'Kontext' ? 'block' : 'none' }}><Context projectId={projectId} /></div>
        <div style={{ display: tab === 'Channels' ? 'block' : 'none' }}><Channel projectId={projectId} onUpdate={checkUnanswered} /></div>
        <div style={{ display: tab === 'Admin' ? 'block' : 'none' }}><Admin onLogout={() => { logout(); setLoggedIn(false) }} /></div>
      </main>

      {/* New Project Modal */}
      {showNewProject && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-3" onClick={() => setShowNewProject(false)}>
          <div className="bg-gray-900 p-6 rounded-xl border border-gray-700 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">Neues Projekt</h3>
            <input value={newProjectName} onChange={e => setNewProjectName(e.target.value)} placeholder="Projektname"
              className="w-full mb-3 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-emerald-500" autoFocus
              onKeyDown={e => e.key === 'Enter' && handleCreateProject()} />
            <div className="mb-4 flex items-center gap-3">
              <label className="text-sm text-gray-400">Farbe:</label>
              <input type="color" value={newProjectColor} onChange={e => setNewProjectColor(e.target.value)}
                className="w-10 h-8 bg-gray-800 border border-gray-700 rounded cursor-pointer" />
              <span className="w-4 h-4 rounded-full" style={{ backgroundColor: newProjectColor }} />
            </div>
            <div className="flex gap-2">
              <button onClick={handleCreateProject} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm font-medium transition-colors">Erstellen</button>
              <button onClick={() => setShowNewProject(false)} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors">Abbrechen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
