# Experimento — Workflow autónomo para cerrar la Entrega 2

**Proyecto:** CODEMIND · fork `DisTinta/AI4Devs-finalproject`
**Rama base:** `feature/entrega-2-CRN`
**Fecha:** 16 de octubre de 2026
**Herramienta:** Claude Code (Opus) con la herramienta Workflow (orquestación de subagentes en segundo plano)
**Contenido:** (1) la pregunta de la autora, (2) los riesgos y choques con las reglas del proyecto, (3) las decisiones de la autora, (4) el plan que sigue el workflow, (5) cómo se mide el coste en tokens.

> Registro parcial de la sesión: solo la pregunta inicial, las decisiones y el plan acordado. El resultado
> del experimento se documenta en `readme.md` (DIS-101).

---

# 1. Pregunta de la autora

> ¿hay alguna forma para que hicieras el resto de tareas de Linear (CODEMIND — Entrega 2) en automático
> con el flujo definido? Y si te surgen preguntas o decisiones investigues como ingeniero de software jefe
> para resolverlas sin tener que preguntarme? No tendrías que mostrar en esta terminal nada más que al
> final una lista de los tickets resueltos y un mensaje tipo tareas finalizadas.
> ¿cómo ves esta idea? es posible? ¿cómo se tendría que hacer?

---

# 2. Respuesta: es posible, pero choca con reglas propias

El agente propuso la herramienta **Workflow** de Claude Code: un script que recorre los tickets en serie
(dependen unos de otros) y lanza para cada paso un subagente con contexto limpio. La terminal queda en
silencio hasta el resumen final. Se descartaron `/loop` en la misma sesión (el contexto se satura tras
varios tickets) y un script con `claude -p`.

Choques con `docs/base-standards.md` y con las normas de la autora:

| Regla | Conflicto |
|---|---|
| §88 — el humano aprueba el plan si toca más de 3 ficheros | Bloquea casi todos los tickets |
| §90 — tests escritos o supervisados por un humano | El agente escribe los tests sin supervisión |
| §99 — los merges los firma un humano | Sin merge, el ticket siguiente no parte de una base actualizada |
| El porqué de ADR y PR lo escribe la autora | El agente no puede inventar el razonamiento de la autora |

Tickets con dificultad propia:

- **DIS-34** — revisión humana de las respuestas golden: definida como "no delegable". Si una IA valida lo
  que generó otra IA, la referencia de evaluación pierde independencia.
- **DIS-26** — `cache-build` con Ollama local, que en esta máquina solo funciona en CPU (~6–7 min por pregunta).

---

# 3. Decisiones de la autora

1. **Plan y tests (§88, §90):** se relajan para esta tanda. El plan lo validan `spec-auditor` y un agente
   "ingeniero jefe" que investiga y decide; la decisión queda en la descripción Enhanced del ticket en Linear.
   Los tests salen de los escenarios del spec.
2. **Merge (§99):** lo hace el agente, siempre después de `/opsx:archive` y con CI en verde.
3. **El porqué** de ADR y PR lo redacta el agente.
4. **DIS-34, modo híbrido:** el agente revisa todas las golden con un veredicto razonado
   (`reviewed_by: agent:claude-opus-5-5`); la autora firma una muestra (todos los `UNKNOWN`, las marcadas
   como dudosas y 2–3 al azar). El ticket espera en In Review a esa firma.
5. **DIS-26:** se intenta con Ollama en CPU (`qwen2.5-coder`, `OLLAMA_CONTEXT_LENGTH=16384`).
6. **Escala:** se autoriza el tamaño dinámico del workflow (más de 10 agentes).
7. **DIS-29** no se cierra: tiene un hijo pendiente en CODEMIND — Entrega 3.
8. **Cada ticket empieza con `/enrich-us DIS-n`.**
9. **DIS-101** explica en `readme.md` que las últimas tareas de la Entrega 2 se hicieron como experimento
   con este workflow, y enlaza este documento.

---

# 4. Plan

## Fase 0 — preparación (en la sesión, visible)

- ADR "Ejecución autónoma de la Entrega 2" con las reglas relajadas y su motivo.
- DIS-34 pasa a modo híbrido en su descripción Enhanced (el bloque `[original]` no se toca).
- Este documento, y el criterio correspondiente en DIS-101.

## Fase 1 — piloto: DIS-76 y DIS-78

El workflow completo sobre dos tickets. Al terminar se revisan con la autora los PR, las decisiones
registradas en Linear y el coste en tokens. Si el flujo convence, se lanza la fase 2.

## Fase 2 — resto, en serie

`DIS-21 → DIS-26 → DIS-34 (pre-revisión del agente) → DIS-44 → DIS-45 → DIS-58 → DIS-60 → DIS-65 → DIS-66 → DIS-101`.
Los padres (DIS-59, DIS-16, DIS-43, DIS-51, DIS-62) se cierran cuando terminan sus hijos.

## Ciclo por ticket (cada paso, un subagente con contexto limpio)

1. Linear → In Progress; rama desde `feature/entrega-2-CRN`.
2. `/enrich-us DIS-n`.
3. `/opsx:propose` → commit de la carpeta del cambio → `spec-auditor`.
4. Dudas abiertas: el agente ingeniero jefe investiga código, specs y ADR, decide y lo deja en la Enhanced
   de Linear (en español); si la decisión es arquitectónica, escribe además el ADR con su porqué.
5. `/opsx:apply` en TDD (`tdd-test-writer` → `tdd-implementer` → `tdd-refactorer`).
6. `/show-spec-working`, `/verify-against-spec`, `/adversarial-review` y `security-reviewer` si aplica;
   los hallazgos se corrigen en el mismo PR.
7. PR en español con el porqué; push; CI en verde.
8. `/opsx:archive` → commit al PR → merge.
9. Linear → Done, recomprobando el estado tras el merge.

**Paradas:** CI en rojo tras 2 intentos, conflicto de merge u Ollama inviable. El ticket queda en In Review
con un comentario en Linear; el workflow sigue con los independientes y se para si el bloqueado es
requisito de los siguientes.

## Fase 3 — salida

En la terminal, solo: tickets resueltos con su PR, tickets bloqueados con el motivo, lo que queda para la
autora (muestra de DIS-34, revisión de los ADR del agente) y "Tareas finalizadas".

---

# 5. Medición del coste en tokens

Referencia tomada antes del piloto a partir de los registros de sesión de Claude Code de este proyecto,
agrupados por rama del ticket (tickets hechos con la autora en el bucle):

| Ticket manual | Lectura de caché | Escritura de caché | Salida |
|---|---|---|---|
| DIS-74 | 180M | 2,9M | 0,46M |
| DIS-92 | 143M | 1,1M | 0,33M |
| DIS-28 | 116M | 1,1M | 0,30M |
| Rango del resto | 30–195M | 0,4–3,5M | 0,1–0,6M |

Tras el piloto se repite la medición para DIS-76 y DIS-78 y se compara con tickets de tamaño parecido.
Estimación previa del agente, sin medir: entre 1x y 2x por ticket (más escritura de caché porque cada
subagente vuelve a leer estándares, spec y código; menos lectura porque no hay una conversación larga que
se relea en cada turno). La autora contrasta además el porcentaje de su límite de uso con `/usage` antes
y después.
