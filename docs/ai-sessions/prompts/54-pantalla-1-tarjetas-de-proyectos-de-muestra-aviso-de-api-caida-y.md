# 54. Pantalla 1: tarjetas de proyectos de muestra, aviso de API caída y pantalla de error (DIS-60)

> Sección 54 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Implementar la Pantalla 1 dentro del workflow autónomo

El script del workflow (ADR `20261016-autonomous-workflow-run-entrega-2`) envió a este paso, entre
otras reglas, este texto literal:

```
YOUR STEP 3/6 — implement.
Run /opsx:apply (Skill "opsx:apply") for the change of DIS-60 and walk every task in tasks.md in TDD per scenario (tdd-test-writer → tdd-implementer → tdd-refactorer). Include the step-12 style verification tasks (suite, lint, typecheck, architecture lint, docs coverage, targeted mutation ≥ 80, privacy check) but stop before the pre-merge review tasks (show-spec-working / verify-against-spec / adversarial-review), PR, CI and archive: those are later steps. Commit in small conventional commits.
```

**Por qué funcionó.** El change `project-picker` llegaba con 25 decisiones y dos pasadas del
`spec-auditor`, y cada escenario de la spec ya nombraba la consulta accesible, el doble de `fetch` y el
orden de las comprobaciones, así que cada test se escribió casi al dictado. Los escenarios que pasaron a
la primera (el teclado, el tiempo límite, la pulsación repetida, el reintento fallido, la cancelación al
salir y axe) se probaron rompiendo a propósito lo que vigilan: el enlace fuera del orden de tabulación, un
límite de 10 s, el guardián del reintento quitado, el estado «reintentando» sin limpiar, el aborto quitado
del efecto y el botón del aviso sin texto. La prueba manual se hizo con la API real sobre la base de datos
sembrada, apagándola y volviéndola a arrancar con la página abierta.

**Ajuste humano.** Ninguno: ejecución autónoma, sin la autora en el bucle. Decisiones del agente al
implementar, registradas en `design.md` y en la descripción `[enhanced]` del ticket: las tablas de
etiquetas son `Map` porque el cliente compila con `lib: ES2020` (sin `Object.hasOwn`); el separador de
miles se escribe como `'\u00a0'` en el código y los tests lo comprueban por punto de código; el enlace
«Volver a la selección de proyecto» pasó a un componente compartido por las pantallas de no encontrado y
de error; y, como el paso no podía arrancar los subagentes de TDD, cada fase rojo → verde → refactor se
hizo en línea con el mismo contrato.

### Prompt 2 — Revisiones previas al merge dentro del workflow autónomo

El mismo script del workflow envió al paso siguiente este texto literal:

```
YOUR STEP 4/6 — pre-merge reviews.
Run, in this order and IN THE FOREGROUND inside your own context (do not fork them to background subagents: their results get lost or blocked by the block-secrets hook when they quote test secrets), the review tasks of the change's tasks.md: /show-spec-working, /verify-against-spec, /adversarial-review, and the security-reviewer agent if the diff touches HTTP inputs, rate limits, secrets or personal data. Save each report where tasks.md says. Every finding gets an A/B/C/D destination in design.md → Follow-ups and is fixed in this change when fixable (behaviour changes via TDD; spec edits via /opsx:update with an addendum to the spec-audit report). Re-run a check whose findings led to non-trivial fixes until no Blocker/Major remain. Mark the tasks. Suite green. Commit.
```

**Por qué funcionó.** `/show-spec-working` recorrió cada escenario visible en el navegador contra la API
real: además de apagarla y encenderla, interceptó `/health` para que no respondiera nunca, y así se vio
el tiempo límite de 5 s, el «Reintentando…» con tres pulsaciones y una sola petición, el reintento
fallido y la cancelación al salir. La pantalla de error, a la que no lleva ninguna URL, se alcanzó a mano
con una ruta temporal que lanza un error, retirada en el acto. La lectura hostil encontró que un
reintento correcto quitaba el foco a quien ya había tabulado hasta el enlace, que el guardián que ignora
una comprobación abortada no tenía ningún test capaz de verlo (solo se nota con el doble montaje de
`StrictMode`) y que a 320 px el aviso dejaba el texto en una columna de 110 px. Los tres se arreglaron en
el mismo change: escenarios nuevos en la spec, test en rojo o roto a propósito, código y comprobación en
el navegador.

**Ajuste humano.** Ninguno: ejecución autónoma. `verify-against-spec` y `adversarial-review` se bifurcan
a un agente en segundo plano por su configuración, así que el agente hizo ambas revisiones en primer
plano con sus mismas listas de comprobación. El security-reviewer no se lanzó: el diff no añade entradas
HTTP, límites, secretos ni datos personales. Las revisiones se hicieron antes de abrir el pull request,
porque el workflow abre el PR en el paso siguiente; quedó anotado como decisión del agente.
