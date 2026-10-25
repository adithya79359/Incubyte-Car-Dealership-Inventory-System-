import React, { useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import Dashboard from './Dashboard';
import { ThemeProvider, ThemeToggle } from './Theme';

function App() {
  const [mode, setMode] = useState('login');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Keep credentials in memory so a shared browser does not retain a session.
  const [session, setSession] = useState(null);
  const registering = mode === 'register';
  function switchMode(next) { setMode(next); setError(''); setShowPassword(false); }
  async function submit(event) {
    event.preventDefault();
    setError(''); setBusy(true);
    const body = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const response = await fetch(`/api/auth/${mode}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to sign in. Please try again.');
      const profileResponse = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${data.token}` } });
      if (!profileResponse.ok) throw new Error('Unable to verify your session. Please sign in again.');
      const profile = await profileResponse.json();
      setSession({ token: data.token, user: profile.user });
    } catch (failure) {
      setError(failure instanceof TypeError ? 'Unable to connect. Check your connection and try again.' : failure.message);
    } finally { setBusy(false); }
  }
  const signOut = useCallback((message = '') => { setSession(null); setMode('login'); setError(message); }, []);
  if (session) return <Dashboard session={session} onSignOut={signOut} />;
  return <main className="min-h-screen grid lg:grid-cols-2">
    <section className="story flex flex-col justify-between relative overflow-hidden p-8 md:p-14 lg:p-16" aria-label="Welcome to Motorlane">
      <a className="brand relative z-10" href="/" aria-label="Motorlane home"><span className="brand-icon">m</span>motorlane<span className="brand-dot">.</span></a>
      <div className="relative z-10 py-16 lg:py-24 max-w-lg">
        <p className="eyebrow mb-6"><span className="inline-block w-6 h-px bg-current align-middle mr-3" />THE ROAD AHEAD STARTS HERE</p>
        <h1 className="text-5xl md:text-6xl xl:text-7xl tracking-tight leading-[1.06]">A new drive.<br />A new <em>chapter.</em></h1>
        <p className="story-copy mt-7 max-w-sm text-base leading-7">Great cars. Clear choices. Your next journey starts with a place you can trust.</p>
        <div className="road-art mt-12" aria-hidden="true"><div className="road-line" /><span className="road-label">MAKE YOUR NEXT MOVE</span><span className="road-arrow">↗</span></div>
      </div>
      <div className="relative z-10 flex flex-wrap gap-5 text-xs story-copy"><span>✓ Thoughtfully selected</span><span>✓ Simply transparent</span><span>✓ Ready for the road</span></div>
    </section>
    <section className="form-side flex flex-col px-6 py-8 md:px-16 lg:px-12 xl:px-24">
      <div className="flex justify-end"><ThemeToggle /></div>
      <div className="w-full max-w-md mx-auto flex-1 flex flex-col justify-center py-14">
        {<>
          <div className="tabs flex mb-10" aria-label="Account options">
            <button type="button" disabled={busy} aria-pressed={!registering} onClick={() => switchMode('login')}>Sign in</button>
            <button type="button" disabled={busy} aria-pressed={registering} onClick={() => switchMode('register')}>Create account</button>
          </div>
          <p className="eyebrow text-stone-500 mb-3">{registering ? 'LET’S GET YOU STARTED' : 'GOOD TO SEE YOU AGAIN'}</p>
          <h2 className="text-4xl md:text-[42px] tracking-tight mb-3">{registering ? 'Your next chapter awaits.' : 'Welcome back.'}</h2>
          <p className="text-stone-500 text-sm leading-6 mb-8">{registering ? 'Create your account and take the first step.' : 'Sign in to continue your journey with Motorlane.'}</p>
          <form key={mode} onSubmit={submit} className="space-y-5">
            <fieldset disabled={busy} className="space-y-5">
              {registering && <label className="field">Full name<input autoComplete="name" name="name" placeholder="Your full name" required maxLength={80} /></label>}
              <label className="field">Email address<input autoComplete="email" type="email" name="email" placeholder="you@example.com" required maxLength={254} /></label>
              <label className="field">Password<div className="relative"><input className="pr-20" autoComplete={registering ? 'new-password' : 'current-password'} type={showPassword ? 'text' : 'password'} name="password" aria-label="Password" placeholder={registering ? 'Create a strong password' : 'Enter your password'} required minLength={registering ? 12 : 1} maxLength={128} aria-describedby={registering ? 'password-hint' : undefined} /><button type="button" className="password-toggle" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? 'Hide' : 'Show'}</button></div></label>
              {registering && <p id="password-hint" className="text-xs text-stone-500">Use 12–128 characters for your password.</p>}
              {error && <p role="alert" className="error">{error}</p>}
              <button className="submit" type="submit">{busy ? 'Please wait…' : registering ? 'Create account' : 'Sign in'}<span aria-hidden="true">↗</span></button>
            </fieldset>
          </form>
          <p className="text-center text-sm text-stone-500 mt-7">{registering ? 'Already part of the journey?' : 'New to Motorlane?'}{' '}<button disabled={busy} className="text-link" onClick={() => switchMode(registering ? 'login' : 'register')}>{registering ? 'Sign in' : 'Create an account'}</button></p>
          <div className="secure mt-10 pt-6 text-center text-xs text-stone-500"><span aria-hidden="true">◇</span> A secure start to your next journey</div>
        </>}
      </div>
      <footer className="text-xs text-stone-400 flex justify-between gap-4"><span>© {new Date().getFullYear()} Motorlane</span><span>Made for the road ahead.</span></footer>
    </section>
  </main>;
}
createRoot(document.getElementById('root')).render(<ThemeProvider><App /></ThemeProvider>);
