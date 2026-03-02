import React, { useState, useEffect, useCallback, useRef } from 'react'
import { isLoggedIn, login as doLogin, logout, channel, admin, projects as projectsApi } from './api'
import { useSSE, requestNotificationPermission, showNotification, subscribePush } from './useSSE'
import Login from './components/Login'
import KanbanBoard from './components/KanbanBoard'
import Admin from './components/Admin'
import Channel from './components/Channel'
import Pages from './components/Pages'
import Context from './components/Context'
import Content from './components/Content'
const TABS = ['Kanban', 'Content', 'Webapps', 'Channels', 'Kontext', 'Admin']

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
  const [editingProject, setEditingProject] = useState(null)
  const [editProjectName, setEditProjectName] = useState('')
  const [editProjectColor, setEditProjectColor] = useState('#10b981')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Tab title badge for unread changes
  const unreadCount = useRef(0);
  const originalTitle = useRef(document.title);

  useEffect(() => {
    const onFocus = () => {
      unreadCount.current = 0;
      document.title = originalTitle.current;
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  // SSE: real-time updates
  const handleSSEEvent = useCallback((event) => {
    // Dispatch to child components via custom window event
    window.dispatchEvent(new CustomEvent('sse-event', { detail: event }));
    
    // Tab title badge + browser notifications (only when tab is not focused)
    if (document.hidden) {
      unreadCount.current += 1;
      document.title = `(${unreadCount.current}) ${originalTitle.current}`;
      switch (event.type) {
        case 'kanban': {
          const { action, card, cardId } = event.data;
          if (action === 'created') {
            showNotification('Neuer Task', card?.title || 'Ein Task wurde erstellt', { tag: `kanban-${card?.id}` });
          } else if (action === 'updated') {
            const status = card?.column_name;
            const label = status === 'done' ? '✅ Erledigt' : status === 'in-progress' ? '🔄 In Arbeit' : status || 'Aktualisiert';
            showNotification(`Task: ${label}`, card?.title || '', { tag: `kanban-${card?.id}` });
          } else if (action === 'deleted') {
            showNotification('Task gelöscht', `Task #${cardId} wurde entfernt`, { tag: `kanban-${cardId}` });
          }
          break;
        }
        case 'content': {
          const { action, file } = event.data;
          if (action === 'uploaded') {
            showNotification('Neue Datei', file?.filename || 'Eine Datei wurde hochgeladen', { tag: `content-${file?.id}` });
          } else if (action === 'updated') {
            showNotification('Datei aktualisiert', file?.filename || '', { tag: `content-${file?.id}` });
          } else if (action === 'deleted') {
            showNotification('Datei gelöscht', 'Eine Datei wurde entfernt', { tag: `content-del` });
          }
          break;
        }
        case 'pages': {
          const { action, domain, path } = event.data;
          const label = action === 'created' ? 'Neue Datei' : action === 'updated' ? 'Datei aktualisiert' : 'Datei gelöscht';
          showNotification(`Webapps: ${label}`, `${domain}/${path || ''}`, { tag: `pages-${domain}-${path}` });
          break;
        }
        case 'channel': {
          const { action } = event.data;
          if (action === 'agent_reply') {
            showNotification('Neue Antwort', 'Der Agent hat geantwortet', { tag: `channel-${event.data.conversationId}` });
          } else if (action === 'message') {
            const msg = event.data.message;
            if (msg?.author === 'agent') {
              showNotification('Neue Nachricht', msg.text?.slice(0, 100) || '', { tag: `channel-${event.data.conversationId}` });
            }
          }
          break;
        }
      }
    }
  }, []);

  useSSE(loggedIn ? handleSSEEvent : () => {});

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
    requestNotificationPermission()
    // Delay push subscription to ensure service worker is ready
    setTimeout(() => subscribePush(), 3000)
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

  const handleEditProject = (project, e) => {
    e.stopPropagation()
    setEditingProject(project)
    setEditProjectName(project.name)
    setEditProjectColor(project.color || '#10b981')
    setShowDeleteConfirm(false)
    setShowProjectDropdown(false)
  }

  const handleUpdateProject = async () => {
    if (!editProjectName.trim() || !editingProject) return
    try {
      await projectsApi.update(editingProject.id, { name: editProjectName, color: editProjectColor })
      await loadProjects()
      if (currentProject?.id === editingProject.id) {
        setCurrentProject(prev => ({ ...prev, name: editProjectName, color: editProjectColor }))
      }
      setEditingProject(null)
    } catch (e) {
      alert('Fehler: ' + e.message)
    }
  }

  const handleDeleteProject = async () => {
    if (!editingProject) return
    try {
      await projectsApi.remove(editingProject.id)
      setEditingProject(null)
      setShowDeleteConfirm(false)
      const list = await projectsApi.list()
      setProjectsList(list)
      if (currentProject?.id === editingProject.id) {
        setCurrentProject(list[0] || null)
      }
    } catch (e) {
      alert('Fehler: ' + e.message)
    }
  }

  if (!loggedIn) return <Login onLogin={() => setLoggedIn(true)} />

  const projectId = currentProject?.id

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 overflow-x-hidden max-w-[100vw]">
      <header className="bg-gray-900 border-b border-gray-800 px-4 md:px-6 py-3 md:py-4 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0 shrink">
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
                    <div key={p.id} className={`flex items-center hover:bg-gray-700 transition-colors ${
                        currentProject?.id === p.id ? 'bg-gray-700/50 text-emerald-300' : 'text-gray-200'
                      }`}>
                      <button onClick={() => handleSelectProject(p)}
                        className="flex-1 flex items-center gap-2 px-4 py-2.5 text-left text-sm min-w-0">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color || '#10b981' }} />
                        <span className="truncate">{p.name}</span>
                      </button>
                      <button onClick={(e) => handleEditProject(p, e)}
                        className="p-2 mr-1 text-gray-500 hover:text-gray-300 transition-colors shrink-0" title="Bearbeiten">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                    </div>
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
        <div className="hidden md:flex items-center shrink-0">
          <nav className="flex gap-0.5">
            {TABS.map(t => (
              <button key={t} onClick={() => handleTabChange(t)}
                className={`relative px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                  tab === t ? 'bg-emerald-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}>
                {t === 'Admin' ? '⚙️' : t}
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
                </button>
              ))}
            </div>
          </div>
        )}
      </header>
      
      <main className="p-3 md:p-6 max-w-full overflow-x-hidden">
        <div style={{ display: tab === 'Kanban' ? 'block' : 'none' }}>
          <KanbanBoard projectId={projectId} highlightTaskId={highlightTaskId} selectedBoardId={selectedBoardId} onTaskHighlighted={() => setHighlightTaskId(null)} />
        </div>
        <div style={{ display: tab === 'Content' ? 'block' : 'none' }}><Content projectId={projectId} onNavigateToKanban={handleNavigateToKanban} /></div>
        <div style={{ display: tab === 'Webapps' ? 'block' : 'none' }}><Pages projectId={projectId} onNavigateToKanban={handleNavigateToKanban} /></div>
        <div style={{ display: tab === 'Channels' ? 'block' : 'none' }}><Channel projectId={projectId} /></div>
        <div style={{ display: tab === 'Kontext' ? 'block' : 'none' }}><Context projectId={projectId} onNavigateToKanban={handleNavigateToKanban} /></div>
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
                className="w-10 h-10 bg-transparent border-0 rounded cursor-pointer p-0"
                style={{ WebkitAppearance: 'none', MozAppearance: 'none', appearance: 'none' }} />
              <span className="w-4 h-4 rounded-full" style={{ backgroundColor: newProjectColor }} />
            </div>
            <div className="flex gap-2">
              <button onClick={handleCreateProject} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm font-medium transition-colors">Erstellen</button>
              <button onClick={() => setShowNewProject(false)} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors">Abbrechen</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Project Modal */}
      {editingProject && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-3" onClick={() => setEditingProject(null)}>
          <div className="bg-gray-900 p-6 rounded-xl border border-gray-700 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">Projekt bearbeiten</h3>
            <input value={editProjectName} onChange={e => setEditProjectName(e.target.value)} placeholder="Projektname"
              className="w-full mb-3 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-emerald-500" autoFocus
              onKeyDown={e => e.key === 'Enter' && handleUpdateProject()} />
            <div className="mb-4 flex items-center gap-3">
              <label className="text-sm text-gray-400">Farbe:</label>
              <input type="color" value={editProjectColor} onChange={e => setEditProjectColor(e.target.value)}
                className="w-10 h-10 bg-transparent border-0 rounded cursor-pointer p-0"
                style={{ WebkitAppearance: 'none', MozAppearance: 'none', appearance: 'none' }} />
              <span className="w-4 h-4 rounded-full" style={{ backgroundColor: editProjectColor }} />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                <button onClick={handleUpdateProject} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm font-medium transition-colors">Speichern</button>
                <button onClick={() => setEditingProject(null)} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors">Abbrechen</button>
              </div>
              {projectsList.length > 1 && !showDeleteConfirm && (
                <button onClick={() => setShowDeleteConfirm(true)}
                  className="px-3 py-2 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded-lg text-sm transition-colors">
                  Löschen
                </button>
              )}
              {showDeleteConfirm && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-red-400">Alles löschen?</span>
                  <button onClick={handleDeleteProject}
                    className="px-3 py-1.5 bg-red-600 hover:bg-red-500 rounded-lg text-xs font-medium text-white transition-colors">Ja</button>
                  <button onClick={() => setShowDeleteConfirm(false)}
                    className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-xs transition-colors">Nein</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
