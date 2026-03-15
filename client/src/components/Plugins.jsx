import React from 'react'

const PLUGINS = [
  {
    name: 'Remotion',
    status: 'Aktiv in OpenClaw',
    note: 'Rendering für Video und Still Images. Soll Puppeteer und ffmpeg im Dashboard perspektivisch ersetzen.',
    paths: ['projects/remotion/', '/content'],
  },
  {
    name: 'ffmpeg',
    status: 'Aktiv in OpenClaw',
    note: 'Systemweit im OpenClaw-Container installiert. Aktuell noch für bestehende Dashboard-Renderpfade relevant.',
    paths: ['OpenClaw Container'],
  },
  {
    name: 'Chrome Headless Shell',
    status: 'Aktiv in OpenClaw',
    note: 'Wird von Remotion zum Rendern genutzt.',
    paths: ['projects/remotion/node_modules/.remotion/'],
  },
  {
    name: 'React / Vite Pages',
    status: 'Geplant als Standard für Pages',
    note: 'Statische React-Seiten werden gebaut und nach /www deployed. Kein App-Runner nötig.',
    paths: ['/www'],
  },
]

export default function Plugins() {
  return (
    <div className="space-y-4 overflow-y-auto h-full pr-1">
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 md:p-5">
        <h2 className="text-lg font-semibold text-white mb-2">Plugins</h2>
        <p className="text-sm text-gray-400">
          Dokumentation der Zusatzmodule und Laufzeit-Erweiterungen. Installation passiert nicht hier, sondern über Docker oder direkt in OpenClaw.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {PLUGINS.map((plugin) => (
          <div key={plugin.name} className="bg-gray-900 rounded-xl border border-gray-800 p-4">
            <div className="flex items-center justify-between gap-3 mb-2">
              <h3 className="text-white font-medium">{plugin.name}</h3>
              <span className="text-[11px] px-2 py-1 rounded-full bg-emerald-900/40 text-emerald-300 border border-emerald-800">
                {plugin.status}
              </span>
            </div>
            <p className="text-sm text-gray-400 mb-3">{plugin.note}</p>
            <div className="flex flex-wrap gap-2">
              {plugin.paths.map((path) => (
                <span key={path} className="text-xs px-2 py-1 rounded bg-gray-800 text-gray-300 border border-gray-700 font-mono">
                  {path}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
