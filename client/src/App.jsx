import React, { useState, useEffect } from 'react'
import { isLoggedIn, login as doLogin, logout } from './api'
import Login from './components/Login'
import KanbanBoard from './components/KanbanBoard'
import MemoryViewer from './components/MemoryViewer'
import Logbuch from './components/Logbuch'
import Channel from './components/Channel'

const TABS = ['Kanban', 'Memory', 'Channel']

export default function App() {
  const [loggedIn, setLoggedIn] = useState(isLoggedIn())
  const [tab, setTab] = useState('Kanban')

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
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  tab === t ? 'bg-emerald-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}>{t}</button>
            ))}
          </nav>
          <button onClick={() => { logout(); setLoggedIn(false) }}
            className="text-sm text-gray-500 hover:text-red-400 transition-colors">Logout</button>
        </div>
      </header>
      <main className="p-6">
        {tab === 'Kanban' && <KanbanBoard />}
        {tab === 'Memory' && <MemoryViewer />}
        {tab === 'Logbuch' && <Logbuch />}
        {tab === 'Channel' && <Channel />}
      </main>
    </div>
  )
}
