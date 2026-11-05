# 18. Extractor de Git con autores seudonimizados (DIS-35)

> Sección 18 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Enriquecer la sub-issue y proponer el change

Comandos literales en Claude Code, rama `feature/DIS-24-store-graph-read` ya mergeada. El agente
leyó con el MCP de Linear DIS-35 y su padre DIS-25 (CM-HU-03): `/enrich-us DIS-35`.

Prompt literal: `/opsx:propose DIS-35`.

**Por qué funcionó.** El mapa de realidad del enriquecido verificó el fixture con `git log` antes de
escribir criterios: 32 commits, 3 autores con nombres acentuados, 17 mensajes `(#NN)`, ninguna
fusión, renombrado ni binario. Salieron dos riesgos que el ticket no nombraba: los tráileres
`Co-authored-by:` meten nombres y correos en el mensaje, y `fixtures/acme-shop` vive dentro del
repositorio Codemind, así que sin su propio `.git` git leería el historial del padre.

**Ajuste humano.** La autora aceptó las cuatro decisiones que el agente marcó para revisar (formato
`Merge pull request #N`, quitar tráileres de identidad, hashear el correo y si no el nombre,
`--no-renames`).

### Prompt 2 — Afinado del change antes del apply

Texto literal enviado:

````
Eres el agente que mantiene el change OpenSpec `git-history-extraction` (DIS-35).
NO implementes código. Solo afina los artefactos de planificación con `/opsx:update`
o editando directamente los ficheros bajo `openspec/changes/git-history-extraction/`.
Tras los cambios: `openspec validate git-history-extraction --strict` y confirma que
pasa. Responde en español con el diff conceptual (qué cambió en proposal/spec/design/tasks).

## Contexto de la auditoría (jefe/auditor)
El propose está bien acotado a DIS-35 (no DIS-25). Se ACEPTAN sin cambio:
- Formato `Merge pull request #N` además de `(#N)`.
- Quitar tráileres de identidad (al menos los del ticket).
- Hashear email normalizado; si vacío, nombre normalizado.
- `--no-renames`.
- `checkIsRepo(IS_REPO_ROOT)` + escenario de subdirectorio (riesgo fixture anidado en Codemind).
- HMAC en core, sal por parámetro, `authorHashSaltFromEnv` separado, lectura de `process.env` en DIS-85.
- Sin ADR.

## Correcciones OBLIGATORIAS (bloqueantes)

### 1) Escenario faltante: email vacío → fallback al nombre
En `specs/git-history/spec.md`, el requisito **Author pseudonymisation** MUST dice que si el
email está vacío se hashea el nombre normalizado, pero no hay `#### Scenario:` que lo cubra
(solo está en tasks 3.1 / design D2).

Añade un escenario, p. ej. "An empty e-mail falls back to the normalised name":
- GIVEN identities con email `''` / solo espacios y un nombre (con mayúsculas/espacios),
- WHEN se seudonimiza con la misma sal,
- THEN el hash coincide con el del nombre normalizado (trim+lower) y NO con el de un email no vacío.
Actualiza `tasks.md` (3.1 y la comprobación 7.2 de mapeo escenario→test) para nombrarlo igual.

### 2) Escenario faltante: path inexistente
El requisito **Not a repository** MUST incluye `repoPath` que no existe, pero solo hay escenarios
para directorio sin Git y subdirectorio. Tasks 6.2 lo menciona de pasada.

Añade `#### Scenario: A non-existent path is rejected` (GIVEN path que no existe →
`NotAGitRepository` con esa ruta). Enlázalo en tasks 6.2 / 7.2.

Regla del kit: todo MUST del delta debe tener al menos un Scenario; la tabla
Requirement → Scenario → task no puede tener filas vacías.

## Correcciones RECOMENDADAS (mejorables, hazlas en el mismo update)

### 3) AC1 / DoD: `committed_at` en el escenario de persistencia
DIS-35 AC1 exige `committed_at = 2024-05-02T14:49:00Z` para el commit `(#61)`.
Hoy está en "The acme-shop history is read completely" pero NO en
"The acme-shop history is persisted without names or e-mails".
Añade al THEN del escenario de persistencia (y a la aserción de tasks 6.7) ese
`committed_at` / `committed_at` en BD, sin ampliar el alcance.

### 4) Lista de tráileres vs ticket
El ticket lista: Co-authored-by, Signed-off-by, Reviewed-by, Acked-by, Reported-by.
La spec añade Tested-by y Suggested-by. Elige UNA y documenta:
- A) Recortar la spec/design/tasks a la lista del ticket, O
- B) Mantenerlas como ampliación de privacidad explícita en proposal/design
  (una línea: "privacy expansion beyond ticket trailer list") y un caso de test por
  cada nombre que quede en el MUST.
No dejes MUST con nombres que tasks 4.1 no cubran.

### 5) Redacción del requisito Salt
Hoy dice que el adaptador "SHALL be configured with the salt read from AUTHOR_HASH_SALT",
pero el diseño es: factory recibe `authorHashSalt`; `authorHashSaltFromEnv` es el helper;
`process.env` lo lee DIS-85. Reescribe el MUST para no confundir parámetro vs env, sin
cambiar el comportamiento. El escenario de sal en blanco debe seguir fallando antes de
cualquier proceso git (factory + helper).

### 6) Contador de escenarios
Actualiza proposal/tasks si dicen "15 escenarios": serán 17 tras (1)+(2), o el número final real.
Tasks 7.2 debe exigir mapeo 1:1 Scenario → test con el mismo nombre.

## No tocar
- No ampliar a co-cambio (DIS-36), indexado/CLI (DIS-85), migraciones, StorePort, HTTP/CLI.
- No cambiar código de producción ni tests existentes del repo.
- No reescribir el alcance hacia el padre DIS-25.

Cuando termines: validate --strict, lista de escenarios actualizada, y confirma que cada
MUST del spec tiene Scenario y task.
````

**Por qué funcionó.** La regla "todo MUST tiene Scenario y task" encontró dos cláusulas que solo
vivían en el texto del requisito (correo vacío, ruta inexistente). Al exigir que no hubiera filas
vacías en la tabla requisito → escenario → tarea, el apply acabó con 17 escenarios y 17 tests del
mismo nombre, comprobados con `grep`.

**Ajuste humano.** Para los tráileres se eligió la opción B: los siete nombres quedan en el MUST,
documentados como ampliación de privacidad, con un caso de test por nombre. El requisito de la sal
se reescribió separando el parámetro del adaptador del helper que lee el entorno, sin cambiar el
comportamiento.

### Prompt 3 — Limpieza de ramas antes del apply

Texto literal enviado, tras el propose: `debes colocarte en la rama feature/entrega-2-CRN y eliminar la rama feature/DIS-24-store-graph-read si ya se hizo merge de la tarea anterior`.

**Por qué funcionó.** La condición "si ya se hizo merge" obligó a comprobarlo antes de borrar: el
agente verificó con `git merge-base --is-ancestor` que el último commit de DIS-24 estaba en
`origin/feature/entrega-2-CRN`, actualizó la rama de entrega (iba 8 commits por detrás) y la rama de
DIS-35 salió desde la base correcta.

**Ajuste humano.** El agente borró solo la rama local y preguntó antes de tocar el remoto; la autora
confirmó también el borrado de `origin/feature/DIS-24-store-graph-read`.
