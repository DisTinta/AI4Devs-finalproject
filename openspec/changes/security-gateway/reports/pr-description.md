feat(DIS-84): gateway de seguridad en core: redacción de secretos, confinamiento de rutas y eventos de auditoría

## ¿Qué cambia?

Core gana el módulo `packages/core/src/index/`, con dos funciones puras:

- `redactSecrets` sustituye por `[REDACTED: possible secret]` las claves privadas, los JWT, las claves de acceso de AWS y los valores de alta entropía asignados a claves con nombre de secreto. Conserva el resto de cada línea y el número de líneas, y devuelve un evento `secret_redacted` por tramo, sin el secreto.
- `confinePath` resuelve una ruta de repositorio dentro de la raíz permitida con `path.relative`, sin usar `startsWith`. Lanza `IndexingDisabled` si la raíz está vacía y `ForbiddenPathError` si la ruta queda fuera.

Core no lee el entorno ni escribe en ningún log. La PR incluye también cinco arreglos de herramientas y tests que salieron durante la implementación (D11–D15).

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
2. `npx vitest run tests/unit/index`: 4 ficheros, 58 tests en verde. En Linux, «A path on another Windows drive is forbidden» sale como skipped.
3. `npx vitest run`: 369 passed y 99 skipped (520 en total). Los 52 que faltan en la suma son `pending`. Los 151 sin ejecutar son tests de integración que necesitan `DATABASE_URL`, y el desglose está en el informe del paso 6.
4. `npx vitest run --exclude 'tests/integration/**'` sin `DATABASE_URL`: 24 ficheros, 343 tests.
5. `npm run lint && npm run typecheck && npm run lint:architecture && npm run docs:coverage`
6. `npx stryker run`: 95.11 % en core (817/859) y 95.45 % en `packages/core/src/index/` (336/352). Hay 16 supervivientes:
   - 15 equivalentes;
   - 1 que solo se nota en tiempo, y que detecta `secret-scanner.linear.spec.ts` fuera de Stryker (D14).

   La clasificación, con el motivo de cada uno, está en el informe del paso 6.
7. Evidencia:
   - Prueba manual sobre los dos fixtures y `confinePath`, repetida sobre el código final: `openspec/changes/security-gateway/reports/2026-10-05-7-manual-interface-testing.md`.
   - Verificación, fallos provocados, tablas de escalado, supervivientes de mutación y las cinco `/adversarial-review`: `reports/2026-10-05-6-test-and-state-verification.md`.

## Decisiones / compromisos

Todas están en `openspec/changes/security-gateway/design.md`.

- **D3, tiempo lineal con entrada adversaria.**
  - `generic-high-entropy` se implementa de forma equivalente a la regex de la spec, que retrocede de forma cuadrática: identificador completo, prueba de palabra clave y cola fija con `sticky`.
  - Las revisiones adversariales encontraron otros caminos cuadráticos alrededor de las regex, y se corrigieron en tres ciclos:
    - el solapamiento contra todos los tramos;
    - la búsqueda del cierre por cada cabecera, también con etiquetas distintas;
    - reconstruir la línea por cada tramo;
    - insertar con `splice`;
    - ordenar los eventos al final.
  - Ahora:
    - los intervalos por línea son el único registro de un tramo;
    - cada línea indexa sus cierres una vez, por etiqueta;
    - cada regla recorre una línea con un puntero que solo avanza y fusiona los resultados una vez;
    - un único recorrido reconstruye el texto y emite los eventos ya ordenados.
  - Todas las proporciones al duplicar la entrada quedan en 2.31 o menos.
- **D3, guiones compartidos.** Una cabecera puede empezar sobre los 5 últimos guiones del cierre anterior, o de una cabecera sin cierre. Antes no se encontraba y el cuerpo de esa clave se colaba en el índice. Ahora la búsqueda se reanuda 5 caracteres antes del final de cada bloque. Los guiones compartidos se quedan en el tramo anterior y el evento conserva la columna del primer guion de su cabecera. La spec lo dice ahora en «Private key blocks» y «Redaction audit events», con su propio escenario. El recorte que impide que dos tramos se solapen es una invariante defensiva que no se nota en el resultado (`slice` con `from < column` devuelve `''`).
- **D4, `private-key`.** Las formas se comprueban en el orden c, a, b. La forma a solo aplica si el `END` va justo después de las líneas de cuerpo PEM. La regla de cuerpo es laxa: una línea de una sola palabra cuenta como base64. Queda aceptado como limitación conocida, porque oculta de más y nunca filtra.
- **D5, orden de eventos.** Por `line` y `column`, sin ordenar al final: salen del recorrido de líneas e intervalos. El desempate por `rule` nunca puede darse.
- **D6, `confinePath` léxica.** No resuelve enlaces simbólicos. DIS-85 debe volver a llamarla con el `realpath`, y DIS-86 recorta `ALLOWED_REPOS_DIR` al leerlo.
- **D7, `readFixtureFiles(root, ignoredDirs)`.** Salta las entradas por nombre. El test del oráculo pasa `['.git', 'node_modules']`.
- **D11–D14, fuera del plan:**
  - D11: `stryker.config.json` limita `disableTypeChecks` a `packages/core/src/**`.
  - D12: `vitest.config.ts` excluye `.stryker-tmp/**`.
  - D13: `.gitattributes` pasa a `* text=auto eol=lf`, en su propio commit, `4c3b177`.
  - D14: los tests con límite de tiempo viven en `secret-scanner.linear.spec.ts`, excluido de Stryker, porque el código instrumentado no cabe en un presupuesto de reloj (2 517 ms dentro de Stryker, frente a ~420 ms fuera).
  - D15: las dos comprobaciones n/4n fallaron una vez en CI (9.10 y 8.13, run 37350620815). Ahora viven en `secret-scanner.scaling.spec.ts`, también excluido de Stryker. Usan la ejecución más rápida de cinco, alternando n y 4n, e imprimen siempre sus tiempos. Los fallos provocados dan entre 15.53 y 20.24.
- **Privacidad.** `/privacy-ethics-check` da PASS WITH GAPS, con dos hallazgos Low:
  - el correo sintético de la cuenta de servicio de AC3: aceptado;
  - el mensaje de `ForbiddenPathError` incluye la ruta pedida: pasa a DIS-86.
- **Seguimientos** (tarea 9.6, comentarios en DIS-85, DIS-86 y DIS-87):
  - DIS-87: `gitleaks` debe cubrir los bloques PGP y no marcar las dos claves plantadas de los fixtures. En `openspec/` ya no aparecen sus valores.

## Trazabilidad

| Escenario de la especificación | Test que lo cubre |
|---|---|
| The acme-shop planted secret is redacted | `tests/unit/index/secret-scanner.spec.ts:17` |
| The fixtures produce no false positive | `tests/unit/index/secret-scanner.spec.ts:49` |
| Redaction time grows linearly on adversarial lines | `tests/unit/index/secret-scanner.linear.spec.ts:10` (`describe`: once casos con límite de tiempo) y `secret-scanner.scaling.spec.ts` (sus dos comprobaciones n/4n) |
| A private key without a closing keeps the following code | `tests/unit/index/secret-scanner.spec.ts:72` |
| A single-line private key keeps the surrounding JSON | `tests/unit/index/secret-scanner.spec.ts:93` |
| A multiline private key inside a string keeps the code around it | `tests/unit/index/secret-scanner.spec.ts:116` |
| A header followed by prose redacts only the header | `tests/unit/index/secret-scanner.spec.ts:131` |
| A single-line block sharing its dashes with the previous closing is redacted whole | `tests/unit/index/secret-scanner.spec.ts:404` |
| Every rule produces one ordered event per span | `tests/unit/index/secret-scanner.spec.ts:147` |
| Paths inside the root are accepted | `tests/unit/index/path-policy.spec.ts:35` |
| Paths outside the root are forbidden | `tests/unit/index/path-policy.spec.ts:43` |
| A path on another Windows drive is forbidden | `tests/unit/index/path-policy.spec.ts:54` |
| A missing or blank root disables indexing | `tests/unit/index/path-policy.spec.ts:9` |

Casos extra, sin escenario propio:

- `secret-scanner.spec.ts:188` y siguientes (`describe('secret scanner boundaries')`): límites de cada regla, modelo de líneas, CRLF, bordes de solapamiento, guiones compartidos y la caché por línea.
- `path-policy.spec.ts:60` y `:67`: la raíz misma y el separador final.

## Origen

agent+human-review

🤖 Generated with [Claude Code](https://claude.com/claude-code)
