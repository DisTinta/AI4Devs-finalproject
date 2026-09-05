# CODEMIND — Hoja de ruta para agentes (temporal, pre-harness)

**Autora:** Cristina Rodríguez Núñez  
**Repo de entrega:** fork `DisTinta/AI4Devs-finalproject`  
**Última actualización:** 5 de septiembre de 2026

> **Temporal.** Este fichero es la brújula viva **hasta que se instale el harness** (`sdd-harness-kit`). No crear ni escribir aún `docs/project-context.md` ni `AGENTS.md`: el kit los genera. Tras el harness, migrar el contenido vigente de este documento a `docs/project-context.md` (incluida la norma de `prompts.md`), actualizar punteros del kit, y **eliminar este archivo**.

---

## 1. Estado actual

| Ítem | Estado |
|---|---|
| Entrega 1 — Documentación técnica | **Cerrada** (`readme.md`, `prompts.md`, wireframes en `images/`, PR + Typeform) |
| Decisiones evidencia / LLM (v4) | **Cerradas** (5 sep 2026) — ver §2 |
| Código / monorepo | Aún no iniciado |
| Harness | Pendiente (se instala **después** del esqueleto del proyecto) |
| `docs/project-context.md` | No existe a propósito; lo creará el harness |

---

## 2. Decisiones cerradas (5 sep 2026)

Antes eran bloqueos abiertos; **ningún agente las reabre ni inventa un hosting/vendor distinto** sin decisión explícita de la autora:

1. **Evidencia solo local.** Sin demo web alojada. Quien evalúa: `make up` + `docs/DEMO.md` + `npm run verify`. Detalle: `readme.md` y `proposal-codemind/05-propuesta-v4-evidencia-local-hibrido-ollama.md`.
2. **LLM híbrido + Ollama.** `LLM_API_KEY` / endpoint **opcionales**. Sin ellos → modo evaluación (caché/golden). Con ellos → pregunta libre; desarrollo por defecto vía **Ollama** (`LLM_BASE_URL` compatible OpenAI). Vendor cloud de pago no obligatorio.
3. **«Despliegue» (Entrega 3)** = Compose + CI + verify reproducibles, no PaaS/VPS público.

Hasta el hito 6 no hace falta tener Ollama instalado: el esqueleto deja `.env.example` alineado con lo anterior (key vacía, comentarios neutros + ejemplo Ollama).

---

## 3. Siguiente paso concreto

Inicializar el **esqueleto del monorepo** según `readme.md` §2.3: workspaces npm, `docker-compose` (Postgres + pgvector) y `Makefile` / `make up`. Los fixtures ya existen (hito 1 cerrado); su historia Git se reconstruye con `node fixtures/build-history.mjs`, que `seed:build` deberá invocar. En `.env.example`: `LLM_API_KEY` vacía, `LLM_BASE_URL` documentado para Ollama, sin asumir Anthropic/OpenAI. Después: harness + adaptador `fastify` → migrar este fichero a `docs/project-context.md` y borrarlo → Ticket 3 (BD).

---

## 4. Cola hasta Entrega 2 (22 oct 2026)

Orden de trabajo (no saltar el harness antes del esqueleto):

| # | Hito | Hecho |
|---|---|---|
| 1 | Fixtures `acme-shop` + `task-api` (drift plantado) | ✅ (rama `feature/entrega-2-CRN`) |
| 2 | Esqueleto monorepo + `make up` | |
| 3 | Harness (`sdd-harness-kit` + adaptador fastify) → migrar a `docs/project-context.md` y **borrar** `CODEMIND-ROADMAP.md` | |
| 4 | Ticket 3 — esquema BD, CHECK, invalidación, semillas | |
| 5 | Analizador PHP + extractor Git + generación de semillas | |
| 6 | Context Engine + `explain` (CLI) + Ticket 1 (verificador) + adaptador LLM (Ollama) + caché de evaluación | |
| 7 | Ticket 2 (web) conectado a `/ask` | |
| 8 | Rama / PR `feature/entrega-2-CRN` + Typeform | |

Tickets canónicos: `readme.md` §6. Calendario largo (S11–S13, analizador TS, verify, Entrega 3): `readme.md` / propuesta; no duplicar aquí.

---

## 5. Reglas duras (cualquier modelo)

- `packages/core` **no** importa `adapters/`, `analyzers/` ni `api/`. La regla se comprobará en CI (`dependency-cruiser`) y en hooks del harness.
- Máximo **3 endpoints** API (plantilla).
- Evidencia de funcionamiento: **demo local** + `npm run verify` (golden/caché, sin LLM). **No** demo alojada. **No** vídeo Opción B.
- Fuentes de verdad:
  - `readme.md` — producto y diseño
  - `prompts.md` — registro de uso de IA
  - este fichero — progreso y siguiente paso (hasta la migración)
  - `proposal-codemind/05-…` — enmienda operativa evidencia/LLM (la 04 es histórica en esos puntos)
- `ai4devs-requisitos-y-encaje.md` es **histórico de encaje**, no spec viva ni brújula.
- No reescribir ni inventar prompts «de memoria» y presentarlos como literales.
- No asumir vendor LLM de pago ni configurar claves reales en el repo.

---

## 6. Norma: registro síncrono en `prompts.md`

Obligatoria para cualquier agente que cierre un hito o una decisión relevante hecha con IA.

1. **Cuándo:** en la **misma sesión** de trabajo — no al final del proyecto ni «cuando haya tiempo».
2. **Qué:** solo los prompts **más significativos** (creación inicial, corrección de rumbo, adición de funcionalidad relevante). Máximo **3 por sección** de la plantilla, como ya indica `prompts.md`.
3. **Formato** (idéntico al existente):
   - Título `### Prompt N — …`
   - Prompt **literal** en bloque de código (tal como se envió)
   - Opcional: `**Por qué funcionó.**` cuando aporte
   - `**Ajuste humano.**` con lo que se cambió o rechazó de la salida del modelo
4. **Prohibido:** reconstruir prompts a posteriori y presentarlos como transcripción.
5. Secciones marcadas como *(pendiente)* (p. ej. §7 Pull Requests): rellenar **solo** cuando exista el trabajo real.
6. **Decisiones de producto sin prompt literal** (p. ej. conversación de criterio): registrarlas en §8 como lección/decisión humana, sin inventar un bloque de prompt.

Al migrar este documento a `docs/project-context.md`, **esta norma viaja con él**.

---

## 7. Cómo actualizar este documento

Al cerrar un hito:

1. Marcar la fila correspondiente en la cola (§4).
2. Reescribir §3 «Siguiente paso concreto» en una o dos frases.
3. Si hubo prompt significativo → aplicar §6 sobre `prompts.md` en la misma sesión.
4. Actualizar la fecha de «Última actualización» del encabezado.

---

## 8. Migración post-harness (checklist)

Cuando el monorepo esté inicializado y el harness instalado:

1. [ ] Incorporar el contenido vigente de este fichero en `docs/project-context.md` (base del harness + estado CODEMIND + §5–§6).
2. [ ] Asegurar que `AGENTS.md` / doctrina del kit apuntan a `docs/project-context.md` para el estado vivo.
3. [ ] **Eliminar** `CODEMIND-ROADMAP.md` de la raíz.
4. [ ] Registrar en `prompts.md` el prompt significativo de esa migración solo si aplica el criterio de §6.
