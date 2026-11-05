# 61. Respuestas en el idioma de la pregunta (DIS-104)

> Sección 61 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Lanzar el ticket tras la medición en vivo de DIS-103

En la comprobación de DIS-103 (Ollama en CPU, `qwen2.5-coder`), la pregunta `¿Qué hace DiscountService?`
recibió respuesta y afirmaciones en inglés. La autora abrió DIS-104 con ese hallazgo (bloque `[original]`
del ticket) y, tras el merge y el interruptor a `"1"`, relanzó el workflow con: `hecho el merge y el interruptor a 1. Relanza el workflow`.

### Prompt 2 — Implementar el change dentro del workflow autónomo

El script del workflow envió a este paso, entre otras reglas, este texto literal:

```
Ticket: DIS-104. Branch: feature/dis-104-answer-language. Change: openspec/changes/answer-language. Step: apply.
The spec audit is APPROVED. Run /opsx:apply on change answer-language: every task in TDD (failing test first, then implementation, layer order), marking tasks.md as you go, with the mandatory verification steps. Run tests, lint and typecheck. Commit, push and open the PR to final-project-CRN with /pr-describe (write the "why" yourself and mark it as agent-written). Return pr.
```

**Por qué funcionó.** El change se partió en lo que la suite comprueba (la regla de idioma como función
pura con tablas de palabras, el mensaje de sistema por idioma, el evento solo con códigos y su orden entre
los demás eventos) y en lo que solo se ve en vivo, con una medición antes y después sobre las mismas tres
preguntas. La medición encontró tres cosas que ningún test habría visto: el Ollama habitual de la máquina
no carga el modelo (error de CUDA) y hubo que usar una instancia solo CPU en otro puerto; `curl` mandaba las
preguntas con bytes rotos desde Git Bash, así que la primera tanda no era en español (se vio porque el
evento no salía para respuestas en inglés, y `query_log` lo confirmó); y `prompt.ts` es una entrada de la
huella de las respuestas golden, así que `npm run verify` fallaba hasta regenerarlas con `cache:build`.

**Ajuste humano.** Ninguno: ejecución autónoma, sin la autora en el bucle. Decisiones del agente durante la
implementación, registradas en `design.md` (A1–A4) y en el ticket: regenerar las tres respuestas golden en
vez de dejar el `verify` en rojo (queda su revisión del agente y la muestra para firmar en
`docs/golden-review/`); no normalizar a NFC; y aceptar los mutantes equivalentes de los bucles de la regla.
Resultado de la medición: no se reproduce con el prompt actual en 2 de 3 preguntas, así que el evento, que
sí salió con el modelo real, es la parte con evidencia viva.

### Prompt 3 — Revisión previa al merge dentro del workflow autónomo

El script del workflow envió a este paso, entre otras reglas, este texto literal:

```
Ticket: DIS-104. Branch: feature/dis-104-answer-language. Change: openspec/changes/answer-language. Step: review.

Run, inline (their Inline mode, never as a fork), /show-spec-working, /verify-against-spec and /adversarial-review on change answer-language / PR #68. Save their reports under the change's reports/. Fix every real finding in the same PR (code fixes must happen now, before archive), commit, push and wait for green CI with Monitor (max 2 CI fixes). Return ok=false if a blocking verdict cannot be resolved.
```

**Por qué funcionó.** La demostración usó la API y la CLI reales con un modelo guionizado (un endpoint
local compatible con OpenAI que devuelve la salida que pide cada paso), así que cada rama del aviso de
idioma se vio a propósito y en segundos, en vez de esperar a que el modelo de 7B contestara en inglés. La
revisión adversarial siguió los datos que el change reescribió y encontró dos huecos que los tests no
veían: `question-language.ts` decide el mensaje de sistema de las preguntas golden pero no entraba en la
huella de las respuestas (un cambio futuro de las listas dejaría `verify` en verde con golden de otro
prompt), y `docs/DEMO.md` seguía pegando la golden Q1 anterior.

**Ajuste humano.** Ninguno: ejecución autónoma. Decisiones del agente (`design.md` → V1–V8): añadir la regla
a la huella con un delta de la spec `golden-answers` y regenerar las golden ahora, ya que más tarde costaría
la misma regeneración; quedarse con la primera Q1 regenerada y descartar una segunda que llamaba
«reembolsación» al descuento; recapturar las salidas de la guía que dependen de la golden; y dejar la firma
de la autora como traspaso en el ticket.
