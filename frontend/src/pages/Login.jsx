import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

// Real column labels from fields.js — the ticker reads the archive's own
// schema instead of decorative copy.
const TICKER_FIELDS = [
  'NO AGENDA',
  'STATUS PERMOHONAN',
  'NO SERTIFIKAT',
  'TANGGAL TERBIT',
  'SUMBER SLO',
  'NAMA UP3',
];

function FieldTicker() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % TICKER_FIELDS.length), 2600);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="login-ticker" aria-hidden="true">
      <span className="login-ticker-dot" />
      <span className="login-ticker-text" key={index}>
        {TICKER_FIELDS[index]}
      </span>
    </div>
  );
}

function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate(location.state?.from ?? '/data', { replace: true });
    } catch (err) {
      setError(err.response?.data?.error?.message ?? 'Unable to sign in');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <svg className="login-traces" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <path className="trace" d="M-20 120 H180 V220 H420 V70 H820" />
        <path className="trace" d="M-20 470 H140 V360 H360 V500 H620 V410 H820" />
        <path className="trace trace-flow" d="M-60 300 H120 V180 H340 V300 H600 V210 H900" />
        <circle className="trace-via" cx="180" cy="220" r="3.5" />
        <circle className="trace-via" cx="420" cy="220" r="3.5" />
        <circle className="trace-via" cx="140" cy="360" r="3.5" />
        <circle className="trace-via" cx="360" cy="360" r="3.5" />
        <circle className="trace-via" cx="340" cy="300" r="3.5" />
        <circle className="trace-via" cx="600" cy="300" r="3.5" />
      </svg>

      <div className="login-panel">
        <div className="login-panel-bezel" />

        <div className="login-brand-row">
          <span className="login-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none">
              <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" fill="currentColor" />
            </svg>
          </span>
          <span className="login-wordmark">ARCHIVE SLO</span>
          <FieldTicker />
        </div>

        <form onSubmit={handleSubmit}>
          <h1 className="login-heading">Sign in to the archive</h1>
          <p className="login-subtext">For PLN backoffice staff — Superadmin and Karyawan accounts.</p>

          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              placeholder="name@company.com"
              required
            />
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="••••••••"
              required
            />
          </div>

          {error && <p className="form-error">{error}</p>}

          <button className="login-submit" type="submit" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="login-footer">
          <span>Internal system</span>
          <span className="login-footer-dot">·</span>
          <span>Superadmin &amp; Karyawan access</span>
        </div>
      </div>
    </div>
  );
}

export default Login;
