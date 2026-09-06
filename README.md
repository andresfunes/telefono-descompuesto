# Teléfono Descompuesto

Juego de fiesta multijugador, mobile-first, inspirado en el clásico “teléfono descompuesto”. Cada persona comienza una cadena con una frase; luego el grupo alterna entre dibujar e interpretar lo recibido hasta revelar cómo se transformaron todas las ideas.

## Estado actual

El repositorio contiene un primer flujo clásico jugable:

- creación de salas sin registro;
- ingreso mediante código corto y nombre;
- lobby con anfitrión y lista de jugadores;
- rondas alternadas de texto y dibujo;
- espera y progreso por ronda;
- revelación cronológica de todas las cadenas;
- validaciones de anfitrión, ronda y envíos duplicados.

El dibujo todavía utiliza un campo de texto temporal. Está aislado para poder reemplazarlo por un lienzo con `react-konva` sin modificar las reglas del juego.

## Requisitos

- Node.js 20.9 o superior
- pnpm 11.19 o compatible

## Desarrollo local

```bash
pnpm install
pnpm dev
```

Abrí [http://localhost:3000](http://localhost:3000). Para simular varios jugadores, usá perfiles o navegadores separados, ya que la pertenencia a cada sala se guarda en una cookie HTTP-only.

## Comandos

```bash
pnpm dev        # servidor de desarrollo
pnpm lint       # reglas de ESLint y Next.js
pnpm typecheck  # verificación estricta de TypeScript
pnpm test       # suite de Vitest
pnpm test:watch # tests en modo interactivo
pnpm build      # build de producción
pnpm start      # ejecuta el build de producción
```

Antes de enviar cambios, ejecutá `pnpm lint`, `pnpm typecheck`, `pnpm test` y `pnpm build`.

## Arquitectura

La aplicación es un monolito Next.js con App Router:

```text
app/            rutas, páginas y acciones de servidor
components/     componentes de interfaz por estado del juego
domain/         modelo y reglas puras del juego
repositories/   interfaz de persistencia e implementación en memoria
tests/          pruebas unitarias del dominio y repositorio
```

El servidor es la autoridad para asignaciones, envíos y transiciones. Los componentes nunca avanzan una ronda por su cuenta. La capa de repositorio permite reemplazar la implementación en memoria por Supabase sin trasladar lógica de negocio a React.

### Rotación de cadenas

Jugadores y cadenas conservan el orden de ingreso. En la ronda `r`, el jugador `i` recibe la cadena `(i - r) mod N`. Con `N` jugadores se juegan `N` rondas: cada participante contribuye exactamente una vez a cada cadena y nunca recibe inmediatamente su propio aporte anterior.

## Limitaciones del MVP

- Los datos viven en memoria y se pierden al reiniciar el servidor.
- Una instalación con múltiples procesos no comparte las salas.
- No hay actualizaciones en tiempo real; durante la espera hay que actualizar el estado manualmente.
- No hay autenticación ni recuperación avanzada de sesión.
- No están integrados Supabase, LiveKit, OpenAI ni el lienzo real.

## Próximos pasos

Las siguientes iteraciones previstas son el lienzo con `react-konva`, persistencia y realtime con Supabase, resultados compartibles y, más adelante, audio/video y recapitulaciones con IA.

Las pautas de arquitectura y contribución están en [AGENTS.md](./AGENTS.md).
