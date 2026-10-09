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
2. `npx vitest run tests/unit/llm` → 48 tests verdes (29 escenarios de la spec, más los extras).
3. `npm run typecheck` → verde; incluye `tests/`, así que comprueba el `// @ts-expect-error` del
   escenario «An evaluation configuration does not type-check against the client».
4. `npm run lint && npm run lint:architecture && npm run docs:coverage`
5. `npx stryker run --mutate "packages/core/src/llm/**/*.ts"` → 100 % (27/27).
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
  `^E[A-Z]+$` (p. ej. `ECONNREFUSED`) o `^UND_ERR_[A-Z_]+$` (p. ej. `UND_ERR_SOCKET`, el código real de un
  socket cortado en Node): identificadores fijos, nunca texto libre. Se pierde el error original al depurar;
  se acepta.
- **D5.** `LLM_BASE_URL` decide el modo; `LlmConfigError` (`LLM_CONFIG_INVALID`) nombra una variable
  cada vez y nunca su valor; `LLM_TIMEOUT_MS` va de 1 a 300000, porque el `fetch` de Node (undici) corta
  cualquier petición a los 300 s por su cuenta (decisión de la autora tras `/adversarial-review`).
  `LLM_BASE_URL` rechaza credenciales, query y fragmento.
- **D6.** Los fallos se clasifican por nombre de error tanto en `fetch` como en la lectura del
  cuerpo: un cuerpo que se queda a medias es `timeout`, y uno cortado a mitad es `network` (decisión de
  la autora tras `/verify-against-spec`); los timeouts propios de undici (`UND_ERR_HEADERS_TIMEOUT`,
  `UND_ERR_BODY_TIMEOUT`) también son `timeout`. Las redirecciones no se siguen (`redirect: 'manual'`): un
  3xx es `http-status`. Sin SDK de vendor ni reintentos.
- **D7.** `zod` 4.6.5 solo en `packages/adapters/llm` (verificado en npmjs); `packages/api` lo
  añadirá en CM-HU-12. `usage` ausente o `null` (o un campo suyo) cuenta como 0; un campo presente que no
  sea un entero no negativo es `invalid-response`; solo se valida `choices[0]` (decisión de la autora).
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
| `A valid timeout overrides the default` | `tests/unit/llm/llm-config.spec.ts:111` |
| `The verify purpose falls back to the generation model` | `tests/unit/llm/openai-compatible-llm.spec.ts:110` |
| `Without an embedding model, embeddings fail and completions work` | `tests/unit/llm/openai-compatible-llm.spec.ts:399` |
| `Without a key the completion is sent without Authorization` | `tests/unit/llm/openai-compatible-llm.spec.ts:84` |
| `With a key the completion is sent and parsed` | `tests/unit/llm/openai-compatible-llm.spec.ts:61` |
| `A completion without usage reports zero tokens` | `tests/unit/llm/openai-compatible-llm.spec.ts:98` |
| `A null usage reports zero tokens` | `tests/unit/llm/openai-compatible-llm.spec.ts:146` |
| `A partial usage counts the missing field as zero` | `tests/unit/llm/openai-compatible-llm.spec.ts:161` |
| `A usage field of the wrong type is an invalid response` | `tests/unit/llm/openai-compatible-llm.spec.ts:175` |
| `Embeddings are returned in input order` | `tests/unit/llm/openai-compatible-llm.spec.ts:283` |
| `Embeddings without usage report zero tokens` | `tests/unit/llm/openai-compatible-llm.spec.ts:353` |
| `Embeddings for no texts send nothing` | `tests/unit/llm/openai-compatible-llm.spec.ts:372` |
| `A vector of another dimension is rejected` | `tests/unit/llm/openai-compatible-llm.spec.ts:385` |
| `Embeddings with missing or duplicated indexes are an invalid response` | `tests/unit/llm/openai-compatible-llm.spec.ts:308` |
| `A non-2xx status is reported with the status` | `tests/unit/llm/openai-compatible-llm.spec.ts:486` |
| `A redirect is not followed` | `tests/unit/llm/openai-compatible-llm.spec.ts:499` |
| `A body that is not JSON or has another shape is an invalid response` | `tests/unit/llm/openai-compatible-llm.spec.ts:517` |
| `A network failure is reported as network` | `tests/unit/llm/openai-compatible-llm.spec.ts:536` |
| `A connection cut while reading the body is a network failure` | `tests/unit/llm/openai-compatible-llm.spec.ts:557` |
| `A runtime socket failure carries its code` | `tests/unit/llm/openai-compatible-llm.spec.ts:577` |
| `A runtime header or body timeout is a timeout` | `tests/unit/llm/openai-compatible-llm.spec.ts:590` |
| `A request that exceeds the timeout is aborted` | `tests/unit/llm/openai-compatible-llm.spec.ts:632` |
| `Errors never contain the key` | `tests/unit/llm/openai-compatible-llm.spec.ts:642` |
| `An evaluation configuration does not type-check against the client` | `tests/unit/llm/openai-compatible-llm.spec.ts:133` |

## Notas

- **`.env.example`**: las reglas `deny` de `.claude/settings.json` y el hook `block-secret-reads.sh`
  impiden al agente leerlo; la autora facilitó el contenido y el agente reescribió el bloque LLM sin
  leer el fichero (modo evaluación por defecto y ejemplo de Ollama comentado).
- **gitleaks**: la clave sintética del escenario «Errors never contain the key» se marcó como
  `generic-api-key`; está permitida por su valor exacto en `.gitleaks.toml`.
- **Cambios ajenos al alcance de DIS-17** que van en esta rama:
  - `0057fb3 chore(harness): add KIT_PROTECT_SPECS switch for the spec/test guard` (de la autora).
  - `b21adce test(harness): raise vitest timeout for git integration tests on Windows`: `testTimeout` y
    `hookTimeout` a 20 s en `vitest.config.ts`, porque dos tests de integración de Git superaban los 5 s
    por carga en la suite completa en Windows (solos pasan). Sin cambios en los tests; suite completa
    verde dos veces seguidas.
- **Traspasos a DIS-29** (comentario en Linear): no registrar ni serializar la configuración (lleva la
  clave), clave con caracteres no válidos en una cabecera, mensajes vacíos y lotes.
- Suite completa: 677 tests verdes y 124 omitidos en local (los de base de datos, sin `DATABASE_URL`);
  en CI corren con Postgres.

## Origen

agent+human-review

🤖 Generated with [Claude Code](https://claude.com/claude-code)
