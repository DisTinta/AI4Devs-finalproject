# Revisión de las respuestas de la Tabla 1 (columna «Correctas»)

Informe del cambio `answer-review` (DIS-82). Texto del agente que ejecutó el ticket; la autora no ha
juzgado ni revisado ninguna respuesta.

## Método

La columna «Correctas (de 20)» de la Tabla 1 cuenta, por repositorio de ejemplo, las respuestas de la
medición de contexto que son correctas. Son 40 respuestas: las 20 de `acme-shop` (PHP/Laravel) y las 20
de `task-api` (TypeScript), en `docs/measurements/context/answers/acme-shop.json` y
`docs/measurements/context/answers/task-api.json`. Se juzgaron así:

1. El criterio (`docs/measurements/answer-review/criterion.md`) se commiteó en `dcaaf00` (2026-11-03),
   antes de que ningún revisor leyera una respuesta. Define tres veredictos (`correct`, `partial`,
   `incorrect`), cómo se juzga una respuesta `UNKNOWN` según el campo `expected` de la pregunta, y que se
   juzga solo contra el código ejecutable del repositorio de ejemplo.
   El criterio se escribió y se congeló antes de leer ninguna respuesta.
2. El juicio lo hicieron dos agentes revisores independientes de modelos distintos, ciegos entre sí, ciegos
   a cómo se produjeron las respuestas y a las cifras de la medición, que juzgaron las 40 respuestas con
   el mismo criterio y solo desde una lista de fuentes permitidas: revisor 1, `claude-opus-5-5`
   (`docs/measurements/answer-review/reviewer-1.json`); revisor 2, `claude-sonnet-5-5`
   (`docs/measurements/answer-review/reviewer-2.json`). Fecha: 2026-11-03.
3. `node scripts/answer-review.mjs agreement` validó ambas salidas y calculó la concordancia
   (`docs/measurements/answer-review/agreement.json`).
4. Un tercer agente (resolutor, `claude-opus-5-5`, contexto nuevo) resolvió solo los desacuerdos, sin leer
   `agreement.json` (`docs/measurements/answer-review/resolution.json`).
5. `node scripts/answer-review.mjs merge` generó, sin edición manual, `docs/measurements/answer-review/verdicts.csv`
   (una fila por respuesta; una respuesta acordada toma el veredicto común y la razón del revisor 1, un
   desacuerdo toma la resolución; cada fila enlaza el criterio).
6. Este informe registra los hashes SHA-256 de los ocho ficheros congelados; el test
   `tests/unit/docs/answer-review.spec.ts` falla si alguno cambia.

Antes del panel se comprobó la ceguera con una búsqueda sin distinguir mayúsculas de `qwen`, `ollama`,
`llm_`, `inputtokens`, `baselinetokens`, `outputtokens` y `latenc` sobre el criterio, los dos ficheros de
respuestas, `questions.json`, `docs/base-standards.md`, el `tasks.md` del cambio, el código de aplicación de
los dos repositorios de ejemplo y la descripción del ticket en Linear: cero coincidencias (se repitió sobre
los ficheros al cerrar el cambio, con el mismo resultado).

## Resultados

Recuento de `verdicts.csv` (20 respuestas por repositorio):

| Repositorio | Correctas | Parciales | Incorrectas |
|---|---|---|---|
| `acme-shop` | 10 | 9 | 1 |
| `task-api` | 12 | 2 | 6 |

## Concordancia

Concordancia entre los dos revisores antes de la resolución (de `docs/measurements/answer-review/agreement.json`):
porcentaje de respuestas con el mismo veredicto y kappa de Cohen sin ponderar sobre los tres veredictos.

- `acme-shop`: 10 correctas, 9 parciales, 1 incorrectas (de 20); concordancia entre revisores 95 % (19/20), kappa 0,908
- `task-api`: 12 correctas, 2 parciales, 6 incorrectas (de 20); concordancia entre revisores 90 % (18/20), kappa 0,826

## Desacuerdos

Tres de las 40 respuestas. La resolución (`docs/measurements/answer-review/resolution.json`, resolutor
`claude-opus-5-5`) decidió cada una con la cita del código que la sostiene:

| Repositorio | Pregunta | Revisor 1 | Revisor 2 | Resolución |
|---|---|---|---|---|
| `acme-shop` | Q06 | `partial` | `correct` | `partial` |
| `task-api` | Q02 | `correct` | `partial` | `correct` |
| `task-api` | Q03 | `incorrect` | `partial` | `incorrect` |

- `acme-shop` Q06: la regla del envío gratis es cierta, pero la respuesta dice que se compara el «monto
  total» y el código compara la base descontada (`app/Services/PriceCalculator.php:29-32`).
- `task-api` Q02: la respuesta describe lo que devuelve `buildPage` sin nada falso; no nombra `pageCount`
  (`src/domain/pagination.ts:19`), que la pregunta no pide de forma explícita.
- `task-api` Q03: la pregunta pide las transiciones válidas y la respuesta no da ninguna, solo dice dónde
  se definen (`src/domain/task-status.ts:13-19`).

En dos de los tres la resolución coincide con el revisor 1 (el mismo modelo que el resolutor) y en uno con
el revisor 2; con tres casos no hay base para decir que el resolutor favorezca a ninguno.

## Limitaciones

- Las fuentes leídas (`sourcesRead`) las declara cada agente; la validación detecta una lectura declarada
  fuera de la lista permitida, no una lectura oculta.
- Los dos revisores y el resolutor son modelos de una misma familia (una misma familia de un solo
  proveedor): no son jueces independientes en el sentido de personas distintas, y un sesgo compartido no se
  vería en la concordancia. La concordancia se informa tal cual, sin interpretarla más allá de su valor.
- Las respuestas proceden de una sola ejecución de la medición, sin repeticiones; los veredictos valen para
  esas 40 respuestas, no para el producto en general.
- Con 20 respuestas por repositorio el kappa es inestable: un solo desacuerdo más lo mueve varias
  centésimas. Se informan también los porcentajes y los recuentos.
- La búsqueda de ceguera cubre los ficheros y la descripción del ticket que se listan en el método. El
  resolutor podía leer además `docs/AUTONOMOUS-RUN.md`, que tiene una línea genérica sobre el campo
  `ollama` del workflow: no nombra ningún identificador de modelo ni ninguna cifra de estas respuestas, y se
  acepta. Las respuestas `UNKNOWN` con `reason` `invalid-model-output` delatan que un modelo las escribió,
  pero no cuál.
- «Parcial» e «incorrecta» dependen de qué se considera una afirmación central. El criterio la define
  como la necesaria para contestar la pregunta tal como está formulada, y los casos límite fueron los tres
  desacuerdos de arriba.
- El criterio dice que una afirmación sobre `tests/`, `docs/` o `README.md` de un fixture se juzga solo
  por el comportamiento que enuncia, contra el código de aplicación: 12 de las 134 entradas de `evidence`
  apuntan a esas rutas. La regla evita leer esos ficheros, pero no impide que un revisor los lea; solo se
  detecta una lectura declarada.
- Las dos salidas de los revisores se commitearon juntas, después de que ambos terminaran, así que ninguno
  pudo leer la del otro en el repositorio.

## Hashes SHA-256

Calculados con `node scripts/answer-review.mjs hashes`. Los dos ficheros de respuestas de la medición de
contexto están en el conjunto: si se repite la medición, la revisión deja de valer y este informe tiene que
regenerarse.

| Fichero | SHA-256 |
|---|---|
| docs/measurements/answer-review/criterion.md | 6b802c38c0e3b4d28303105ea0421d8c63c62c07b75cd35886090b6115aec11d |
| docs/measurements/answer-review/reviewer-1.json | d062e645851c22e61bdee0566c5e097367736400af1fbf4f93b6f48bcb2dd9ed |
| docs/measurements/answer-review/reviewer-2.json | 95a50495a9284f6ba8eb8a8a1b62d9ef030f0bce7ec5a53304fb0e1d66a48f4b |
| docs/measurements/answer-review/resolution.json | 8bf331d75cb8bd4f1b4472c6a426519468d1c7f13b6001ca9bb837c9e6e50964 |
| docs/measurements/answer-review/agreement.json | 585210e7da5f2b91f0c71af1284522cef8fc597661dd1556368f62a443eee836 |
| docs/measurements/answer-review/verdicts.csv | 52cb02430feeef8106817fc1d3c7b079d709a039af098a76d09ab1a9f1dc4988 |
| docs/measurements/context/answers/acme-shop.json | cd60866dc6be631ad9b390fdb2e30fb33602a1279e0a45d6122c0935006aaf0b |
| docs/measurements/context/answers/task-api.json | 239484ea51f48149cd98f4b573faff4dcecebd9d50a7caf09542ebb4403bb241 |
