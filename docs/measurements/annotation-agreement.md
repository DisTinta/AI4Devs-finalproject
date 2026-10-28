# Concordancia de la anotación de sitios de llamada (Tabla 2)

Informe del cambio `callsite-annotations` (DIS-80). Texto del agente que ejecutó el ticket; la autora
no ha anotado ni revisado ningún sitio.

## Método

La referencia de la Tabla 2 (calidad del grafo por analizador) son 50 sitios de llamada por proyecto de
ejemplo, `acme-shop` (PHP) y `task-api` (TypeScript), 100 en total. Se anotaron así:

1. La preparación del ticket eligió los sitios (`docs/measurements/annotation/acme-shop.sites.json` y
   `docs/measurements/annotation/task-api.sites.json`): los 12 + 10 sitios de control, que son las 22
   filas de control de `fixtures/README.md`, anteriores a este ticket, y 38 + 40 sitios nuevos del
   código de aplicación. Transcribió además el control en `docs/measurements/annotation/control.json` y
   registró la construcción de cada sitio en `docs/measurements/annotation/selection.json`, todo
   commiteado antes de que ningún anotador juzgara.
2. La anotación la hicieron dos agentes anotadores independientes de modelos distintos, ciegos entre sí
   y ciegos al control, que anotaron los 100 sitios con el mismo criterio escrito de antemano (`exact`, `heuristic`, `none`) y
   solo desde una lista de fuentes permitidas: panelista 1, `claude-opus-5-5`
   (`docs/measurements/annotation/panelist-1.json`); panelista 2, `claude-sonnet-5-5`
   (`docs/measurements/annotation/panelist-2.json`). Fecha: 2026-10-28.
3. `node scripts/annotation-agreement.mjs agreement` validó ambas salidas y calculó la concordancia
   (`docs/measurements/annotation/agreement.json`).
4. Un tercer agente (resolutor, `claude-opus-5-5`, contexto nuevo) resolvió solo los desacuerdos, sin
   leer `agreement.json` (`docs/measurements/annotation/resolution.json`).
5. `node scripts/annotation-agreement.mjs merge` generó, sin edición manual, los dos ficheros finales
   `fixtures/annotations/acme-shop.callsites.json` y `fixtures/annotations/task-api.callsites.json`
   (formato 1; un sitio acordado toma la respuesta común y la razón del panelista 1, un desacuerdo toma
   la resolución).
6. Este informe registra los hashes SHA-256 de los nueve ficheros congelados; el test
   `tests/unit/docs/annotation-freeze.spec.ts` falla si alguno cambia.

## Selección por construcción

Copiada de `docs/measurements/annotation/selection.json`. `Instancias` es el número de instancias de la
construcción en el código de aplicación (para `other`, su número de sitios); `Control` son los sitios de
control de la fila y `Nuevos` los demás.

### acme-shop

| Construcción | Instancias | Control | Nuevos |
|---|---|---|---|
| facade | 12 | php-08, php-09 | php-18, php-22, php-23, php-24, php-49 |
| container-binding | 11 | — | php-32, php-33, php-34, php-35 |
| magic-call | 5 | php-07 | php-13, php-17, php-36, php-37 |
| eloquent-read | 27 | php-04 | php-16, php-27, php-40, php-42, php-46 |
| string-route | 1 | php-12 | — |
| array-route | 2 | php-11 | php-50 |
| job-dispatch | 2 | php-10 | php-31 |
| event | 2 | php-06 | php-30 |
| framework-function | 44 | — | php-15, php-19, php-20, php-25, php-26, php-44, php-45, php-48 |
| other | 13 | php-01, php-02, php-03, php-05 | php-14, php-21, php-28, php-29, php-38, php-39, php-41, php-43, php-47 |

### task-api

| Construcción | Instancias | Control | Nuevos |
|---|---|---|---|
| imported-function | 11 | ts-01, ts-02, ts-04, ts-05, ts-06 | ts-12, ts-13, ts-36, ts-42 |
| interface-method | 5 | ts-09 | ts-45, ts-47, ts-50 |
| new | 7 | — | ts-21, ts-22, ts-27, ts-44, ts-48 |
| method-reference | 11 | ts-08 | ts-15, ts-28, ts-30, ts-31 |
| callback | 5 | — | ts-23, ts-24, ts-34, ts-40 |
| reexport | 0 | — | — |
| stdlib | 29 | ts-10 | ts-19, ts-20, ts-25, ts-26, ts-38, ts-39 |
| zod | 81 | — | ts-16, ts-17, ts-32, ts-33, ts-35 |
| fastify | 38 | ts-07 | ts-11, ts-14, ts-18, ts-29, ts-37 |
| other | 5 | ts-03 | ts-41, ts-43, ts-46, ts-49 |

La fila `reexport` de `task-api` tiene 0 instancias: el único barrel (`src/schemas/index.ts`) se importa
para tipos y para valores de esquema que se referencian, nunca se llama. No se inventó un sitio para
rellenarla.

## Concordancia entre los panelistas

Concordancia = mismo `expected` y mismo `target` (`file` y `symbol`). Kappa de Cohen sobre `expected`
con las categorías `exact`, `heuristic` y `none`.

| Proyecto | n | Acordados | Porcentaje | Kappa | Desacuerdos |
|---|---|---|---|---|---|
| acme-shop | 50 | 50 | 100 | 1 | 0 |
| task-api | 50 | 50 | 100 | 1 | 0 |

Sitios por valor de `expected` en la anotación final:

| Proyecto | exact | heuristic | none |
|---|---|---|---|
| acme-shop | 14 | 17 | 19 |
| task-api | 26 | 0 | 24 |

`task-api` no tiene ningún sitio `heuristic`: TypeScript tiene menos construcciones que dependen de una
convención de framework que PHP, que es el contraste esperado de la Tabla 2 y no un sesgo de selección.

## Concordancia con el control

Sobre los sitios de control de cada proyecto (12 en `acme-shop`, 10 en `task-api`); el kappa es
orientativo por el tamaño de la muestra.

| Proyecto | Panelista | n | Acordados | Porcentaje | Kappa (orientativo) |
|---|---|---|---|---|---|
| acme-shop | 1 | 12 | 12 | 100 | 1 |
| acme-shop | 2 | 12 | 12 | 100 | 1 |
| task-api | 1 | 10 | 10 | 100 | 1 |
| task-api | 2 | 10 | 10 | 100 | 1 |

## Desacuerdos

Ninguno.

Los dos panelistas dieron la misma respuesta en los 100 sitios, así que la resolución
(`docs/measurements/annotation/resolution.json`, resolutor `claude-opus-5-5`) no contiene ninguna
respuesta, todos los sitios llevan `decidedBy: "agreement"` y no hubo desempate.

## Discrepancias con el control

Ninguna.

La anotación final de los 22 sitios de control coincide con `docs/measurements/annotation/control.json`
(mismo `expected` y mismo `target`), y el control no se editó.

## Limitaciones

- Las fuentes leídas (`sourcesRead`) las declara cada agente; la validación detecta una lectura
  declarada fuera de la lista permitida, no una lectura oculta.
- Los dos panelistas son modelos de una misma familia: no son anotadores independientes en el sentido
  de personas distintas, y un sesgo compartido no se vería en la concordancia. El 100 % de concordancia
  se informa tal cual, sin interpretarlo más allá de su valor.
- El criterio de `exact`, `heuristic` y `none` lo escribió un agente que había leído el control de
  `fixtures/README.md` (nombra clases de construcción, nunca sitios), y las notas de ejecución dadas a
  los panelistas nombran `fixtures/README.md` como el lugar del control. El README siguió prohibido
  como fuente.
- La construcción `reexport` de `task-api` no tiene ninguna instancia en el código de aplicación, así
  que ninguna llamada pasa por una reexportación en este proyecto de ejemplo.
- La concordancia con el control se mide sobre 12 y 10 sitios; su kappa es orientativo.

## Hashes SHA-256

Calculados con `node scripts/annotation-agreement.mjs hashes`. `selection.json` no está en el conjunto
congelado: se commiteó antes del panel y el test de congelación comprueba que la tabla de selección de
este informe coincide con él.

| Fichero | SHA-256 |
|---|---|
| docs/measurements/annotation/acme-shop.sites.json | 9a9cff1d48865501f2a9262b98ccc1779aab3f6c93a7b7c5eaa0023d4b411718 |
| docs/measurements/annotation/task-api.sites.json | 75088de5d76d473270fa0cebf5bf042b927005882392a5c831fe494cf6fc34c1 |
| docs/measurements/annotation/control.json | 18b65aecfe6f35d204478f5e1d8a03769c5056639904dac6a11b908738da58e2 |
| docs/measurements/annotation/panelist-1.json | 15d5bfc15f2691e281b24c148a818d515e9a417e4e918edcf80fce15293cddbf |
| docs/measurements/annotation/panelist-2.json | 1b06822fe13d1d387f5fd2b79eeb0fbf55e84dbfbbd35c70a4f8e6ef92aa8062 |
| docs/measurements/annotation/resolution.json | e5021f1497b67eb0214d160a880f20cc65dd7b2da3773a67b773ede742667ec6 |
| docs/measurements/annotation/agreement.json | 0716be23ebfd2403df063d83150b66fa9871279de53bc314c5b320438423ba6a |
| fixtures/annotations/acme-shop.callsites.json | 4389d1b64b45103cebaf680577f2b64fb2c729ff295a510394eddf75761a416f |
| fixtures/annotations/task-api.callsites.json | 8364de464383f767a35b0942ed6ae84ccbc9720172dd9281d22e702903a17814 |
