# 💕 Dibujo — un lienzo para dos

Una **PWA instalable** (Android / iPhone) para que las parejas dibujen juntas,
compartan sus obras e intercambien dibujos en tiempo real. Interfaz moderna,
minimalista y cálida, con una paleta **100% pastel**.

No usa ningún framework ni paso de compilación: es **JavaScript modular (ES
modules)**, rápido, ligero y totalmente offline para dibujar.

---

## ✨ Funcionalidades

### 🎨 Estudio de dibujo profesional
- **+15 pinceles**: lápiz, pluma, bolígrafo, marcador, pincel artístico, acuarela,
  aerógrafo, tiza, carboncillo, crayón, pixel brush y caligrafía.
- **Borradores**: normal, suave y por píxeles.
- **Cubeta inteligente** con detección de bordes (flood-fill con tolerancia y cierre
  de huecos) — solo rellena la zona cerrada.
- **Cuentagotas**, **rueda cromática** (anillo de tono + cuadro SV) y paleta pastel.
- **Regla / líneas rectas**, figuras (rect, círculo, triángulo, estrella, polígono).
- **Simetría** horizontal, vertical, 4 ejes y radial (reproducible en la grabación).
- **Transformar capa**: voltear H/V y rotar.
- **Capas ilimitadas**: opacidad, 15 modos de mezcla, bloquear, ocultar, duplicar,
  combinar y reordenar.
- Ajustes de pincel: tamaño, dureza, flujo, **suavizado**, **estabilizador** y
  **presión** del stylus.
- **Deshacer / rehacer** amplios (snapshots por capa).
- **Zoom y desplazamiento** con dos dedos.

### 🖼️ Lienzo personalizable
Color del papel, texturas (reciclado, acuarela, libreta, pergamino, lienzo, madera,
cartulina, puntos), fondo transparente, fondos personalizados, cuadrícula y guías.

### ⏱️ Reproducción del proceso (¡destacada!)
Cada dibujo **graba automáticamente los trazos vectoriales** (no es una grabación de
pantalla). El **temporizador solo avanza mientras se dibuja** — las pausas no cuentan.
Reproductor con barra de avance/retroceso, velocidades (0.5×–8×), pausar/reanudar y
**estadísticas**: tiempo real dibujando, nº de trazos, colores y herramientas usadas,
fechas de creación y edición.

### 🎬 Multimedia
GIFs (**API de Klipy**), imágenes de la galería, texto, emojis, stickers, y **música
por dibujo**. Notas de voz y audio en el chat. Objetos arrastrables, escalables y
rotables sobre el lienzo.

### 💌 Compartir y galería
Enviar / recibir / editar / duplicar / comentar / reaccionar dibujos. Carpetas,
favoritos, historial y filtros (todos, favoritos, recibidos, míos).

### 💬 Chat
Mensajes, fotos, GIFs, stickers, emojis, dibujos y notas de voz. Indicadores de
*escribiendo…*, *en línea*, *última conexión* y estados *enviado / entregado / leído*.

### 👩‍❤️‍👨 Funciones para parejas ("Nosotros")
Contador de tiempo juntos (en vivo), racha de dibujo, retos diarios, metas, logros e
insignias, calendario de recuerdos, perfiles con avatar y color, **invitación por
enlace** y **dibujo colaborativo en tiempo real**.

### ⚙️ Ajustes completos
Temas **pastel / claro / oscuro / automático**, idioma (ES/EN), tamaño de interfaz,
calidad, rendimiento, animaciones, sonidos, vibración, notificaciones, sincronización,
privacidad, y **copia de seguridad** (exportar / importar todo).

---

## 🏗️ Arquitectura

```
index.html · manifest.webmanifest · sw.js       (shell PWA + offline)
css/        reset · theme (tokens pastel) · layout · components · canvas
js/core/    bus · store · db (IndexedDB) · i18n · router · sync · ui · utils · theme-apply
js/drawing/ engine · brushes · paint · layers · history · floodfill · color · recorder · player
js/media/   klipy (API de GIFs)
js/ui/      studio · gallery · chat · us · settings · onboarding · player-ui · icons
js/couples/ features (rachas, logros, retos, recuerdos)
assets/     icons (generados con scripts/make-icons.mjs)
```

**Sincronización en tiempo real:** la capa `sync` usa `BroadcastChannel` como
transporte por defecto (funciona de verdad entre pestañas/ventanas — abre el enlace de
invitación en otra pestaña para dibujar juntos). La interfaz (`connect / send / on`) es
agnóstica, así que se puede sustituir por un backend (WebSocket, WebRTC, Firebase,
Supabase Realtime) sin tocar el resto de la app.

**Almacenamiento local:** IndexedDB para dibujos, carpetas, mensajes, multimedia y
recuerdos; `localStorage` para ajustes/perfil. Todo funciona **offline**.

---

## 🚀 Cómo ejecutar

Al ser estático, sírvelo con cualquier servidor HTTP:

```bash
python3 -m http.server 8080
# o
npx serve .
```

Abre `http://localhost:8080` en el móvil (o en el navegador con vista móvil) y usa
"Añadir a pantalla de inicio" / "Instalar app" para instalarla como PWA.

### Regenerar iconos
```bash
node scripts/make-icons.mjs
```

---

Hecho con 💗 para las parejas creativas.
