# Prompt — Recorte poke-holes (Fase C del backlog)

**Proyecto:** CODEMIND · fork `DisTinta/AI4Devs-finalproject`
**Rama:** `feature/entrega-2-CRN`
**Fecha:** 27 de septiembre de 2026
**Contenido:** (1) la petición, (2) el prompt listo para pegar en la sesión que tiene el backlog + poke-holes (o en una sesión nueva con el archivo ya escrito).

> **Uso.** Pegar la sección «# 2. Prompt» íntegra. No sustituye al prompt de creación; es solo la **Fase C** (gate humano).

---

# 1. Petición

> Audité el backlog y el poke-holes. Aquí van mis decisiones sobre las 6
> preguntas abiertas y los PH-01…28. Aplícalas, anota cada decisión, actualiza
> estado y `prompts.md`. Sin Linear.

---

# 2. Prompt (pegar íntegro)

```
## Contexto

Trabajas en CODEMIND. Ya existe el borrador en:

`docs/ai-sessions/03-planificacion-historias-de-usuario.md`

Estado actual: backlog + §5 Poke-holes (PH-01…28) escritos; **ninguna Decisión aplicada aún**.

Esta sesión es **solo Fase C** (gate humano del prompt de planificación):

1. Aplicar **únicamente** las decisiones de abajo al §2–§4 (y resumen §0 si cambia).
2. Anotar bajo cada PH del §5: `**Decisión:** aceptada → …` / `rechazada — …` / `aceptada parcial → …`.
3. Actualizar cabecera del documento a: `borrador post poke-holes · pendiente importación Linear`.
4. Actualizar `**Ajuste humano.**` en `prompts.md` §11 con un resumen de lo aceptado/rechazado.
5. Corregir inconsistencias menores ya detectadas en auditoría (ver «Ajustes mecánicos»).

### Prohibido

- No crear/editar issues en Linear.
- No implementar código de producto.
- No modificar `docs/ai-sessions/03-prompt-planificacion-historias-de-usuario.md`.
- No reescribir §§5–6 del `readme.md` (la nota pre-§5 ya está; solo toca readme si una decisión exige una **nota breve** explícita abajo — p. ej. PH-02).
- No inventar decisiones distintas a las tablas.
- No borrar PH rechazados del §5.
- No commit / push salvo que la autora lo pida.

### Ajustes mecánicos (obligatorios)

- Cabecera: estado `borrador post poke-holes · pendiente importación Linear`.
- Alinear dependencias de CM-HU-15a en la vista tablero con el orden del §0 (si hace falta).
- Tras aplicar PH-18: fusionar 17.2 en 17.1 y actualizar totales de sub-issues.
- Si aceptas PH que añaden sub-issues (06, 13, 25, 17…): crearlas con IDs `CM-HU-XX.k` coherentes, DoD en una frase y nota OpenSpec.

---

## Decisiones — Preguntas abiertas §0

| # | Tema | Decisión | Acción concreta en el backlog |
|---|---|---|---|
| **1** | `GET /api/projects` (4º endpoint) | **Rechazar** el 4º endpoint | Pantalla 1 (CM-HU-15a): tarjetas de muestra desde constante/JSON de semillas en el frontend. CLI `projects`: lee vía `StorePort`, no HTTP. Quitar hipótesis `GET /api/projects` de Reality map / Enhanced / sub-issues. Actualizar PH-01. |
| **2** | Botón «+ Indexar mi propio repositorio» | **Confirmar non-goal** | Mantener non-goal en CM-HU-15a. Indexar solo CLI/API. |
| **3** | PHP 8.2+ en PATH vs Tree-sitter | **Mantener Tree-sitter sin PHP** | CM-HU-04a: sin intérprete PHP. Añadir nota (non-goal o technical context): §1.4 «PHP en PATH» no es requisito de indexado CODEMIND; se corregirá en docs más adelante. |
| **4** | Detección de secretos | **Reglas propias en proceso + `gitleaks` en CI** | Mantener hipótesis de CM-HU-05a. Añadir sub-issue de CI `gitleaks` + `.gitleaksignore` (ver PH-25). |
| **5** | Estado del job `POST /index` | **Non-goal** | Mantener: `202` + progreso en CLI; sin endpoint de consulta de estado. |
| **6** | `404` proyecto inexistente | **Aceptar** | CM-HU-12 (y `/impact` si aplica): `404` con formato `Error`. Documentar como extensión mínima del contrato §4 (error, no capacidad nueva). |

---

## Decisiones — Poke-holes PH-01…28

### Producto / camino crítico

| PH | Decisión | Acción concreta |
|---|---|---|
| **PH-01** | **Rechazada** — sin 4º endpoint | Ver pregunta 1. Alimentar Pantalla 1 sin `GET /api/projects`. |
| **PH-02** | **Aceptada parcial** | Entrega 2 con **1 proyecto** sembrado (`acme-shop`). `task-api` sigue en CM-HU-18 (E3). Añadir nota en CM-HU-06 / CM-HU-14 (y, si cabe en una línea, en la nota del DEMO dentro de 14.2): en E2 la salida esperada es `1 project loaded` hasta que exista el analizador TS. No hace falta reescribir todo el readme §1.4 ahora; deja el desfase explícito en el backlog. |
| **PH-03** | **Aceptada** | Ranking must (CM-HU-08) = **léxico + grafo**. Columnas `file.embedding` / `symbol.embedding` nullable; rellenar embeddings = should / ligado a F7 (CM-HU-19), no bloquea E2. Actualizar non-goals / technical context de 05a/08 y trazabilidad §4. |
| **PH-04** | **Aceptada** | Promesa operativa: acierto por **similitud de embedding** solo con embeddings/LLM configurado. En modo evaluación: acierto por golden / texto normalizado a 0 €. Reflejar en CM-HU-13 y CM-HU-19 (AC y non-goals). Anotar que §2.4 del readme se alineará en `/update-docs` posterior. |
| **PH-05** | **Aceptada** | Paso 5 de la demo E2 = **misma pregunta** (o clave normalizada idéntica). F7 (CM-HU-19) sigue `should`. Actualizar CM-HU-14.2. |
| **PH-06** | **Aceptada** | E2: marcar `stale` + aviso si se recupera claim stale. **Recálculo perezoso** = nueva sub-issue en E3 bajo CM-HU-09 (p. ej. `CM-HU-09.4`). Quitar el «se lo pasan en non-goals» sin dueño. |
| **PH-07** | **Aceptada** | Al reindexar (CM-HU-05b): **invalidar todas las `cache_entry` del proyecto**. Añadir AC + DoD en la sub-issue correspondiente. |
| **PH-08** | **Aceptada** | Sin código `LLM_REQUIRED` inventado. Comportamiento: **`200` + `answer: UNKNOWN` + `reason`** (modo solo-caché / configurar `LLM_*`). Ajustar CM-HU-13, 12, 15b. |
| **PH-09** | **Rechazada** — no hay `AuditPort` | Auditoría = **logger estructurado** (y/o persistencia vía `StorePort` si hace falta). Se mantienen **4 puertos**. Reescribir AC de 05a/09/10 que citan `AuditPort`. |
| **PH-10** | **Aceptada** | Esta versión: **una pasada** Context Engine → modelo. Bucle multi-iteración = non-goal / futuro. Explicitar en CM-HU-09. |
| **PH-11** | **Aceptada** | Fixtures con autores ficticios: sal en **`.env` / entorno (no versionada en git)**; semillas con `author_hash` ya calculados. Actualizar CM-HU-03 y 06. |
| **PH-12** | **Aceptada** | **Huella** (hash analizador + prompt / pesos) en semilla o artefacto comprobado por `verify`. No exigir regenerar `seed:build` en cada CI al inicio. Añadir a CM-HU-14 (y nota en 06/13). |
| **PH-13** | **Aceptada** | Sanitización **mínima** (delimitadores, truncado, filtrado burdo de patrones de instrucción) como sub-issue de CM-HU-09. Non-goal: no es barrera perfecta (como §2.5). |
| **PH-14** | **Aceptada** | `DAILY_BUDGET_USD`: gasto del día = **suma de `query_log.cost_usd`** (o equivalente), no contador solo en memoria. Actualizar CM-HU-07 / 12. |
| **PH-15** | **Aceptada** | Fijar regla de riesgo **antes** de implementar 16a.2. Regla inicial documentada en la HU: **HIGH** si algún impacto directo sin test o cadena solo `heuristic`; **LOW** si todos los directos tienen test y resolución `exact`; en otro caso **MEDIUM**, con `rationale` que cite esos hechos. |
| **PH-19** | **Aceptada** | Non-goal explícito en 04a, 05a y 18: **no** ejecutar `composer` / `npm install` / `artisan` / scripts del repo analizado. |
| **PH-20** | **Aceptada parcial** | `POST /index` (aceptar indexado vía API) = **must**. Indexado **incremental** = **should** (o queda en E3 sin pelear F1). Ajustar labels/prioridad de 05b.1 vs 05b.2 en consecuencia. |
| **PH-24** | **Aceptada** | `project.framework`: detección por manifiesto (`composer.json` → laravel; deps fastify → fastify; si no → `none`) + flag opcional `--framework` en CLI. Añadir AC en CM-HU-05a. |
| **PH-25** | **Aceptada** | Sub-issue bajo CM-HU-05a: paso `gitleaks` en `ci.yml` + `.gitleaksignore` alineado a fixtures. Reglas propias siguen en proceso (pregunta 4). |
| **PH-26** | **Aceptada** | Preguntas sugeridas Pantalla 2 = **constante por proyecto de muestra en la web** (E2). No nuevo campo en API. Actualizar CM-HU-15b. |
| **PH-27** | **Aceptada** | Registrar tokens/coste de **verificación** aparte (desglose en `usage` / `query_log`). Actualizar CM-HU-10 y 11; nota para Tabla 1 en 22 si aplica. |
| **PH-28** | **Aceptada** | Spike corto (≤ ½ día) en M2: validar `AnalyzerPort` con un fichero TS **antes** de cerrar CM-HU-04a.1. Añadir sub-issue o criterio de aceptación explícito. |

### Proceso / DX

| PH | Decisión | Acción concreta |
|---|---|---|
| **PH-16** | **Aceptada** | Declarar en CM-HU-08/11/22 que `baselineTokens` es **estimación local** (misma familia de tokenizador si es barato; si no, desviación explícita en Tabla 1). No bloquear E2 por tokenizador idéntico al proveedor. |
| **PH-17** | **Aceptada** | Separar trabajo humano (anotación sitios / revisión respuestas) en sub-issues tipo `chore`/`docs` con estimación en horas de autora, bajo CM-HU-22 (y 13.2/18.3 si aplica). |
| **PH-18** | **Aceptada** | Fusionar CM-HU-17.2 en CM-HU-17.1; eliminar 17.2; actualizar totales. |
| **PH-21** | **Aceptada** | Gate duro CI = **mutación**; cobertura = informativa. Reflejar en CM-HU-21; nota de que §2.6 del readme se alineará en docs. |
| **PH-22** | **Aceptada** | Excepción a documentar en technical context / non-goal de analizadores: fixtures = **entrada** del analizador, no «fixture mutable compartido» de backend-standards §7. (La edición de `project-context.md` puede ser una línea en CM-HU-04a DoD o sub-issue docs mínima.) |
| **PH-23** | **Aceptada** | CI: **job `verify` separado** o dos bases (`test` vs `verify`). Añadir a CM-HU-14 / 02 technical context. |

---

## Forma de trabajo

1. Lee el archivo de planificación completo (sobre todo §0 preguntas, §2 HUs afectadas, §5).
2. Aplica los cambios en orden: preguntas §0 → PH producto → PH proceso → ajustes mecánicos.
3. En §5, cada PH debe quedar con `**Decisión:**` rellenada (no dejes ninguno sin decisión).
4. Actualiza §0 «Preguntas abiertas»: márcalas como **resueltas** con la decisión (o muévelas a un subapartado «Resueltas en gate 2026-09-27»).
5. Actualiza `prompts.md` §11 `**Ajuste humano.**` con resumen tabular breve (aceptadas / parciales / rechazadas).
6. Al cerrar, informa en el chat: nº de padres, nº de sub-issues tras cambios, lista de HUs tocadas, y recuerda: **aún no Linear**.

## Criterios de aceptación

- Documento en estado `post poke-holes`.
- Los 28 PH tienen `**Decisión:**`.
- Las 6 preguntas §0 están resueltas según la tabla.
- No existe `AuditPort` ni `GET /api/projects` ni `LLM_REQUIRED` como contrato.
- Invalidación de caché al reindexar y presupuesto diario vía `query_log` quedan en AC.
- 17.2 fusionada; totales coherentes.
- `prompts.md` actualizado.
- Cero Linear, cero código de producto.
```

---

# 3. Notas para la autora

- Este prompt asume que el backlog + §5 ya existen en `03-planificacion-historias-de-usuario.md`.
- Si la sesión anterior aún está abierta, pégalo ahí (mejor continuidad). Si no, sesión nueva: «lee el archivo y aplica este gate».
- Tras Fase C, revisa el diff del markdown antes de importar a Linear.
