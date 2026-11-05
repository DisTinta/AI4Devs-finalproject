# 28. Gateway de seguridad en core: redacción de secretos y confinamiento de rutas (DIS-84)

> Sección 28 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Proponer el change desde la sub-issue

Texto literal enviado: `/opsx:propose DIS-84`.

**Por qué funcionó.** El modelo cargó la sub-issue y su padre DIS-64, y comprobó que coincidían en el
alcance. Con un script recalculó todas las columnas y entropías del ticket (9, 12, 11, 35, 19, 7, 44
y 34; 5.0 y 4.12) y cuadraban. En el diseño vio que la regex `generic-high-entropy` del ticket
retrocede de forma cuadrática con una línea larga de palabras clave repetidas. Propuso una
implementación equivalente y lineal (identificador completo, palabra clave y cola fija) y dejó la regex
como definición del comportamiento.

**Ajuste humano.** El modelo separó AC3 y AC4 en varios escenarios (11 en total), y lo dejó escrito
como decisión propia en D9. La autora lo aceptó. El modelo de líneas lo fijó la autora en el
siguiente prompt.

### Prompt 2 — Fijar el modelo de líneas en la spec

Texto literal enviado:

````
Ajusta la spec de DIS-84 (openspec/changes/security-gateway) con /opsx:update, sin tocar nada más:

  - spec.md → Requirement "Secret redaction", tras la tabla de reglas, añade:
    "The content SHALL be split on `\n`. Rules `jwt`, `aws-access-key-id` and
    `generic-high-entropy` SHALL be matched within a single line: no match SHALL cross a line
    break. Only `private-key` spans several lines, as defined in requirement 'Private key
    blocks'. A trailing `\r` SHALL be treated as part of the line terminator: it is excluded
    from matching and from columns, and it is kept on every line, including lines that become
    empty."
  - spec.md → Requirement "Redaction audit events": after "`line` and `column` are 1-based",
    add "(`column` counted in UTF-16 code units of the original line)".
  - spec.md → Requirement "Secret redaction": replace "(no pattern with nested quantifiers)"
    with "(including adversarial input such as a long run of repeated keywords; the regex of
    the table defines which text matches, not how it is implemented)".
  - design.md → D2: add the line "This is the line model of the spec (requirement 'Secret
    redaction')", so the design points to the spec instead of defining it alone.
  - tasks.md → 3.7: add two extra cases: "a `secret =` assignment with the quoted value on the
    next line is not redacted (no match across lines)" and "a CRLF line emptied by a
    private-key block keeps its `\r`" (the second one replaces the generic "CRLF content keeps
    every `\r`").
  - Do not add scenarios: the scenario count stays at 11, and the 5.2 check does not change.

  Also add to DIS-84 in Linear, as a comment in Spanish (the [original] block is not touched;
  if you edit [enhanced], only §1 "Prioridad y solapamiento"):
  "Ajuste de la spec (2026-10-05): las reglas jwt, aws-access-key-id y generic-high-entropy
  casan dentro de una sola línea (ninguna coincidencia cruza un salto de línea); solo
  private-key abarca varias líneas. `column` se cuenta en unidades UTF-16 de la línea
  original; el `\r` final forma parte del terminador y se conserva, también en las líneas que
  quedan vacías. La linealidad se exige también con entrada adversaria; la regex de la tabla
  define qué casa, no cómo se implementa."
````

**Por qué funcionó.** El modelo de líneas solo estaba en el diseño (D2), y así la spec no decía si
una coincidencia podía cruzar un salto de línea ni qué pasaba con el `\r`. Al subirlo a la spec,
quedaron como requisitos los dos casos extra de 3.7 (el valor en la línea siguiente y la línea CRLF
vaciada). Y la frase sobre la entrada adversaria convirtió la linealidad en un requisito.

**Ajuste humano.** Todo el prompt. El modelo señaló que D2 seguía diciendo «All four rules match
within one line», lo que contradecía la frase siguiente. La autora pidió corregirlo en un prompt
aparte de una línea.

### Prompt 3 — Corregir el rumbo a mitad del apply

La implementación arrancó con `/opsx:apply security-gateway`. Este es el prompt que corrigió el
rumbo durante el paso 6. Texto literal enviado:

````
 Ya he borrado .stryker-tmp/. Antes de pasar al paso 6, corrige estas cuatro cosas, en este orden:

  1. Causa del fallo de gate.spec.ts. En vitest.config.ts, añade '.stryker-tmp/**' al array `exclude`
     (que quede ['fixtures/**', 'node_modules/**', '.stryker-tmp/**']). Si no, cada Stryker que falle
     vuelve a dejar sandboxes y el test vuelve a fallar en local. Anótalo en design.md como D12, con el
     mismo formato que D7 y D11: qué pasó, fecha 2026-10-05 y por qué está fuera del plan.

  2. Ruido en el diff:
     - stryker.config.json: has cambiado los finales de línea. `git diff --ignore-all-space` da 1 línea
       y `git diff` da 35. Devuélvele los finales de línea originales: el diff debe quedar solo en la
       línea "disableTypeChecks".
     - tests/support/read-fixture-files.ts: vuelve a poner el salto de línea final.
     Compruébalo con `git diff --stat`.

  3. Paso 6 completo, sin saltarte nada de tasks.md 6.1–6.6 ni de 8.1. Además:
     - Lanza `npx stryker run` entero después de los cambios 1 y 2. En el informe pon la cifra real de
       esa ejecución, no el 94.65 % anterior.
     - Para cada superviviente de packages/core/src/index/, indica el fichero, la línea, el mutador y
       por qué es equivalente, en una línea. Si alguno no lo es, mátalo con otro caso antes de cerrar.
     - Antes de lanzar `npx vitest run`, confirma que .stryker-tmp/ no existe.
     - La suite sin base de datos: `npx vitest run --exclude 'tests/integration/**'` sin DATABASE_URL.

  4. Para aquí y enséñame el informe del paso 6 y el `git diff --stat` final. No hagas commit, push ni
     PR hasta que te pase el «por qué». Cuando te lo pase, cópialo literal en la PR, sin parafrasear
     ni añadir nada.

  El resto de lo que propones (D5, D7, D11, el hallazgo que pasa a DIS-86 en 9.6) lo he revisado y
  está bien. No lo toques.
````

**Por qué funcionó.** La cláusula «si alguno no lo es, mátalo» obligó a mirar los supervivientes uno
por uno. El modelo los había dado por equivalentes y cinco mutantes, en tres sitios, no lo eran: la
regex `Name: value`, el punto de reanudación tras un bloque de una sola línea y la anticipación del
JWT. Este último dejaba sin redactar el último carácter del token, y ningún test lo veía porque
ninguno comprobaba la línea del JWT. Con tres casos más, la puntuación en `index/` pasó al 98.84 % y
quedaron 3 supervivientes realmente equivalentes. La condición «confirma que `.stryker-tmp/` no
existe» detectó que el primer borrado no había llegado a hacerse.

**Ajuste humano.** Además del prompt, la autora encontró que el CRLF venía de `.gitattributes`
(`* text=eol=lf` no activaba `eol`) y pidió arreglarlo en un commit propio. También vio que las
cuentas de Vitest no cuadraban (faltaban 52 tests en el total) y pidió explicarlas en el informe: son
tests de base de datos que Vitest 1.6 marca como `pending`. Tropiezos del propio modelo, registrados en
`tasks.md` y en los informes:
1. El primer Stryker falló dos veces en la ejecución inicial: por el `node_modules` enlazado en la
   sandbox (D7) y por el `// @ts-nocheck` que Stryker añade a los fixtures (D11).
2. En el chat dijo «cuatro» supervivientes no equivalentes cuando eran cinco mutantes; el informe da la
   cuenta exacta.
3. Dos tests extra usaban `texto` como prosa, pero es base64 válido, así que según la spec es cuerpo
   PEM. Se cambió la entrada y se anotó el matiz en `docs/project-context.md`.
