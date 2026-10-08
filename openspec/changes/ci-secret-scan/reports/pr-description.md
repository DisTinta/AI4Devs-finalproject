chore(DIS-87): escaneo de secretos con gitleaks en CI y allowlist por valor

## ¿Qué cambia?

- **Job `secrets` nuevo en `.github/workflows/ci.yml`.**
  - Instala gitleaks 8.30.1, el binario oficial verificado con un SHA-256 escrito en el workflow, en `$RUNNER_TEMP`.
  - Ejecuta `gitleaks dir .` (árbol) y `gitleaks git` sobre el rango del evento: `base..head` en un PR, `before..sha` en un push. Si `before` es todo ceros o no se puede alcanzar, escanea solo el árbol.
  - Los dos escaneos llevan `--redact` y `--config .gitleaks.toml`. Si falta el fichero, el job falla.
  - No tiene `needs`, ni `if`, ni `npm ci`, así que nunca se salta, tampoco en un push que solo toca documentación.
- **`.gitleaks.toml` nuevo.** Mantiene las reglas por defecto y permite los 13 hallazgos sintéticos del árbol por su **valor exacto**, no por línea. Son las claves plantadas de los fixtures, la clave falsa citada en un log de sesión y los bloques PEM de ejemplo de los specs de `security-gateway`. Cualquier otro valor, en esa línea o en otra, sale en rojo.
- **`.gitleaksignore` nuevo,** con una sola huella ligada a commit: un hallazgo del hito 2 cuyo valor ya no está en el árbol.
- **Documentación.**
  - `fixtures/README.md`: cómo corre el escaneo, la receta para regenerar y sus límites.
  - `docs/project-context.md`: bullet de CI y gotcha de la allowlist por valor.
  - `readme.md`: fila Security Gateway, nodo CI y árbol del repositorio.

Ticket: [DIS-87](https://linear.app/distinta-ai4devs/issue/DIS-87/cm-hu-05a4-paso-gitleaks-en-ciyml-gitleaksignore-con-las-huellas-de) (sub-issue de DIS-64, CM-HU-05a).

## ¿Por qué?

<!-- Transcrito de DIS-87 ([enhanced] §1 y decisión D4, decididas por la autora el 2026-10-08); se ha ajustado la redacción, no el contenido. -->

Como autora de Codemind, quiero que cada PR y cada push a `main` pasen un escaneo de secretos con `gitleaks` en un job propio que nunca se salte, con las huellas sintéticas ya conocidas ignoradas explícitamente, para que ningún secreto real (tampoco uno pegado en un `.md`) entre en el repositorio sin que CI se ponga en rojo.

El escaneo no va dentro de `quality`. DIS-86 hizo que `quality` se salte en pushes docs-only (`openspec/`, `docs/`, `*.md`), y un secreto pegado en un `.md` es justo el caso que hay que pillar.

## ¿Cómo probarlo?

1. Instala gitleaks 8.30.1 y comprueba la versión con `gitleaks version` (→ `8.30.1`).
2. `gitleaks dir . --config .gitleaks.toml --redact --no-banner` → «no leaks found».
3. `gitleaks git . --config .gitleaks.toml --redact --no-banner --log-opts="origin/main..HEAD"` → «no leaks found» (C6).
4. Con solo las reglas por defecto, aparecen los 13 hallazgos sintéticos. Así se ve que es el `.toml` el que los permite:
   - `printf '[extend]\nuseDefault = true\n' > /tmp/defaults.toml`
   - `mv .gitleaksignore /tmp/`
   - `gitleaks dir . --config /tmp/defaults.toml --redact --no-banner` → «leaks found: 13»
   - `mv /tmp/.gitleaksignore .`
5. Cambia una letra mayúscula de la clave de `fixtures/acme-shop/config/services.php:21` por otra mayúscula, sin commit. El paso 2 da rojo. Después, `git checkout -- fixtures/acme-shop/config/services.php`.
6. CI de este PR: el job `secrets` sale en verde. El log muestra `8.30.1`, la línea `OK` de `sha256sum` y «no leaks found» en los dos pasos, y no ejecuta `npm ci`. `quality` también sale en verde (C1; enlace en Trazabilidad).
7. `npx vitest run` con `DATABASE_URL` → 48 ficheros y 682 tests en verde. Este PR no toca código ni tests.
8. `npm run lint`, `npm run typecheck`, `npm run lint:architecture` y `npm run docs:coverage` → sin errores. Los avisos que salen ya estaban antes.

## Decisiones / compromisos

- **Qué se escanea** (D1, decisión de la autora): el árbol y además el rango de commits del evento.
- **Nada de allowlist por ruta** (D2, decisión de la autora): silenciaría una clave real futura en los specs. Reescribir el contenido habría tocado specs archivados.
- **Binario fijado por SHA-256 en lugar de `gitleaks-action`** (D3, decisión de la autora).
- **Job propio, sin `needs: scope`** (D4, decisión de la autora).
- **Disposición del job** (D5).
  - El escaneo `git` corre aunque falle el del árbol (`!cancelled()`).
  - Ningún `${{ … }}` aparece dentro de un `run:`.
  - El binario va en `$RUNNER_TEMP` para que `dir .` no se escanee a sí mismo.
- **Allowlist por valor en lugar de huellas de árbol** (D10, decisión de la autora tras `/adversarial-review`).
  - La primera versión ponía los 9 hallazgos de árbol en `.gitleaksignore` como `path:rule:line`. Una huella así no lleva nada del valor: escondía *cualquier* secreto de esa regla en esa línea, en `dir` y en `git`. Lo comprobé con una clave AWS distinta en `services.php:21`, que daba «no leaks found».
  - Ahora cada entrada se ata al valor exacto. Las entradas no llevan `paths`, porque gitleaks 8.30.1 aplica los `paths` de una allowlist global como si fuera saltarse el fichero entero, incluso con `condition = "AND"`.
  - Mover una línea ya no pone CI en rojo; cambiar el texto que coincide, sí.
  - Contrapartida: las entradas PEM son bloques largos del texto de los specs.
- **C5(b) por simulación local.** Un push a `main` con `before` todo ceros no se puede reproducir sin tocar `main`. La shell simulada es el `run:` del paso `range`, extraído con un parser YAML de `ci.yml` (`sha256` `74399cfd…5ecc`).
- **Deuda (destino C, en DIS-87 y en los Follow-ups del design):**
  - Un PR puede editar su propia config.
  - No hay CODEOWNERS.
  - Los pushes directos a otras ramas no se escanean.
  - Un secreto que solo entra al resolver un merge no se ve en el escaneo de commits.
  - Los lockfiles no se escanean.
  - En modo `git`, el cambio de una línea de cuerpo PEM no se ve.

## Checklist post-merge (autora, cuenta DisTinta)

- [ ] Añadir `secrets` como check obligatorio en `main` y en `feature/entrega-2-CRN` si tienen protección, o dejar anotado «sin regla de protección». Consulta del 2026-10-08: **las dos ramas responden «Branch not protected» y el repositorio tiene 0 rulesets → sin regla de protección**.
- [ ] Al confirmar esta checklist, pasar DIS-87 a Done. Mientras tanto se queda en In Review; si la integración Linear–GitHub lo mueve a Done al hacer merge, el agente lo devuelve a In Review.

## Trazabilidad

El cambio no tiene spec delta (`skip_specs: true`: chore de CI, como indica el `[original]` de DIS-87). Los criterios de aceptación del ticket se corresponden con estas evidencias:

| Criterio de DIS-87 | Evidencia |
|---|---|
| C1 — Árbol actual en verde | Head final `426b7f1`, [run 37768286114](https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/37768286114): [`secrets`](https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/37768286114/job/113281207758) en verde (`8.30.1`, `sha256sum` OK, `--config .gitleaks.toml`, «no leaks found» en `dir` y en `git` sobre 9 commits, sin `npm`); `quality` en verde (1 min 38 s). Con la primera configuración: [run 37760219359](https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/37760219359) |
| C2 — Secreto nuevo fuera de `fixtures/` → rojo | PR desechable #27, commit 1 `b517885`: [run 37760684063](https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/37760684063/job/113256055294). `secrets` en rojo; los dos pasos nombran `packages/secret-probe.ts:1` y `generic-api-key`, con el valor `REDACTED` |
| C3 — Secreto solo en Markdown, push docs-only → rojo | #27, commit 3 `c64074d`: [run 37761215621](https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/37761215621/job/113257802929). `scope` da `code=false` y `quality` se salta; falla el paso «Scan working tree» con `docs/secret-probe.md:3` y `generic-api-key`. El commit 2 dejó `quality` en verde ([run 37760985833](https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/37760985833)) |
| C4 — Secreto añadido y borrado en el mismo PR → rojo | #27, commit 4 `68bda5e`: [run 37761381963](https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/37761381963/job/113258344810). «Scan working tree» da «no leaks found»; «Scan commits» falla y nombra `b517885` y `c64074d`. #27 se cerró sin merge y se borró la rama; los commits siguen en `refs/pull/27/head` |
| C5(a) — Huella desplazada (ahora: valor cambiado) | «Evidencia local» abajo y `reports/2026-10-08-adversarial-review.md` |
| C5(b) — Push sin `before` utilizable | «Evidencia local» abajo y `reports/2026-10-08-5-test-and-state-verification.md` → «C5(b)» |
| C6 — El rango del hito sale en verde | «Evidencia local» abajo |
| Major de `/adversarial-review` (RED → GREEN) | `reports/2026-10-08-adversarial-review.md` |

## Evidencia local (C5(a), C5(b), C6, RED/GREEN)

Salida tal cual, con `--redact` y la configuración final.

<details><summary>C6 — rango del hito</summary>

```
$ gitleaks dir . --config .gitleaks.toml --redact --no-banner                            → INF no leaks found
$ gitleaks git . --config .gitleaks.toml --redact --no-banner --log-opts="origin/main..HEAD" → INF no leaks found
```

En `bc3e395` gitleaks informa de «292 commits scanned». Son los 318 de `origin/main..bc3e395` menos 25 merges, que gitleaks no recorre, y menos `780194d`, que solo renombra ficheros.
</details>

<details><summary>C5(a) — mover una línea frente a cambiar el valor</summary>

```
# línea añadida encima de openspec/specs/security-gateway/spec.md:120 (sin commit)
$ gitleaks dir . --config .gitleaks.toml --redact --no-banner
INF no leaks found
# un carácter del bloque PEM que coincide, cambiado (sin commit)
$ gitleaks dir . --config .gitleaks.toml --redact --no-banner -v
RuleID: private-key  File: openspec/specs/security-gateway/spec.md  Line: 120   (×2, coincidencias solapadas)
WRN leaks found: 2
# git checkout -- spec.md
restored (sha256 identical)
```
</details>

<details><summary>RED/GREEN del Major — otros valores sintéticos en las líneas permitidas</summary>

```
RED (configuración anterior, .gitleaksignore de 17 líneas)
-- validity: sin la config, las 4 sondas se detectan → WRN leaks found: 13
-- dir después de la sonda → INF no leaks found
-- git HEAD~1..HEAD        → INF no leaks found

GREEN (.gitleaks.toml)
-- dir originales → INF no leaks found
-- dir después de la sonda → WRN leaks found: 5 (env.ts:7, services.php:21, log de sesión:116, spec.md:120 ×2)
-- git HEAD~1..HEAD        → WRN leaks found: 3 (los tres valores cortos; el cuerpo PEM solo lo ve dir)
```
</details>

<details><summary>C5(b) — push sin <code>before</code> utilizable (simulación local del paso)</summary>

```
$ node -e "<js-yaml> jobs.secrets.steps.find(s=>s.id==='range').run" > range.sh
$ sha256sum range.sh
74399cfd29406aa8b8544cb9925a24ee0b6c1a74e30c8e6fde269b7cfa955ecc
$ bash -e range.sh   # con EVENT/BEFORE/SHA/BASE/HEAD y GITHUB_OUTPUT de prueba
push zeros        → exit=0 output: range=
push unreachable  → exit=0 output: range=
push parent       → exit=0 output: range=aa31566e…..95d55409…
pull_request      → exit=0 output: range=bc3e3952…..95d55409…
workflow_dispatch → exit=0 output: range=
```

Con `range=` vacío, el `if:` de «Scan commits of the event» es falso y el job ejecuta solo el escaneo del árbol. Un push real a `main` no se puede reproducir sin tocar `main` (design D9).
</details>

## Origen

agent+human-review

🤖 Generated with [Claude Code](https://claude.com/claude-code)
