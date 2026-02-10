import React, { useState } from 'react'
import { login } from '../api'

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    try {
      await login(username, password)
      onLogin()
    } catch { setError('Login fehlgeschlagen') }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <form onSubmit={handleSubmit} className="bg-gray-900 p-8 rounded-2xl shadow-2xl w-full max-w-sm border border-gray-800">
        <div className="text-center mb-6">
          <span className="text-5xl">🐢</span>
          <h1 className="text-2xl font-bold text-white mt-2">Schildi Dashboard</h1>
        </div>
        {error && <p className="text-red-400 text-sm mb-4 text-center">{error}</p>}
        <input value={username} onChange={e => setUsername(e.target.value)} placeholder="Benutzername"
          className="w-full mb-3 px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500" />
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Passwort"
          className="w-full mb-4 px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500" />
        <button type="submit" className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg transition-colors">
          Anmelden
        </button>
      </form>
    </div>
  )
}
