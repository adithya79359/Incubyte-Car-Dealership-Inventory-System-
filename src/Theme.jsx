import React, { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext(null);
function initialTheme() {
  try {
    const saved = localStorage.getItem('motorlane-theme');
    if (saved === 'light' || saved === 'dark') return saved;
  } catch { /* Storage may be disabled; the switch still works for this visit. */ }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
const startupTheme = initialTheme();
document.documentElement.dataset.theme = startupTheme;

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(startupTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('motorlane-theme', theme); } catch { /* Optional persistence. */ }
  }, [theme]);
  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function ThemeToggle() {
  const { theme, setTheme } = useContext(ThemeContext);
  return <button type="button" className="theme-toggle" aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">{theme === 'dark' ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></> : <path d="M20 15.5A9 9 0 0 1 8.5 4 9 9 0 1 0 20 15.5Z" />}</svg>
    <span>{theme === 'dark' ? 'Light' : 'Dark'} mode</span>
  </button>;
}
