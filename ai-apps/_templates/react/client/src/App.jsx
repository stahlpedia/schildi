import { useState } from 'react';
import { api } from './api';

export default function App() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [result, setResult] = useState('Ready');

  async function run(path, options) {
    const res = await api(path, options);
    setResult(JSON.stringify(res, null, 2));
  }

  function payload() {
    return JSON.stringify({ email: email.trim(), password });
  }

  return (
    <main className="container">
      <h1>React Template</h1>
      <p className="muted">Register, login and test protected endpoint.</p>

      <section className="card">
        <h2>Auth</h2>
        <label>
          Email
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" />
        </label>
        <label>
          Password
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            minLength={8}
            autoComplete="current-password"
          />
        </label>
        <div className="row">
          <button onClick={() => run('/api/auth/register', { method: 'POST', body: payload() })}>Register</button>
          <button onClick={() => run('/api/auth/login', { method: 'POST', body: payload() })}>Login</button>
          <button onClick={() => run('/api/auth/logout', { method: 'POST' })}>Logout</button>
        </div>
      </section>

      <section className="card">
        <h2>Session</h2>
        <div className="row">
          <button onClick={() => run('/api/auth/me')}>Load /api/auth/me</button>
          <button onClick={() => run('/api/protected')}>Load /api/protected</button>
        </div>
      </section>

      <section className="card">
        <h2>Result</h2>
        <pre>{result}</pre>
      </section>
    </main>
  );
}
