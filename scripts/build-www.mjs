// Empaqueta la app en ./www para Capacitor (Play Store).
// La web (GitHub Pages) se sirve directamente desde la raíz del repo;
// este script solo copia los archivos de la app, sin repo ni herramientas.
import { cpSync, rmSync, mkdirSync } from 'node:fs';

const OUT = new URL('../www/', import.meta.url);
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const items = ['index.html', 'manifest.webmanifest', 'sw.js', 'css', 'js', 'assets'];
for (const item of items) {
  cpSync(new URL(`../${item}`, import.meta.url), new URL(item, OUT), { recursive: true });
}
console.log('www/ listo para `npx cap sync android`');
