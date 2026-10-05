feat(DIS-84): gateway de seguridad en core: redacción de secretos, confinamiento de rutas y eventos de auditoría

## ¿Qué cambia?

Core gana el módulo `packages/core/src/index/`, con dos funciones puras:

- `redactSecrets` sustituye por `[REDACTED: possible secret]` las claves privadas, los JWT, las claves de acceso de AWS y los valores de alta entropía asignados a claves con nombre de secreto. Conserva el resto de cada línea y el número de líneas, y devuelve un evento `secret_redacted` por tramo, sin el secreto.
- `confinePath` resuelve una ruta de repositorio dentro de la raíz permitida con `path.relative`, sin usar `startsWith`. Lanza `IndexingDisabled` si la raíz está vacía y `ForbiddenPathError` si la ruta queda fuera.

Core no lee el entorno ni escribe en ningún log. La PR incluye también tres arreglos de herramientas que salieron durante la implementación (D11–D13).

Ticket: [DIS-84](https://linear.app/distinta-ai4devs/issue/DIS-84/cm-hu-05a1-gateway-de-seguridad-en-core-secret-scanner-path-policy) (sub-issue de DIS-64).

## ¿Por qué?

 Codemind va a leer repositorios ajenos para indexarlos y pasar su contenido a un LLM. Esos
  repositorios pueden contener credenciales: claves privadas, tokens, claves de AWS, contraseñas
  en ficheros de configuración. Si una credencial llega al índice, queda guardada en la base de
  datos, aparece en las respuestas y sale de la máquina hacia el proveedor del modelo. Y eso no
  tiene vuelta atrás. Lo mismo pasa si una ruta mal formada lleva a leer fuera del directorio
  permitido.

  Por eso las dos reglas, no dejar pasar secretos y no salir de la raíz permitida, van primero, antes
  de que exista el caso de uso de indexación (DIS-85) y el comando de la CLI (DIS-86). Así, cuando
  lleguen, solo tendrán que conectarlas, no inventarlas. Las pongo en core como funciones puras, sin
  I/O y con tests, para que se puedan verificar de forma aislada y nadie pueda saltárselas por accidente
  desde un adaptador.

  Los eventos de auditoría se devuelven como datos y nunca incluyen el secreto, ni un prefijo ni un
  hash. Quiero que se pueda saber qué se ha ocultado y dónde, sin que el propio registro se convierta
  en una filtración.


## ¿Cómo probarlo?

1. `npm ci`
2. `npx vitest run tests/unit/index`: 2 ficheros, 39 tests en verde. En Linux, «A path on another Windows drive is forbidden» sale como skipped.
3. `npx vitest run`: 350 passed y 99 skipped (501 en total; los 52 que faltan en la suma son `pending`). Los 151 sin ejecutar son tests de integración que necesitan `DATABASE_URL`; el desglose está en el informe del paso 6.
4. `npx vitest run --exclude 'tests/integration/**'` sin `DATABASE_URL`: 22 ficheros, 324 tests.
5. `npm run lint && npm run typecheck && npm run lint:architecture && npm run docs:coverage`
6. `npx stryker run`: 95.56 % en core (732/766) y 98.84 % en `packages/core/src/index/` (256/259). Los 3 supervivientes son equivalentes y están justificados en el informe.
7. Evidencia:
   - Prueba manual sobre los dos fixtures y `confinePath`: `openspec/changes/security-gateway/reports/2026-10-05-7-manual-interface-testing.md`.
   - Verificación, fallos provocados y supervivientes de mutación: `reports/2026-10-05-6-test-and-state-verification.md`.

## Decisiones / compromisos

Todas están en `openspec/changes/security-gateway/design.md`.

- **D3, `generic-high-entropy` en tiempo lineal.** La regex de la spec retrocede de forma cuadrática con una línea larga de palabras clave repetidas. Su grupo 1 siempre es un identificador completo, así que se implementa de forma equivalente: identificador completo, prueba de palabra clave y cola fija con `sticky`. La regex de la tabla define qué casa, no cómo se implementa.
- **D4, `private-key`.** Las formas se comprueban en el orden c, a, b. La forma a solo aplica si el `END` va justo después de las líneas de cuerpo PEM; si no, no se toca el código que hay entre la cabecera y un `END` lejano.
- **D5, orden de eventos.** Se ordenan por `line` y `column`. El desempate por `rule` de la spec nunca puede darse, porque los tramos no se solapan, y Stryker lo marcaba como `NoCoverage`.
- **D6, `confinePath` léxica.** No resuelve enlaces simbólicos (eso necesita `fs`). DIS-85 debe volver a llamarla con el `realpath` antes de leer.
- **D7, `readFixtureFiles(root, ignoredDirs)`.** Salta las entradas por nombre, igual que ya hacía con `.git`. El test del oráculo pasa `['.git', 'node_modules']`, porque `fixtures/task-api/node_modules` existe en local y no en CI.
- **D11–D13, fuera del plan:**
  - `stryker.config.json` limita `disableTypeChecks` a `packages/core/src/**`. Stryker añadía `// @ts-nocheck` a los fixtures de la sandbox y desplazaba el secreto plantado una línea.
  - `vitest.config.ts` excluye `.stryker-tmp/**`, para que una sandbox abandonada no rompa la suite local.
  - `.gitattributes` pasa a `* text=auto eol=lf`, porque la regla anterior no aplicaba `eol`. Va en su propio commit, `4c3b177`.
- **Privacidad.** `/privacy-ethics-check` da PASS WITH GAPS, con dos hallazgos Low:
  - El correo sintético de la cuenta de servicio de AC3: aceptado.
  - El mensaje de `ForbiddenPathError` incluye la ruta pedida, que puede contener el usuario del sistema operativo: pasa a DIS-86, que es quien lo escribirá en el log.

## Trazabilidad

| Escenario de la especificación | Test que lo cubre |
|---|---|
| The acme-shop planted secret is redacted | `tests/unit/index/secret-scanner.spec.ts:17` |
| The fixtures produce no false positive | `tests/unit/index/secret-scanner.spec.ts:49` |
| A private key without a closing keeps the following code | `tests/unit/index/secret-scanner.spec.ts:72` |
| A single-line private key keeps the surrounding JSON | `tests/unit/index/secret-scanner.spec.ts:93` |
| A multiline private key inside a string keeps the code around it | `tests/unit/index/secret-scanner.spec.ts:116` |
| A header followed by prose redacts only the header | `tests/unit/index/secret-scanner.spec.ts:131` |
| Every rule produces one ordered event per span | `tests/unit/index/secret-scanner.spec.ts:147` |
| Paths inside the root are accepted | `tests/unit/index/path-policy.spec.ts:35` |
| Paths outside the root are forbidden | `tests/unit/index/path-policy.spec.ts:43` |
| A path on another Windows drive is forbidden | `tests/unit/index/path-policy.spec.ts:54` |
| A missing or blank root disables indexing | `tests/unit/index/path-policy.spec.ts:9` |

Casos extra, sin escenario propio:

- `secret-scanner.spec.ts:188` y siguientes (`describe('secret scanner boundaries')`): límites de cada regla, modelo de líneas, CRLF, bordes de solapamiento y línea larga adversaria.
- `path-policy.spec.ts:60` y `:67`: la raíz misma y el separador final.

## Origen

agent+human-review

🤖 Generated with [Claude Code](https://claude.com/claude-code)
