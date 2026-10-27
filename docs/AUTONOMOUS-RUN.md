# Ejecución autónoma del ciclo SDD

Cómo se lanza un agente que recorre el ciclo SDD de un ticket sin nadie delante (enriquecer,
proponer, `spec-auditor`, aplicar en TDD, las tres revisiones, PR, archivo y merge) en Claude Code o
en Cursor, y qué hacen los hooks del kit mientras tanto. Lo introdujo DIS-106, a partir de los
bloqueos del experimento de la Entrega 2 (ADR
[`20261016-autonomous-workflow-run-entrega-2.md`](adr/20261016-autonomous-workflow-run-entrega-2.md),
`readme.md` §8.6). La decisión y la doctrina que se relaja están en el ADR
[`20261020-kit-autonomous-mode.md`](adr/20261020-kit-autonomous-mode.md).

Todos los comandos de esta guía se escriben igual en PowerShell y en Bash, salvo donde la guía da
las dos formas.

Si solo quieres lanzar una ejecución, ve a la sección 10: es el recorrido paso a paso y remite a las
demás secciones cuando hace falta el detalle.

## 1. Los dos modos

El interruptor es la clave `KIT_AUTONOMOUS_RUN` de `.claude/sdd-harness.env`. Se cambia **a mano**:
ni el agente ni un comando de shell del agente pueden escribir ese fichero. En el repositorio va
siempre como `"0"`; el `"1"` es un cambio local que no se hace commit.

| Modo | Cuándo | Qué cambia |
|---|---|---|
| **Interactivo** | `KIT_AUTONOMOUS_RUN="0"` y sesión normal | Lo mismo que antes, salvo lo que está siempre activo (abajo): los hooks preguntan donde preguntaban. El agente nunca hace merge |
| **Desatendido** | `KIT_AUTONOMOUS_RUN="1"`, o un *background agent* de Cursor aunque el interruptor esté a `"0"` | Ningún hook deja una confirmación pendiente: cada pregunta se convierte en una comprobación automática que permite o deniega, o en una denegación que dice qué hacer en su lugar. Sin `jq`, los hooks deniegan en vez de desactivarse. La puerta del `spec-auditor` exige `APPROVED` antes de escribir código o tests |
| **Ejecución autónoma** | Solo `KIT_AUTONOMOUS_RUN="1"` | Todo lo del modo desatendido, más: el agente puede hacer merge a través de la puerta de merge, se relaja la doctrina de la sección 2, y se protege la configuración del kit y el propio interruptor |

Con el interruptor a `"1"`, el inicio de cada sesión lo avisa (`⚠ autonomous run: ON`): en Claude Code
aparece en la terminal como mensaje del hook `SessionStart` y además llega al agente como primera
línea de su contexto. Los avisos `protect-specs: OFF` y `spec-audit-gate: OFF` salen igual. En Cursor
el aviso solo llega al agente: pregúntale al empezar.

### Qué decide cada hook en modo desatendido

- **Comandos destructivos de git** (`git reset --hard`, `git clean`): se deniegan y el mensaje propone
  `git restore -- <rutas>` o `git stash push -- <rutas>` sobre rutas explícitas.
- **Instalar dependencias:** solo npm, y con versión exacta (`paquete@1.2.3`). Se comprueba en el
  registro público que el paquete y la versión existen, que el paquete tiene al menos 90 días y la
  versión al menos 7, que tiene repositorio, al menos 10 000 descargas semanales y ningún script de
  instalación. Si algo falla, se deniega diciendo qué comprobación falló. `pnpm dlx`, `yarn dlx`,
  `bunx` y un `npx` que tendría que descargar se deniegan; `npx vitest run` (binario ya instalado)
  pasa. Otros gestores (`pip`, `composer`…) se deniegan.
- **Artefactos de OpenSpec, tests existentes, doctrina y migraciones:** en una ejecución autónoma, los
  artefactos del cambio activo se pueden reescribir antes de la primera auditoría, si la última
  auditoría es `APPROVED` y en las rondas de corrección tras una auditoría `CHANGES REQUIRED` (como
  mucho `AUTONOMOUS_AUDIT_ROUNDS` rondas, 5 por defecto; ver la sección 6). Un test existente solo se puede cambiar si `tasks.md` lo nombra o
  si lo creó la propia rama. La doctrina del kit y las migraciones ya versionadas no se tocan.
- **Puerta de merge:** ver la sección 5.
- **Lecturas de secretos:** `.env` y similares siguen denegados, también a través de `Grep` y `Glob` (en Cursor, `Grep`), en los dos modos.
  `.env.example` y `.env.sample` se pueden leer y editar en los dos modos.
- **Líneas demasiado costosas de comprobar:** una línea con demasiados textos de intérprete o comandos
  (por ejemplo, cientos de `eval` delante de un merge) se deniega antes de que el hook agote su tiempo.
  Un hook que agota su tiempo deja pasar la llamada, así que el tope cierra esa puerta.

### Qué más se deniega en una ejecución autónoma

- Escribir en `.claude/`, `.cursor/` o el perfil autónomo con cualquier forma de la ruta: `./` o `..`,
  barras dobles, prefijos `\\?\` o `\\localhost\C$\`, `/cygdrive/c/…`, otras mayúsculas en Windows, o
  una *junction* o un enlace simbólico que apunte dentro.
- Las formas alternativas de los comandos que escriben: `cp -t`, `cp --target-directory=`, `ln -t`,
  `install -t`, `sed --in-place`, `sed --expression=…`.
- Definir un alias de `gh` o de `git` (`gh alias set`, `git config alias.*`, `git -c alias.*=`), escribir
  a mano un fichero de configuración de git (`.git/config`, `~/.gitconfig`) o ejecutar un subcomando de
  git que no sea de git (`git m`, `git lfs`, `git flow`): un alias o un comando externo podría esconder
  un merge a la puerta.
- Texto de un intérprete (`python -c`, `node -e`, `eval`…) que nombre `.claude/`, `.cursor/`,
  `sdd-harness.env` o el perfil.
- Cualquier comando que nombre la configuración del kit y no sea de solo lectura (`cat`, `grep`, `ls`,
  `jq`, `git diff`/`show`/`log`/`status`…) ni una herramienta del propio kit (`bash .claude/doctor.sh`,
  `node .claude/hooks/…`). Incluye `curl -o`, `tar -C`, `touch`, `chmod`, `git apply`… y también
  `sed`, porque su comando `w` escribe ficheros: para leer la configuración del kit, `cat` o `grep`.
- Un `git checkout` en un directorio que no se puede resolver (por ejemplo, tras `cd "$X"`).
- Cualquier palabra de un comando que contenga una ruta del kit, se pase como se pase: `node --eval`,
  `python3 -Ic`, `perl -E`, `awk`… También pierden la excepción de solo lectura los comandos con una
  opción que ejecuta o escribe (`rg --pre`, `git -c …`, `git diff --output`, `less -o`, `find -exec`) o
  con una variable que cambia el programa que se lanza (`GIT_PAGER`, `EDITOR`…). Los scripts del kit
  se ejecutan sin opciones: `bash .claude/doctor.sh` pasa, `bash -x .claude/doctor.sh` no.
- Escribir por la shell en `~/.claude/…` o en `.claude/worktrees/`: la memoria se escribe con la
  herramienta de edición, y una ejecución autónoma no usa worktrees.
- Rutas que el guardián no puede resolver: comodines o llaves que podrían apuntar al kit
  (`.cl?ude/`, `.{claude,x}/`), nombres cortos de Windows (`CLAUDE~1`) y **palabras con variables** en
  un comando que no es de solo lectura (`git push origin "$BRANCH"`, `export PATH="$PATH:x"`, cualquier
  comando tras `cd "$X"`). En una ejecución autónoma se escriben los valores literales. El mensaje de
  un commit o de un PR sí puede llevar variables (`git commit -m "$(cat <<EOF …)"`).
- Una ruta de edición de más de 4 KiB, que no se puede comprobar a tiempo.

### Lo que cuesta cada llamada

Medianas en Windows (Git Bash, 7 ejecuciones), con el interruptor a `"0"`:

| Llamada | Antes de DIS-106 | Ahora |
|---|---|---|
| `Bash` (`ls`, los tres hooks de Bash) | 2,16 s | 1,85 s |
| `Read` | 0,86 s | 0,47 s |
| `Grep` / `Glob` | sin hook | 0,50 s |
| `Edit` | 1,54 s | 1,27 s |

La fila de `Edit` suma los dos hooks de edición en una rama con un cambio activo; en una rama sin
cambio activo el coste es el mismo que antes (unos 1,3 s). La fila de `Bash` suma el guardián de shell,
la puerta de merge y la de documentación. En una ejecución autónoma, la puerta de merge analiza cada
línea y una llamada a `Bash` cuesta unos 3,9 s.

### Qué está activo siempre, también con el interruptor a `"0"`

- El guardián de shell lee comandos, no texto: un mensaje de commit o un patrón de `grep` que contiene
  `rm -rf` no es un comando.
- Un `rm` o `rmdir` **solo** (sin `&&` ni otros comandos en la línea) sobre rutas literales dentro del
  scratchpad de la sesión no recibe decisión del hook.
- La detección de instalaciones también ve flags delante del paquete (`npm i -D x`).
- Borrar o sustituir el contrato del kit (`rm .claude/sdd-harness.env`) cuenta como escribirlo, y se
  deniega.
- `KIT_SECRET_ALLOWLIST` excluye centinelas de test conocidos del escaneo de secretos del prompt.
- La comprobación de ficheros secretos también se aplica a `Grep` y `Glob`, sin distinguir mayúsculas.
  Un fichero de entorno es `.env`, `.env.<sufijo>`, `<nombre>.env` o `<nombre>.env.<sufijo>`, salvo los
  sufijos `example`/`sample` y los ficheros de código (`config.env.ts` se puede leer y editar; `.env.sh`
  y `.env.md` no cuentan como código y siguen siendo secretos). También se reconocen en rutas
  relativas y con el sufijo de flujo alternativo de Windows (`.env::$DATA`).
- En Cursor, los hooks del kit (sección 7).

## 2. La doctrina que se relaja en una ejecución autónoma

Solo con `KIT_AUTONOMOUS_RUN="1"`. Un *background agent* de Cursor con el interruptor a `"0"` no
recibe ninguna de estas excepciones. Los ficheros de doctrina no cambian; la lista vive aquí, en el
ADR y en la nota de parche local de `docs/project-context.md`.

| Regla | Normalmente | En una ejecución autónoma |
|---|---|---|
| `docs/base-standards.md` §3, regla 2 | Una persona aprueba el plan antes del código | El veredicto `APPROVED` del `spec-auditor` sustituye a esa aprobación; la puerta del `spec-auditor` lo exige antes de escribir código o tests |
| §3, regla 3 | Los tests salen de los escenarios del spec, con supervisión humana | Se escriben sin supervisión |
| §3, regla 4 | Un test no se modifica para que pase | Solo se editan tests nombrados en `tasks.md` o creados en la rama |
| §3, regla 8 | El «porqué» de PR y ADR lo escribe una persona | Lo escribe el agente y lo marca como texto suyo |
| §3, regla 9 | Los merges los firma una persona | El agente hace merge a través de la puerta de merge |
| §7.1, punto 3 | Tras una auditoría `CHANGES REQUIRED`, las decisiones de producto o de alcance las toma la autora | El agente las toma como lead engineer en una ronda de corrección (sección 6), las marca como suyas y las deja en `design.md` → Follow-ups y en el ticket; la nueva auditoría las revisa |
| `docs/openspec-tasks-mandatory-steps.md` §3, Pre-merge Review, punto 5 | El agente nunca hace merge | El agente hace merge después del commit de archivo, a través de la puerta |

## 3. El perfil autónomo de Claude Code

El `~/.claude/settings.json` personal puede tener reglas `ask` (`npm install*`, `rm *`, `WebFetch`…)
que obligan a confirmar incluso en auto mode, y no se pueden quitar desde otro fichero de settings.
Por eso una ejecución autónoma arranca Claude Code con `CLAUDE_CONFIG_DIR` apuntando a un **perfil
aparte**, que tiene su propio `settings.json`, su propio login, su configuración de MCP, su memoria y
sus transcripciones.

**Crear el perfil** (una vez):

1. Crea la carpeta, por ejemplo `~/.claude-autonomous`.
2. Copia en ella `ai-specs/templates/autonomous/claude-settings.json.tpl` como `settings.json` y
   sustituye `<owner>/<repo>` (por ejemplo `DisTinta/AI4Devs-finalproject`), `<base-branch>`
   (`final-project-CRN`) y `<db-name>` (`codemind`). La plantilla no tiene reglas `ask`, deniega la
   lectura de `.env` y los flags que se saltan los permisos, y autoriza en `autoMode.allow` el merge
   hacia la rama base.
3. Abre Claude Code con el perfil (siguiente apartado), haz `/login`, aprueba los servidores MCP del
   proyecto (`.mcp.json`: Linear, Context7, Playwright) y autentica Linear en `/mcp`. Sal con `/exit`.
4. Comprueba que la autorización está cargada: debe salir la línea del merge.

PowerShell:

```
$env:CLAUDE_CONFIG_DIR = "$HOME\.claude-autonomous"; claude auto-mode config | Select-String "gh pr merge"
```

Bash:

```
CLAUDE_CONFIG_DIR="$HOME/.claude-autonomous" claude auto-mode config | grep "gh pr merge"
```

**Lanzar una sesión con el perfil**, desde la carpeta del repositorio:

PowerShell (la variable queda puesta en esa terminal; ciérrala al terminar):

```
$env:CLAUDE_CONFIG_DIR = "$HOME\.claude-autonomous"; claude
```

Bash (solo para ese comando):

```
CLAUDE_CONFIG_DIR="$HOME/.claude-autonomous" claude
```

Dentro del perfil, sus propios ficheros son configuración del kit: en una ejecución autónoma el
agente no puede escribir su memoria ni sus planes (`<perfil>/projects/…`).

## 4. Antes de cada ejecución: el preflight

1. La rama base está protegida en GitHub: PR obligatorio, los cinco checks de `ci.yml` (`scope`,
   `quality`, `verify`, `mutation`, `secrets`) obligatorios, `enforce_admins` activo, sin revisiones
   obligatorias y `strict` desactivado. Es la red de seguridad del lado del servidor: aguanta aunque un
   hook no vea un comando.
2. `gh` está autenticado con una cuenta con acceso de administrador al repositorio (en Codemind,
   `DisTinta`): sin ella, GitHub responde «Not Found» a la consulta de la protección. Si la
   configuración global de `gh` la comparten otros proyectos, dale al repositorio su propia
   configuración con `GH_CONFIG_DIR`: en la clave `env` de `.claude/settings.local.json` (ignorado por
   git; solo se lee al arrancar la sesión) para el agente y sus hooks, y en la terminal desde la que
   lances el preflight (`$env:GH_CONFIG_DIR = "<dir>"` en PowerShell, `GH_CONFIG_DIR="<dir>"` delante
   del comando en Bash). `git push` también la usa si el credential helper de GitHub es
   `gh auth git-credential`. Desde PowerShell lanza `doctor.ps1`: `bash` puede resolverse al de WSL,
   que no ve el `gh` de Windows, ni esa variable, ni `~/.claude-autonomous`.
3. Pon a mano `KIT_AUTONOMOUS_RUN="1"` (y `AUTONOMOUS_MERGE_BASE`, si la base no es la de siempre).
4. Ejecuta el preflight y corrige cada `FAIL`:

```
bash .claude/doctor.sh --autonomous --config-dir ~/.claude-autonomous
```

```
pwsh .claude/doctor.ps1 -Autonomous -ConfigDir "$HOME\.claude-autonomous"
```

Sin `--config-dir`/`-ConfigDir` usa `CLAUDE_CONFIG_DIR`. Comprueba, entre otras cosas: el interruptor y
la base, el perfil sin reglas `ask` y con la autorización del merge que nombra la base, `jq`, los hooks
registrados, `gh` autenticado, que la última CI de la base terminó en verde y la protección de la base.
Si la base se protege con *rulesets* en vez de la protección clásica, exige que pidan PR y checks y
que **no tengan actores con permiso para saltárselas**; sin acceso de administrador no puede leerlos y
lo dice. La autorización del merge tiene que estar en una sola regla del perfil que nombre a la vez
`gh pr merge` y la base. Sale con código distinto de 0 si hay algún `FAIL`. Docker y las exclusiones de
Defender (también desde Git Bash) solo dan `WARN`.
Si alguna protección del kit está desactivada en local, también es `WARN`: el modo desatendido aplica
sus reglas igualmente.

### Prueba en seco del merge

Antes de la primera ejecución, o tras cambiar el perfil o la protección, conviene comprobar que el
merge funciona de punta a punta en una base desechable. Así se hizo en DIS-106 (informe
`openspec/changes/archive/…-autonomous-run-switch/reports/2026-10-21-12-manual-interface-testing.md`):

1. Con el interruptor a `"0"`, crea la base desechable `tmp-autonomous-dry-run` desde la base real y
   súbela. Crea la rama de cabeza en un worktree del scratchpad, con un commit de un fichero que no
   esté bajo `openspec/changes/archive/`, y súbela. La copia principal se queda en su rama.
2. Protege `tmp-autonomous-dry-run` como la base real.
3. Pon a mano `KIT_AUTONOMOUS_RUN="1"` y `AUTONOMOUS_MERGE_BASE="tmp-autonomous-dry-run"`, y cambia las
   dos menciones de la base en el `settings.json` del perfil.
4. Abre un PR desechable (sin `DIS-` en el título) y espera su CI. En una sesión con el perfil, desde la
   copia principal, pide solo `gh pr merge <n> --merge`: la puerta lo **deniega** («no archived OpenSpec
   change»). Añade un fichero bajo `openspec/changes/archive/` en la rama de cabeza, súbelo, espera la
   CI y repite: la puerta lo **permite**. Anota si el clasificador de auto mode también lo permite.
5. Restaura el interruptor, la base y el perfil; quita la protección de la base desechable; quita el
   worktree y borra las ramas.

Pega en esa sesión instrucciones cortas, de una línea: un texto largo pegado desde la terminal puede
llegar cortado.

## 5. La puerta de merge

En una ejecución autónoma el agente solo hace merge con `gh pr merge <n> --merge`, solo en la línea, y
el hook `autonomous-merge-gate` lo permite únicamente si:

- el PR apunta a `AUTONOMOUS_MERGE_BASE`;
- todos sus checks han terminado en `SUCCESS`, `NEUTRAL` o `SKIPPED` (un push que solo toca el archivo
  deja `quality`, `verify` y `mutation` en `SKIPPED`, y cuenta como verde);
- GitHub lo da como `MERGEABLE`;
- lleva algún fichero bajo `openspec/changes/archive/`;
- no toca nada bajo `.claude/` ni `.cursor/`, en ninguna combinación de mayúsculas, ni renombra o borra
  nada de ahí (la puerta consulta también la lista de ficheros del PR con su ruta anterior);
- la base está protegida en GitHub.

Si falla alguna condición, el motivo las nombra todas a la vez. Por eso, aunque la forma del comando
sea incorrecta, la puerta consulta GitHub antes de denegar (hasta 15 s).

Se deniegan `--squash`, `--rebase`, `--admin`, `--auto`, `--delete-branch`, varios comandos en la
misma línea, variables `GH_*` y los merges por `gh api` o dentro de texto de un intérprete. Un push
directo a la base, un `git merge` local sobre ella o cambiar su protección también se deniegan.

Un ticket sin cambio de OpenSpec (por ejemplo, solo documentación) no lo puede integrar el agente: lo
integra la autora.

Después, el clasificador de auto mode decide también. En la prueba en seco de DIS-106, la
autorización del perfil pesó más que su regla de serie «Merge Without Review». El clasificador no es
determinista; si deniega, se aplica la alternativa de la sección 6.

## 6. El contrato del workflow

Lo que el script del workflow y cada agente cumplen en una ejecución autónoma. Es el mismo contrato
que `.cursor/rules/20-openspec.mdc` (punto 9). En Claude Code lo implementa el workflow guardado
`.claude/workflows/autonomous-sdd.js` (sección 10, paso 9).

**Pasos por ticket**, cada uno en un subagente nuevo: `/enrich-us` → `/opsx:propose` → `spec-auditor`
→ rondas de corrección hasta `APPROVED` → `/opsx:apply` en TDD → PR → `/show-spec-working`,
`/verify-against-spec` y `/adversarial-review` → correcciones en el mismo PR → `/opsx:archive` →
merge. **Modelos:** Opus en los pasos de juicio (enriquecer, proponer, auditar, corregir la
auditoría, revisar), Sonnet en los mecánicos.

**Rondas de corrección de la auditoría.** Una auditoría `CHANGES REQUIRED` no para el ticket: abre una
ronda de corrección, como en `docs/base-standards.md` §7.1, punto 3, pero sin la autora.

1. Un subagente nuevo (Opus) lee el informe y responde cada pregunta para la autora como lead
   engineer: elige la opción que mejor cumple el ticket y, ante la duda, la que menos amplía el
   alcance; la marca como texto suyo y la deja
   en `design.md` → Follow-ups (con su destino A/B/C/D) y en un comentario del ticket.
2. Aplica las «Corrections to apply» a los artefactos del cambio (`/opsx:update` o una edición
   equivalente) y cierra el informe con una sección que dice, por hallazgo, cómo se resolvió:
   corregido, rechazado con el motivo o decidido por el agente.
3. Un `spec-auditor` nuevo, sin el contexto de la ronda, audita el cambio entero. Su informe se añade
   al final del mismo informe (`reports/<fecha>-spec-audit.md`), bajo `## Run <n>`, y su veredicto es
   el que cuenta. No se crea otro fichero: los hooks leen los informes por orden de nombre y
   `…-spec-audit-2.md` va antes que `…-spec-audit.md`, así que contaría como la primera auditoría.
   Una línea que sea exactamente `APPROVED` o `CHANGES REQUIRED` solo puede ser la línea de veredicto
   de una ejecución; en cualquier otro sitio esas palabras van dentro de una frase o entre comillas
   invertidas.

El hook `protect-specs-and-tests` deja reescribir los artefactos mientras el número de veredictos
`CHANGES REQUIRED` del cambio no pase de `AUTONOMOUS_AUDIT_ROUNDS` (en `.claude/sdd-harness.env`; 5
si no está, y 0 si no es un número entero). Es un techo, no un número fijo: en cuanto una auditoría
sale `APPROVED` no hay más rondas. En los cambios archivados hasta el 26-10-2026, 16 de 17 se
aprobaron en 5 rondas o menos. La puerta del `spec-auditor` sigue sin dejar escribir código ni tests
hasta `APPROVED`. Una auditoría `CHANGES REQUIRED` después de la última ronda sí para el ticket.

**Reglas:**

- No se pregunta nada: se decide como lead engineer y cada decisión queda en el ticket y en
  `design.md` → Follow-ups, con su destino A/B/C/D.
- `verify-against-spec` y `adversarial-review` se ejecutan en línea (su sección *Inline mode*), nunca
  como fork: un fork no deja su informe a quien lo lanzó. No se invoca la skill: se lee su `SKILL.md`
  y se siguen sus instrucciones (en el piloto de DIS-104 y DIS-105 se lanzó una vez como fork en cada
  ticket y no devolvió nada).
- `tasks.md` nombra cada test existente que cambia una tarea; si no, la protección lo deniega.
- El código no se escribe por la shell (`cat > fichero`, `sed -i`): se usan las herramientas de
  edición, que la puerta del `spec-auditor` sí ve.
- El texto que menciona comandos (documentación, prompts, informes) también se escribe con las
  herramientas de edición, nunca en un heredoc pasado a un intérprete (`python - <<EOF`): el guardián
  de shell compara el texto de un intérprete con patrones, y una frase como «`git reset --hard`» se
  deniega como si fuera el comando.
- El agente escribe el «porqué» de PR y ADR y lo marca como texto suyo.
- Tras una instalación ya validada, `npm audit --audit-level=high`; un hallazgo nuevo alto o crítico
  detiene el ticket.
- No se toca ni se hace commit de `.claude/` ni de `.cursor/`; se preparan para commit rutas
  explícitas, nunca `git add -A` ni `git commit -a`.
- No se usan worktrees aislados: un subagente en un worktree nuevo leería el `KIT_AUTONOMOUS_RUN="0"`
  del commit, y sus hooks volverían a preguntar.
- Las esperas (CI, merges) se hacen con la herramienta `Monitor`, nunca con `sleep`. Un paso que espera
  la CI no termina hasta que ningún check está pendiente: no deja un monitor en segundo plano y
  devuelve su resultado sin el veredicto de la CI.
- Un comando `git` por llamada: no se encadenan `git switch`, `git merge` o `git push` con `&&`. Los
  hooks juzgan la línea entera con la rama en la que se está al lanzarla, y un `git merge` encadenado
  tras un `git switch` desde la base se deniega como si fuera un merge sobre la base.
- No se deja en marcha ningún proceso al terminar un paso: `vitest run`, nunca en modo watch, y se
  para cualquier servidor (`vite`, API) que se arranque. Un `vitest` huérfano bloquea en Windows los
  binarios de `node_modules`, y el siguiente `npm ci` falla con `EPERM`. Cada paso que haya
  arrancado algo termina con `node scripts/dev-processes.mjs stop`, que cierra los procesos `node` y
  `esbuild` del repositorio y de los clones del scratchpad (`list` los enseña sin cerrarlos). El
  clasificador de auto mode deniega las consultas de procesos en PowerShell (`Get-CimInstance`), así
  que el agente no tiene otra forma de encontrarlos. Cierra también los que haya arrancado la autora
  en ese repositorio; `--since <fecha>` limita a los arrancados desde entonces.
- Las comprobaciones en PowerShell (capturas de `docs/DEMO.md`, una orden de la guía en una terminal
  PowerShell nueva) las hace la autora: el clasificador deniega las órdenes de PowerShell que cambian
  variables de entorno (`$env:…`). El agente las hace en Git Bash y las deja en `design.md` →
  Follow-ups con destino C desde el `tasks.md`, no al descubrirlo en el apply (en el piloto de DIS-105
  se denegaron dos veces).
- Ninguna sesión, tampoco la principal, deja su directorio de trabajo dentro de
  `openspec/changes/<cambio>/`: en Windows esa carpeta queda bloqueada y `/opsx:archive` no la puede
  mover.
- El merge es solo `gh pr merge <n> --merge`, a través de la puerta. Si la puerta lo deniega, se vuelve
  a leer el PR antes de reintentar: puede haber cambiado entretanto.

**Paradas limpias** (ticket a *In Review* con un comentario en español; los tickets independientes
siguen):

- una auditoría `CHANGES REQUIRED` después de la última ronda de corrección: el hook ya no deja
  reescribir los artefactos, así que el ticket vuelve a la autora con los informes de las auditorías;
- la CI en rojo después de 2 correcciones;
- un conflicto de merge;
- el límite de uso;
- un permiso denegado sin alternativa;
- una corrección de código necesaria después de `/opsx:archive` (ya no hay cambio activo);
- **el clasificador deniega el merge:** el ticket queda en *In Review* con el comentario y se vigila
  el PR con `Monitor` hasta que la autora lo integre.

## 7. Cursor

`.cursor/hooks.json` ejecuta los mismos scripts que Claude Code, con
`node .claude/hooks/invoke.cjs --client cursor`, que adapta la entrada y la respuesta al formato de
Cursor:

| Evento de Cursor | Hooks |
|---|---|
| `sessionStart` | `session-context` |
| `beforeShellExecution` | `block-dangerous-bash`, `docs-gate`, `autonomous-merge-gate` |
| `beforeReadFile` | `block-secret-reads` |
| `preToolUse` (`Write\|Delete`) | `protect-specs-and-tests`, `spec-audit-gate` |
| `afterFileEdit` | `post-edit-quality`, `validate-tasks` |
| `beforeSubmitPrompt` | `block-secrets` |
| `stop` | `verify-tests` |

- **La excepción del `ask`:** `preToolUse` y `beforeReadFile` no aceptan `ask`. En una sesión
  interactiva, donde Claude Code preguntaría, Cursor deja pasar la edición con un aviso al usuario y al
  agente. En modo desatendido es una denegación, como en Claude Code.
- **Background agents:** siempre son desatendidos, aunque el interruptor esté a `"0"`, así que nunca
  esperan una confirmación. Pero solo hacen merge o reciben las excepciones de la sección 2 si la
  autora ha puesto el interruptor a `"1"`. Cursor solo documenta `is_background_agent` en
  `sessionStart`, que los agentes en la nube no ejecutan: un agente en la nube cuyos otros eventos no
  lo traigan solo es desatendido a través del interruptor.
- **`cursor-agent`** (la CLI): sus permisos van en `<proyecto>/.cursor/cli.json`, a partir de
  `ai-specs/templates/autonomous/cursor-cli.json.tpl` (permite `gh pr merge`, `gh pr checks`,
  `gh pr view` y los tests; deniega leer `.env` y escribir en `.claude/`, `.cursor/` y `secrets/`).
- Cursor no tiene clasificador de auto mode: en Cursor la puerta de merge y la protección de la rama
  base son los únicos controles del merge.
- Cursor no tiene evento de denegación: sus denegaciones solo quedan en la transcripción del agente.

## 8. Cerrar una ejecución

1. Pon a mano `KIT_AUTONOMOUS_RUN="0"` (y la base, si la cambiaste). Comprueba que `git status` no
   propone hacer commit de `.claude/sdd-harness.env`.
2. Repasa `.claude/autonomous-denials.log`: una línea JSON por cada denegación de la ejecución
   (fecha, herramienta, motivo, entrada con los secretos sustituidos por `[REDACTED]` y, si lo hay, el
   veredicto del clasificador). Es local y no se versiona. Cada denegación es o una protección que
   funcionó o una regla que falta en el kit.

## 9. Lo que no está verificado

- **Herencia del perfil en subagentes.** La documentación de Claude Code no dice si los subagentes y
  los agentes de un Workflow heredan `CLAUDE_CONFIG_DIR`. Corren en el mismo proceso, así que deberían
  leer la misma configuración, pero la prueba en seco de DIS-106 hizo el merge desde la sesión
  principal del perfil, no desde un subagente.
- **Cursor en vivo.** En DIS-106 no estaba instalado `cursor-agent`: se ejecutaron todas las líneas de
  `.cursor/hooks.json` con entradas en formato Cursor, no una sesión real. Los formatos salen de la
  documentación de Cursor.
- **El clasificador.** No es determinista: que haya permitido el merge en la prueba en seco no
  garantiza que lo permita siempre.
- **Huecos aceptados:**
  - el código que ejecuta un intérprete que no es de shell (`node -e`, `python -c`) solo se compara
    con patrones de texto: en una ejecución autónoma se deniega si nombra la configuración del kit, pero
    una ruta construida por partes no se ve;
  - un script escrito y luego ejecutado (`bash x.sh`, `source x.sh`) no se inspecciona por dentro;
  - `git apply` o `git stash pop` sin ninguna ruta del kit en la línea no se deciden;
  - una búsqueda con `Grep` sobre una carpeta entera, sin patrón de ficheros, no se puede decidir: el
    hook no sabe qué ficheros tocará;
  - la lectura de un `.env.*` por la shell (`cat .env.local`) no la para ningún hook.

  En Claude Code queda el clasificador; en los dos clientes, la protección de la rama base.

## 10. Cómo se usa, paso a paso

El recorrido completo de una ejecución autónoma en Claude Code, desde la preparación hasta el cierre.
Para Cursor, ver la sección 7.

En pocas palabras: preparas una vez el perfil autónomo y la protección de la base. Antes de cada
ejecución eliges los tickets, pones el interruptor a `"1"` y pasas el preflight. Abres una sesión
**nueva** de Claude Code con el perfil autónomo y le pides, en un solo mensaje, un workflow con la
lista de tickets. El workflow recorre cada ticket en un subagente propio, con el contrato de la
sección 6, y al final escribe un resumen. Tú no respondes nada mientras corre.

### Una sola vez

**Paso 1. Crea el perfil autónomo.** Sigue «Crear el perfil» de la sección 3: carpeta
`~/.claude-autonomous`, su `settings.json` a partir de la plantilla, `/login`, servidores MCP
aprobados y Linear autenticado.

**Paso 2. Prepara GitHub.**
- Protege la rama base (sección 4, punto 1).
- Si la configuración global de `gh` la comparten otros proyectos, dale al repositorio la suya con
  `GH_CONFIG_DIR` (sección 4, punto 2).

**Paso 3. Haz la prueba en seco del merge.** Ver «Prueba en seco del merge» en la sección 4. Repítela
si cambias el perfil o la protección de la base.

### Antes de cada ejecución

**Paso 4. Elige los tickets y su orden.**
- **Qué tickets.** Solo los que terminan en un cambio de OpenSpec: uno de solo documentación no lo
  puede integrar el agente (sección 5). Deja fuera los que necesitan una decisión o una revisión
  tuya que no se puede delegar, por ejemplo firmar resultados.
- **En qué orden.** El workflow los hace en serie, cada uno sobre la base ya integrada del anterior.
  Ordénalos por dependencias. Si uno se para, el workflow salta los que dependen de él y sigue con
  los independientes.
- **Cuántos.** El kit no pone límite: el límite es tu cuota de uso. Mira `/usage` antes de elegir. En
  la Entrega 2 cada ticket tardó entre 2 y 4 h de reloj (más si había esperas), y las tandas se
  cortaron en unos 7 tickets para no agotar el límite semanal a mitad de un ticket. La primera vez,
  lanza una tanda piloto de 1 o 2 tickets y revisa el resultado antes de lanzar más.

**Paso 5. Deja la copia de trabajo lista.**
- Rama base actualizada y sin cambios pendientes: `git switch final-project-CRN`, `git pull` y
  `git status` limpio.
- Docker arrancado (`docker compose up -d`): sin él fallan los tests de integración.

**Paso 6. Pon el interruptor a `"1"`.** Edita a mano `.claude/sdd-harness.env`:
`KIT_AUTONOMOUS_RUN="1"`.

**Paso 7. Pasa el preflight sin ningún `FAIL`** (sección 4). Si usas `GH_CONFIG_DIR`, ponla en la
misma terminal.

PowerShell:

```
$env:GH_CONFIG_DIR = "$HOME\.config\gh-distinta"; pwsh .claude/doctor.ps1 -Autonomous -ConfigDir "$HOME\.claude-autonomous"
```

Bash (Git Bash, no WSL):

```
GH_CONFIG_DIR="$HOME/.config/gh-distinta" bash .claude/doctor.sh --autonomous --config-dir ~/.claude-autonomous
```

Si la última CI de la base está en rojo, el preflight falla. Mira el motivo antes de lanzar: un test
inestable se relanza; un fallo real se arregla primero.

### Lanzar

**Paso 8. Abre una sesión nueva con el perfil autónomo**, en una terminal nueva y desde la carpeta
del repositorio (comandos en la sección 3, «Lanzar una sesión con el perfil»). Tiene que ser nueva:
`.claude/settings.local.json` y el interruptor solo se leen al arrancar. Comprueba dos cosas:
- al inicio sale en la terminal el aviso `⚠ autonomous run: ON` (mensaje del hook `SessionStart`).
  Si no sale, la sesión no leyó el interruptor a `"1"`: no lances el workflow;
- si usas `GH_CONFIG_DIR`, `gh auth status` muestra solo la cuenta del repositorio. Pídeselo al agente
  como primer mensaje.

**Paso 9. Pide el workflow en un solo mensaje.** La herramienta Workflow solo se usa si se pide
explícitamente, así que el mensaje tiene que nombrar el workflow. El script es
`.claude/workflows/autonomous-sdd.js`: recorre los pasos de la sección 6 para cada ticket, con las
rondas de corrección, y es el mismo en todas las tandas. Recibe la lista de tickets en `args`:

| Campo | Qué es |
|---|---|
| `id` | El ticket de Linear. |
| `dependsOn` | Tickets **de la misma tanda** que tienen que estar integrados antes. Si uno se para, este se salta. Un bloqueador de una tanda anterior lo comprueba el paso de enriquecer en Linear. |
| `ollama` | El ticket necesita el modelo local. El workflow comprueba Ollama al empezar; si no responde, el ticket se para. |
| `notes` | Instrucciones extra que reciben todos los pasos del ticket. |
| `panel` | El juicio del ticket (anotar, revisar) lo hacen agentes independientes, uno por modelo de `models`, a ciegas entre sí y fuera del apply. Con dos o más, otro agente resuelve solo los desacuerdos. El `tasks.md` del cambio lleva un grupo `Panel` con las entradas, el criterio, las rutas de salida y la concordancia. |

Cambia los tickets y pégalo en una sola línea (un texto largo pegado desde la terminal puede llegar
cortado):

```
Ejecuta el workflow guardado autonomous-sdd con args {"tickets":[{"id":"DIS-a"},{"id":"DIS-b","dependsOn":["DIS-a"]}]}. No me preguntes nada mientras corre. Al terminar escribe solo: tickets cerrados con su PR, tickets parados o saltados con el motivo y lo que queda pendiente para mí.
```

Claude Code enseña la descripción del workflow en un diálogo de permiso: apruébalo. Desde ahí, la
terminal queda en silencio hasta el resumen final.

### Mientras corre

**Paso 10. No toques la copia de trabajo.** El workflow trabaja en esa misma carpeta, sin worktrees
(sección 6). No cambies de rama, no edites ficheros, no hagas commit allí y no cambies el
interruptor. Si necesitas trabajar en el repositorio a la vez, hazlo en otro clon.

**Paso 11. Deja la sesión viva.** El workflow corre dentro de esa sesión de Claude Code: no cierres
la terminal ni dejes que el equipo se suspenda.

**Paso 12. Sigue el avance sin intervenir:**
- `/workflows`, en la misma sesión: el progreso de cada agente;
- Linear: cada ticket pasa por *In Progress* y termina en *Done* o en *In Review*;
- GitHub: los PR, su CI y sus merges.

**Paso 13. Atiende los tickets que se paran.** Un ticket que queda en *In Review* lleva un comentario
en Linear con el motivo (las paradas de la sección 6):
- **El clasificador denegó el merge:** revisa el PR y haz tú el merge. El workflow lo detecta y sigue
  con el siguiente ticket.
- **Cualquier otro motivo:** no hagas nada durante la ejecución. Ese ticket lo retomas tú después, en
  modo interactivo.

Para cortar la ejecución antes de tiempo, pídeselo al agente en la misma sesión («para el workflow»).

### Al terminar

**Paso 14. Revisa el resultado.** Lee el resumen y repasa, ticket a ticket:
- el PR y su CI;
- las decisiones que el agente tomó por su cuenta: en la descripción Enhanced del ticket en Linear y
  en `design.md` → Follow-ups;
- el «porqué» de los PR y ADR, que escribió el agente y lleva su marca.

**Paso 15. Cierra la ejecución** (sección 8): interruptor a `"0"` y repaso de
`.claude/autonomous-denials.log`.

**Paso 16. Vuelve al modo interactivo.**
- Sal de la sesión autónoma con `/exit` y cierra esa terminal: en PowerShell, `CLAUDE_CONFIG_DIR`
  sigue puesta en ella.
- Para seguir trabajando, abre una sesión normal: `claude`, sin el perfil.
