// Empaqueta tldraw + React en un único módulo ESM autocontenido.
// Se ejecuta UNA vez (npm run build:vendor) y el resultado se versiona, así
// la app sigue sin necesitar build en tiempo de ejecución: funciona en
// GitHub Pages, en file:// (Capacitor) y offline con el service worker.
import * as esbuild from 'esbuild';
import { copyFileSync, cpSync, mkdirSync, statSync } from 'node:fs';

mkdirSync(new URL('../vendor/', import.meta.url), { recursive: true });

const out = new URL('../vendor/tldraw.bundle.js', import.meta.url);
await esbuild.build({
  entryPoints: [new URL('../src/tldraw-entry.jsx', import.meta.url).pathname],
  outfile: out.pathname,
  bundle: true,
  format: 'esm',
  target: ['es2020'],
  minify: true,
  sourcemap: false,
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  loader: { '.js': 'jsx', '.woff2': 'dataurl', '.svg': 'dataurl', '.png': 'dataurl' },
  logOverride: { 'direct-eval': 'silent' },
});

copyFileSync(
  new URL('../node_modules/tldraw/tldraw.css', import.meta.url),
  new URL('../vendor/tldraw.css', import.meta.url),
);

// Fuentes, iconos y traducciones LOCALES: por defecto tldraw los pide a
// cdn.tldraw.com, lo que rompería la app sin conexión y en file:// (Capacitor).
for (const dir of ['fonts', 'icons', 'embed-icons', 'translations']) {
  cpSync(
    new URL(`../node_modules/@tldraw/assets/${dir}`, import.meta.url),
    new URL(`../vendor/assets/${dir}`, import.meta.url),
    { recursive: true },
  );
}

const kb = (u) => Math.round(statSync(u).size / 1024) + ' KB';
console.log('vendor/tldraw.bundle.js', kb(out));
console.log('vendor/tldraw.css      ', kb(new URL('../vendor/tldraw.css', import.meta.url)));
