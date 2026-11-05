# Observación sobre el repositorio de validación privado

*(Texto del agente, 2026-11-05, rama `feature/final-delivery-adjustments`. Prueba hecha a petición de la autora.)*

Es la observación aparte que anuncia el sacrificio 6 de [`readme.md`](../../readme.md) §2.1. **No es una
medición publicable**: el repositorio es privado, nadie ajeno puede repetirla y no forma parte de la Tabla 1 ni
de la Tabla 2 de §2.6. Solo se publican cifras agregadas: ni el nombre del proyecto, ni código, ni nombres de
personas, ni claves de tickets.

## El repositorio

- Aplicación Laravel en producción, con historial desde enero de 2022.
- 3 008 ficheros versionados (1 116 `.php`), 7 390 commits y 17 direcciones de autor distintas.
- Incluye recursos de terceros copiados en el repositorio (`public/`, carpetas `vendor/`) y una carpeta
  `openspec/` con unos 200 documentos de cambios archivados.

## Qué se ejecutó

Modo evaluación para indexar y `impact` (sin LLM); modo vivo con Ollama local para `ask` y `drift`.

```bash
ALLOWED_REPOS_DIR=C:/laragon/www npm run cli -- index <carpeta> --name private-laravel --language php --json
npm run cli -- impact private-laravel "Add a required column to the User model"
LLM_TIMEOUT_MS=600000 npm run cli -- ask private-laravel "How does the login listener record a user's login?"
LLM_TIMEOUT_MS=600000 npm run cli -- drift private-laravel --doc <documento>
```

## Resultados

### Indexado: funciona

| Dato | Valor |
|---|---|
| Tiempo total | 78 s |
| Ficheros indexados | 2 690 (1 989 `source`, 419 `doc`, 149 `test`, 133 `config`) |
| Ficheros saltados | 318 (306 binarios, 8 demasiado grandes, 4 enlaces simbólicos) |
| Diagnósticos del analizador | 0 |
| Símbolos | 3 854 |
| Commits / filas `file_commit` | 7 390 / 13 054 |
| Aristas | 13 116: 3 867 `exact` (29,5 %) y 9 249 `heuristic` (70,5 %) |
| Secretos redactados | 4, todos por la regla `generic-high-entropy` |

Por tipo: `co_changed` 5 998, `describes` 3 217, `calls` 2 690 `exact` y 34 `heuristic`, `imports` 1 023,
`extends` 134, `tested_by` 20.

El analizador PHP aguanta un repositorio real de este tamaño sin un solo diagnóstico, y el historial completo
entra en un minuto y medio.

### `impact`: responde en 4 s, con ruido

- Riesgo `HIGH`: 4 elementos directos, 0 tests, 35 documentos desalineados, 68 ficheros por co-cambio.
- **El propio modelo `User` no aparece como elemento directo.** Salen cuatro clases que lo usan; el fichero del
  modelo solo aparece en el historial, con un 3 % de co-cambio.
- **De los 35 documentos «desactualizados», 34 son de `openspec/changes/archive/`.** Un documento archivado no
  se vuelve a tocar por diseño, así que siempre queda «desactualizado desde» el último commit que cambió el código
  que menciona. Además, 2 652 de las 3 217 aristas `describes` (82 %) salen de `openspec/`.

### `ask`: correcta, pero sin verificar

- Con el timeout por defecto (`LLM_TIMEOUT_MS=120000`) falló con `LLM_UNAVAILABLE` (`timeout`) a los 127 s.
- Con 600 000 ms respondió en 107 s. La respuesta es correcta (comprobada contra el código), pero cita la clase
  entera (184 líneas) como evidencia, y la verificación de implicación devolvió `invalid-output` en las tres
  afirmaciones, así que las tres quedan como `INFERENCE`.

### `drift`: no utilizable en este equipo

De tres documentos, uno falló con `invalid-model-output` (`invalid_json`), otro devolvió 0 afirmaciones en 20 s y
el tercero (2 KB) no terminó en 900 s y se cortó.

## Qué se aprende

1. **Tests casi invisibles al grafo.** 137 ficheros de `tests/` se clasifican como `test`, pero solo hay 20 aristas
   `tested_by`. Los tests de este proyecto son mayoritariamente de `Feature` y se nombran por comportamiento, no
   por la clase que prueban, y la heurística actual depende del nombre. Por eso `impact` dice «0 tests» aunque el
   historial muestra tests que co-cambian con el código afectado.
2. **Faltan exclusiones por ruta.** El 35 % de los ficheros indexados (938) está bajo `public/` o en carpetas
   `vendor/`, y los documentos archivados de `openspec/` dominan las aristas `describes`. Una lista de rutas
   ignoradas por proyecto reduciría ruido en `impact` y `drift`.
3. **El modo vivo con un modelo local pequeño no escala a un repositorio real.** Los prompts crecen con el grafo, y
   en un portátil sin GPU dedicada el timeout por defecto se queda corto y el modelo devuelve JSON inválido con
   frecuencia. Es coherente con el diseño: el producto se evalúa en modo caché/golden y el modo vivo depende del
   endpoint que configure cada cual.
4. **La señal de co-cambio sí aporta.** Es la sección más útil del informe de impacto: une el cambio con los tests
   y los controladores que de verdad se tocan juntos, justo donde el grafo estático no llega (sacrificio 1 de §2.1).
