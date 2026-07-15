// Applies theme + display prefs from the store to <body>.
import { store } from './store.js';

export function applyTheme() {
  const s = store.get().settings;
  let theme = s.theme;
  if (theme === 'auto') theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.body.dataset.theme = theme;
  document.body.dataset.uiscale = s.uiScale || 'm';
  document.body.dataset.animations = s.animations || 'on';
  const colors = { pastel: '#f6d7de', light: '#f6f5f9', dark: '#221d28' };
  let meta = document.querySelector('meta[name="theme-color"]:not([media])');
  if (!meta) { meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.append(meta); }
  meta.content = colors[theme] || '#f6d7de';
}
// React to system theme changes when in auto mode.
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
  if (store.get().settings.theme === 'auto') applyTheme();
});
