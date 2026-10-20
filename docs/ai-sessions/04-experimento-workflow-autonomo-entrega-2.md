# Experimento — Workflow autónomo para cerrar la Entrega 2

**Proyecto:** CODEMIND · fork `DisTinta/AI4Devs-finalproject`
**Rama base:** `feature/entrega-2-CRN`
**Fecha:** 16 de octubre de 2026
**Herramienta:** Claude Code (Opus) con la herramienta Workflow (orquestación de subagentes en segundo plano)
**Contenido:** (1) la pregunta de la autora y por qué se atrevió a intentarlo, (2) los riesgos y choques con las reglas del proyecto, (3) las decisiones de la autora, (4) el plan que sigue el workflow, (5) cómo se mide el coste en tokens y los resultados de cada tanda, (6) la conclusión de la autora.

> Registro parcial de la sesión: solo la pregunta inicial, las decisiones y el plan acordado, más los
> resultados de cada tanda al final de la sección 5. El análisis del experimento está en `readme.md` §8.6
> (DIS-101).

---

# 1. Pregunta de la autora

> ¿hay alguna forma para que hicieras el resto de tareas de Linear (CODEMIND — Entrega 2) en automático
> con el flujo definido? Y si te surgen preguntas o decisiones investigues como ingeniero de software jefe
> para ressolverlas sin tener que preguntarme? No tendrías que mostrar en esta terminal nada más que al
> final una lista de los tickets resueltos y un mensaje tipo tareas finalizadas.
> ¿como ves esta idea? es posible? ¿cómo se tendría que hacer?

## Por qué se atrevió a intentarlo

En palabras de la autora:

> Me atreví a intentar el experimento porque ya había hecho más del 80 % de las tareas de la Entrega 2
> con el flujo normal, conmigo en el bucle, y había visto ticket tras ticket lo bien que el agente lo
> seguía. Eso me dio la confianza de que, con el mismo flujo y con normas y reglas claras, en modo
> automático lo haría igual de bien.

El dato lo respalda: el 16-10, de los 66 tickets del proyecto «CODEMIND — Entrega 2» en Linear, 54 (un
82 %) ya estaban cerrados con la autora en el bucle; quedaban los doce de la sección 4.

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

Valores de `/usage` antes del piloto (16-10-2026, plan de suscripción):

| Indicador | Antes del piloto | Después del piloto | Último punto registrado |
|---|---|---|---|
| Sesión actual (ventana de 5 h) | 13 % | 24 % | — (no se volvió a anotar) |
| Semana, todos los modelos (reinicio 18-10, 12:00) | 51 % | 56 % | 74 % (17-10, 20:20, tras DIS-45) |
| Coste equivalente de API acumulado en la sesión | 1,01 $ | 53,93 $ | 266,18 $ (17-10, 17:35, al cerrar la tanda 1) |

El agente no puede leer `/usage`: la última columna es el último valor que anotó la autora. Tras el
reinicio semanal del 18-10 a las 12:00 no se registró ningún punto, así que DIS-58 (que cruzó el
reinicio), DIS-60, DIS-65, DIS-66 y DIS-101 no tienen cifra de `/usage`. Con suscripción, el coste equivalente de API es
una estimación de lo que costaría con pago por uso, no un cargo.

Diagnóstico de `/usage` sobre las últimas 24 h: el 98 % del uso vino de sesiones con muchos subagentes y
el 81 % se consumió con más de 150k tokens de contexto. Por eso el workflow asigna modelo por paso:
Opus para el razonamiento (ingeniero jefe, tests, revisión adversarial) y Sonnet para los pasos mecánicos.

## Resultado del piloto (DIS-76)

- **DIS-76** completó el ciclo entero en 3 h 33 min de reloj, con 7 agentes del workflow y 773 llamadas a
  herramientas, hasta el commit de `/opsx:archive` en el PR #45 con CI en verde. El `spec-auditor` pidió
  cambios tres veces y aprobó en la cuarta pasada.
- **Coste:** unos 5 puntos del límite semanal (51 % → 56 %); unos 53 $ equivalentes de API en la sesión
  (Opus 41 $, Sonnet 13 $). Por los registros locales, 137M de lectura y 3,7M de escritura de caché:
  parecido a un ticket manual, con más escritura de caché (cada subagente vuelve a leer el proyecto).
- **Bloqueo:** el clasificador de permisos del modo automático de Claude Code denegó `gh pr merge` por
  «Merge Without Review». El merge lo hizo la autora. DIS-78 no arrancó porque depende de DIS-76.
- **Decisión tras el piloto:** seguir en tandas que paren antes de agotar el límite semanal (unos 7 tickets
  antes del reinicio del 18-10 y el resto después), para no dejar tickets a medias.

## Resultado de la tanda 1 (16-10 → 17-10)

Run del workflow `wf_2ee7c1a7`, de las 22:13 del 16-10 a las 16:21 del 17-10 (horas peninsulares).

- **DIS-78** (#46), **DIS-21** (#47) y **DIS-26** (#48): ciclo completo y merge hecho por el propio
  workflow, con la regla de permiso `gh pr merge` que la autora añadió tras el piloto. DIS-26 tardó
  8 h 21 min porque generó las tres respuestas *golden* con Ollama en CPU.
- **DIS-34**: el agente revisó las tres *golden* (#49). Vio que Q4 era incorrecta y la regeneró, y marcó
  Q3 como dudosa. El clasificador denegó el merge del #49 y la autora lo hizo a mano. Después la autora
  revisó las tres, pidió regenerar Q3 y las firmó; el agente se negó a firmar en su nombre. Las firmas
  y la nueva Q3 entraron en el #50, que preparó la sesión principal y fusionó la autora. El agente de
  cierre intentó commitear `.claude/settings.json`, con cambios locales de la autora, y el clasificador
  lo denegó («Self-Modification»): no se commiteó nada.
- **DIS-44** (#51): ciclo completo; el clasificador denegó el merge y lo hizo la autora.
- **DIS-45**: no llegó a lanzarse. Depende de DIS-44, y el script salta los dependientes de un ticket
  bloqueado; el merge de la autora llegó cuando la tanda ya había terminado.
- **Padres:** DIS-59 y DIS-16 cerrados; DIS-43 no, porque DIS-45 seguía pendiente.
- **Incidencias:** un falso positivo de Windows Defender (`Trojan:Win32/Bearfoos.A!ml` sobre un fichero
  de test `<?php // b`) rompió en local dos tests de git, y la autora añadió una exclusión acotada a las
  carpetas temporales del proyecto; una caída de internet dejó un agente de DIS-44 unos 25 min sin
  avanzar, sin pérdida; los informes de `verify-against-spec` y `adversarial-review` no llegaban al paso
  de revisión (quedaban guardados en `reports/`), y uno lo bloqueó el hook `block-secrets` por citar
  secretos de prueba.
- **Decisión de la autora (17-10):** ante el merge denegado no se busca ningún rodeo. El paso de merge
  espera a que lo haga la autora, sondeando el PR hasta 3 h.

## DIS-45 y DIS-58, lanzados aparte (17-10 → 18-10)

- **DIS-45** (run `wf_2ead1005`): 1 h 47 min de ciclo; merge denegado y hecho por la autora (#52).
  Costó alrededor de 1 punto semanal (73 % → 74 %).
- **DIS-58** (run `wf_8d14bcc3`), adelantado la noche del 17-10 con el visto bueno de la autora: el
  agente de propuesta lanzó a las 20:45 un `npm install` de prueba y se quedó esperando hasta las 07:25
  la confirmación de instalación de dependencias del hook `block-dangerous-bash`, unas 10,5 h. La autora
  desactivó esa confirmación en local para el resto de la ejecución y pidió a cambio una verificación de
  cada paquete en las instrucciones del workflow (nombre exacto, más de 90 días con su repositorio
  conocido, al menos 10 000 descargas semanales, sin scripts de instalación inesperados y `npm audit`
  después). El workflow fusionó él mismo el #53, sin denegación. 20 h 37 min de ciclo en total.

## Resultado de la tanda 2 (18-10 → 19-10)

Run `wf_ba3c3c42`, lanzado por la autora («sí, lanza la tanda 2») a las 19:03 del 18-10.

- **DIS-60** (#54): ciclo completo en 1 h 36 min, con CI en verde y el archivo hecho. El clasificador
  denegó el merge, y el workflow esperó a la autora con 20 agentes de sondeo de unos 9,4 min cada uno
  (3 h 08 min) antes de dejar el ticket en In Review con un comentario. La autora lo fusionó a las 08:30
  del 19-10.
- **DIS-65 y DIS-66**: no se lanzaron, porque dependen de DIS-60.
- **DIS-101** (#55): el ciclo ligero de este ticket de documentación, sin change de OpenSpec, en 1 h 06 min.
  El clasificador denegó también este merge; tras 20 agentes de sondeo (3 h 06 min) el ticket quedó en
  In Review, a la espera de la autora.
- **Padres:** DIS-51 y DIS-62 no se cerraron, porque DIS-60, DIS-65 y DIS-66 seguían abiertos.

## Resultado de la tanda 3 (19-10)

Run `wf_426c6b7e`, lanzado por la autora («ya hice el merge del #54, lanza DIS-65 y DIS-66») a las 08:33
del 19-10.

- **DIS-65** (#56): ciclo completo en 2 h 00 min. El clasificador denegó el merge; el workflow esperó con
  3 agentes de sondeo (28 min) hasta que la autora lo fusionó a las 11:00.
- **DIS-66** (#57): ciclo completo en 2 h 11 min, y el workflow fusionó él mismo el #57 a las 13:10.
- **Padres:** DIS-62 cerrado; DIS-51 también está en Done.

Estado al cerrar la tanda 3: once tickets cerrados (DIS-76, DIS-78, DIS-21, DIS-26, DIS-34, DIS-44, DIS-45, DIS-58,
DIS-60, DIS-65 y DIS-66) y DIS-101 en revisión en el #55.

## Medición final de tokens (19-10)

Script de medición por rama, ejecutado el 19-10 sobre todas las ramas (lectura de caché / escritura de
caché / salida, en millones):

| Ticket | Modo | Lectura | Escritura | Salida |
|---|---|---|---|---|
| DIS-76 | Workflow (piloto) | 137,2 | 3,70 | 0,14 |
| DIS-78 | Workflow | 83,6 | 2,03 | 0,06 |
| DIS-21 | Workflow | 156,4 | 4,42 | 0,13 |
| DIS-26 | Workflow | 125,3 | 4,92 | 0,03 |
| DIS-44 | Workflow | 137,1 | 3,33 | 0,13 |
| DIS-58 | Workflow | 139,3 | 5,17 | 0,16 |
| DIS-65 | Workflow | 77,0 | 1,95 | 0,01 |
| DIS-66 | Workflow | 81,0 | 1,73 | 0,03 |
| DIS-60 | Workflow (fuera de la media: cifra baja para un ciclo completo) | 53,8 | 2,10 | 0,02 |
| DIS-101 | Workflow (documentación; incluye la sesión principal en su rama) | 81,8 | 2,62 | 0,03 |
| DIS-45 | Workflow (documentación) | 32,0 | 1,83 | 0,01 |
| DIS-34 | Workflow (documentación) | 6,7 | 0,34 | 0,01 |
| DIS-68 / DIS-70 / DIS-72 | Manual | 92,7 / 108,3 / 102,7 | 1,20 / 1,82 / 1,25 | 0,25 / 0,31 / 0,31 |
| DIS-74 / DIS-28 / DIS-92 | Manual | 180,0 / 116,1 / 143,4 | 2,92 / 1,09 / 1,14 | 0,46 / 0,30 / 0,33 |
| `feature/entrega-2-CRN` | Sin ticket (orquestación y trabajo en la rama de entrega) | 263,5 | 10,52 | 1,77 |

Frente a la estimación previa (entre 1x y 2x por ticket): en los ocho tickets de código del workflow
con ciclo completo, la lectura de caché media es 0,95 veces la de los seis manuales (117,1M frente a
123,9M) y la escritura de caché, unas 2,2 veces (3,41M frente a 1,57M). La salida no se compara, porque la de los subagentes
del workflow sale muy por debajo. La orquestación no se atribuye a ningún ticket. El análisis completo
está en `readme.md` §8.6.

## DIS-101, cerrado (19-10)

La autora fusionó el #55 a las 13:48 del 19-10, y DIS-101 pasó a Done. Con él, los doce tickets del plan
quedaron cerrados.

## Resultado de la tanda 4: DIS-102 y DIS-103 (19-10 → 20-10)

Dos tickets que no estaban en el plan y que salieron de las pruebas desde cero de la autora, lanzados con
el mismo workflow y las mismas reglas.

- **DIS-102** (#58), run `wf_61e95f53`. La autora clonó la rama de entrega en una carpeta nueva y siguió
  la guía: `make up` funcionó en Git Bash, pero en una segunda terminal de PowerShell la CLI respondió
  `MISSING_CONFIG` (`DATABASE_URL is not set`), porque los scripts npm no leían `.env`. La autora pidió
  que cada paso funcionase igual en PowerShell y en Bash y que `DEMO.md`, `CONFIDENCE.md`,
  `DEPLOYMENT.md` y `TESTING.md` pasasen al español. Ciclo completo en 4 h 39 min con 7 agentes:
  `npm run up` y `npm run down` en Node, `.env` cargado solo, `demo:ask` y `demo:excerpt` en lugar de los
  ayudantes de Bash, y la guía recorrida en dos clones limpios (PowerShell 7 y Git Bash). La revisión
  adversarial encontró un fallo Major (`demo:ask` cortaba a los 300 s con un modelo lento) y se corrigió
  en el mismo PR. El workflow fusionó él mismo el #58, a las 22:06 del 19-10.
- **Prueba manual de la autora** (20-10), en **Windows PowerShell 5.1**, la terminal que no había probado
  ningún agente. Todos los pasos del modo evaluación, `npm run verify`, el recorrido por la web y el aviso
  de API caída coincidieron con `DEMO.md`. Al configurar Ollama y hacer una pregunta fuera de la caché
  salieron dos fallos que ninguna prueba automática había visto: `SOURCE_UNAVAILABLE`
  (`not-a-repository`), porque el historial Git de `fixtures/acme-shop` no viaja con el clon y nada lo
  generaba, y después `LLM_UNAVAILABLE` (`timeout`), porque el adaptador del LLM cortaba a los 300 s y en
  esta máquina, solo en CPU, una pregunta tarda entre 3,5 y 9 min.
- **DIS-103** (#59), run `wf_e9c6d8a6`, abierto con esos hallazgos y con la decisión de la autora de
  quitar el tope de 300 s. Ciclo completo en 6 h 10 min con 6 agentes: `npm run up` genera el historial
  del fixture, `LLM_TIMEOUT_MS` admite hasta una hora con el envío por `node:http`, y `DEMO.md` gana la
  sección «Probar con un modelo real» (Ollama, probado; una API alojada y Claude, marcados como no
  verificados). Una pregunta en vivo con Ollama en CPU terminó en la CLI en 8 min 28 s y en la web en
  597,7 s. El workflow fusionó él mismo el #59, a las 15:06 del 20-10.
- **A la Entrega 3:** DIS-104 (las respuestas en vivo salen en inglés aunque la pregunta esté en
  español) y DIS-105 (los 18 avisos de `npm audit` de las herramientas de desarrollo).

## Medición de tokens de la tanda 4 (20-10)

El mismo script, ejecutado el 20-10:

| Ticket | Modo | Lectura | Escritura | Salida |
|---|---|---|---|---|
| DIS-102 | Workflow | 163,2 | 4,90 | 0,20 |
| DIS-103 | Workflow | 114,9 | 4,71 | 0,16 |
| `feature/entrega-2-CRN` | Sin ticket (cifra acumulada al 20-10) | 282,6 | 11,54 | 1,82 |

Las dos quedan dentro del rango de los tickets de código del workflow, con la escritura de caché en la
parte alta: cada uno recorrió la guía entera en varios clones limpios.

---

# 6. Conclusión de la autora

En palabras de la autora:

> Me doy cuenta de que, sin un harness, un contexto, un flujo, unas normas y una planificación claros y
> robustos, la automatización no habría dado un buen resultado; más bien todo lo contrario.

Lo que hizo que funcionase no fue que el agente trabajase solo, sino todo lo que lo rodeaba y que ya
existía antes del experimento:

- **El harness:** los hooks que bloquean comandos peligrosos y secretos, los subagentes con contexto
  limpio para cada paso, y las revisiones (`spec-auditor`, `verify-against-spec`, `adversarial-review`)
  que pararon cambios incompletos antes del merge.
- **El contexto:** `docs/base-standards.md`, `docs/project-context.md`, las specs de OpenSpec y los ADR,
  que cada subagente vuelve a leer y que le dicen cómo se hacen las cosas en este proyecto.
- **El flujo:** el mismo ciclo SDD de los tickets manuales, de `/enrich-us` al archive, con TDD.
- **Las normas:** qué no se toca nunca (`.claude/`, el bloque `[original]` de Linear, la firma de la
  autora), qué paquetes se pueden instalar y cuándo se puede fusionar.
- **La planificación:** tickets enriquecidos con criterios de aceptación comprobables, dependencias
  explícitas entre ellos y decisiones registradas en Linear.

Sin esa estructura, el agente habría tenido la misma autonomía y menos con qué orientarse: se habría
producido más rápido, pero peor, y con errores más difíciles de ver. La tanda 4 lo muestra también por
el otro lado: lo que la estructura no cubría (el camino en vivo desde un clon limpio) lo encontró la
prueba manual de la autora, no un agente.
