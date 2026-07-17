# 💕 Dibujo — un espacio privado para dos

**PWA instalable** (Android / iPhone) para que las parejas dibujen juntas a
distancia y en tiempo real. Interfaz premium en **español latino**, 100% pastel,
inspirada en Procreate, Pinterest, iOS y liquid glass. Solo móvil.

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

## 🚀 Ejecutar

```bash
python3 -m http.server 8080   # o npx serve .
```

Ábrela en el teléfono e instálala ("Añadir a pantalla de inicio").

**Firebase**: el proyecto ya está configurado (`lovedrawing-33b5a`). Para
activar el espacio de pareja en producción: en Firebase Console habilita
Authentication → Google, agrega tu dominio a los dominios autorizados, y pega
las reglas de `firestore.rules` y `storage.rules`.

---

Hecho con 💗 para las parejas creativas.
