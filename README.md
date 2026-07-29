# Dibujo — un espacio privado para dos

**PWA instalable** (Android / iPhone) para que las parejas dibujen juntas a
distancia y en tiempo real. Interfaz premium en **español latino**, pastel
refinado (no infantil), iconografía SVG profesional (sin emojis en la UI),
inspirada en Procreate, Pinterest, iOS y liquid glass. Solo móvil.

## Novedades v8 (tinta, WebGL2, color y táctil)

- **Pinceles como tinta, no como objetos**: los pinceles de tinta (pluma,
  bolígrafo, marcador, pincel redondo, caligrafía, plano, acuarela, borrador)
  se dibujan como una **cinta de ancho variable** — perfil redondo que engorda
  y afina con la presión, o de plumilla (chisel) con grosor según la dirección.
  Se acabaron los círculos encadenados. Lápiz, carboncillo, tiza, crayón,
  aerógrafo y salpicado conservan su grano. Idéntico en vivo y en reproducción.
- **Renderizado WebGL2** (opcional, `js/gl/canvas-gl.js`): compone las capas en
  la GPU (normal/multiply/screen) con respaldo 2D automático si el navegador no
  lo soporta o aparece un blend no soportado. La exportación siempre usa el
  aplanado 2D. Interruptor en **Ajustes › Dibujo** (activo por defecto).
- **Barra de colores** rehecha: paleta pastel curada siempre disponible, botón
  “+” para la rueda completa, anillo doble en el color activo, punto de
  favorito y fijar/soltar favoritos con pulsación larga. **Barra de grosor**
  con relleno de progreso.
- **Táctil mejorado**: suavizado **adaptativo** (mucho filtrado en trazos
  lentos → sin temblor; poco en trazos rápidos → sin retraso) y **rechazo de
  palma** (con un lápiz óptico activo, los toques accidentales se ignoran).
- **Corrección**: el mapeo de coordenadas usa la hoja (siempre visible), no el
  lienzo 2D que puede ocultarse en modo WebGL2.

## Novedades v7 (iconografía y pulido)

- **Set de iconos rediseñado**: cada herramienta de dibujo es ahora un
  implemento único y legible (lápiz, carboncillo sólido con polvo, tiza en
  bloque, crayón con envoltura, marcador con capuchón, pluma, bolígrafo,
  caligrafía como trazo, pincel redondo/plano, acuarela con gota,
  difuminador, aerógrafo, salpicado, borradores, cubeta…). Verificados
  legibles al tamaño real de la barra (26 px).
- **Iconos nuevos** cohesivos: `flame`, `target`, `trophy`, `calendar`,
  `hourglass`, `cake`, `link`, más `image`/`gif` rehechos como contorno.
- **Bugs de iconos corregidos**: `emoji` (se dibujaba como un disco negro) y
  `image`/`gif` (cuadros negros sólidos) ahora son contornos limpios.
- **Sin emojis en la UI**: "Nosotros", widgets, onboarding, login, avisos
  (toasts) y retos usan el set SVG en lugar de emojis, para un acabado
  premium y coherente.

## Novedades v6 (máxima calidad)

- **Trazos continuos**: pluma, bolígrafo y borrador se renderizan como líneas
  suaves reales (nada de "figuras unidas"); marcador/caligrafía con paso más
  fino. Motor con `_beginStroke`/`_paintStep` y flag `direct`.
- **Pinceles reales**: nuevos **Pincel plano** y **Difuminador** (arrastra el
  pigmento ya pintado); cada uno con identidad propia.
- **Lápiz virtual rehecho**: 1 dedo mueve el lápiz (nunca dibuja), 2 dedos
  dibujan desde la punta, 3 dedos hacen zoom. Sin conflictos.
- **Editor de texto completo**: color (arreglado), tamaño, fuente, grosor,
  alineación, opacidad y espaciado, con vista previa en vivo.
- **Visor de enviados** a pantalla completa con zoom por pellizco / doble
  toque y desplazamiento; los dibujos enviados quedan bloqueados.
- **Botón Enviar** en la barra + **animación cinematográfica** (partículas,
  anillo, desenfoque, iluminación) con **sonido intercambiable**
  (`Audio/UI/send-special`).
- **Música**: se detiene y libera el audio al salir del editor.
- **Control de grosor compacto** (barra fina + número), **iconos únicos**
  por herramienta, **recuerdos más dinámicos** (2.6 s) y salida del editor
  con Guardar borrador / Salir sin guardar / Cancelar (bug de re-guardado
  corregido).

## Novedades v5.1 (correcciones reportadas)

- **Bloqueado el zoom accidental del navegador** (causa de que la app se
  viera "gigante y borrosa"): campos a 16px (evita el auto-zoom al enfocar en
  Android/iOS) y `touch-action: pan-x pan-y` global; el lienzo conserva su
  propio zoom.
- **Asas y controles de objetos SIEMPRE grandes**: se contra-escalan con el
  zoom del lienzo (asa de rotar ~40px reales en pantalla; barra de
  duplicar/animar/estilo/editar/eliminar visible sin hacer zoom). Igual los
  controles de la regla.
- **Tocadiscos compacto**: tarjeta 330px centrada, disco 148px, textos con
  elipsis — nada se desborda de la pantalla.
- **Inicio**: el saludo y los botones Dibujar/Inbox siempre se muestran y
  ahora también **se pueden mover** desde el editor (manijas sobre los
  elementos reales, con vista previa en vivo).
- **Pinceles**: tamaños por defecto más generosos y marcador más denso.

## Novedades v5 (mejora profunda)

- **Audio total**: variantes aleatorias por botón (3 por evento), loop continuo
  por herramienta al dibujar/borrar con detención limpia, sonidos de agarrar y
  soltar la regla, cubeta, figuras, selección y transiciones. Carpeta `Audio/`
  organizada y **autodetección** de tus .wav/.mp3 (con síntesis de respaldo).
- **Inicio personalizable**: botón "Personalizar inicio" → dibujar encima,
  añadir GIFs y textos arrastrables, fondo, corazones flotantes… e **Inicio
  compartido** sincronizado con tu pareja en tiempo real.
- **Título al crear**, **sistema de borradores** (guardar/descartar al salir,
  contador visible), **hoja de envío** con "Visualizar" y "Editable después";
  lo enviado queda sellado y lo de tu pareja es **solo lectura** (visor con
  proceso y "duplicar como mío"). Los secretos se revelan tocando, para ambos.
- **Regla inteligente**: dibujas libre y, al tocar su borde, el trazo se
  desliza recto por su dirección — como una regla física.
- **Hoja infinita**: zoom ×64 con grosor de pincel adaptado al zoom; guías
  reales de composición; figura **corazón**.
- **Paleta**: favoritos + historial reciente persistentes, en rueda y dock.
- **Objetos**: barra contextual (duplicar, opacidad, sombra, animar —
  flotar/latido/girar/mecerse —, editar texto, pausar GIF, eliminar) y
  pellizco de dos dedos para escalar/rotar sin interferir con el dibujo.
- **Navegación tipo app nativa**: sin barra de pestañas — arquitectura hub
  desde el Inicio con cabeceras contextuales. Chat con botón de dibujar en la
  barra y fondos personalizables. "Nosotros" con héroe emocional.
- Correcciones: hoja nueva ya no se borra al abrirse tras cerrar otra, texto
  sin deformación al redimensionar, memoria de deshacer acotada.

## Novedades v3 (rediseño premium)

- **Home ultra limpia**: saludo dinámico por hora local (incluye "Buenas
  madrugadas") con entrada animada, fondo **aurora WebGL2** que reacciona al
  tacto (con degradación automática a CSS) y **solo dos botones**: Dibujar e
  Inbox, con identidad de color (verde salvia = tú, rosa = tu pareja).
- **Inbox**: adiós cuadrícula — feed vertical de tarjetas con profundidad,
  autor con acento de color, fecha y hora, reacciones, favorito, proceso y
  transición fluida al lienzo (View Transitions API).
- **Barra de herramientas horizontal** fuera del lienzo (desplazable) con
  ilustraciones SVG de cada herramienta y **rueda cromática** al final;
  hoja aparte para herramientas adicionales.
- **Dibujo Secreto**: envía lienzos ocultos; el receptor los toca y se
  revelan con una animación de desenfoque → nitidez con destello.
- **Reproductor con 3 modos**: vinilo girando, portada estática o minimalista.
- **Chat** con identidad de color por autor, tipografía y burbujas pulidas.
- **Auth Google endurecida**: persistencia IndexedDB, popup con resolver +
  respaldo redirect, mensajes de error claros (dominio no autorizado, etc.).
- **Multiplataforma**: workflow de GitHub Pages incluido y
  `capacitor.config.json` + `scripts/build-www.mjs` para empaquetar la misma
  base de código hacia Google Play.

Sin frameworks ni build: **JavaScript ES2024 modular**, Canvas API, Firebase y
service worker offline-first.

---

## ✨ Qué incluye

### ☁️ Firebase (tiempo real)
- **Authentication con Google** (popup con respaldo redirect para PWA iOS),
  sesión persistente, perfil automático con foto y nombre.
- **Firestore en tiempo real** con caché persistente offline multi-pestaña.
- **Storage** para los dibujos completos compartidos (capas + proceso).
- **Presence**: en línea, "dibujando ahora" y última conexión con heartbeats.
- **Analytics** (carga tolerante a fallos).
- Reglas de seguridad listas para pegar: [`firestore.rules`](firestore.rules) y
  [`storage.rules`](storage.rules).

### 💑 Sistema de pareja
Al iniciar sesión eliges: **entrar sin pareja**, **invitar a tu pareja** (código
único `AB7K-XP93`) o **introducir un código**. Al vincularse se crea un espacio
privado permanente: dibujos, chat, stickers, GIF, audios, música, recuerdos,
logros y widgets, todo sincronizado en tiempo real y accesible solo para ambos.

La capa de sync es intercambiable: `FirebaseTransport` (pareja) o
`BroadcastTransport` (modo local sin cuenta) con la misma interfaz.

### 🏠 Pantalla principal
- **Widgets** de colocación libre (mantén presionado para editar, estilo iOS):
  días juntos, cuenta regresiva, clima, música, último dibujo, actividad,
  frase del día, recuerdos, notas, foto favorita, cumpleaños, calendario,
  objetivos, logros, estado de la pareja y racha. Cada uno se mueve,
  redimensiona, oculta y personaliza (color + transparencia).
- **Dibujos compartidos**: carrusel horizontal de tarjetas con reacciones,
  comentarios, favoritos, descarga, ampliación, historial del proceso, autor,
  fecha y hora.

### 🎨 Estudio
Todo lo del motor v1 (15+ pinceles, acuarela, aerógrafo, tiza, carboncillo,
crayón, pixel, caligrafía, 3 borradores, cubeta inteligente, cuentagotas, rueda
cromática, figuras, simetría, capas ilimitadas con modos de mezcla,
deshacer/rehacer, grabación del proceso con tiempo activo real y reproductor
con velocidades) más:

- **Regla profesional**: se mueve, gira, bloquea y redimensiona; muestra cm y
  grados; actúa como **barrera física** — ningún pincel, borrador, spray ni
  acuarela pinta del otro lado (recorte de semiplano, fiel también en la
  reproducción del proceso).
- **Simular Pincel Virtual**: un lápiz elegante con inclinación sigue tu dedo y
  el trazo sale desde su punta — siempre ves dónde dibujas.
- **Modo zen**: botón flotante que oculta todas las barras con animaciones
  suaves; el lienzo nunca queda tapado.
- **Biblioteca de assets**: imágenes, GIF, stickers, videos, música, pinceles,
  texturas, fondos, marcos y plantillas, con buscador, favoritos y recientes.

### 💿 Música (tocadiscos)
Reproductor personalizado con disco de vinilo animado, portada, ecualizador en
vivo (WebAudio), fondo dinámico, bucle, volumen, biblioteca y mini-reproductor
flotante. Cada dibujo puede tener su canción (suena al abrirlo).

### 💬 Chat
Responder (citas), editar, eliminar, reacciones, mensajes fijados,
escribiendo…, en línea, última conexión, enviado/entregado/leído, fotos,
videos, GIF (el buscador siempre inicia con **bear love** 🐻), stickers,
mini dibujos a mano, audios compactos con onda y animaciones de envío.

### 🏆 Logros
**315 logros** en 21 categorías × 15 niveles con rarezas (común, raro, épico,
legendario, mítico), insignias, recompensas, progreso y celebración animada.

### 🔊 Sonidos
Sonidos satisfactorios sintetizados (0 KB de audio): dibujar, borrar, enviar y
recibir mensajes, abrir/cerrar paneles, logros y guardado — **todos
configurables** en Ajustes.

### 📱 Optimización móvil
Pantalla completa, notch/Dynamic Island (safe areas), sin zoom accidental,
sin barras blancas, animaciones GPU, eventos coalescidos para 60–165 Hz,
consumo moderado y funcionamiento con conexión lenta u offline.

---

## 🏗️ Estructura

```
index.html · manifest.webmanifest · sw.js        shell PWA offline
firestore.rules · storage.rules                  seguridad Firebase
css/          reset · theme · layout · components · canvas
js/core/      bus · store · db · i18n · router · sync · firebase · sounds · ui · utils
js/drawing/   engine · brushes · paint · layers · history · floodfill · color
              recorder · player · ruler
js/ui/        login · home · widgets · studio · gallery · chat · us · settings
              vinyl · assets · achievements-ui · player-ui · onboarding · icons
js/couples/   features · achievements
js/media/     klipy (GIF)
```

## 🚀 Ejecutar / Publicar

```bash
python3 -m http.server 8080   # o npx serve .
```

**GitHub Pages**: activa Pages (Settings → Pages → GitHub Actions). El workflow
`.github/workflows/deploy-pages.yml` publica automáticamente en cada push.
Recuerda agregar `TU_USUARIO.github.io` a los dominios autorizados de Firebase
Authentication.

**Google Play (Capacitor)**:

```bash
node scripts/build-www.mjs        # empaqueta la app en ./www
npm i -D @capacitor/cli @capacitor/core @capacitor/android
npx cap add android && npx cap sync android
npx cap open android              # compila el AAB en Android Studio
```

**Firebase**: el proyecto ya está configurado (`lovedrawing-33b5a`). Para
activar el espacio de pareja en producción: en Firebase Console habilita
Authentication → Google, agrega tu dominio a los dominios autorizados, y pega
las reglas de `firestore.rules` y `storage.rules`.

---

Hecho con 💗 para las parejas creativas.
