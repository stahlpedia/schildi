import React, { useState, useEffect } from 'react'
import { isLoggedIn, login as doLogin, logout, channel } from './api'
import Login from './components/Login'
import KanbanBoard from './components/KanbanBoard'
import MemoryViewer from './components/MemoryViewer'
import Logbuch from './components/Logbuch'
import Channel from './components/Channel'
import Pages from './components/Pages'

const TABS = ['Kanban', 'Memory', 'Channel', 'Pages']

export default function App() {
  const [loggedIn, setLoggedIn] = useState(isLoggedIn())
  const [tab, setTab] = useState('Kanban')
  const [unansweredCount, setUnansweredCount] = useState(0)

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
    if (tab === 'Channel') checkUnanswered()
  }, [tab])

  if (!loggedIn) return <Login onLogin={() => setLoggedIn(true)} />

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-3xl">🐢</span>
          <h1 className="text-xl font-bold">Schildi Dashboard</h1>
        </div>
        <div className="flex items-center gap-4">
          <nav className="flex gap-1">
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`relative px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  tab === t ? 'bg-emerald-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}>
                {t}
                {t === 'Channel' && unansweredCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[10px] font-bold flex items-center justify-center text-white">
                    {unansweredCount}
                  </span>
                )}
              </button>
            ))}
          </nav>
          <button onClick={() => { logout(); setLoggedIn(false) }}
            className="text-sm text-gray-500 hover:text-red-400 transition-colors">Logout</button>
        </div>
      </header>
      <main className="p-6">
        <div style={{ display: tab === 'Kanban' ? 'block' : 'none' }}><KanbanBoard /></div>
        <div style={{ display: tab === 'Memory' ? 'block' : 'none' }}><MemoryViewer /></div>
        <div style={{ display: tab === 'Logbuch' ? 'block' : 'none' }}><Logbuch /></div>
        <div style={{ display: tab === 'Channel' ? 'block' : 'none' }}><Channel onUpdate={checkUnanswered} /></div>
        <div style={{ display: tab === 'Pages' ? 'block' : 'none' }}><Pages /></div>
      </main>
    </div>
  )
}
