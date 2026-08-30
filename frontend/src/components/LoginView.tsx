import { useState } from 'react';

import { useAuth } from '../lib/auth';
import { backendConfigured } from '../lib/api';
import { HandKeyStage } from '../three/HandKey';

export function LoginView() {
  const { login, devLogin, devBypassEnabled } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (!email.trim() || !password) {
      setError('Enter both email and password.');
      return;
    }
    setBusy(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleDev() {
    setError(null);
    setBusy(true);
    try {
      await devLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      {/* outer backdrop with soft luxury bokeh like the BREEZY image */}
      <div className="login__shell">
        {/* LEFT — luxury showcase, inspired by BREEZY LUXURY layout + Payoneer dark panel */}
        <div className="login__showcase">
          <div className="login__showcase-bg" aria-hidden="true" />
          <div className="login__showcase-grid" aria-hidden="true" />

          <header className="login__brand">
            <span className="login__brand-mark" aria-hidden="true">SD</span>
            <span className="login__brand-word">Service<span>Desk</span></span>
            <span className="login__brand-sub">Service Desk · Dhaka</span>
          </header>

          <div className="login__showcase-head">
            <p className="login__eyebrow">— PROTECT YOUR FLEET FROM DAILY RISK</p>
            <h1 className="login__hero">
              <span className="login__hero--accent">LUXURY</span>
              <span className="login__hero--outline">SERVICE</span>
              <span className="login__hero--muted">DESK</span>
            </h1>
            <p className="login__lede">
              Every vehicle checked against fixed dates, time intervals and distance run — then ranked so the most overdue and the highest value work is on top of your call sheet.
            </p>
          </div>

          {/* 3D hand + key — hero object, like the top-down convertible in BREEZY */}
          <div className="login__stage">
            <HandKeyStage className="login__handkey" />
            {/* decorative glow under the 3D */}
            <div className="login__stage-glow" aria-hidden="true" />
          </div>

          {/* bottom pricing strip — mirrors BREEZY BASIC $6 / ELITE $20 — BDT */}
          <div className="login__strip">
            <div className="login__strip-item">
              <span className="login__strip-label">BASIC<br />WASH</span>
              <span className="login__strip-price">৳600</span>
              <span className="login__strip-meta">- FOOMING - CLEAN WASH<br />- DRY VACUUM - PALLETE</span>
            </div>
            <div className="login__strip-div" aria-hidden="true" />
            <div className="login__strip-item">
              <span className="login__strip-label">ELITE<br />WASH</span>
              <span className="login__strip-price">৳2,000</span>
              <span className="login__strip-meta">- FOOMING - CLEAN WASH<br />- DRY VACUUM - PALLETE</span>
            </div>
          </div>

          <p className="login__foot">OUR BEST <span>CAR WASH</span> SERVICE — 44 vehicles · 28 owners · live due dates from the backend</p>
        </div>

        {/* RIGHT — sign-in card, like Payoneer */}
        <div className="login__panel">
          <div className="login__panel-head">
            <span className="login__panel-logo">
              <span className="login__dot" aria-hidden="true" />
              ServiceDesk
            </span>
            <span className="login__panel-toplink">
              Don&apos;t have an account? <a href="#contact">Contact workshop</a>
            </span>
          </div>

          <div className="login__form-wrap">
            <h2 className="login__title">Sign In</h2>
            <p className="login__hint">
              Workshop access only. All fleet, due-date and call-list data is computed on the backend — the frontend just renders what the API returns.
            </p>

            <form className="login__form" onSubmit={handleSubmit} noValidate>
              <label className="login__field">
                <span className="sr-only">Email or username</span>
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="username"
                  placeholder="Email or Username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-label="Email or Username"
                />
              </label>

              <label className="login__field">
                <span className="sr-only">Password</span>
                <input
                  type={showPw ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-label="Password"
                />
                <button
                  type="button"
                  className="login__eye"
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPw((v) => !v)}
                >
                  {showPw ? '◯' : '◎'}
                </button>
              </label>

              <div className="login__row">
                <span className="login__backend-note">
                  {backendConfigured ? 'Backend: live' : 'If Backend is offline: sample mode — use Dev Bypass'}
                </span>
                <button type="button" className="login__link" onClick={() => alert('Contact Service Desk admin to reset your password.')}>
                  Forgot password?
                </button>
              </div>

              {error ? <p className="login__error" role="alert">{error}</p> : null}

              <button type="submit" className="login__submit" disabled={busy}>
                {busy ? 'Signing in…' : '→ Sign In'}
              </button>

              {devBypassEnabled ? (
                <button type="button" className="login__dev" onClick={handleDev} disabled={busy}>
                  Dev bypass — enter without backend
                </button>
              ) : null}

              <p className="login__faint">
                Demo hint: with no backend, Dev bypass works with any details. With a backend, use a real account (POST <code>/api/v1/auth/login</code>).
              </p>
            </form>
          </div>

          <footer className="login__panel-foot">
            <span>© 2005–2026 ServiceDesk · figures as of today</span>
            <span><a href="#contact">Contact Us</a> · English ▾</span>
          </footer>
        </div>
      </div>
    </div>
  );
}
