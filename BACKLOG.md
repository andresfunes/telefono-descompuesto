# Backlog

- [ ] Al expulsar a un jugador en una partida iniciada, verificar que no haya quedado un solo jugador y decidir que hacer en ese caso, si aún no se hizo nada, lo mas lógico seria dar por finalizada la partida.
- [x] **Previsualización de grosor táctil:** muestra del tamaño del trazo o
  borrador antes de dibujar, ajustada al color y zoom actuales sin depender de
  `hover` ni predecir la posición del dedo.
- [x] **Feedback háptico (vibración en móviles):** invocar
  `navigator.vibrate?.(10)` al tocar herramientas, deshacer o rellenar con balde
  para dar una sensación táctil de aplicación nativa en navegadores compatibles.
  Implementado y validado con tests; pendiente de probar la vibración en un celular real.
- [ ] **Inspiración de consignas (ruleta / temas):** aprovechar las frases de
  `lib/example-prompts.ts` para agregar un botón «🎲 Sugerir idea» o un selector
  de temas (Cine, Animales bizarros, Situaciones cotidianas) que ayude con el
  bloqueo creativo en la ronda 0.
- [ ] **Optimización de refresco Realtime:** en `components/game-realtime.tsx`,
  cada evento `GAME_CHANGED` dispara un `router.refresh()`. Si varios jugadores
  envían casi al mismo tiempo, se pueden producir muchos refrescos SSR
  concurrentes. Evaluar un payload ligero en el broadcast para actualizar en el
  cliente estados menores, como el contador de jugadores que terminaron la ronda,
  sin revalidar todo el árbol de Server Components.
