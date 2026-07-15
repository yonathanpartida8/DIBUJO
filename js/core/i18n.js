// Internationalization — Spanish (default) and English.
import { store } from './store.js';
import { bus } from './bus.js';

const dict = {
  es: {
    'nav.draw': 'Dibujar', 'nav.gallery': 'Galería', 'nav.chat': 'Chat', 'nav.us': 'Nosotros',
    'time.now': 'ahora',
    'common.save': 'Guardar', 'common.cancel': 'Cancelar', 'common.delete': 'Eliminar', 'common.done': 'Listo',
    'common.close': 'Cerrar', 'common.share': 'Compartir', 'common.send': 'Enviar', 'common.duplicate': 'Duplicar',
    'common.edit': 'Editar', 'common.rename': 'Renombrar', 'common.new': 'Nuevo', 'common.search': 'Buscar',
    'common.back': 'Atrás', 'common.settings': 'Ajustes', 'common.confirm': 'Confirmar',
    'gallery.title': 'Galería', 'gallery.sub': 'Vuestros dibujos, juntos',
    'gallery.all': 'Todos', 'gallery.mine': 'Míos', 'gallery.shared': 'Compartidos', 'gallery.favorites': 'Favoritos',
    'gallery.received': 'Recibidos', 'gallery.empty': 'Aún no hay dibujos', 'gallery.emptySub': 'Toca + para empezar vuestra primera obra',
    'gallery.folders': 'Carpetas', 'gallery.newFolder': 'Nueva carpeta', 'gallery.newDrawing': 'Nuevo dibujo',
    'studio.untitled': 'Sin título', 'studio.saved': 'Guardado', 'studio.saving': 'Guardando…', 'studio.rec': 'GRABANDO',
    'studio.layers': 'Capas', 'studio.newLayer': 'Nueva capa', 'studio.layer': 'Capa',
    'studio.color': 'Color', 'studio.brush': 'Pincel', 'studio.size': 'Tamaño', 'studio.opacity': 'Opacidad',
    'studio.hardness': 'Dureza', 'studio.smoothing': 'Suavizado', 'studio.stabilizer': 'Estabilizador', 'studio.flow': 'Flujo',
    'studio.paper': 'Papel', 'studio.blend': 'Mezcla', 'studio.symmetry': 'Simetría', 'studio.play': 'Reproducir proceso',
    'studio.stats': 'Estadísticas', 'studio.media': 'Multimedia', 'studio.music': 'Música', 'studio.clear': 'Limpiar lienzo',
    'studio.export': 'Exportar PNG', 'studio.eyedropper': 'Cuentagotas',
    'chat.title': 'Chat', 'chat.online': 'En línea', 'chat.typing': 'escribiendo…', 'chat.lastSeen': 'últ. vez',
    'chat.placeholder': 'Mensaje…', 'chat.sent': 'Enviado', 'chat.delivered': 'Entregado', 'chat.read': 'Leído',
    'us.title': 'Nosotros', 'us.together': 'Juntos desde', 'us.streak': 'Racha', 'us.days': 'días',
    'us.challenge': 'Reto de hoy', 'us.goals': 'Metas', 'us.achievements': 'Logros', 'us.memories': 'Recuerdos',
    'us.invite': 'Invitar a mi pareja', 'us.setAnniversary': 'Definir aniversario', 'us.collab': 'Dibujar juntos',
    'set.title': 'Ajustes', 'set.appearance': 'Apariencia', 'set.theme': 'Tema', 'set.language': 'Idioma',
    'set.uiSize': 'Tamaño de interfaz', 'set.quality': 'Calidad', 'set.performance': 'Rendimiento',
    'set.animations': 'Animaciones', 'set.sounds': 'Sonidos', 'set.haptics': 'Vibración', 'set.notifications': 'Notificaciones',
    'set.backup': 'Copia de seguridad', 'set.sync': 'Sincronización', 'set.privacy': 'Privacidad',
    'set.export': 'Exportar datos', 'set.import': 'Importar datos', 'set.profile': 'Perfil', 'set.reset': 'Restablecer',
    'set.themePastel': 'Pastel', 'set.themeLight': 'Claro', 'set.themeDark': 'Oscuro', 'set.themeAuto': 'Automático',
    'set.install': 'Instalar app',
    'onb.welcome': 'Bienvenidos a Dibujo', 'onb.sub': 'Un lienzo para dos corazones',
    'onb.yourName': '¿Cómo te llamas?', 'onb.partnerName': '¿Y tu pareja?', 'onb.anniversary': '¿Desde cuándo están juntos?',
    'onb.start': 'Empezar a dibujar', 'onb.next': 'Siguiente',
    'toast.saved': 'Dibujo guardado 💕', 'toast.copied': 'Enlace copiado', 'toast.sent': 'Enviado 💌',
    'toast.exported': 'Exportado', 'toast.cleared': 'Lienzo limpio',
  },
  en: {
    'nav.draw': 'Draw', 'nav.gallery': 'Gallery', 'nav.chat': 'Chat', 'nav.us': 'Us',
    'time.now': 'now',
    'common.save': 'Save', 'common.cancel': 'Cancel', 'common.delete': 'Delete', 'common.done': 'Done',
    'common.close': 'Close', 'common.share': 'Share', 'common.send': 'Send', 'common.duplicate': 'Duplicate',
    'common.edit': 'Edit', 'common.rename': 'Rename', 'common.new': 'New', 'common.search': 'Search',
    'common.back': 'Back', 'common.settings': 'Settings', 'common.confirm': 'Confirm',
    'gallery.title': 'Gallery', 'gallery.sub': 'Your drawings, together',
    'gallery.all': 'All', 'gallery.mine': 'Mine', 'gallery.shared': 'Shared', 'gallery.favorites': 'Favorites',
    'gallery.received': 'Received', 'gallery.empty': 'No drawings yet', 'gallery.emptySub': 'Tap + to start your first artwork',
    'gallery.folders': 'Folders', 'gallery.newFolder': 'New folder', 'gallery.newDrawing': 'New drawing',
    'studio.untitled': 'Untitled', 'studio.saved': 'Saved', 'studio.saving': 'Saving…', 'studio.rec': 'RECORDING',
    'studio.layers': 'Layers', 'studio.newLayer': 'New layer', 'studio.layer': 'Layer',
    'studio.color': 'Color', 'studio.brush': 'Brush', 'studio.size': 'Size', 'studio.opacity': 'Opacity',
    'studio.hardness': 'Hardness', 'studio.smoothing': 'Smoothing', 'studio.stabilizer': 'Stabilizer', 'studio.flow': 'Flow',
    'studio.paper': 'Paper', 'studio.blend': 'Blend', 'studio.symmetry': 'Symmetry', 'studio.play': 'Replay process',
    'studio.stats': 'Statistics', 'studio.media': 'Media', 'studio.music': 'Music', 'studio.clear': 'Clear canvas',
    'studio.export': 'Export PNG', 'studio.eyedropper': 'Eyedropper',
    'chat.title': 'Chat', 'chat.online': 'Online', 'chat.typing': 'typing…', 'chat.lastSeen': 'last seen',
    'chat.placeholder': 'Message…', 'chat.sent': 'Sent', 'chat.delivered': 'Delivered', 'chat.read': 'Read',
    'us.title': 'Us', 'us.together': 'Together since', 'us.streak': 'Streak', 'us.days': 'days',
    'us.challenge': "Today's challenge", 'us.goals': 'Goals', 'us.achievements': 'Achievements', 'us.memories': 'Memories',
    'us.invite': 'Invite my partner', 'us.setAnniversary': 'Set anniversary', 'us.collab': 'Draw together',
    'set.title': 'Settings', 'set.appearance': 'Appearance', 'set.theme': 'Theme', 'set.language': 'Language',
    'set.uiSize': 'Interface size', 'set.quality': 'Quality', 'set.performance': 'Performance',
    'set.animations': 'Animations', 'set.sounds': 'Sounds', 'set.haptics': 'Haptics', 'set.notifications': 'Notifications',
    'set.backup': 'Backup', 'set.sync': 'Sync', 'set.privacy': 'Privacy',
    'set.export': 'Export data', 'set.import': 'Import data', 'set.profile': 'Profile', 'set.reset': 'Reset',
    'set.themePastel': 'Pastel', 'set.themeLight': 'Light', 'set.themeDark': 'Dark', 'set.themeAuto': 'Auto',
    'set.install': 'Install app',
    'onb.welcome': 'Welcome to Dibujo', 'onb.sub': 'A canvas for two hearts',
    'onb.yourName': "What's your name?", 'onb.partnerName': 'And your partner?', 'onb.anniversary': 'Together since?',
    'onb.start': 'Start drawing', 'onb.next': 'Next',
    'toast.saved': 'Drawing saved 💕', 'toast.copied': 'Link copied', 'toast.sent': 'Sent 💌',
    'toast.exported': 'Exported', 'toast.cleared': 'Canvas cleared',
  },
};

let lang = store.get().settings.language || 'es';

export function setLang(l) {
  lang = dict[l] ? l : 'es';
  store.set('settings', { language: lang });
  document.documentElement.lang = lang;
  applyDOM();
  bus.emit('i18n:change', lang);
}
export function getLang() { return lang; }
export function t(key, vars) {
  let s = dict[lang]?.[key] ?? dict.es[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, v);
  return s;
}
export function applyDOM(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((n) => { n.textContent = t(n.dataset.i18n); });
}
document.documentElement.lang = lang;
