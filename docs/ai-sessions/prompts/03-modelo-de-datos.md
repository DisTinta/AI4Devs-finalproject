# 3. Modelo de Datos

> Sección 3 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Traducir una decisión conceptual a esquema

```
CODEMIND distingue entre conocimiento observado (extraído por un parser, sin
LLM) y conocimiento inferido (producido por un LLM a partir de evidencias).
Esa distinción es central: no quiero que una inferencia pueda presentarse
nunca como un hecho.

Diseña el esquema PostgreSQL que hace esa distinción IMPOSIBLE de violar a
nivel de base de datos, no solo por convención en el código.

Incluye: entidades, tipos exactos, claves primarias y foráneas,
restricciones CHECK, e índices necesarios para travesía del grafo y búsqueda
vectorial con pgvector.
Entrégalo como diagrama Mermaid erDiagram más el DDL de las restricciones.
```

**Por qué funcionó.** «Imposible de violar a nivel de base de datos» es lo que produjo las dos restricciones `CHECK` que son, probablemente, el detalle del que estoy más satisfecha:

```sql
ALTER TABLE claim ADD CONSTRAINT fact_only_from_l1
  CHECK (type <> 'FACT' OR layer = 'L1');

ALTER TABLE claim ADD CONSTRAINT l2_requires_provenance
  CHECK (layer <> 'L2' OR provenance IS NOT NULL);
```

Un principio de diseño que la base de datos hace cumplir no se erosiona con las prisas.

**Ajuste humano.** El primer esquema tenía `layer` y `type` fusionados en un solo campo. **Los separé**: `layer` dice de dónde salió la afirmación, `type` dice qué garantía tiene. Son cosas distintas y fusionarlas habría impedido justamente la restricción que quería.

### Prompt 2 — Campo `resolution` en las aristas

```
Problema concreto. En PHP/Laravel, muchas llamadas no se pueden resolver con
certeza: facades, bindings del contenedor de servicios, rutas por string,
atributos mágicos de Eloquent. En TypeScript, en cambio, el compilador las
resuelve con precisión.

Quiero que el grafo refleje esa diferencia de fiabilidad en lugar de
esconderla, y que se propague hasta la respuesta que ve el usuario.

Propón el diseño. Debe permitir: (a) filtrar por fiabilidad al recuperar
contexto, (b) impedir que una arista poco fiable sustente un hecho, y
(c) comparar la calidad de los dos analizadores con datos.
```

**Ajuste humano.** El diseño propuesto usaba una puntuación continua de 0 a 1. **Lo cambié a un enum de dos valores, `exact` | `heuristic`.** Una puntuación continua obliga a elegir umbrales que no puedo justificar con datos, y da una precisión aparente que no tengo. Dos valores son honestos y suficientes para las tres cosas que pedía. Añadí también el campo `extractor`, que no estaba propuesto, para poder auditar el origen de cada arista y comparar analizadores.

### Prompt 3 — Incrementalidad e invalidación

```
El README afirma que CODEMIND mantiene una "memoria viva" del proyecto, pero
no tengo diseñado qué pasa cuando llegan commits nuevos. Reindexar todo en
cada cambio no es viable.

Diseña la política de actualización incremental, incluyendo qué ocurre con
las inferencias del LLM cuyo código de soporte ha cambiado.

Sé concreta sobre el mecanismo: qué campo dispara la invalidación, cuándo se
recalcula, y qué se muestra al usuario mientras un dato está obsoleto.
```

**Ajuste humano.** Acepté el mecanismo —`content_hash` por fichero, `status = stale` en los claims afectados, re-inferencia perezosa— y descarté la propuesta de un sistema de versionado completo del grafo. Es correcto en abstracto y no cabe en 13 semanas. Queda anotado como trabajo futuro.
