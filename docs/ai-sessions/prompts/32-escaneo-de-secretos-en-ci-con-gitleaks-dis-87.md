# 32. Escaneo de secretos en CI con `gitleaks` (DIS-87)

> Sección 32 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Proponer el change desde la sub-issue

Texto literal enviado: `/opsx:propose DIS-87`. Durante la propuesta la autora envió dos mensajes
literales: «¿no pones la tarea en inProgress?» (el modelo la pasó a In Progress; la autora confirmó
después que el estado es obligatorio al aplicar, no al proponer) y «tú trabajas desde la rama
feature/entrega-2-CRN. La rama main no la vas a usar para nada». Tras el segundo, el modelo preguntó
con opciones cerradas si mantener `origin/main..HEAD` como rango de lectura local de C6 y de la
sección histórica de `.gitleaksignore`; respuesta elegida: «Mantener como referencia».

**Por qué funcionó.** El `[enhanced]` de DIS-87 ya traía el escaneo real (13 hallazgos y 9 huellas en
el árbol, no los 2 del `[original]`) y las decisiones D1–D4 de la autora; el modelo repitió el escaneo
antes de escribir y coincidió. El `[original]` decía «chore de CI; no requiere spec», así que el
change declara `skip_specs: true`, con el precedente de `analyzer-port-edges-tsdoc`.

**Ajuste humano.** La autora rechazó las ediciones con las que el modelo empezó a quitar `main` de los
artefactos y pidió en su lugar el ajuste del Prompt 2.

### Prompt 2 — Ajustar el plan con `/opsx:update`

```
 Ajusta la spec de DIS-87 (cambio openspec/changes/ci-secret-scan) con /opsx:update, sin tocar el [original] de
  Linear:

  1. design.md D5 y tasks.md 2.1 — coherencia con la regla "valores por env:, nunca interpolados en run:":
     - En el paso "Scan commits of the event", pasar el rango por env (`env: { RANGE: ${{
  steps.range.outputs.range }} }`) y usar `--log-opts="$RANGE"` en el run. Mantener el `if:` tal cual.
     - En 2.1, añadir que ningún `${{ … }}` aparece dentro de un `run:` del job `secrets`; verificarlo en 2.2
  con `grep -n '\${{' .github/workflows/ci.yml` limitado al job `secrets` (solo debe aparecer en `env:` e
  `if:`).

  2. design.md D9 y tasks.md 2.3 — fidelidad de la prueba local de C5(b):
     - La shell que se ejecuta en local se extrae del bloque `run:` del paso `range` de
  `.github/workflows/ci.yml` ya escrito (copiado tal cual a un fichero del scratchpad), nunca reescrita a mano.
  Indicar en el informe del paso 5 el comando de extracción y que el contenido coincide byte a byte (diff
  vacío).
     - Indicar que C5(b) se demuestra por simulación local del paso, porque provocar un push a `main` con
  `before` todo ceros no es reproducible sin tocar `main`. Añadirlo a Risks/Trade-offs.

  3. proposal.md "What Changes", design.md (Migration Plan + Open Questions) y tasks.md 8.2 — check obligatorio:
     - Unificar en "fuera del apply": el agente solo consulta la protección con la cuenta DisTinta (8.2) y deja
  en la descripción del PR una checklist post-merge para la autora: añadir `secrets` como check obligatorio en
  `main` y en `feature/entrega-2-CRN` si tienen protección, o anotar "sin regla de protección".
     - En proposal.md, mover "Branch protection" de What Changes a Impact → GitHub settings con la etiqueta
  "manual, post-merge".
     - En 8.4, dejar DIS-87 en In Review (no Done) hasta que la autora confirme esa checklist.

  Actualiza también la sección [enhanced] de DIS-87 (Definición de hecho), sin tocar el [original]:
     - "Evidencia local de C5(a), C5(b) (shell del paso de rango extraída de ci.yml) y C6 pegada en el PR."
     - "`secrets` como check obligatorio: paso manual de la autora tras el merge (cuenta DisTinta); hasta
  entonces el ticket queda en In Review."
     Deja un comentario en español en DIS-87 que resuma estos dos ajustes.
```

**Por qué funcionó.** Cada punto nombraba el artefacto, la sección y el criterio de comprobación, así
que el modelo pudo enseñar las revisiones antes de escribirlas. Al hacerlo detectó un choque: la
integración Linear–GitHub pasa el ticket a Done al hacer merge, lo que contradice «queda en In
Review hasta la checklist»; lo planteó con tres opciones en lugar de escribirlo.

**Ajuste humano.** El del Prompt 3.

### Prompt 3 — Aplicar la revisión con tres ajustes

```
 Aplica todas las revisiones tal cual, con estos tres ajustes:

  1. tasks.md 8.4 — opción (a), redactada sin depender de la integración: «Tras abrir el PR, DIS-87 pasa a In
  Review con un comentario en español que enlace el PR. Tras el merge, si DIS-87 no está en In Review (la
  integración Linear–GitHub lo mueve a Done), devolverlo a In Review con un comentario en español: "pendiente de
  la checklist post-merge (check obligatorio `secrets`)". Lo pasa a Done la autora al confirmar la checklist;
  el agente nunca lo pasa a Done.» Añade este comportamiento de la integración a design.md → Migration Plan, en
  una línea.

  2. tasks.md 2.2 — el criterio de la comprobación con awk|grep pasa a: «cada `${{` del job `secrets` está
  dentro de un bloque `env:` o en una línea `if:`; ninguno dentro de un `run:`». No cambies el comando.

  3. design.md D9 y tasks.md 2.3/5.5 — quita el diff contra el bloque cortado del texto. La shell se extrae con
  parser YAML (jobs.secrets.steps[id=range].run) a un fichero del scratchpad; en el informe del paso 5 van el
  comando de extracción y el `sha256sum` del script extraído. Deja igual el resto de D9 (los 4 casos y la nota
  de simulación local).

  El patch del [enhanced] de DIS-87 y el comentario en español, como los propusiste.
```

**Por qué funcionó.** La autora quitó el diff contra el texto cortado del YAML (habría comparado dos
extracciones distintas del mismo bloque) y lo sustituyó por el parser, que da el string exacto que
ejecuta el runner, más su `sha256sum` como huella verificable.

**Ajuste humano.** Ninguno sobre el contenido. Durante el `/opsx:apply ci-secret-scan` el modelo hizo
un cambio de diseño menor y lo anotó en D5: el binario se descarga y extrae en `$RUNNER_TEMP`, porque
extraído en la raíz del checkout `gitleaks dir .` lo habría escaneado a él mismo. El modelo
simuló C5(b) primero con `bash --noprofile --norc -eo pipefail`, creyendo que era la shell por
defecto de Actions; el log de C1 mostró que el runner usa `bash -e {0}` y se repitió con esa shell
(mismos resultados). Al escribir la descripción del PR comprobó que `--gitleaks-ignore-path` no
impide leer el `.gitleaksignore` de la raíz y corrigió la receta de regeneración de
`fixtures/README.md`.

Revisión final (la autora pidió `/show-spec-working`, `/verify-against-spec` y `/adversarial-review`,
con los arreglos en TDD). `/verify-against-spec` encontró que DIS-87 había vuelto a In Progress: la
integración Linear–GitHub lo movió al cerrar el PR desechable #27, que llevaba `DIS-87` en el título
y en la rama. `/adversarial-review` encontró un Major real: una huella `path:rule:line` escondía
cualquier secreto en esa línea. El modelo lo comprobó en local y preguntó con opciones cerradas;
respuesta elegida: «Allowlist por valor (Recomendada)». El RED (sondas con otros valores sintéticos,
que pasaban) precedió al arreglo. El GREEN necesitó dos correcciones: gitleaks 8.30.1 trata los
`paths` de una allowlist global como saltarse el fichero entero, incluso con `condition = "AND"`, y el
generador había leído el JSON de gitleaks en cp1252, que estropea el «–» de los specs. Los Minors
quedaron como deuda C en DIS-87.
