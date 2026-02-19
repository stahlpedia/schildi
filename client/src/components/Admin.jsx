import React, { useState, useEffect } from 'react'
import MemoryViewer from './MemoryViewer'
import { admin } from '../api'

const ADMIN_SECTIONS = [
  { id: 'profile', label: 'Profil', icon: '👤' },
  { id: 'appearance', label: 'Erscheinungsbild', icon: '🎨' },
  { id: 'memory', label: 'Memory', icon: '🧠' },
  { id: 'system', label: 'System', icon: '⚙️' },
  { id: 'backup', label: 'Backup', icon: '💾' },
  { id: 'logout', label: 'Logout', icon: '🚪' }
]

export default function Admin({ onLogout }) {
  const [activeSection, setActiveSection] = useState('profile')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [systemInfo, setSystemInfo] = useState(null)
  const [passwordForm, setPasswordForm] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' })
  const [passwordMessage, setPasswordMessage] = useState('')
  const [darkMode, setDarkMode] = useState(localStorage.getItem('darkMode') === 'true')
  const [branding, setBranding] = useState({ title: 'Schildi Dashboard', logoUrl: null })
  const [brandingForm, setBrandingForm] = useState({ title: '' })
  const [brandingMessage, setBrandingMessage] = useState('')
  const [logoUploading, setLogoUploading] = useState(false)

  useEffect(() => {
    if (activeSection === 'system') {
      loadSystemInfo()
    } else if (activeSection === 'appearance') {
      loadBrandingSettings()
    }
  }, [activeSection])

  const loadBrandingSettings = async () => {
    try {
      const data = await admin.branding()
      setBranding(data)
      setBrandingForm({ title: data.title })
    } catch (error) {
      console.error('Failed to load branding settings:', error)
    }
  }

  const loadSystemInfo = async () => {
    try {
      const data = await admin.systemInfo()
      setSystemInfo(data)
    } catch (error) {
      console.error('Failed to load system info:', error)
    }
  }

  const handlePasswordChange = async (e) => {
    e.preventDefault()
    setPasswordMessage('')
    
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordMessage('Neue Passwörter stimmen nicht überein')
      return
    }
    
    if (passwordForm.newPassword.length < 6) {
      setPasswordMessage('Neues Passwort muss mindestens 6 Zeichen lang sein')
      return
    }
    
    try {
      await admin.changePassword(passwordForm.oldPassword, passwordForm.newPassword)
      setPasswordMessage('Passwort erfolgreich geändert')
      setPasswordForm({ oldPassword: '', newPassword: '', confirmPassword: '' })
    } catch (error) {
      setPasswordMessage('Fehler beim Ändern des Passworts: ' + error.message)
    }
  }

  const handleLogout = () => {
    if (confirm('Wirklich ausloggen?')) {
      onLogout()
    }
  }

  const toggleDarkMode = () => {
    const newDarkMode = !darkMode
    setDarkMode(newDarkMode)
    localStorage.setItem('darkMode', newDarkMode.toString())
    
    // Apply theme to document
    if (newDarkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }

  const handleTitleSave = async () => {
    setBrandingMessage('')
    
    if (!brandingForm.title || brandingForm.title.trim().length === 0) {
      setBrandingMessage('Titel ist erforderlich')
      return
    }
    
    try {
      await admin.updateBranding({ title: brandingForm.title.trim() })
      setBranding(prev => ({ ...prev, title: brandingForm.title.trim() }))
      setBrandingMessage('Titel erfolgreich gespeichert')
      
      // Trigger app header update
      window.dispatchEvent(new CustomEvent('brandingUpdated'))
    } catch (error) {
      setBrandingMessage('Fehler beim Speichern des Titels: ' + error.message)
    }
  }

  const handleLogoUpload = async (event) => {
    const file = event.target.files[0]
    if (!file) return
    
    setBrandingMessage('')
    setLogoUploading(true)
    
    try {
      await admin.uploadLogo(file)
      setBranding(prev => ({ ...prev, logoUrl: '/api/admin/branding/logo-file?t=' + Date.now() }))
      setBrandingMessage('Logo erfolgreich hochgeladen')
      
      // Trigger app header update
      window.dispatchEvent(new CustomEvent('brandingUpdated'))
    } catch (error) {
      setBrandingMessage('Fehler beim Upload des Logos: ' + error.message)
    } finally {
      setLogoUploading(false)
      // Clear file input
      event.target.value = ''
    }
  }

  const handleLogoDelete = async () => {
    if (!confirm('Logo wirklich entfernen?')) return
    
    setBrandingMessage('')
    
    try {
      await admin.deleteLogo()
      setBranding(prev => ({ ...prev, logoUrl: null }))
      setBrandingMessage('Logo erfolgreich entfernt')
      
      // Trigger app header update
      window.dispatchEvent(new CustomEvent('brandingUpdated'))
    } catch (error) {
      setBrandingMessage('Fehler beim Entfernen des Logos: ' + error.message)
    }
  }

  const downloadFile = (url, filename) => {
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
  }

  const handleFileUpload = async (event, type) => {
    const file = event.target.files[0]
    if (!file) return
    
    if (type === 'db') {
      if (!confirm('WARNUNG: Das überschreibt die komplette Datenbank! Fortsetzten?')) {
        return
      }
      try {
        await admin.restoreDb(file)
        alert('Datenbank wurde importiert. Seite wird neu geladen...')
        window.location.reload()
      } catch (error) {
        alert('Fehler beim Import: ' + error.message)
      }
    } else if (type === 'workspace') {
      try {
        await admin.restoreWorkspace(file)
        alert('Workspace wurde importiert')
      } catch (error) {
        alert('Fehler beim Import: ' + error.message)
      }
    }
  }

  const renderContent = () => {
    switch (activeSection) {
      case 'profile':
        return (
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-gray-100">Profil</h2>
            
            <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
              <h3 className="text-lg font-medium mb-4 text-gray-200">Passwort ändern</h3>
              <form onSubmit={handlePasswordChange} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Aktuelles Passwort</label>
                  <input
                    type="password"
                    value={passwordForm.oldPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, oldPassword: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-100 focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Neues Passwort</label>
                  <input
                    type="password"
                    value={passwordForm.newPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-100 focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Neues Passwort bestätigen</label>
                  <input
                    type="password"
                    value={passwordForm.confirmPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-100 focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg transition-colors"
                >
                  Passwort ändern
                </button>
                {passwordMessage && (
                  <p className={`text-sm ${passwordMessage.includes('erfolgreich') ? 'text-emerald-400' : 'text-red-400'}`}>
                    {passwordMessage}
                  </p>
                )}
              </form>
            </div>
          </div>
        )

      case 'appearance':
        return (
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-gray-100">Erscheinungsbild</h2>
            
            {/* Branding Settings */}
            <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
              <h3 className="text-lg font-medium mb-4 text-gray-200">Dashboard-Branding</h3>
              
              {/* Title */}
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Dashboard-Titel</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={brandingForm.title}
                      onChange={(e) => setBrandingForm({ title: e.target.value })}
                      placeholder="Dashboard-Titel"
                      className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-100 focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    />
                    <button
                      onClick={handleTitleSave}
                      disabled={!brandingForm.title.trim() || brandingForm.title === branding.title}
                      className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg transition-colors"
                    >
                      Speichern
                    </button>
                  </div>
                </div>
              </div>
              
              {/* Logo */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Logo</label>
                  
                  {/* Logo Preview */}
                  <div className="mb-4 p-4 bg-gray-800 rounded-lg border border-gray-700">
                    <div className="flex items-center gap-3">
                      {branding.logoUrl ? (
                        <img 
                          src={branding.logoUrl} 
                          alt="Logo" 
                          className="h-12 max-w-[200px] object-contain"
                          onError={(e) => {
                            e.target.style.display = 'none'
                            e.target.nextElementSibling.style.display = 'block'
                          }}
                        />
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">🐢</span>
                          <span className="text-gray-400 text-sm">Standard-Emoji</span>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Logo Actions */}
                  <div className="flex flex-wrap gap-2">
                    <label className={`cursor-pointer bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors text-sm ${logoUploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                      {logoUploading ? 'Uploading...' : '📁 Logo hochladen'}
                      <input
                        type="file"
                        accept=".png,.jpg,.jpeg,.svg,.webp"
                        className="hidden"
                        onChange={handleLogoUpload}
                        disabled={logoUploading}
                      />
                    </label>
                    {branding.logoUrl && (
                      <button
                        onClick={handleLogoDelete}
                        className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors text-sm"
                      >
                        🗑️ Logo entfernen
                      </button>
                    )}
                  </div>
                  
                  <p className="text-xs text-gray-500 mt-2">
                    Max. 2MB • PNG, JPG, SVG, WebP • Empfohlen: max. 48px Höhe
                  </p>
                </div>
              </div>
              
              {brandingMessage && (
                <p className={`text-sm mt-4 ${brandingMessage.includes('erfolgreich') ? 'text-emerald-400' : 'text-red-400'}`}>
                  {brandingMessage}
                </p>
              )}
            </div>
            
            {/* Theme Settings */}
            <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
              <h3 className="text-lg font-medium mb-4 text-gray-200">Theme</h3>
              <div className="flex items-center space-x-4">
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={darkMode}
                    onChange={toggleDarkMode}
                    className="w-4 h-4 text-emerald-600 bg-gray-800 border-gray-600 rounded focus:ring-emerald-500"
                  />
                  <span className="text-gray-300">Dark Mode</span>
                </label>
              </div>
            </div>
          </div>
        )

      case 'memory':
        return (
          <div>
            <h2 className="text-xl font-bold text-gray-100 mb-6">Memory</h2>
            <MemoryViewer />
          </div>
        )

      case 'system':
        return (
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-gray-100">System-Info</h2>
            
            {systemInfo ? (
              <div className="space-y-4">
                <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
                  <h3 className="text-lg font-medium mb-4 text-gray-200">API Status</h3>
                  <div className="space-y-2">
                    <div className="flex items-center space-x-3">
                      <div className="w-3 h-3 bg-emerald-500 rounded-full"></div>
                      <span className="text-gray-300">Dashboard Backend</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <div className={`w-3 h-3 rounded-full ${systemInfo.openclaw_status ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
                      <span className="text-gray-300">OpenClaw ({systemInfo.openclaw_status ? 'Online' : 'Offline'})</span>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
                  <h3 className="text-lg font-medium mb-4 text-gray-200">Datenbank</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-400">Tasks:</span>
                      <span className="ml-2 text-gray-100">{systemInfo.db_stats.tasks}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">Nachrichten:</span>
                      <span className="ml-2 text-gray-100">{systemInfo.db_stats.messages}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">Attachments:</span>
                      <span className="ml-2 text-gray-100">{systemInfo.db_stats.attachments}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">Attachment-Größe:</span>
                      <span className="ml-2 text-gray-100">{systemInfo.attachment_size}</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-gray-500">Lade System-Informationen...</p>
            )}
          </div>
        )

      case 'backup':
        return (
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-gray-100">Backup & Restore</h2>
            
            <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
              <h3 className="text-lg font-medium mb-4 text-gray-200">Export</h3>
              <div className="space-y-3">
                <button
                  onClick={() => downloadFile(admin.backupDb(), 'schildi.db')}
                  className="block w-full text-left bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors"
                >
                  🗃️ Datenbank exportieren
                </button>
                <button
                  onClick={() => downloadFile(admin.backupWorkspace(), 'workspace.tar.gz')}
                  className="block w-full text-left bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors"
                >
                  📂 Workspace exportieren
                </button>
                <button
                  onClick={() => downloadFile(admin.backupAttachments(), 'attachments.tar.gz')}
                  className="block w-full text-left bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors"
                >
                  📎 Attachments exportieren
                </button>
              </div>
            </div>

            <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
              <h3 className="text-lg font-medium mb-4 text-gray-200">Import</h3>
              <div className="space-y-3">
                <div>
                  <label className="block bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors cursor-pointer">
                    🗃️ Datenbank importieren
                    <input
                      type="file"
                      accept=".db"
                      className="hidden"
                      onChange={(e) => handleFileUpload(e, 'db')}
                    />
                  </label>
                </div>
                <div>
                  <label className="block bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors cursor-pointer">
                    📂 Workspace importieren
                    <input
                      type="file"
                      accept=".tar.gz,.tgz"
                      className="hidden"
                      onChange={(e) => handleFileUpload(e, 'workspace')}
                    />
                  </label>
                </div>
              </div>
            </div>
          </div>
        )

      case 'logout':
        return (
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-gray-100">Logout</h2>
            
            <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
              <p className="text-gray-300 mb-4">Möchten Sie sich abmelden?</p>
              <button
                onClick={handleLogout}
                className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-lg transition-colors"
              >
                Abmelden
              </button>
            </div>
          </div>
        )

      default:
        return <div>Bereich nicht gefunden</div>
    }
  }

  return (
    <div className="flex gap-6 h-[calc(100vh-140px)]">
      {/* Desktop Sidebar */}
      <div className="hidden lg:block w-64 shrink-0 bg-gray-900 rounded-xl p-4 border border-gray-800">
        <h3 className="font-bold mb-4 text-sm text-gray-400 uppercase tracking-wider">Admin</h3>
        <nav className="space-y-1">
          {ADMIN_SECTIONS.map(section => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={`w-full text-left flex items-center space-x-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                activeSection === section.id
                  ? 'bg-emerald-900/50 text-emerald-300'
                  : 'text-gray-300 hover:bg-gray-800'
              }`}
            >
              <span>{section.icon}</span>
              <span>{section.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Mobile Sidebar Toggle */}
      <div className="lg:hidden fixed top-20 left-4 z-10">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="bg-gray-800 text-gray-400 p-2 rounded-lg hover:bg-gray-700 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
          </svg>
        </button>
      </div>

      {/* Mobile Sidebar */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 bg-black/60 z-20" onClick={() => setSidebarOpen(false)}>
          <div className="absolute top-0 left-0 w-64 h-full bg-gray-900 border-r border-gray-800 p-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-sm text-gray-400 uppercase tracking-wider">Admin</h3>
              <button
                onClick={() => setSidebarOpen(false)}
                className="text-gray-400 hover:text-white"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <nav className="space-y-1">
              {ADMIN_SECTIONS.map(section => (
                <button
                  key={section.id}
                  onClick={() => { setActiveSection(section.id); setSidebarOpen(false) }}
                  className={`w-full text-left flex items-center space-x-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                    activeSection === section.id
                      ? 'bg-emerald-900/50 text-emerald-300'
                      : 'text-gray-300 hover:bg-gray-800'
                  }`}
                >
                  <span>{section.icon}</span>
                  <span>{section.label}</span>
                </button>
              ))}
            </nav>
          </div>
        </div>
      )}

      {/* Content Area */}
      <div className="flex-1 bg-gray-900 rounded-xl p-6 overflow-y-auto border border-gray-800">
        {renderContent()}
      </div>
    </div>
  )
}