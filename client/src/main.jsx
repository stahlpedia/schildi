import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Service Worker registrieren
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(registration => {
        console.log('SW: Registriert', registration);
      })
      .catch(registrationError => {
        console.log('SW: Registrierung fehlgeschlagen', registrationError);
      });
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />)
