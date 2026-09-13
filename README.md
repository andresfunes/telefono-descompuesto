# Teléfono Descompuesto

Juego de fiesta multijugador, mobile-first, inspirado en el clásico “teléfono descompuesto”. Cada persona comienza una cadena con una frase; luego el grupo alterna entre dibujar e interpretar lo recibido hasta revelar cómo se transformaron todas las ideas.

## Estado actual

El flujo clásico permite:

- crear y entrar a salas de seis caracteres con una sesión anónima, sin registro;
- invitar mediante QR, WhatsApp o un enlace copiable;
- bloquear el lobby, expulsar intrusos y admitir hasta 12 jugadores;
- jugar rondas alternadas de texto y dibujo;
- mostrar una de 100 frases visuales aleatorias como inspiración inicial;
- dibujar con lápiz, goma, relleno, 12 colores, siete grosores y deshacer/rehacer;
- ver el tamaño del lápiz o borrador sobre el lienzo y dibujar puntos sin arrastrar;
- sincronizar lobby, jugadores pendientes, rondas y reveal automáticamente;
- refrescar o reintentar sin perder el texto ni el dibujo en curso;
- generar comentarios personalizados por cadena y premios de la partida;
- crear una revancha y notificar al resto mediante un modal descartable;
- registrar páginas vistas y visitas agregadas con Vercel Web Analytics.

Los dibujos se editan como vectores con `react-konva`, se exportan a PNG y se guardan en un bucket privado. PostgreSQL conserva el estado autoritativo.

## Cómo se juega

1. El organizador crea una sala y comparte el enlace o QR.
2. Con al menos dos participantes, inicia la partida.
3. Cada jugador escribe una frase original.
4. El grupo alterna entre dibujar lo recibido e interpretar el dibujo anterior.
5. La pantalla de espera agrupa quién sigue trabajando y quién ya terminó.
6. Tras una contribución de cada persona en cada cadena, se revela la cronología.
7. El organizador puede generar el veredicto con IA y comenzar otra partida.

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
NEXT_PUBLIC_TURNSTILE_SITE_KEY=...
TURNSTILE_SECRET_KEY=...
ABUSE_IP_HASH_SECRET=...
AI_ENABLED=true
```

Localmente, la publishable key puede ser la clave anónima y la secret key puede ser la clave `service_role`. Nunca expongas `SUPABASE_SECRET_KEY` con el prefijo `NEXT_PUBLIC_`.

`OPENAI_COMMENTARY_MODEL` es opcional y usa `gpt-5-mini` por defecto. `OPENAI_API_KEY` se utiliza solo en el servidor; no le agregues el prefijo `NEXT_PUBLIC_`.

Para habilitar comentarios e ingreso adaptativo en producción, creá un widget **Turnstile Managed** en Cloudflare, agregá los dominios de producción y preview permitidos y configurá su site key y secret. La verificación usa el modo visual `interaction-only`, por lo que normalmente permanece invisible. Para desarrollo podés permitir `localhost` o usar las claves de prueba oficiales de Turnstile.

La protección de comentarios usa estos valores predeterminados: 10 intentos por usuario/hora, 20 por IP/hora, 5 por partida y 1000 generaciones globales por día UTC. Los límites se pueden cambiar con las variables `AI_RATE_LIMIT_*` y `AI_DAILY_GLOBAL_LIMIT`. `AI_ENABLED=false` apaga todas las llamadas nuevas a OpenAI sin afectar el reveal. Definí `ABUSE_IP_HASH_SECRET` con un valor aleatorio largo: PostgreSQL guarda solamente un HMAC de la IP, nunca la dirección original. `AI_IP_HASH_SECRET` sigue funcionando como nombre heredado.

El mismo widget Turnstile protege el ingreso de forma adaptativa: no aparece durante el uso normal y se solicita después de varios intentos fallidos. Los intentos se limitan en PostgreSQL por sesión anónima, IP y código, con bloqueos de 5, 15 y 60 minutos ante abuso continuado.

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
lib/ai/              generación de comentarios y protección de uso
lib/supabase/        clientes de navegador, servidor y administración
repositories/        contratos y adaptadores de PostgreSQL/Storage
supabase/            configuración, migraciones y tests pgTAP
tests/               pruebas de dominio, dibujo, seguridad y repositorios
public/              ilustraciones y recursos estáticos
```

`SupabaseGameRepository` reconstruye el agregado de dominio, ejecuta las reglas TypeScript y persiste el resultado mediante compare-and-swap. `InMemoryGameRepository` permanece disponible para tests rápidos.

Los clientes reciben `GAME_CHANGED` por un Broadcast privado `game:<uuid>`. El evento solo invalida la vista: `router.refresh()` vuelve a pedir el estado autoritativo y URLs firmadas para los dibujos visibles.

### Seguridad y concurrencia

- Las Server Actions verifican la sesión anónima y derivan el jugador desde `auth.users.id`.
- Las salas nuevas usan seis caracteres generados con aleatoriedad criptográfica; los códigos históricos de cuatro caracteres siguen siendo legibles.
- Los lobbies vencen a las dos horas, admiten hasta 12 jugadores y el anfitrión puede bloquearlos o quitar participantes.
- La unión devuelve errores indistinguibles para salas inexistentes, vencidas, bloqueadas, llenas o ya iniciadas.
- Los intentos de unión se limitan por sesión, código y HMAC de IP; el desafío Turnstile aparece únicamente ante comportamiento sospechoso.
- El navegador no puede escribir tablas ni leer entregas ocultas.
- Cadenas, entradas y dibujos completos se habilitan directamente solo durante `REVEAL`.
- Cada mutación compara `games.version` dentro de una transacción; ante conflicto recarga, revalida y reintenta.
- Los PNG viven en `game-drawings`; durante la partida el servidor firma únicamente el dibujo asignado.
- Solo el organizador puede solicitar comentarios. La respuesta se valida contra jugadores, cadenas y entradas reales antes de persistirse para todo el grupo.
- Los comentarios requieren Turnstile y una reserva atómica por `game_id`; los límites y el cupo diario viven en tablas privadas de PostgreSQL.
- Vercel provee la IP mediante `x-vercel-forwarded-for`; fuera de Vercel en producción se usa un bucket conservador sin confiar en headers arbitrarios.

### Comentarios y premios

El reveal ofrece humor **Suave**, **Ácido** o **Sin piedad**, siempre limitado a las contribuciones observables de la partida. OpenAI recibe nombres, textos y URLs firmadas temporales de los dibujos únicamente cuando el organizador solicita el veredicto. Los comentarios aparecen debajo de su cadena y los premios al final: mejor dibujante, frase más original, mejor interpretación cuando corresponde, agente del caos y rescate de la cadena.

Los resultados quedan persistidos y se distribuyen por realtime. `AI_ENABLED=false` funciona como interruptor de emergencia sin impedir el reveal ni borrar comentarios existentes.

### Rotación de cadenas

En la ronda `r`, el jugador `i` recibe la cadena `(i - r) mod N`. Con `N` jugadores se juegan `N` rondas: cada participante contribuye exactamente una vez a cada cadena.

## Proyecto Supabase alojado

1. Creá el proyecto y habilitá **Anonymous Sign-Ins** en Auth.
2. Configurá la URL, publishable key y secret key en el despliegue.
3. Ejecutá `pnpm exec supabase login` y `pnpm exec supabase link --project-ref <ref>`.
4. Revisá con `pnpm exec supabase db push --dry-run` y aplicá con `pnpm exec supabase db push`.

La migración crea tablas, constraints, índices, funciones, RLS, autorización Realtime, límites de abuso y el bucket privado. No hay que crear esos recursos manualmente en el dashboard. En producción también debés configurar Anonymous Sign-Ins, Turnstile y todas las variables de entorno en Vercel.

## Limitaciones

- La identidad se pierde al borrar los datos del navegador o cambiar de dispositivo.
- El progreso indica quién entregó, pero no existe Presence real ni estado de conexión.
- La limpieza de un PNG subido cuyo commit falla es best-effort.
- Solo quien creó la partida puede generar los comentarios de IA.
- Audio y emoji existen en el modelo, pero todavía no tienen flujo jugable.
- No hay PWA instalable ni integración con LiveKit.

Las pautas de contribución están en [AGENTS.md](./AGENTS.md).
