import React, { useState, useEffect } from 'react'
import { isLoggedIn, login as doLogin, logout, channel } from './api'
import Login from './components/Login'
import KanbanBoard from './components/KanbanBoard'
import Admin from './components/Admin'
import Logbuch from './components/Logbuch'
import Channel from './components/Channel'
import Pages from './components/Pages'

const TABS = ['Kanban', 'Channels', 'Pages', 'Admin']

export default function App() {
  const [loggedIn, setLoggedIn] = useState(isLoggedIn())
  const [tab, setTab] = useState('Kanban')
  const [unansweredCount, setUnansweredCount] = useState(0)
  const [highlightTaskId, setHighlightTaskId] = useState(null)
  const [selectedBoardId, setSelectedBoardId] = useState(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const checkUnanswered = async () => {
    try {
      const list = await channel.unanswered()
      setUnansweredCount(list.length)
    } catch {}
  }

  useEffect(() => {
    if (!loggedIn) return
    checkUnanswered()
    const interval = setInterval(checkUnanswered, 15000)
    return () => clearInterval(interval)
  }, [loggedIn])

  // Also refresh when switching to Channel tab
  useEffect(() => {
    if (tab === 'Channels') checkUnanswered()
  }, [tab])

  const handleNavigateToKanban = (taskId, boardId) => {
    setHighlightTaskId(taskId)
    setSelectedBoardId(boardId)
    setTab('Kanban')
  }

  const handleTabChange = (newTab) => {
    setTab(newTab)
    setMobileMenuOpen(false) // Close mobile menu when tab is selected
  }

  if (!loggedIn) return <Login onLogin={() => setLoggedIn(true)} />

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="bg-gray-900 border-b border-gray-800 px-4 md:px-6 py-3 md:py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl md:text-3xl">🐢</span>
          <h1 className="text-lg md:text-xl font-bold">Schildi Dashboard</h1>
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
                  <span className="font-medium">{t === 'Admin' ? '⚙️ Admin' : t}</span>
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
          <KanbanBoard highlightTaskId={highlightTaskId} selectedBoardId={selectedBoardId} onTaskHighlighted={() => setHighlightTaskId(null)} />
        </div>
        <div style={{ display: tab === 'Channels' ? 'block' : 'none' }}><Channel onUpdate={checkUnanswered} /></div>
        <div style={{ display: tab === 'Pages' ? 'block' : 'none' }}><Pages onNavigateToKanban={handleNavigateToKanban} /></div>
        <div style={{ display: tab === 'Admin' ? 'block' : 'none' }}><Admin onLogout={() => { logout(); setLoggedIn(false) }} /></div>
      </main>
    </div>
  )
}
