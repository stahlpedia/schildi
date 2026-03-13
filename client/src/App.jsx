import React, { useState, useEffect, useCallback, useRef } from 'react'
import { isLoggedIn, logout, channel, admin } from './api'
import { useSSE, requestNotificationPermission, showNotification, subscribePush } from './useSSE'
import Login from './components/Login'
import KanbanBoard from './components/KanbanBoard'
import Admin from './components/Admin'
import Channel from './components/Channel'
import Pages from './components/Pages'
import Openclaw from './components/Openclaw'
import ContentBrowser from './components/ContentBrowser'

const TABS = ['Kanban', 'Agents', 'Content', 'Pages', 'Openclaw', 'Admin']

export default function App() {
  const [loggedIn, setLoggedIn] = useState(isLoggedIn())
  const [tab, setTab] = useState('Kanban')
  const [unansweredCount, setUnansweredCount] = useState(0)
  const [highlightTaskId, setHighlightTaskId] = useState(null)
  const [selectedBoardId, setSelectedBoardId] = useState(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [branding, setBranding] = useState({ title: 'Schildi Dashboard', logoUrl: null })

  const unreadCount = useRef(0)
  const originalTitle = useRef(document.title)

  useEffect(() => {
    const onFocus = () => {
      unreadCount.current = 0
      document.title = originalTitle.current
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  const handleSSEEvent = useCallback((event) => {
    window.dispatchEvent(new CustomEvent('sse-event', { detail: event }))

    if (document.hidden) {
      unreadCount.current += 1
      document.title = `(${unreadCount.current}) ${originalTitle.current}`
      switch (event.type) {
        case 'kanban': {
          const { action, card, cardId } = event.data
          if (action === 'created') {
            showNotification('Neuer Task', card?.title || 'Ein Task wurde erstellt', { tag: `kanban-${card?.id}` })
          } else if (action === 'updated') {
            const status = card?.column_name
            const label = status === 'done' ? '✅ Erledigt' : status === 'in-progress' ? '🔄 In Arbeit' : status || 'Aktualisiert'
            showNotification(`Task: ${label}`, card?.title || '', { tag: `kanban-${card?.id}` })
          } else if (action === 'deleted') {
            showNotification('Task gelöscht', `Task #${cardId} wurde entfernt`, { tag: `kanban-${cardId}` })
          }
          break
        }
        case 'content': {
          const { action, file } = event.data
          if (action === 'uploaded') {
            showNotification('Neue Datei', file?.filename || 'Eine Datei wurde hochgeladen', { tag: `content-${file?.id}` })
          } else if (action === 'updated') {
            showNotification('Datei aktualisiert', file?.filename || '', { tag: `content-${file?.id}` })
          } else if (action === 'deleted') {
            showNotification('Datei gelöscht', 'Eine Datei wurde entfernt', { tag: `content-del` })
          }
          break
        }
        case 'pages': {
          const { action, domain, path } = event.data
          const label = action === 'created' ? 'Neue Datei' : action === 'updated' ? 'Datei aktualisiert' : 'Datei gelöscht'
          showNotification(`Pages: ${label}`, `${domain}/${path || ''}`, { tag: `pages-${domain}-${path}` })
          break
        }
        case 'channel': {
          const { action } = event.data
          if (action === 'agent_reply') {
            showNotification('Neue Antwort', 'Der Agent hat geantwortet', { tag: `channel-${event.data.conversationId}` })
          } else if (action === 'message') {
            const msg = event.data.message
            if (msg?.author === 'agent') {
              showNotification('Neue Nachricht', msg.text?.slice(0, 100) || '', { tag: `channel-${event.data.conversationId}` })
            }
          }
          break
        }
      }
    }
  }, [])

  useSSE(loggedIn ? handleSSEEvent : () => {})

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

  useEffect(() => {
    if (!loggedIn) return
    requestNotificationPermission()
    setTimeout(() => subscribePush(), 3000)
    checkUnanswered()
    loadBranding()
    const interval = setInterval(checkUnanswered, 15000)
    const handleBrandingUpdate = () => loadBranding()
    window.addEventListener('brandingUpdated', handleBrandingUpdate)
    return () => {
      clearInterval(interval)
      window.removeEventListener('brandingUpdated', handleBrandingUpdate)
    }
  }, [loggedIn])

  const handleNavigateToKanban = (taskId, boardId) => {
    setHighlightTaskId(taskId)
    setSelectedBoardId(boardId)
    setTab('Kanban')
  }

  const handleTabChange = (newTab) => {
    setTab(newTab)
    setMobileMenuOpen(false)
  }

  if (!loggedIn) return <Login onLogin={() => setLoggedIn(true)} />

  // Intern: festes Default-Projekt, bis die Server-API projektfrei umgebaut ist
  const projectId = 1

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
          <span className="text-sm font-semibold text-gray-300 hidden md:inline">{branding.title || 'Schildi Dashboard'}</span>
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
        <div style={{ display: tab === 'Agents' ? 'block' : 'none' }}><Channel projectId={projectId} /></div>
        <div style={{ display: tab === 'Content' ? 'block' : 'none' }}><ContentBrowser /></div>
        <div style={{ display: tab === 'Pages' ? 'block' : 'none' }}><Pages projectId={projectId} onNavigateToKanban={handleNavigateToKanban} /></div>
        <div style={{ display: tab === 'Openclaw' ? 'block' : 'none' }}><Openclaw /></div>
        <div style={{ display: tab === 'Admin' ? 'block' : 'none' }}><Admin onLogout={() => { logout(); setLoggedIn(false) }} /></div>
      </main>
    </div>
  )
}
