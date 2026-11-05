# 35. Adaptador LLM compatible OpenAI con Ollama como entorno real (DIS-17)

> Sección 35 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Rehacer la matriz de configuración para Ollama sin clave

Tras `/enrich-us DIS-17`, un agente revisor propuso cambiar el criterio y la autora lo envió tal cual:

```
  Ajusta la spec de DIS-17 (CM-HU-07.1) sustituyendo la matriz de configuración por esta, pensada para Ollama
  como entorno real de desarrollo:
  - (a) LLM_BASE_URL y LLM_API_KEY vacías → mode 'evaluation'.
  - (b) LLM_BASE_URL definida y LLM_API_KEY vacía → mode 'live' válido; la petición no lleva cabecera
  Authorization (Ollama no necesita clave).
  - (c) LLM_API_KEY definida y LLM_BASE_URL vacía → error al arrancar que nombra la variable que falta, sin
  mostrar valores.
  - (d) LLM_BASE_URL definida y LLM_MODEL vacía → error al arrancar.
  - (e) LLM_MODEL_VERIFY ausente → se usa LLM_MODEL; (f) LLM_EMBED_MODEL ausente → complete() funciona y embed()
  lanza un error tipado sin petición HTTP, sin usar LLM_MODEL como respaldo.
  - Timeout por petición con AbortSignal, con un valor por defecto amplio (120 s) para cubrir el arranque en
  frío de Ollama al cargar el modelo, configurable con LLM_TIMEOUT_MS (se añade a .env.example y a readme §1.4).
  Si vence → LlmUnavailable con motivo 'timeout'.
  - Riesgo explícito en los non-goals: con Ollama, embed() fallará por dimension-mismatch contra
  EMBEDDING_DIMENSIONS = 1536 hasta que CM-HU-19 elija el modelo y migre la columna; DIS-17 solo valida y no
  demuestra embed() en vivo.
  Actualiza también la descripción de la tarea con: el ejemplo de .env.example para Ollama
  (LLM_BASE_URL=http://localhost:11434/v1, LLM_API_KEY vacía, LLM_MODEL=<modelo de chat>,
  LLM_EMBED_MODEL=nomic-embed-text) y un criterio Dado/Cuando/Entonces que compruebe que, sin clave, la petición
  sale sin cabecera Authorization.
```

**Por qué funcionó.** El primer borrador hacía que la clave decidiera el modo, lo que obligaba a poner
una clave falsa (`ollama`) en cada `.env` de desarrollo. Con `LLM_BASE_URL` como discriminante, la
matriz quedó en seis casos comprobables uno a uno, y el riesgo de la dimensión (`vector(1536)` frente a
los 768 de `nomic-embed-text`), detectado durante el enriquecimiento, quedó escrito como non-goal en
vez de descubrirse al primer `embed()`.

**Ajuste humano.** La autora decidió que el modelo de embeddings y la migración de la columna son de
CM-HU-19 (nota en DIS-46, sin tocar su `[original]`) y pidió dejar en DIS-7 un comentario en español
sobre la nueva regla del modo, sin editar su descripción.

### Prompt 2 — Ajustar los artefactos antes del apply

```
  Ajusta los artefactos de openspec/changes/llm-adapter añadiendo:
  - design.md D6: la clasificación de errores se hace por el nombre del error también en la lectura del cuerpo:
  si response.text() rechaza con AbortError/TimeoutError → reason 'timeout'; cualquier otro fallo de lectura o
  de JSON.parse → 'invalid-response'. Actualiza la tabla de mapeo con esa fila.
  - spec.md, requisito "Endpoint failures map to one error", escenario "A request that exceeds the timeout is
  aborted": añade el caso de un endpoint que envía cabeceras 200 y no termina el cuerpo hasta el abort → reason
  'timeout'.
  - spec.md, requisito de configuración: LLM_TIMEOUT_MS debe ser entero positivo ≤ 2147483647 (límite de
  temporizadores de Node; por encima Node usa 1 ms). Añade 9999999999 a los valores rechazados del escenario "A
  malformed timeout or URL fails naming the variable" y refleja el límite en design.md D5.
  - spec.md, requisito "Embedding request, order and dimension": nuevo escenario "Embeddings with missing or
  duplicated indexes are an invalid response" (dos textos y data con un solo vector; con index [0,0]; con index
  [0,2]) → LLM_UNAVAILABLE, reason 'invalid-response'. Actualiza tasks.md 5.1 (deja de ser caso extra; nueva
  tarea RED → GREEN) y el recuento de 8.2 a 22 escenarios.
  - (Opcional) design.md D3/D4: LlmUnavailable con un campo opcional `systemCode` solo para reason 'network',
  copiado de error.cause.code si coincide con /^E[A-Z]+$/ (p. ej. ECONNREFUSED); nunca texto libre. Si se añade,
  inclúyelo en el escenario "A network failure is reported as network".
  No toques .claude/settings.json ni .gitignore: sus cambios no pertenecen a este change.
```

**Por qué funcionó.** Cada punto cerraba un hueco que el apply habría resuelto improvisando: un cuerpo
que se queda a medias habría salido como `invalid-response` en vez de `timeout`, y un
`LLM_TIMEOUT_MS=9999999999` se habría convertido sin aviso en un timeout de 1 ms. `systemCode`, con un
alfabeto cerrado de mayúsculas, recupera el único dato útil para el diagnóstico (Ollama apagado frente a
un host mal escrito) sin abrir una vía para que la clave llegue al error.

**Ajuste humano.** La autora dejó `systemCode` como opcional; el modelo lo incorporó y lo justificó en
D4. En la prueba manual, el `fetch` real de Node no dio código contra el puerto 1 (está en la lista de
puertos bloqueados de `fetch`, «bad port»); contra un puerto cerrado normal devolvió `ECONNREFUSED`.

### Prompt 3 — Aplicar el change con paradas de control

Texto literal enviado: `/opsx:apply llm-adapter`. A mitad de la aplicación, la autora añadió:

```
\btw antes de hacer ningún commit ni ejecutar las skills de revisión te paras y me avisas
```

El modelo se paró con cuatro preguntas (lanzar las skills de revisión, editar `.env.example`, instalar
Ollama y hacer commits, push y PR), y la autora respondió:

```
1. si
2. te doy permiso para modificar el .env.example
3. si
4. puedes hacerlos
```

**Por qué funcionó.** Las paradas separaron lo que el agente podía verificar por sí mismo (22
escenarios con un test cada uno, typecheck del `@ts-expect-error` comprobado ensanchando la firma,
mutación del 100 % en `core/src/llm` tras matar tres supervivientes) de lo que tiene efectos fuera del
repositorio: instalar software en el equipo y publicar commits.

**Ajuste humano.** El permiso verbal sobre `.env.example` no levantaba las reglas `deny` de
`.claude/settings.json` ni el hook `block-secret-reads.sh`; el agente no las esquivó y pidió a la autora
que le pasara el contenido del fichero.
