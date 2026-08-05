// ============================================================
// Iconos propios de Dibujo para la interfaz de tldraw.
//
// Los originales del SDK son finos y muy técnicos. Estos están dibujados
// con trazo grueso, puntas redondeadas y formas amables, en el mismo
// lienzo de 30×30 que usa tldraw, así que entran sin tocar nada más.
//
// tldraw pinta cada icono como máscara CSS (background-color: currentColor),
// por eso el color del SVG da igual: lo que cuenta es la silueta.
// Van como data URI dentro del bundle para que no dependan de la red ni
// de la caché, y funcionen igual desde file:// en la app instalada.
// ============================================================

const W = 2.5;   // grosor de trazo común: robusto a 16-22 px
const OPEN = `xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30" fill="none" stroke="#000" stroke-width="${W}" stroke-linecap="round" stroke-linejoin="round"`;
const svg = (body) => `<svg ${OPEN}>${body}</svg>`;

export const CUSTOM_ICONS = {
  // --- Herramientas -------------------------------------------------
  // Puntero: flecha clásica pero con esquinas suaves.
  'tool-pointer': svg('<path d="M6.9 4.3 22 15.6c.8.6.4 1.9-.6 2l-5 .4 2.4 5.4c.3.6 0 1.3-.6 1.6l-1.8.8c-.6.3-1.3 0-1.6-.6l-2.4-5.4-3.4 3.4c-.7.7-1.9.2-1.9-.8V5.3c0-1 1.1-1.6 1.9-1z"/>'),
  // Mano: palma redonda con dedos cortos y gruesos.
  'tool-hand': svg('<path d="M11.2 15.2V8.4a2.2 2.2 0 0 1 4.4 0v4.9"/><path d="M15.6 13.6V6.8a2.2 2.2 0 0 1 4.4 0v6.5"/><path d="M20 13.9a2.2 2.2 0 0 1 4.4 0v5.4a7.7 7.7 0 0 1-7.7 7.7h-1.6a7.7 7.7 0 0 1-6.2-3.1l-3.5-4.7a2.2 2.2 0 0 1 3.3-2.9l2.5 2.4V10.6a2.2 2.2 0 0 1 4.4 0"/>'),
  // Lápiz rechoncho, con su banda y su punta.
  'tool-pencil': svg('<path d="M20.3 4.5a3.1 3.1 0 0 1 4.4 0l.8.8a3.1 3.1 0 0 1 0 4.4L11.2 24.1a2 2 0 0 1-.9.5l-5 1.3a1 1 0 0 1-1.2-1.2l1.3-5a2 2 0 0 1 .5-.9z"/><path d="m18.2 6.6 5.2 5.2"/><path d="m5.6 19.2 5.2 5.2"/>'),
  // Goma: bloque redondeado apoyado en la línea del papel.
  'tool-eraser': svg('<path d="M16.4 6.6a3 3 0 0 1 4.2 0l4.4 4.4a3 3 0 0 1 0 4.2l-9.6 9.6a3 3 0 0 1-2.1.9h-3.2a3 3 0 0 1-2.1-.9l-3.4-3.4a3 3 0 0 1 0-4.2z"/><path d="m11.6 11.4 8.6 8.6"/><path d="M15.3 25.7H26"/>'),
  // Flecha con cabeza redondeada.
  'tool-arrow': svg('<path d="M5.5 24.5 24 6"/><path d="M14 6h10v10"/>'),
  // Texto: una T generosa con base.
  'tool-text': svg('<path d="M4.5 8V6.2a1.7 1.7 0 0 1 1.7-1.7h17.6a1.7 1.7 0 0 1 1.7 1.7V8"/><path d="M15 5v20.5"/><path d="M10.4 25.5h9.2"/>'),
  // Nota adhesiva con la esquina doblada.
  'tool-note': svg('<path d="M26.8 5.4v11.1a2 2 0 0 1-.6 1.4l-8.3 8.3a2 2 0 0 1-1.4.6H5.2a2 2 0 0 1-2-2V5.4a2 2 0 0 1 2-2h19.6a2 2 0 0 1 2 2z"/><path d="M26.4 16.9h-7.2a2 2 0 0 0-2 2v7.2"/>'),
  // Línea con nudos redondos en las puntas.
  'tool-line': svg('<path d="m9.2 20.8 11.6-11.6"/><circle cx="6.2" cy="23.8" r="2.7" fill="#000" stroke="none"/><circle cx="23.8" cy="6.2" r="2.7" fill="#000" stroke="none"/>'),
  // Láser: destellos, porque el trazo se desvanece.
  'tool-laser': svg('<path d="M13.4 3.6c.4 5 2.9 7.5 7.9 7.9-5 .4-7.5 2.9-7.9 7.9-.4-5-2.9-7.5-7.9-7.9 5-.4 7.5-2.9 7.9-7.9z"/><path d="M22.6 17.4c.2 2.9 1.6 4.3 4.5 4.5-2.9.2-4.3 1.6-4.5 4.5-.2-2.9-1.6-4.3-4.5-4.5 2.9-.2 4.3-1.6 4.5-4.5z"/>'),
  // Marco: cuatro esquinas suaves.
  'tool-frame': svg('<path d="M11.5 3.6H6.6a3 3 0 0 0-3 3v4.9"/><path d="M18.5 3.6h4.9a3 3 0 0 1 3 3v4.9"/><path d="M26.4 18.5v4.9a3 3 0 0 1-3 3h-4.9"/><path d="M3.6 18.5v4.9a3 3 0 0 0 3 3h4.9"/>'),
  // Resaltador: punta ancha sobre su trazo.
  'tool-highlight': svg('<path d="M19.4 4.4a2.8 2.8 0 0 1 4 0l2.2 2.2a2.8 2.8 0 0 1 0 4l-11 11H9.6l-2.4-2.4z"/><path d="m15.9 7.9 6.2 6.2"/><path d="M5.5 26h19"/>'),
  // Imagen: paisaje redondeado.
  'tool-media': svg('<rect x="3.4" y="5.4" width="23.2" height="19.2" rx="3.4"/><circle cx="10.4" cy="12" r="2.1"/><path d="m3.9 21.4 5.4-5a2.4 2.4 0 0 1 3.2 0l5.6 5.1"/><path d="m14.9 19.4 3.2-3a2.4 2.4 0 0 1 3.2 0l5 4.5"/>'),

  // --- Acciones rápidas --------------------------------------------
  'undo': svg('<path d="M10 7.2 4.4 12.8 10 18.4"/><path d="M4.4 12.8h13.9a6.9 6.9 0 0 1 0 13.8h-7.4"/>'),
  'redo': svg('<path d="m20 7.2 5.6 5.6L20 18.4"/><path d="M25.6 12.8H11.7a6.9 6.9 0 0 0 0 13.8h7.4"/>'),
  'trash': svg('<path d="M4.6 7.8h20.8"/><path d="M11.4 7.8V5.6a2.4 2.4 0 0 1 2.4-2.4h2.4a2.4 2.4 0 0 1 2.4 2.4v2.2"/><path d="M7.2 7.8v16.6a3.4 3.4 0 0 0 3.4 3.4h8.8a3.4 3.4 0 0 0 3.4-3.4V7.8"/><path d="M12.6 13.4v8.6"/><path d="M17.4 13.4v8.6"/>'),
  'duplicate': svg('<path d="M9.6 20.4H6.4a3.2 3.2 0 0 1-3.2-3.2V6.4a3.2 3.2 0 0 1 3.2-3.2h10.8a3.2 3.2 0 0 1 3.2 3.2v3.2"/><rect x="9.6" y="9.6" width="17.2" height="17.2" rx="3.2"/>'),
  'menu': svg('<path d="M4.8 8.4h20.4"/><path d="M4.8 15h20.4"/><path d="M4.8 21.6h20.4"/>'),
  'check': svg('<path d="m5.5 15.6 6.2 6.2L24.5 9"/>'),
  'cross-2': svg('<path d="M7.5 7.5l15 15"/><path d="M22.5 7.5l-15 15"/>'),
  'chevron-up': svg('<path d="m7.5 18.5 7.5-7.5 7.5 7.5"/>'),
  'chevron-down': svg('<path d="m7.5 11.5 7.5 7.5 7.5-7.5"/>'),
  'chevron-left': svg('<path d="m18.5 7.5-7.5 7.5 7.5 7.5"/>'),
  'chevron-right': svg('<path d="m11.5 7.5 7.5 7.5-7.5 7.5"/>'),
  'plus': svg('<path d="M15 6v18"/><path d="M6 15h18"/>'),
  'minus': svg('<path d="M6 15h18"/>'),
  'zoom-in': svg('<circle cx="13.2" cy="13.2" r="8.6"/><path d="m19.6 19.6 6 6"/><path d="M13.2 9.6v7.2"/><path d="M9.6 13.2h7.2"/>'),
  'zoom-out': svg('<circle cx="13.2" cy="13.2" r="8.6"/><path d="m19.6 19.6 6 6"/><path d="M9.6 13.2h7.2"/>'),
  'lock': svg('<rect x="5.4" y="13" width="19.2" height="13.4" rx="3.2"/><path d="M9.8 13V9.4a5.2 5.2 0 0 1 10.4 0V13"/>'),
  'unlock': svg('<rect x="5.4" y="13" width="19.2" height="13.4" rx="3.2"/><path d="M9.8 13V9.4a5.2 5.2 0 0 1 10.2-1.4"/>'),
  'trash-2': svg('<path d="M4.6 7.8h20.8"/><path d="M11.4 7.8V5.6a2.4 2.4 0 0 1 2.4-2.4h2.4a2.4 2.4 0 0 1 2.4 2.4v2.2"/><path d="M7.2 7.8v16.6a3.4 3.4 0 0 0 3.4 3.4h8.8a3.4 3.4 0 0 0 3.4-3.4V7.8"/>'),
};

// data URI para cada icono, listo para assetUrls.icons
export function customIconUrls() {
  const out = {};
  for (const [name, markup] of Object.entries(CUSTOM_ICONS)) {
    out[name] = `data:image/svg+xml;utf8,${encodeURIComponent(markup)}`;
  }
  return out;
}
