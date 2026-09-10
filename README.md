# Teléfono Descompuesto

Juego de fiesta multijugador, mobile-first, inspirado en el clásico “teléfono descompuesto”. Cada persona comienza una cadena con una frase; luego el grupo alterna entre dibujar e interpretar lo recibido hasta revelar cómo se transformaron todas las ideas.

## Estado actual

El flujo clásico permite:

- crear y entrar a salas cortas sin registro;
- jugar rondas alternadas de texto y dibujo;
- dibujar con lápiz, goma, colores, grosores y deshacer/rehacer;
- sincronizar lobby, progreso, rondas y reveal automáticamente;
- refrescar o reconectar sin perder la partida persistida.
- generar comentarios personalizados y basados en las contribuciones al finalizar.

Los dibujos se editan como vectores con `react-konva`, se exportan a PNG y se guardan en un bucket privado. PostgreSQL conserva el estado autoritativo.

## Requisitos

- Node.js 22 o superior (ejecutá `nvm use` para usar la versión del proyecto)
- pnpm 11.19 o compatible
- Docker Desktop, OrbStack u otro runtime compatible para Supabase local

## Desarrollo local

```bash
pnpm install
pnpm supabase:start
```

Copiá `.env.example` a `.env.local`. Completá las variables de Supabase con los valores de `pnpm exec supabase status` y agregá una API key de OpenAI para habilitar los comentarios:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SECRET_KEY=...
OPENAI_API_KEY=...
OPENAI_COMMENTARY_MODEL=gpt-5-mini
```

Localmente, la publishable key puede ser la clave anónima y la secret key puede ser la clave `service_role`. Nunca expongas `SUPABASE_SECRET_KEY` con el prefijo `NEXT_PUBLIC_`.

`OPENAI_COMMENTARY_MODEL` es opcional y usa `gpt-5-mini` por defecto. `OPENAI_API_KEY` se utiliza solo en el servidor; no le agregues el prefijo `NEXT_PUBLIC_`.

```bash
pnpm supabase:reset
pnpm dev
```

Abrí [http://localhost:3000](http://localhost:3000). Para simular varios jugadores, usá perfiles o contextos separados; cada uno recibe una identidad anónima.

## Comandos

```bash
pnpm dev             # servidor de desarrollo
pnpm lint            # ESLint y reglas de Next.js
pnpm typecheck       # TypeScript estricto
pnpm test            # suite de Vitest
pnpm build           # build de producción
pnpm supabase:start  # levanta Supabase local y aplica migraciones
pnpm supabase:reset  # recrea la base local desde las migraciones
pnpm supabase:test   # ejecuta tests pgTAP de esquema y RLS
pnpm supabase:stop   # detiene la pila local
```

Antes de enviar cambios, ejecutá `pnpm lint`, `pnpm typecheck`, `pnpm test` y `pnpm build`.

## Arquitectura

```text
app/                 rutas y Server Actions autoritativas
components/          interfaz y suscripción Realtime
components/drawing/  lienzo, controles e historial vectorial
domain/              modelo y reglas puras del juego
lib/supabase/        clientes de navegador, servidor y administración
repositories/        contratos y adaptadores de PostgreSQL/Storage
supabase/            configuración local y migraciones SQL
tests/               pruebas del dominio, dibujo y repositorios
```

`SupabaseGameRepository` reconstruye el agregado de dominio, ejecuta las reglas TypeScript y persiste el resultado mediante compare-and-swap. `InMemoryGameRepository` permanece disponible para tests rápidos.

Los clientes reciben `GAME_CHANGED` por un Broadcast privado `game:<uuid>`. El evento solo invalida la vista: `router.refresh()` vuelve a pedir el estado autoritativo y URLs firmadas para los dibujos visibles.

### Seguridad y concurrencia

- Las Server Actions verifican la sesión anónima y derivan el jugador desde `auth.users.id`.
- El navegador no puede escribir tablas ni leer entregas ocultas.
- Cadenas, entradas y dibujos completos se habilitan directamente solo durante `REVEAL`.
- Cada mutación compara `games.version` dentro de una transacción; ante conflicto recarga, revalida y reintenta.
- Los PNG viven en `game-drawings`; durante la partida el servidor firma únicamente el dibujo asignado.

### Rotación de cadenas

En la ronda `r`, el jugador `i` recibe la cadena `(i - r) mod N`. Con `N` jugadores se juegan `N` rondas: cada participante contribuye exactamente una vez a cada cadena.

## Proyecto Supabase alojado

1. Creá el proyecto y habilitá **Anonymous Sign-Ins** en Auth.
2. Configurá la URL, publishable key y secret key en el despliegue.
3. Ejecutá `pnpm exec supabase login` y `pnpm exec supabase link --project-ref <ref>`.
4. Revisá con `pnpm exec supabase db push --dry-run` y aplicá con `pnpm exec supabase db push`.

La migración crea tablas, constraints, índices, funciones, RLS, autorización Realtime y el bucket privado. No hay que crear esos recursos en el dashboard. Para producción, configurá CAPTCHA o Turnstile para limitar abuso del alta anónima.

## Limitaciones

- La identidad se pierde al borrar los datos del navegador o cambiar de dispositivo.
- No hay Presence ni indicadores por jugador conectado.
- La limpieza de un PNG subido cuyo commit falla es best-effort.
- Los comentarios de IA se generan bajo demanda y no se persisten al refrescar.
- LiveKit todavía no está integrado.

Las pautas de contribución están en [AGENTS.md](./AGENTS.md).
