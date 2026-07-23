# Carpeta de sonidos de Dibujo

Coloca aquí tus archivos **.wav** o **.mp3**. La app los detecta
automáticamente: si un archivo existe se reproduce; si no, suena la
síntesis integrada. No hay que configurar nada.

## Nombres esperados

### UI/  (botones e interfaz — 3 variantes por evento, se eligen al azar)
- `tap-1` `tap-2` `tap-3` — pulsación de botón
- `pop-1` `pop-2` `pop-3` — aparición / burbuja
- `love-1` `love-2` `love-3` — momentos románticos (revelar secreto, vincular)
- `send-1` `send-2` `send-3` — enviar mensaje/dibujo
- `send-special` — animación cinematográfica al enviar un dibujo
- `receive-1` `receive-2` `receive-3` — recibir mensaje
- `panel-open-1..3` / `panel-close-1..3` — abrir / cerrar paneles
- `achieve-1` `achieve-2` — logro desbloqueado
- `save-1` `save-2` `save-3` — guardado

### Drawing/Brushes/  (loop continuo mientras se dibuja, uno por herramienta)
- `pencil-loop` `charcoal-loop` `chalk-loop` `crayon-loop`
- `marker-loop` `pixel-loop`
- `pen-loop` `ballpoint-loop` `calligraphy-loop`
- `brush-loop` `watercolor-loop`
- `airbrush-loop` `splatter-loop`

### Drawing/Eraser/
- `eraser-loop` `eraserSoft-loop` `eraserPixel-loop` — loop al borrar
- `erase-1` `erase-2` — toque de borrador

### Drawing/Fill/
- `fill-1` `fill-2` — cubeta de relleno

### Drawing/Ruler/
- `grab-1` `grab-2` — agarrar la regla
- `release-1` `release-2` — soltar la regla

### Drawing/
- `shape-1` `shape-2` — figuras

### Transform/
- `select-1` `select-2` — seleccionar objeto
- `move-1` `move-2` — mover objeto
- `transform-1` `transform-2` — escalar / rotar

### Transitions/
- `screen-1` `screen-2` `screen-3` — transición entre pantallas

### Animations/
- (reservado para sonidos de animaciones de widgets/objetos)

> Formato recomendado: WAV 44.1 kHz mono, cortos (< 1 s) para eventos
> y loops perfectos (sin clic al repetir) para los `-loop`.

## manifest.json

Por rendimiento, `manifest.json` lista las rutas activas (sin extensión), p. ej.:

```json
["UI/tap-1", "UI/tap-2", "Drawing/Brushes/pencil-loop"]
```

Al agregar archivos, añade sus rutas aquí. Si prefieres autodetección pura
(la app prueba cada ruta), simplemente **elimina** `manifest.json`.
