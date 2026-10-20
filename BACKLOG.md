# Backlog

- [x] **Finalización con un jugador:** al expulsar al último oponente, el servidor pasa a revelación conservando las cadenas, incluso sin envíos. Incluye analytics de cero rondas y pruebas de dominio y PostgreSQL.
- [x] **Previsualización de grosor táctil:** muestra del tamaño del trazo o
  borrador antes de dibujar, ajustada al color y zoom actuales sin depender de
  `hover` ni predecir la posición del dedo.
- [x] **Feedback háptico (vibración en móviles):** invocar
  `navigator.vibrate?.(10)` al tocar herramientas, deshacer o rellenar con balde
  para dar una sensación táctil de aplicación nativa en navegadores compatibles.
  Implementado y validado con tests; pendiente de probar la vibración en un celular real.
- [x] **Inspiración de consignas:** botón «🎲 Sugerir idea» en la ronda 0,
  con las 100 frases existentes, sin repetir la sugerencia actual ni sobrescribir
  el borrador del jugador.
- [x] **Optimización de refresco Realtime:** agrupa ráfagas durante 250 ms,
  evita refrescos simultáneos y conserva una actualización pendiente durante
  refrescos o acciones. Se mantiene el snapshot autoritativo del servidor;
  no se introducen contadores derivados del broadcast en el cliente.
