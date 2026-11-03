# Ahorro de contexto y coste del verificador

*(Texto del agente, ejecución autónoma, 2026-11-03. Cambio `context-measurement`, DIS-81.)*

## Hashes SHA-256

Registrados antes de lanzar la medición. `npm run measure:context` compara el fichero de preguntas con
este hash antes de leer nada más.

| Fichero | SHA-256 |
|---|---|
| `docs/measurements/context/questions.json` | `e01752687bbf6be2bcba95c7f2dc116c0ea5f3666100b387db7d170e14c893e6` |

## Método

Informe de la medición que rellena la Tabla 1 de [`readme.md`](../../readme.md) §2.6. Las cifras salen de
[`context/context-savings.json`](context/context-savings.json), que escribe `npm run measure:context`
(`scripts/measure-context.mjs`) a partir de los datos en bruto de [`context/raw/`](context/raw/);
`tests/unit/docs/context-savings.spec.ts` comprueba que los ficheros publicados son la agregación de esos datos
y que las secciones de este informe que se pueden leer con una máquina coinciden con el JSON.

- **Preguntas.** Las escribió el agente de la fase de aplicación (sin intervención de la autora) a partir de los
  fixtures, del grafo de `seeds/graph-dump.sql` y de la tabla de preguntas golden de `fixtures/README.md`: 20 por
  repositorio de muestra, con las tres golden de cada uno y dos que deben dar `UNKNOWN` (`expected: "unknown"`).
  Se commitearon con el hash de la sección anterior antes de la primera ejecución. Las preguntas se escribieron y congelaron antes de ver ninguna respuesta.
- **Congelación.** Antes de leer nada más, el script compara el SHA-256 de `questions.json` con el registrado aquí;
  si difiere, sale con código 1 y no escribe nada.
- **Comprobaciones en vivo.** La API responde `{ "status": "ok" }` en `/health`; Ollama responde `/api/version` y
  lista el modelo en `/api/tags`; `raw/run.json` registra versión, modelo, digest y modelo de verificación, y una
  ejecución con otro valor sale con código 1 en lugar de mezclar modelos.
- **Preguntas a la API.** Cada pregunta va a `POST /api/projects/<id>/ask` con `useCache: false`, sin límite de
  tiempo. Una respuesta de la caché de respuestas, un cuerpo sin campo de uso o una respuesta `UNKNOWN` con motivo
  `llm-required` (API en modo evaluación) detienen la ejecución. Cada respuesta se escribe en `raw/` en cuanto
  llega, y una nueva ejecución reanuda donde se quedó.
- **Tokenizador.** Cada fichero no redactado de los dos proyectos en la semilla (89) se cuenta con
  `POST /api/generate` (`raw: true`, `num_predict: 1`, `prompt_eval_count`), tras comprobar que su SHA-256 es el
  `content_hash` de la semilla. Los dos ficheros redactados se excluyen: su contenido indexado no son sus bytes.
- **Ahorro.** «Contexto bruto» es la suma de `baselineTokens`, «CODEMIND» la de `inputTokens` (generación más
  verificación) de las respuestas con contexto, y «Ahorro» son décimas enteras con la fórmula de `savingsPct`
  del producto. Las filas `UNKNOWN` no llevan uso y se cuentan aparte por motivo.
- **Texto del agente.** Este informe, las preguntas y las conclusiones son texto del agente de la ejecución
  autónoma de DIS-81.

## Entorno

- **Fecha:** 2026-11-03. Una sola ejecución del script (inicio 11:53, local; las 40 respuestas, entre las 11:58 y las
  13:22, y los 89 conteos hasta las 13:30), código de salida 0, sin reanudaciones.
- **Ollama:** 0.40.13. **Modelo de respuesta y de verificación:** `qwen2.5-coder:latest`
  (7,6B, Q4_K_M), digest `dae161e27b0e90dd1856c8bb3209201fd6736d8eb66298e75ed87571486f4364`; `LLM_MODEL_VERIFY`
  vacío, de modo que verifica el mismo modelo. El modelo registrado es el del entorno del script, que se lanzó con
  los mismos valores `LLM_*` que la API.
- **Procesador:** GPU, NVIDIA GeForce GTX 970 (4 GB), biblioteca CUDA (`inference compute … library=CUDA
  compute=5.2`); 9 de las 29 capas del modelo en la GPU y el resto en la CPU.
- **Tiempo máximo:** `LLM_TIMEOUT_MS=1200000`.
- **Contexto de Ollama:** `OLLAMA_CONTEXT_LENGTH=16384` (`n_ctx = 16384` en su registro). El registro de Ollama de
  toda la ejecución no contiene ninguna línea `truncating input prompt`, así que ningún prompt se recortó.
- **Servidor de Ollama de la medición:** un proceso `ollama serve` aparte, en `127.0.0.1:11435`, arrancado por el
  agente con ese contexto. La aplicación de bandeja de Ollama de la máquina (puerto 11434, contexto por defecto) no
  se cerró, porque el clasificador del modo automático denegó cerrarla; la medición no la usó.
- **Repositorio:** rama `feature/dis-81-measure-context`; semilla `seeds/graph-dump.sql` con SHA-256
  `771ddaf556a7ebcf41632fa7a487b44eee9a7f71371ae4f84bd1e7b9658c6d16`.

## Resultados

| Repositorio | Contexto bruto | CODEMIND | Ahorro | Respondidas | UNKNOWN |
|---|---|---|---|---|---|
| `acme-shop` | 86 355 | 116 025 | -34,4 % | 17 | 3 |
| `task-api` | 52 420 | 85 200 | -62,5 % | 16 | 4 |

El ahorro es negativo en los dos repositorios: CODEMIND envía más tokens al modelo que los ficheros completos que
cita. Es lo que mostraban ya las seis respuestas golden de `seeds/cache/` (todas con `savingsPct` negativo). Los
repositorios de muestra son pequeños y construidos a propósito (sus ficheros tienen entre decenas y unos pocos
cientos de tokens), y el paquete de CODEMIND añade el prompt de sistema, los metadatos de cada fragmento y las
llamadas de verificación; con ficheros así de cortos eso pesa más que lo que se ahorra al no enviar el resto del
repositorio. No se ha ajustado ninguna cifra, y la medición no dice qué ocurre en un repositorio grande.

Las cuatro respuestas `UNKNOWN` por `no-anchor` son las cuatro preguntas que se declararon `unknown` (las cuatro
respondieron `UNKNOWN`, 2 de 2 en cada repositorio); las tres `invalid-model-output` (una en `acme-shop`, dos en
`task-api`, una de ellas la pregunta golden Q01) son salidas del modelo que no se pudieron verificar. Las respuestas
`UNKNOWN` no llevan uso y quedan fuera de las cifras de tokens.

## Verificador

Reparto de la verificación (PH-27), por repositorio:

- `acme-shop`: 17 respondidas y 3 UNKNOWN (invalid-model-output 1, no-anchor 2); verificación 28,1 % de los tokens y 18,2 % del tiempo; coste de verificación n/a (0 USD con Ollama local); latencia mediana 162,5 s (verificación 24,7 s)
- `task-api`: 16 respondidas y 4 UNKNOWN (invalid-model-output 2, no-anchor 2); verificación 36,3 % de los tokens y 24,1 % del tiempo; coste de verificación n/a (0 USD con Ollama local); latencia mediana 93,6 s (verificación 11,5 s)

- **Latencia frente al criterio de 10 s del README.** Ninguna de las 33 respuestas se contestó en menos de 10 s
  (`under10s` es 0 en los dos repositorios): la mediana es de 162,5 s y 93,6 s con este modelo local en una GTX 970. La
  verificación sola ya supera esos 10 s (mediana de 24,7 s y 11,5 s). El criterio del README («menos de 10
  segundos») no se cumple con este hardware y este modelo; la medición no dice qué ocurriría con un modelo alojado.
- **Llamadas de verificación.** El máximo de llamadas de una respuesta fue de 9 en `acme-shop` y de 15 en `task-api`,
  frente a `MAX_VERIFY_CALLS_PER_ANSWER` = 20 (provisional, «se revisa con las mediciones de la Tabla 1»).
- **Caché de verificación de la API.** 0 aciertos en `acme-shop` y 0 en `task-api`: ninguna verificación se sirvió de
  la caché en memoria de la API, así que ninguna cifra de tokens de verificación se subestima por ella en esta
  ejecución (única, sin reinicios de la API).
- **Coste.** 0 USD con Ollama local, así que el reparto del coste no está definido; `verifyCostUsd` está en el CSV
  para recalcularlo con un modelo de pago.
- **Conclusión del agente sobre la constante.** Con 9 y 15 llamadas como máximo, el tope de 20 no llegó a limitar
  ninguna respuesta: no hay motivo para cambiarlo con estos datos, y no se cambia en este cambio. Queda como un tope
  de seguridad; con 40 preguntas no hay datos para afinarlo hacia abajo.

## Desviación del estimador

Muestra: los 89 ficheros no redactados de la semilla de los dos repositorios, contados con el tokenizador del
modelo a través de Ollama.

- Desviación de `baselineTokens` (chars/4) frente al tokenizador de `qwen2.5-coder:latest` en 89 ficheros: +2,4 % en total (mínimo -31,2 %, máximo +43,3 % por fichero)

El estimador del producto (`ceil(caracteres / 4)`) sobreestima un 2,4 % en total sobre esta muestra: 20 628 tokens
estimados frente a 20 147 contados. El mínimo es `fixtures/task-api/package.json` (un JSON, que el modelo
divide en más tokens que chars/4) y el máximo `fixtures/acme-shop/app/Http/Controllers/Controller.php` (un fichero de 60 tokens). Se declara y no
se corrige (el tokenizador local no cambia). La reutilización del prefijo de la caché de Ollama no sesga el conteo: en
Ollama 0.40.13 `prompt_eval_count` es el del prompt entero aunque Ollama reutilice su caché (sonda previa al cambio).

## Limitaciones

- Una sola ejecución, sin repeticiones ni intervalos de confianza, con un modelo local de 7,6B parámetros en una GPU
  de 4 GB; son mediciones de producto, no resultados de investigación.
- Las 40 preguntas las escribió un agente a partir de los propios fixtures y se congelaron antes de la ejecución; no
  son una muestra de preguntas reales de usuarios.
- Los repositorios de muestra son pequeños y se crearon a propósito; el ahorro medido no se extrapola a repositorios
  grandes.
- Los tokens gastados en una respuesta `UNKNOWN` después de llamar al modelo (`invalid-model-output`, `no-evidence`,
  `broken-evidence`) no vienen en la respuesta de `/ask`, así que no están en la Tabla 1 (están en `query_log`);
  aquí fueron tres respuestas.
- Una verificación respondida desde la caché en memoria de la API no cuesta ningún token y `useCache: false` no la
  salta; en esta ejecución hubo 0 aciertos.
- El modelo registrado es el del entorno del script; la API se lanzó con los mismos valores `LLM_*`, pero el script no
  puede leer la configuración de la API.
- «Correctas (de 20)» no sale de esta medición: viene de la revisión ciega de las respuestas (`context/answers/`, sin
  modelo, tokens, coste, latencia ni confianza) por dos agentes revisores de modelos distintos, que
  se describe, con sus veredictos y sus hashes, en [`answer-review.md`](answer-review.md).
- La estimación `baselineTokens` y su desviación se midieron con un solo tokenizador (el del modelo local).
