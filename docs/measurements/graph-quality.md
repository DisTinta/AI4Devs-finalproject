# Calidad del grafo: cobertura y precisión por analizador

*(Texto del agente, ejecución autónoma, 2026-11-03. Cambio `graph-quality-measurement`, DIS-79.)*

Informe de la medición que rellena la Tabla 2 de [`readme.md`](../../readme.md) §2.6. Las cifras salen de
[`graph-quality.json`](graph-quality.json), que escribe `npm run measure:graph` (`scripts/measure-graph.mjs`);
`tests/unit/docs/graph-quality.spec.ts` comprueba que el JSON es lo que da hoy la medición y que las tres
secciones de este informe que se pueden leer con una máquina coinciden con él.

## Método

- **Entradas.** Las aristas del grafo son las filas de `edge` de `seeds/graph-dump.sql` (las que
  `npm run db:seed` carga), no una base de datos viva: la medición no necesita PostgreSQL, ni red, ni un modelo.
  El JSON registra la huella del analizador de la cabecera de la semilla
  (`analyzer-fingerprint: sha256:c7da76cae0637280c2b3aefbb14e0ef36bf475ffbcbb8e3796e7c924d38796df`); el job
  `verify` de la CI hace fallar una semilla desfasada respecto a los analizadores. La referencia son los dos ficheros
  `fixtures/annotations/<proyecto>.callsites.json`: 50 sitios de llamada por lenguaje.
- **Congelación.** Antes de leer nada más, el script compara el SHA-256 de los nueve ficheros de la sección
  `## Hashes SHA-256` de [`annotation-agreement.md`](annotation-agreement.md) con los registrados allí. Si uno
  difiere sale con código 1 y no escribe nada. Esta medición no modifica ninguna fuente congelada.
- **Independencia.** La medición la ejecutó un agente que no anotó ningún sitio.
- **Reproducción.** `npm run measure:graph` da los mismos bytes en Bash, `pwsh` y `powershell.exe`.

### Definiciones

- **Ámbito de un sitio.** Aristas `calls` del proyecto cuyo origen es un símbolo declarado en el fichero del sitio
  con `inicio ≤ línea ≤ fin`, o el propio fichero del sitio. Se admiten todos los símbolos que lo envuelven (un método
  y su clase), no solo el más interno.
- **Acierto.** Arista del ámbito cuyo destino es el símbolo `target.symbol` declarado en `target.file`. No se compara
  el nombre del origen. Si hay varios aciertos se registra el de la resolución esperada o, si no hay, el primero de la semilla.
- **Arista atribuida.** Arista del ámbito cuyo destino es el anotado, o un símbolo cuyo último segmento de nombre
  (tras `::`) es el nombre llamado del sitio: el último identificador de la llamada, `__construct` o `constructor` para
  `new`, y para una lectura la propiedad, su forma camelCase y `get<Studly>Attribute`.
- **Falso positivo.** Arista atribuida que no es el acierto de ningún sitio del proyecto, contada una vez por proyecto.
- **Resultado de un sitio.** `tp` (esperado distinto de `none` y con acierto), `fn` (esperado distinto de `none` y sin
  acierto), `fp` (esperado `none` con una arista atribuida que es falso positivo) y `tn` (el resto).
- **Cobertura** = `tp / positivos`, con positivos los sitios cuyo esperado no es `none`. **Precisión** =
  `tp / (tp + falsos positivos)`. **Resolución coincidente** = aciertos cuya `resolution` es la esperada, sobre los
  aciertos. Las aristas `exact` y `heuristic` son todas las aristas `calls` del proyecto. Una medida con denominador 0
  es `no definida`.

## Resultados

| Proyecto | Cobertura | Precisión | Resolución coincidente | Aristas exact | Aristas heuristic |
|---|---|---|---|---|---|
| `acme-shop` | 77,4 % (24/31) | 100,0 % (24/24) | 100,0 % (24/24) | 47 | 17 |
| `task-api` | 100,0 % (26/26) | 100,0 % (26/26) | 100,0 % (26/26) | 37 | 0 |

Concordancia entre anotadores, de [`agreement.json`](annotation/agreement.json): `acme-shop`, concordancia
100 % (50/50), kappa 1; `task-api`, concordancia 100 % (50/50), kappa 1.

## Desglose por construcción

### acme-shop

| Construcción | Sitios | Aciertos | Fallos | Falsos positivos |
|---|---|---|---|---|
| facade | 7 | 4 | 1 | 0 |
| container-binding | 4 | 0 | 1 | 0 |
| magic-call | 5 | 1 | 0 | 0 |
| eloquent-read | 6 | 5 | 0 | 0 |
| string-route | 1 | 1 | 0 | 0 |
| array-route | 2 | 2 | 0 | 0 |
| job-dispatch | 2 | 2 | 0 | 0 |
| event | 2 | 2 | 0 | 0 |
| framework-function | 8 | 0 | 0 | 0 |
| other | 13 | 7 | 5 | 0 |

### task-api

| Construcción | Sitios | Aciertos | Fallos | Falsos positivos |
|---|---|---|---|---|
| imported-function | 9 | 9 | 0 | 0 |
| interface-method | 4 | 4 | 0 | 0 |
| new | 5 | 4 | 0 | 0 |
| method-reference | 5 | 5 | 0 | 0 |
| callback | 4 | 0 | 0 | 0 |
| reexport | 0 | 0 | 0 | 0 |
| stdlib | 7 | 0 | 0 | 0 |
| zod | 5 | 0 | 0 | 0 |
| fastify | 6 | 0 | 0 | 0 |
| other | 5 | 4 | 0 | 0 |

Las filas con cero aciertos y cero fallos (por ejemplo `framework-function` o `stdlib`) son construcciones cuyos
sitios están anotados como `none`: el analizador no debe emitir arista y no la emite (verdaderos negativos).

## Sitios fallados

| Id | Resultado | Llamada | Sitio | Aristas atribuidas |
|---|---|---|---|---|
| `php-14` | fn | `$request->lines(` | `app/Http/Controllers/CheckoutController.php:23` | — |
| `php-18` | fn | `Pricing::compute(` | `app/Http/Controllers/OrderController.php:35` | — |
| `php-35` | fn | `$app->make(` | `app/Providers/AppServiceProvider.php:44` | — |
| `php-38` | fn | `$subtotal->percentage(` | `app/Services/DiscountService.php:42` | — |
| `php-39` | fn | `$discount->isGreaterThan(` | `app/Services/DiscountService.php:44` | — |
| `php-41` | fn | `$order->lineCount(` | `app/Services/DiscountService.php:62` | — |
| `php-47` | fn | `$base->percentage(` | `app/Services/TaxService.php:26` | — |

Los siete fallos son de PHP y en todos falta una arista del ámbito del sitio hacia el destino anotado; ninguna arista
del ámbito se atribuye a un sitio fallado. El informe no investiga la causa de cada uno. Corregir los analizadores por
estos fallos queda fuera de esta medición (mejora futura).

## Limitaciones

- **Atribución por nombre llamado.** Puede no detectar una arista errónea cuyo destino tiene otro nombre, y puede
  contar como falso positivo una arista correcta de una llamada no anotada con el mismo nombre en el mismo ámbito.
  El recuento de falsos positivos es, por tanto, aproximado en los dos sentidos. En esta medición es 0 en los dos
  proyectos.
- **Anotación por agentes de dos modelos distintos de una misma familia** (`claude-opus-5-5` y `claude-sonnet-5-5`):
  no hay anotadores de fuera de esa familia. La concordancia entre ellos (100 % y kappa 1 en los dos lenguajes, sin
  desacuerdos) está en [`annotation-agreement.md`](annotation-agreement.md); una concordancia perfecta no demuestra que
  la referencia sea correcta, solo que los dos anotadores coinciden.
- **Muestra pequeña y creada a propósito:** 50 sitios por lenguaje en dos repositorios de muestra construidos para
  el proyecto, que incluyen casos difíciles elegidos por construcción. Las cifras describen estos 100 sitios, no código
  de terceros.
- **Una sola ejecución:** la medición es determinista, pero no se repite sobre otras muestras ni otras semillas.
