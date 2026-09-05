# Revisión de `fixtures/` y prompt de corrección

**Proyecto:** CODEMIND · fork `DisTinta/AI4Devs-finalproject`
**Rama revisada:** `feature/entrega-2-CRN` · commits `054f7ba` … `029b8dc`
**Fecha:** 29 de agosto de 2026
**Contenido:** (1) la petición, (2) el informe de revisión con la evidencia, (3) el prompt de corrección listo para pegar.

---

# 1. Petición

> analiza el resultado construido `fixtures/`, eres el ingeniero jefe y dime si consideras que cumple las necesidades reales del proyecto

Y a continuación:

> prepara un archivo con mi petición de análisis, tu respuesta y el prompt para solucionarlo todo con detalles claros y restricciones para que no divague.

---

# 2. Informe de revisión

**Veredicto:** la construcción es sólida en estructura, disciplina y documentación —por encima de lo que pedía el hito—, pero **tal como está compromete tres de las mediciones estrella del proyecto** (Tabla 1, F6 y Tabla 2) y contiene dos afirmaciones de verdad-terreno que son falsas. No lo aceptaría como cerrado.

El coste de arreglarlo ahora es de medio día a un día. El coste de arreglarlo después del hito 5 es mucho mayor, porque las semillas SQL versionadas y las ~12 respuestas cacheadas del modo demo se construyen a partir de estos árboles.

## 2.1. Método

No se dio por buena ninguna afirmación de `fixtures/README.md`: se comprobó cada una.

| Comprobación | Cómo | Resultado |
|---|---|---|
| Cobertura de los manifiestos de historia | script sobre `git ls-files` vs. `history/*.commits.mjs` | 52/52 y 38/38, sin huérfanos ni fantasmas |
| Determinismo de la reconstrucción | `build-history.mjs` × 2 en copia limpia, comparando SHA | idéntico: `64395b4…` y `fb24d1c…` |
| Limpieza del árbol tras reconstruir | `git status` en cada fixture | limpio |
| Fechas del drift | `git log -1 -- <fichero>` | doc 2024-02-19 · código 2024-05-02 (#61) ✔ |
| Aritmética del ejemplo de referencia | a mano sobre `Money` | 6200 → −620 → 5580 → +1172 → +490 = **7242** ✔ |
| Sintaxis PHP | `php-parser` sobre los 45 `.php` | 0 errores |
| Compilación TypeScript | `npx tsc --noEmit` | **3 errores** ✘ |
| Tests TypeScript | `npx vitest run` | 25/25 en verde ✔ |
| Secretos plantados | `gitleaks 8.24 detect --no-git` | **1 de 2 detectado** ✘ |
| Contaminación del corpus | `grep -rniE` sobre ficheros indexables | **26 de 90 ficheros** ✘ |

## 2.2. Lo que está bien

- **Cobertura de historia perfecta.** Los 90 ficheros versionados aparecen en los manifiestos: ningún fichero quedaría sin historia para el extractor de Git, y ninguna entrada apunta a un fichero inexistente.
- **Reconstrucción determinista y no destructiva.** Dos ejecuciones seguidas producen los mismos SHA; el guion restaura el árbol incluso si falla. 32 y 28 commits, 3 autores cada uno, 17 y 14 mensajes con `(#NN)`, orden cronológico correcto.
- **El drift por fecha funciona sobre un repositorio real**, que era el motivo de elegir el guion determinista frente al fichero de datos.
- **`docs/pricing.md` es internamente coherente con su propia regla equivocada** (ejemplo trabajado €108.90). No se delata por incoherencia interna, que es como habría fallado un fixture escrito con prisa.
- **Las 7 trampas de análisis son reales y bien elegidas**: facade, binding por contenedor, `__call`, atributos mágicos de Eloquent, ruta por string, job en cola y evento. Cubren el catálogo de lo que rompe el análisis estático en Laravel.
- **`task-api` es genuinamente limpio**: imports explícitos, sin `any`, sin despacho dinámico, validación Zod en el borde de la ruta. El contraste con `acme-shop` existe de verdad.
- **`fixtures/README.md` cubre los siete puntos pedidos** y `prompts.md` §9 registra la fase conforme a la norma §6 del roadmap.

## 2.3. Problema 1 — El corpus está contaminado: los fixtures le cuentan la respuesta al modelo

**Gravedad: alta. Es el único que, si llega al hito 6, invalida resultados ya publicados.**

26 de los 90 ficheros indexables llevan comentarios que narran el arnés en lugar de describir el dominio:

```
app/Services/PriceCalculator.php:13   * ORDER OF OPERATIONS (this is the reference demo question):
app/Services/PriceCalculator.php:24   * planted documentation drift (see fixtures/README.md).
config/shop.php:8                     * NOTE ON DRIFT: free_shipping_threshold was raised from 50.00 to 75.00...
config/shop.php:10                    * threshold. See fixtures/README.md → planted drift.
app/Services/DiscountService.php:16   *   c) volume discount — UNDOCUMENTED business rule (see below)
app/Services/DiscountService.php:18   * (c) is the planted "implemented and tested but undocumented" rule...
app/Services/CarrierGateway.php:12    * ANALYZER TRAP (__call): ...
app/Models/Order.php:16               * ANALYZER TRAP (Eloquent magic attributes): ...
... y 18 ficheros más
```

Consecuencias concretas, una por medición:

- **Q1 deja de medir lo que dice medir.** El docblock de `PriceCalculator` afirma en prosa *«discount is applied BEFORE tax»*. La respuesta ya no vive en la **relación** entre método, test e historial —que es la tesis entera del producto, readme §1.1— sino en un único fragmento recuperable por similitud. Un RAG ingenuo acierta Q1, y la Tabla 1 pierde el baseline contra el que se compara.
- **F6 queda regalada.** `config/shop.php` lleva un comentario titulado `NOTE ON DRIFT` que remite al inventario de drift. El detector de contradicciones «encontraría» la contradicción leyendo el aviso de que hay una contradicción. Lo mismo en `ShippingService.php:15-16`.
- **El Caso B ya no existe.** La regla «implementada y testeada pero **sin documentar**» está documentada: en el docblock de `DiscountService` y en el de `DiscountServiceTest`. Tal como está construido, ese caso no se puede demostrar.

Falsos positivos del grep, que **no** hay que tocar: `Money.php` («floating-point drift» es vocabulario de dominio) y `swagger.ts` («the spec never drifts from the validation», comentario plausible de un proyecto real).

## 2.4. Problema 2 — La historia es real en la forma y falsa en el contenido

`build-history.mjs` escribe, en cada toque no final de un fichero, **el contenido final más un marcador** `// hist:rN`. El resultado es que el diff de cada commit intermedio consiste en añadir o quitar ese marcador. El commit del drift lo enseña bien:

```
$ git show <sha> --format="%an | %ad | %s"
Marta Ibáñez | Thu May 2 14:49:00 2024 | fix: apply discount before tax and raise free-shipping threshold to 75 (#61)

--- a/app/Services/PriceCalculator.php
+++ b/app/Services/PriceCalculator.php
@@ -52,5 +52,3 @@
 }
-
-// hist:r12
```

El mensaje no se corresponde con el cambio. Qué sobrevive y qué no:

| Señal | ¿Funciona? |
|---|---|
| Co-cambio por pares de ficheros (HU3, `[git]`) | sí |
| Drift por fecha de último toque (F6) | sí |
| `pr_number` desde el mensaje | sí |
| Autoría y seudonimización | sí |
| Cualquier cosa derivada del **contenido** del diff (churn real, «por qué cambió esto») | no |

Dos motivos para arreglarlo: readme §1.1 vende el historial de Git como la fuente que dice **por qué** se cambió algo, y un evaluador que ejecute `git log -p` sobre el fixture ve una historia fabricada cuyos mensajes mienten — en un proyecto cuyo argumento central es verificar la evidencia en lugar de citarla. Además `fixtures/README.md` lo presenta como *«a real repository»* sin declarar el límite.

## 2.5. Problema 3 — Dos afirmaciones de la verdad-terreno son falsas

`fixtures/README.md` afirma que ambos secretos plantados son detectables por gitleaks. No es cierto:

```
$ gitleaks detect --no-git --source fixtures
total: 1
aws-access-token | fixtures/task-api/src/config/env.ts | line 12 | AKIAJ7FAKEFIXTURE42Q
```

El `APP_KEY` falso de `acme-shop/config/app.php` **no dispara ninguna regla**, así que el criterio de HU1 —indexar un fichero con secreto detectable y almacenarlo redactado— no tiene caso de prueba en el fixture PHP.

Dos detalles añadidos:

- La etiqueta `pragma: allowlist secret (fixture)` es sintaxis de **detect-secrets**, no de gitleaks (que usa `gitleaks:allow`). Hoy no hace nada; si alguien la «corrige» al dialecto correcto, suprimirá justo el hallazgo que se necesita.
- **Trampa #12 del inventario: la razón está mal.** La ruta es `'App\Http\Controllers\CheckoutController@store'`, ya cualificada por completo — no hay namespace que adivinar. Clasificarla como `heuristic` por ser una cadena es defendible; el motivo escrito no sustenta la afirmación. Es literalmente el modo de fallo que el Ticket 1 existe para cazar, dentro del documento de verdad-terreno.

## 2.6. Problema 4 — `task-api` no compila

```
$ npx tsc --noEmit
src/controllers/tasks.controller.ts(14,56): error TS2379 ... 'TaskQuery' with 'exactOptionalPropertyTypes: true'
src/controllers/tasks.controller.ts(30,58): error TS2379 ... 'CreateTaskInput' with 'exactOptionalPropertyTypes: true'
src/controllers/tasks.controller.ts(38,77): error TS2379 ... 'UpdateTaskInput' with 'exactOptionalPropertyTypes: true'
```

El fixture cuyo argumento entero es *«el compilador resuelve todas las referencias, por eso cada arista sale `exact`»* no pasa el `npm run typecheck` que él mismo declara en su `package.json`. Los 25 tests pasan, así que es un desajuste de estrictez y no comportamiento roto — pero tiene que estar verde antes de que el analizador TypeScript produzca la Tabla 2, y cualquiera que revise el fixture ejecutará ese script.

## 2.7. Menores, con nombre y apellidos

1. **La suite PHP no puede ejecutarse.** `tests/CreatesApplication.php` hace `require __DIR__.'/../bootstrap/app.php'` y no existe `bootstrap/`. Es coherente con «se analiza, no se despliega» (declarado en `acme-shop/README.md`), pero entonces hay que decirlo en la verdad-terreno: las cifras que sostienen Q1 descansan sobre código que nunca se ha ejecutado. La aritmética del €72.42 se verificó a mano en esta revisión.
2. **El readme está desactualizado respecto a su propio fixture:** §1.4 anuncia `47 files · 312 symbols · 1840 edges` y el fixture tiene 52 ficheros. En un proyecto sobre detectar documentación desincronizada, conviene marcar esas cifras como ilustrativas hasta que las emita el analizador.
3. **`CODEMIND-ROADMAP.md` sigue sin versionar.** La brújula declarada vive solo en esta máquina y el ✅ del hito 1 no está en el repositorio.
4. **Tabla 2: 12 + 10 anotados de 50 + 50.** El primer lote está bien y fija el formato; los 78 restantes son el trabajo de verdad y deberían tener sitio en la cola, no quedarse como *pending*.
5. Los tres commits de co-cambio de `task-api` (#15, #31, #40) comparten autor. Variarlo cuesta nada y hace la señal histórica más creíble.

## 2.8. Orden de ejecución recomendado

**1 → 3 → 4 → 2 → 5.** El problema 1 es el único que contamina resultados publicables; el 3 es una falsedad en el documento que sirve de verdad-terreno a todo lo demás; el 4 bloquea la Tabla 2; el 2 es honestidad metodológica y defensa ante el tribunal; el 5 es una decisión a tomar, no un arreglo.

---

# 3. Prompt de corrección

> Pegar íntegro como primer mensaje de una sesión nueva de Claude Code abierta en la raíz del repositorio, con la rama `feature/entrega-2-CRN` activa.
> Todo lo que sigue es el prompt.

---

## Contexto

Trabajas en **CODEMIND** (fork `DisTinta/AI4Devs-finalproject`). El hito 1 de la Entrega 2 —los fixtures `fixtures/acme-shop` y `fixtures/task-api`— está construido y commiteado en la rama `feature/entrega-2-CRN`. Una revisión de ingeniería ha encontrado cuatro defectos que hay que corregir **antes** de seguir con el esqueleto del monorepo.

Lee antes de tocar nada: `CODEMIND-ROADMAP.md`, `fixtures/README.md`, `readme.md` §1.1, §1.2, §2.5, §2.6 y §5 (HU1). El informe completo de la revisión está en `revision-fixtures-y-prompt-correccion.md` §2, en la raíz.

## Reglas duras — léelas dos veces

1. **Solo se toca `fixtures/`.** Nada de `packages/`, `docs/`, `openspec/`, `ai-specs/`, `.claude/`, harness, `docker-compose`, `Makefile` ni workspaces. El esqueleto del monorepo es el hito 2 y no es esta tarea.
2. **El comportamiento del dominio no cambia.** Ni un número. Siguen valiendo exactamente: orden descuento→impuesto, umbral de envío gratis `75.00`, IVA `21.0/23.0/20.0/19.0`, lealtad `5.0/10.0`, `VOLUME_LINE_THRESHOLD = 5`, `VOLUME_BONUS_PERCENT = 5.0`, `MAX_DISCOUNT_PERCENT = 30.0`, tarifas `490/590/690`, y el total del ejemplo trabajado **7242 céntimos (€72.42)**. Si un cambio tuyo mueve cualquiera de esas cifras, el cambio está mal.
3. **No se renombra ni se mueve ningún fichero existente.** No se borra ninguno salvo que este prompt lo diga.
4. **Todo fichero que añadas o elimines debe reflejarse en el manifiesto de historia correspondiente**, y la comprobación de cobertura (§ Verificación) tiene que seguir dando 0 huérfanos y 0 fantasmas.
5. **No toques `readme.md` ni `CODEMIND-ROADMAP.md` sin preguntar.** Hay dos cambios propuestos para ellos al final; se proponen, no se aplican por tu cuenta.
6. **No inventes.** Si una comprobación no la puedes ejecutar, dilo; no escribas en la verdad-terreno nada que no hayas verificado con un comando cuya salida puedas enseñar. Es el defecto que se está corrigiendo: no lo repitas.
7. **Commits pequeños, uno por defecto corregido.** No hagas push ni abras PR sin confirmación.

## Defecto 1 — Descontaminar el corpus (prioridad máxima)

Los ficheros indexables no pueden hablar del arnés. Un comentario puede explicar **el dominio**; no puede mencionar CODEMIND, fixtures, trampas de analizador, drift plantado, preguntas de demostración ni la verdad-terreno.

**Ficheros a limpiar** (19 en `acme-shop`, 7 en `task-api`):

```
acme-shop/README.md
acme-shop/composer.json                         ← description y keywords mencionan "fixture"/"CODEMIND"
acme-shop/config/app.php
acme-shop/config/shop.php
acme-shop/routes/api.php
acme-shop/routes/web.php
acme-shop/app/Facades/Pricing.php
acme-shop/app/Jobs/RecalculateTotals.php
acme-shop/app/Models/Order.php
acme-shop/app/Observers/OrderObserver.php
acme-shop/app/Providers/AppServiceProvider.php
acme-shop/app/Providers/EventServiceProvider.php
acme-shop/app/Services/CarrierGateway.php
acme-shop/app/Services/DiscountService.php
acme-shop/app/Services/PriceCalculator.php
acme-shop/app/Services/ShippingService.php
acme-shop/tests/Unit/DiscountServiceTest.php
acme-shop/tests/Unit/ShippingServiceTest.php
task-api/README.md
task-api/src/config/env.ts
task-api/src/domain/task-status.ts
task-api/src/plugins/swagger.ts
task-api/src/repositories/in-memory-task.repository.ts
task-api/src/services/task.service.ts
task-api/tests/integration/validation.test.ts
```

**No toques** `acme-shop/app/Support/Money.php` (su «floating-point drift» es vocabulario de dominio legítimo) ni la frase de `swagger.ts` sobre que la especificación no se desincroniza de la validación: son falsos positivos del grep.

Reglas de reescritura:

- Prohibidas en código y en los README de los fixtures, en cualquier idioma: `CODEMIND`, `fixture`, `harness`, `analyzer`, `ANALYZER TRAP`, `planted`, `drift` (salvo los dos falsos positivos citados), `ground truth`, `reference demo`, `demo question`, `undocumented`, `heuristic`/`exact` en el sentido de aristas, y cualquier referencia a `fixtures/README.md`.
- Sustituye cada comentario meta por uno que un desarrollador de ese proyecto habría escrito de verdad, o bórralo. `PriceCalculator` puede documentar sus parámetros; **no puede** enunciar el orden descuento-antes-de-impuesto en prosa: eso es la respuesta a Q1 y tiene que deducirse leyendo el código y sus tests.
- `acme-shop/README.md`: reescríbelo como el README de un proyecto real. Que remita a `docs/pricing.md` como referencia canónica de precios y **que no describa el orden de operaciones**. Fuera el párrafo «A note for readers».
- `docs/pricing.md` no se toca: su contenido equivocado es el material de F6 y ya es internamente coherente.
- `DiscountService`: fuera toda mención a que la regla de volumen no está documentada. La regla se queda tal cual en el código. Los **nombres** de los tests de `DiscountServiceTest` se quedan (un test se llama así en cualquier proyecto); lo que se va es el docblock que explica que son el caso plantado.
- `config/app.php` y `src/config/env.ts`: fuera los comentarios que anuncian el secreto falso (ver Defecto 3). El valor sigue siendo obviamente sintético y su declaración vive en `fixtures/README.md`, que no se indexa.

## Defecto 2 — Que los diffs digan la verdad

Hoy cada commit intermedio de `build-history.mjs` escribe el contenido final más un marcador `// hist:rN`, así que el diff de `fix: apply discount before tax and raise free-shipping threshold to 75 (#61)` consiste en borrar `// hist:r12`.

Implementación pedida, sin desviarte de ella:

1. Extiende el formato del manifiesto para que un fichero de un commit pueda declarar su contenido **anterior**:
   `files: ['config/shop.php']` sigue valiendo, y además se admite `files: [{ path: 'config/shop.php', before: 'snapshots/r31/config/shop.php' }]`, con la ruta relativa a `fixtures/history/`.
2. `build-history.mjs`: cuando un toque declara `before`, escribe ese contenido en ese commit en lugar del contenido final más marcador. El resto sigue con el marcador. El último toque de cada fichero sigue escribiendo el contenido final exacto.
3. Crea los snapshots **solo** para los commits con carga semántica, que son estos y ningún otro:

   | Fixture | Commit | Snapshot que hay que crear |
   |---|---|---|
   | acme-shop | `fix: apply discount before tax and raise free-shipping threshold to 75 (#61)` | versión previa de `PriceCalculator.php` (impuesto sobre el subtotal bruto) y de `config/shop.php` (`free_shipping_threshold => 50.00`) |
   | acme-shop | `refactor: extend shipping zones and discount stacking (#55)` | versión previa de `DiscountService.php` y `ShippingService.php` |
   | acme-shop | `refactor: tune loyalty tiers and shipping fees (#33)` | ídem, un escalón más atrás |
   | task-api | `refactor: tighten create and update validation (#31)` | versión previa de `task.schema.ts` y `task.service.ts` |
   | task-api | `refactor: align schema defaults with service (#40)` | ídem |

   Cada versión previa tiene que ser **código coherente que compila y cuadra con el mensaje del commit**: la de `PriceCalculator` anterior a #61 calcula el impuesto sobre el subtotal bruto —que es justo lo que `docs/pricing.md` sigue describiendo— y la de `config/shop.php` tiene el umbral en `50.00`. Así el documento no es que esté mal: es que **se quedó atrás**, y el commit #61 es la prueba fechada.
4. Documenta el mecanismo en `fixtures/README.md`, sin adornos: los commits con snapshot llevan un diff real, el resto son de relleno con un marcador y su valor es la señal de co-cambio, la fecha y el `pr_number`, no el contenido. Que se lea como una limitación declarada, porque lo es.

## Defecto 3 — Verdad-terreno verificada

1. **Secreto de `acme-shop`.** El `APP_KEY` falso de `config/app.php` no lo detecta gitleaks; comprobado con `gitleaks 8.24`. Sustitúyelo por un secreto plantado que **sí** dispare una regla y que sea plausible en un Laravel real: unas credenciales AWS en `config/services.php` (`'s3' => ['key' => 'AKIA…']`) son el camino corto, porque la regla `aws-access-token` ya se dispara con el patrón que usa `task-api`. Si añades `config/services.php`, añádelo también al manifiesto de historia (regla dura 4).
2. **Demuéstralo, no lo afirmes.** El criterio es la salida de `gitleaks detect --no-git --source fixtures`: exactamente **dos** hallazgos, uno por fixture. Pega esa salida en el informe final.
3. **Etiquetas.** Quita los `pragma: allowlist secret (fixture)`: son sintaxis de detect-secrets, no de gitleaks, y además incumplen el Defecto 1. **No** los sustituyas por `gitleaks:allow`, que suprimiría el hallazgo que HU1 necesita. La exención, cuando exista CI, irá en un `.gitleaksignore` a nivel de repositorio, por *fingerprint*; anótalo como pendiente del hito 2, no lo crees ahora.
4. **Trampa #12 del inventario.** Corrige la razón: la cadena está completamente cualificada, así que no hay namespace que adivinar. Sigue siendo `heuristic` porque es una cadena y no una referencia de clase, y el analizador tiene que aplicar la convención `Controlador@método` de Laravel. Revisa de paso las otras 21 filas del primer lote de la Tabla 2 con el mismo criterio: cada «Reason» tiene que ser cierta, no plausible.

## Defecto 4 — Que `task-api` compile

`npx tsc --noEmit` da tres `TS2379` en `src/controllers/tasks.controller.ts` (líneas 14, 30 y 38) por `exactOptionalPropertyTypes: true`.

- **No relajes el `tsconfig.json`.** Quitar `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess` o `strict` es exactamente la solución equivocada: la estrictez es lo que respalda la afirmación de que en este fixture el compilador resuelve todo.
- Arregla los tipos: alinea `TaskQuery`, `CreateTaskInput` y `UpdateTaskInput` con lo que Zod infiere realmente (propiedades opcionales que admiten `undefined`), o normaliza en el controlador antes de pasar al servicio. Lo que sea más idiomático; que no se note que fue un parche.
- Los 25 tests siguen pasando. Si alguno se cae, el arreglo está mal.

## Menor — decisión que no tomas tú

`acme-shop/tests/CreatesApplication.php` hace `require __DIR__.'/../bootstrap/app.php'` y no existe `bootstrap/`: la suite PHP no puede ejecutarse ni instalando `vendor/`. Hay dos salidas y **las presentas, no eliges**:

- **(a)** Declararlo en `fixtures/README.md`: el fixture PHP se analiza, no se ejecuta, y las cifras de Q1 están verificadas a mano. Coste cero, honesto, coherente con `acme-shop/README.md`.
- **(b)** Añadir un `bootstrap/app.php` mínimo para que PHPUnit arranque con `vendor/` instalado. Más trabajo y requiere PHP en el entorno.

Recomienda una en una frase y espera respuesta antes de tocar nada de esto.

## Verificación — todo esto tiene que pasar

Ejecuta y pega la salida real. Nada de «debería funcionar».

```bash
# 1. Historia: se reconstruye, es determinista y deja el árbol limpio
node fixtures/build-history.mjs
git -C fixtures/acme-shop rev-parse HEAD && git -C fixtures/task-api rev-parse HEAD
node fixtures/build-history.mjs          # los SHA deben repetirse
git -C fixtures/acme-shop status --short # vacío
git -C fixtures/task-api  status --short # vacío
git status --short                       # el repo padre, sin cambios en fuentes de fixtures

# 2. El commit del drift lleva un diff real que corresponde a su mensaje
git -C fixtures/acme-shop show $(git -C fixtures/acme-shop log --format=%H --grep="#61") --stat
git -C fixtures/acme-shop log -1 --format=%ad -- docs/pricing.md              # 2024-02-19
git -C fixtures/acme-shop log -1 --format=%ad -- app/Services/PriceCalculator.php  # 2024-05-02

# 3. Cobertura de los manifiestos: 0 huérfanos, 0 fantasmas
node -e "
const {execFileSync}=require('node:child_process');
(async()=>{for(const n of ['acme-shop','task-api']){
  const c=(await import('./fixtures/history/'+n+'.commits.mjs')).default;
  const m=new Set(c.flatMap(x=>x.files.map(f=>typeof f==='string'?f:f.path)));
  const t=execFileSync('git',['ls-files','fixtures/'+n],{encoding:'utf8'}).trim().split('\n').map(p=>p.replace('fixtures/'+n+'/',''));
  console.log(n,'tracked',t.length,'manifest',m.size,
    '| huerfanos',t.filter(f=>!m.has(f)),'| fantasmas',[...m].filter(f=>!t.includes(f)));
}})();"

# 4. TypeScript: compila y pasa
cd fixtures/task-api && npm install && npx tsc --noEmit && npx vitest run && cd ../..

# 5. PHP: parsea entero (php-parser vale; no hace falta PHP instalado)
# 6. Secretos: exactamente 2 hallazgos, uno por fixture
gitleaks detect --no-git --source fixtures -v

# 7. Descontaminación: 0 coincidencias fuera de la lista blanca
grep -rniE "codemind|analyzer trap|planted|ground truth|reference demo|demo question|undocumented|fixture" \
  fixtures/acme-shop fixtures/task-api \
  --include='*.php' --include='*.ts' --include='*.md' --include='*.json' --include='*.xml'
```

Criterios de aceptación, en corto:

- Los 7 bloques anteriores pasan; el 7 solo devuelve, como mucho, los dos falsos positivos declarados.
- Ninguna cifra del dominio ha cambiado; el ejemplo trabajado sigue dando **7242**.
- Los 5 commits con carga semántica tienen diff real; el resto queda declarado como relleno en `fixtures/README.md`.
- `fixtures/README.md` no contiene ninguna afirmación que no hayas verificado con uno de esos comandos.
- No existe ningún fichero nuevo fuera de `fixtures/`.

## Al cerrar

1. Informe final breve: qué se corrigió, salida de las verificaciones, y la recomendación (a)/(b) del menor pendiente.
2. Propón —sin aplicar— estos dos cambios, para que los decida la autora:
   - `readme.md` §1.4: marcar `47 files · 312 symbols · 1840 edges` como cifras ilustrativas hasta que las emita el analizador, o actualizarlas a los recuentos reales.
   - `CODEMIND-ROADMAP.md`: sigue sin versionar; la brújula del proyecto vive solo en local y el ✅ del hito 1 no está en el repositorio.
3. Aplica la norma §6 del roadmap sobre `prompts.md` **en esta misma sesión**: el prompt de corrección va literal, en bloque de código, dentro de §9, con su `**Ajuste humano.**`. Máximo 3 prompts por sección; si §9 ya tiene tres, sustituye el menos significativo y dilo en el informe.
