# 22. Llamadas `exact` por tipo declarado en el analizador PHP (DIS-52)

> Sección 22 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Enriquecer la sub-issue

Texto literal enviado: `/enrich-us DIS-52`.

**Por qué funcionó.** La skill obliga a construir el Reality map antes de escribir el `[enhanced]`.
Al leer el código salió un dato que el ticket no daba: el test de rutas de DIS-49 exigía exactamente
dos aristas `calls`, y cualquier arista nueva lo iba a romper. Las cuatro dudas de alcance (llamadas
`$this->m()`, closures, `new` sin constructor y escritura en Linear) se presentaron como preguntas
cerradas, cada una con una recomendación, en vez de resolverlas el modelo por su cuenta.

**Ajuste humano.** La autora eligió las tres recomendaciones: las llamadas `$this->m()`/`self::m()`
entran como `exact`, las llamadas dentro de closures no tienen arista y `new X` sin `__construct` no
tiene arista. Después, una auditoría pidió una sola corrección en Linear: dejar explícitas en AC1
**las dos** aristas de ruta de DIS-49, no solo la del sitio 11.

### Prompt 2 — Ajuste de `new self` / `new static` antes del apply

Texto literal enviado (auditoría del change propuesto):

````
Auditoría de openspec/changes/php-declared-type-calls: aprobado con un ajuste. No implementes código ni pongas DIS-52 en In Progress todavía.

## Ajuste obligatorio — `new self()` vs `new static()`

Decisión del auditor:
- **`new self(...)` SÍ** genera `calls` `exact` al `__construct` del tipo contenedor, si ese tipo lo declara en su propio cuerpo (análogo a `self::m()` / forma (d)+(c)).
- **`new static(...)` NO** genera arista (late binding; coherente con `static::m()` fuera de alcance).

[...]

## Confirmado sin cambio

- Stryker solo `packages/core/src/**`: no ampliar; task 5.3 + fallos forzados bastan.
- Parámetro tipado en AC4 (`$p->now()`): se mantiene como non-goal explícito.
- Scenario de propiedad tipada con interfaz: se mantiene.

## Al terminar

- `npx openspec validate php-declared-type-calls --strict`
- Resume en 3–5 líneas el diff.
````

**Por qué funcionó.** El modelo había dejado `new self` sin arista como «supuesto a revisar» en
`design.md`, en lugar de decidirlo por su cuenta. La auditoría lo convirtió en una decisión firmada que
distingue `self` (enlace estático, exacto) de `static` (late binding). El escenario de instanciación
pasó a tener un oráculo propio: 4 aristas, con `new static()` sin aportar ninguna.

**Ajuste humano.** La decisión de `new self` / `new static` la tomó el auditor, no el modelo.

### Prompt 3 — Implementación completa

Texto literal enviado: `/opsx:apply php-declared-type-calls`.

**Por qué funcionó.** El orden lo marcaban `tasks.md` y la memoria del proyecto: DIS-52 en In
Progress primero, después la rama desde `feature/entrega-2-CRN`, el baseline, la comprobación de la
gramática con un script desechable y el TDD. La comprobación de la gramática encontró una diferencia
con el design: `new self()` llega como un `name`, no como `relative_scope`. Se anotó en `design.md`
antes de escribir el colector. La prueba manual contra la tabla de los 12 sitios de
`fixtures/README.md` dio 1, 2, 3, 5 y 11 como `exact` y ninguna arista para los heurísticos.

**Ajuste humano.** Ninguno durante la sesión. Sí hubo dos tropiezos del propio modelo, ambos
registrados en `tasks.md`:
1. El primer fallo forzado (fallback a `__call`) parecía no romper ningún test. La causa era que el
   `sed` no había aplicado la mutación y el `grep` que lo «confirmaba» encontraba la palabra en el
   TSDoc. Se rehízo con un script de node y entonces el test falló como debía.
2. Los tests 2.2–2.7 pasaron a verde a la primera, porque la implementación de 2.1 ya cubría todas
   las formas. No se maquilló como RED → GREEN: se anotó así, y la prueba de que pueden fallar son los
   tres fallos forzados.
