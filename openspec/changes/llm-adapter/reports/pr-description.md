# feat(DIS-17): `LlmPort` y adaptador LLM compatible OpenAI, con Ollama sin clave como entorno real

## ¿Qué cambia?

`LlmPort` tiene ya su contrato real (`complete`, `embed`, `mode`), y `packages/adapters/llm` lo
implementa contra cualquier endpoint compatible OpenAI (`chat/completions`, `embeddings`) con un
`fetch` inyectable, timeout por petición y respuestas validadas con Zod. La configuración se lee una
sola vez de las variables `LLM_*` y se valida al arrancar: `LLM_BASE_URL` decide el modo y la clave es
opcional, así que Ollama funciona sin clave. Ningún error contiene la clave ni texto del endpoint.

## ¿Por qué?

Ticket: DIS-17 (CM-HU-07.1), sub-issue de DIS-7 (CM-HU-07). Razonamiento de la autora, transcrito de
sus decisiones:

- **Decisión cerrada (5 sep 2026)**, `readme.md` §1.4: «Antes: `LLM_API_KEY` obligatoria. Ahora:
  **opcional**; evaluación sin key; desarrollo libre con Ollama. Motivo: 0 € y 0 fricción para quien
  evalúa.»
- **Matriz de configuración** (DIS-17, criterio enviado por la autora): «Ajusta la spec de DIS-17
  (CM-HU-07.1) sustituyendo la matriz de configuración por esta, pensada para Ollama como entorno real
  de desarrollo: […] (b) LLM_BASE_URL definida y LLM_API_KEY vacía → mode 'live' válido; la petición
  no lleva cabecera Authorization (Ollama no necesita clave).»
- **Dimensión de embeddings** (DIS-17): «DIS-17 no elige modelo de embeddings ni cambia la dimensión
  del esquema. Riesgo conocido: nomic-embed-text (Ollama) devuelve 768 y fallaría por
  dimension-mismatch; la decisión (migración de vector(1536) a la dimensión del modelo elegido, sin
  datos que migrar porque las columnas están siempre a NULL) corresponde a CM-HU-19.»

Desbloquea DIS-18 (modo evaluación y presupuesto), DIS-29 y DIS-56 (prompts), DIS-57 (métricas de
uso) y DIS-59 (API).

## ¿Cómo probarlo?

1. `npm ci`
2. `npx vitest run tests/unit/llm` → 33 tests verdes (22 escenarios de la spec, más los extras).
3. `npm run typecheck` → verde; incluye `tests/`, así que comprueba el `// @ts-expect-error` del
   escenario «An evaluation configuration does not type-check against the client».
4. `npm run lint && npm run lint:architecture && npm run docs:coverage`
5. `npx stryker run --mutate "packages/core/src/llm/**/*.ts"` → 100 % (21/21).
6. Contra Ollama real (opcional): instalar Ollama, `ollama pull llama3.2`, y en el `.env`
   `LLM_BASE_URL=http://localhost:11434/v1`, `LLM_API_KEY=` (vacía), `LLM_MODEL=llama3.2`. La traza
   completa de la prueba manual (éxito en frío y en caliente, `dimension-mismatch` real con
   `nomic-embed-text`, 404, `ECONNREFUSED`, `timeout`) está en
   `openspec/changes/llm-adapter/reports/2026-10-09-12-manual-interface-testing.md`. En este equipo
   Ollama necesitó `CUDA_VISIBLE_DEVICES=-1` porque el driver de NVIDIA es anterior al build CUDA que
   trae Ollama.

## Decisiones / compromisos

Todas en `openspec/changes/llm-adapter/design.md`:

- **D2.** `EMBEDDING_DIMENSIONS = 1536` en core, alineada con `vector(1536)`; no se envía
  `dimensions` y una dimensión distinta es `dimension-mismatch`. La elección del modelo y la
  migración son de DIS-46 (nota dejada allí).
- **D3/D4.** Un único `LlmUnavailable` con `reason` cerrado, **sin `cause`** ni cuerpo de respuesta: la
  clave no puede filtrarse por construcción. Para `network` se conserva solo un `systemCode` que cumpla
  `^E[A-Z]+$` (p. ej. `ECONNREFUSED`). Se pierde el error original al depurar; se acepta.
- **D5.** `LLM_BASE_URL` decide el modo; `LlmConfigError` (`LLM_CONFIG_INVALID`) nombra una variable
  cada vez y nunca su valor; `LLM_TIMEOUT_MS` va de 1 a 2147483647 (límite de los temporizadores de
  Node).
- **D6.** El timeout se clasifica por nombre de error tanto en `fetch` como en la lectura del cuerpo
  (un cuerpo que se queda a medias es `timeout`). Sin SDK de vendor ni reintentos.
- **D7.** `zod` 4.6.5 solo en `packages/adapters/llm` (verificado en npmjs); `packages/api` lo
  añadirá en CM-HU-12.
- **Privacidad** (`/privacy-ethics-check`, PASS WITH GAPS): una clave con una URL remota `http://`
  viaja en claro (Low, aceptado: Ollama local no usa clave); lo que se envíe a un proveedor cloud es
  de DIS-29 / DIS-41.

## Trazabilidad

| Escenario de la especificación | Test que lo cubre |
|---|---|
| `No URL and no key selects evaluation mode` | `tests/unit/llm/llm-config.spec.ts:18` |
| `A URL without a key selects live mode` | `tests/unit/llm/llm-config.spec.ts:30` |
| `A key without a URL fails without showing the key` | `tests/unit/llm/llm-config.spec.ts:46` |
| `A URL without a model fails` | `tests/unit/llm/llm-config.spec.ts:57` |
| `A malformed timeout or URL fails naming the variable` | `tests/unit/llm/llm-config.spec.ts:77` |
| `A valid timeout overrides the default` | `tests/unit/llm/llm-config.spec.ts:105` |
| `The verify purpose falls back to the generation model` | `tests/unit/llm/openai-compatible-llm.spec.ts:108` |
| `Without an embedding model, embeddings fail and completions work` | `tests/unit/llm/openai-compatible-llm.spec.ts:248` |
| `Without a key the completion is sent without Authorization` | `tests/unit/llm/openai-compatible-llm.spec.ts:82` |
| `With a key the completion is sent and parsed` | `tests/unit/llm/openai-compatible-llm.spec.ts:59` |
| `A completion without usage reports zero tokens` | `tests/unit/llm/openai-compatible-llm.spec.ts:96` |
| `Embeddings are returned in input order` | `tests/unit/llm/openai-compatible-llm.spec.ts:151` |
| `Embeddings without usage report zero tokens` | `tests/unit/llm/openai-compatible-llm.spec.ts:202` |
| `Embeddings for no texts send nothing` | `tests/unit/llm/openai-compatible-llm.spec.ts:221` |
| `A vector of another dimension is rejected` | `tests/unit/llm/openai-compatible-llm.spec.ts:234` |
| `Embeddings with missing or duplicated indexes are an invalid response` | `tests/unit/llm/openai-compatible-llm.spec.ts:176` |
| `A non-2xx status is reported with the status` | `tests/unit/llm/openai-compatible-llm.spec.ts:303` |
| `A body that is not JSON or has another shape is an invalid response` | `tests/unit/llm/openai-compatible-llm.spec.ts:316` |
| `A network failure is reported as network` | `tests/unit/llm/openai-compatible-llm.spec.ts:335` |
| `A request that exceeds the timeout is aborted` | `tests/unit/llm/openai-compatible-llm.spec.ts:355` |
| `Errors never contain the key` | `tests/unit/llm/openai-compatible-llm.spec.ts:365` |
| `An evaluation configuration does not type-check against the client` | `tests/unit/llm/openai-compatible-llm.spec.ts:131` |

## Notas

- **`.env.example` está pendiente**: las reglas `deny` de `.claude/settings.json` y el hook
  `block-secret-reads.sh` impiden al agente leerlo; se añadirá el bloque de Ollama (tarea 10.1) en
  cuanto la autora facilite el contenido.
- El commit `0057fb3 chore(harness): add KIT_PROTECT_SPECS switch for the spec/test guard` es de la
  autora y va en esta rama, ajeno al adaptador.
- Suite completa: 661 tests verdes y 124 omitidos en local (los de base de datos, sin `DATABASE_URL`);
  en CI corren con Postgres. Una pasada local falló por el timeout de Git dependiente de carga ya
  clasificado en DIS-92; el fichero solo pasa 24/24.

## Origen

agent+human-review

🤖 Generated with [Claude Code](https://claude.com/claude-code)
