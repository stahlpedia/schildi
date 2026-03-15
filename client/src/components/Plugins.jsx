import React from 'react'

const PLUGINS = [
  {
    name: 'Remotion v4',
    status: 'Aktiv in OpenClaw',
    note: 'React-basiertes Video-Rendering. Compositions: BriefingVideo, SocialCard, SocialTeaser, BriefingKW09. Ersetzt Puppeteer+ffmpeg Pipeline.',
    paths: ['projects/remotion/', '/content/videos/'],
  },
  {
    name: 'ffmpeg 5.1',
    status: 'Aktiv in OpenClaw',
    note: 'Video-Encoding, Komprimierung, Frame-Extraktion. Wird von Remotion intern und standalone genutzt.',
    paths: ['OpenClaw Container'],
  },
  {
    name: 'ImageMagick 6.9',
    status: 'Aktiv in OpenClaw',
    note: 'Bildbearbeitung, Compositing, Resize, Format-Konvertierung. Vorinstalliert im Container.',
    paths: ['OpenClaw Container'],
  },
  {
    name: 'Chrome Headless Shell',
    status: 'Aktiv in OpenClaw',
    note: 'Wird von Remotion zum Frame-Rendering genutzt. Automatisch installiert via @remotion/compositor.',
    paths: ['projects/remotion/node_modules/.remotion/'],
  },
  {
    name: 'ElevenLabs TTS',
    status: 'Aktiv (API)',
    note: 'Text-to-Speech via API. Schildi-Stimme (vPDsszmHlzvG3I4bnDga) für Briefings und Podcasts.',
    paths: ['$ELEVENLABS_API_KEY'],
  },
  {
    name: 'Pixabay',
    status: 'Aktiv (API)',
    note: 'Lizenzfreie Bilder und Videos für Content-Produktion.',
    paths: ['$PIXABAY_API_KEY'],
  },
  {
    name: 'WordPress (stahlworte.de)',
    status: 'Aktiv (API)',
    note: 'Blog-Artikel lesen und veröffentlichen. Schildi hat Editor-Rolle.',
    paths: ['$WORDPRESS_API_KEY'],
  },
  {
    name: 'GitHub',
    status: 'Aktiv (API)',
    note: 'Repository-Zugriff, Pages Import/Sync im Dashboard.',
    paths: ['$GITHUB_TOKEN'],
  },
  {
    name: 'React / Vite Pages',
    status: 'Aktiv',
    note: 'Statische Webseiten werden gebaut und nach /www deployed. Caddy serviert sie automatisch.',
    paths: ['/www/'],
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
