# 39. Afirmaciones tipadas y cuarentena de la salida del modelo (DIS-38)

> Sección 39 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Cerrar las decisiones antes de proponer

Tras `/enrich-us DIS-38`, el modelo propuso cuatro decisiones abiertas. La más delicada era que el
`CHECK` `fact_only_from_l1` impide guardar como `FACT` una afirmación escrita por el modelo (capa `L2`).
La autora rechazó el formulario de opciones y respondió con este texto:

```
Ajusta la spec de DIS-38 (claims-and-typing) añadiendo:
- Decisión 1 = opción 3: DIS-38 NO decide cómo se persiste un statement FACT. Los tipos de dominio replican
los CHECK de 0002_history-claims (fact_only_from_l1, l2_requires_provenance, claim_confidence_range) de forma
que Claim{type: FACT, layer: L2} no sea representable (test de tipos o de constructor). El tipo del statement
(FACT/INFERENCE/UNKNOWN) que devuelve typing-rules es independiente de layer. Sin ADR en este cambio.
- Decisiones 2–4 = opción 1. Escenarios explícitos: (a) la salida del modelo trae "type" u otra clave extra →
.strict() la rechaza entera, se descarta y se audita como schema_violation; (b) evidenceId desconocido → se
descarta toda la salida y se audita con un subcódigo distinguible (p. ej. unknown_evidence_id) dentro de
schema_violation; (c) cadena con alguna arista heuristic → INFERENCE; FACT solo si toda la evidencia es exact.
- Límites: nombra cada uno (bytes totales de la salida, longitud del texto de un statement, nº máx. de
statements, etc.) y asígnale su valor (64KiB/2000/20/500/10) como constantes exportadas y provisionales, con
una línea de porqué cada una. Tests de borde n acepta / n+1 rechaza para cada límite.
- Define qué pasa con evidenceIds vacío y con ids duplicados dentro de un statement (schema_violation o
deduplicación: elige uno y añade su escenario).
- Auditoría de una salida descartada: guarda motivo, subcódigo, tamaño y hash de la salida, NUNCA el contenido
en bruto del modelo. Lanza /privacy-ethics-check sobre este punto.
```

**Por qué funcionó.** Sacar la persistencia de `FACT` del ticket (se trasladó como pregunta a DIS-39)
dejó DIS-38 en funciones puras sin decisiones de arquitectura pendientes. Al pedir el
`/privacy-ethics-check` sobre el evento salió el hueco real: en Zod 4, el issue `unrecognized_keys`
lleva en `keys` los nombres de clave que inventa el modelo, así que el evento copia solo `path` y `code`.

**Ajuste humano.** Para ids duplicados el modelo eligió rechazar en lugar de deduplicar, porque
deduplicar sería reinterpretar la salida, y lo dejó como escenario.

### Prompt 2 — Auditar la spec antes del apply

```
has usado al agente `spec-auditor` ?
```

**Por qué funcionó.** El modelo no lo había usado. Al lanzarlo salieron tres Major: una restricción
inventada (`subject` no vacío), una contradicción con `docs/backend-standards.md` §4, y que el diseño
no decía `z.strictObject()` cuando `z.object()` de Zod 4 descarta las claves desconocidas sin avisar.
Una segunda revisión, hecha en otra sesión, añadió la definición real de `origin` (un span que
sustituye a otros hereda el mejor) y el conjunto cerrado de subcódigos.

**Ajuste humano.** La autora pidió razonamiento y permiso antes de aplicar la segunda revisión; el
modelo separó lo ya aplicado de lo pendiente y señaló que uno de los cambios pedidos apuntaba a una
sección distinta de Linear.

### Prompt 3 — Decidir cómo se cuentan los caracteres

El caso extra de la tarea 4.9 (499 `a` y un emoji) falló: Zod 4.6.5 mide `.max` en code points, no en
unidades UTF-16 como decían la spec y el diseño. El modelo paró el apply y presentó dos opciones; la
autora respondió:

```
Opción 1 aprobada: las longitudes se cuentan en code points de Unicode. Ajusta DIS-38 (change
claims-and-typing):
```

(seguido de cinco puntos: spec, D6 con Risks y Follow-ups, JSDoc de `limits.ts`, la tarea 4.9 con los
dos lados del borde, y Linear).

**Por qué funcionó.** El test que el `spec-auditor` pidió para distinguir unidades UTF-16 de code points
encontró que la premisa del diseño era falsa (`node_modules/zod/v4/core/checks.js:273`). Como la
aserción nueva nacía verde, el modelo la comprobó con un mutante que mide en UTF-16, y el mutante hizo
fallar el test.

**Ajuste humano.** El hook de cierre no dejaba terminar el turno con la suite en rojo mientras se
esperaba la decisión. El modelo aisló el caso en un `it.skip` sin commitear, lo dijo, y lo quitó al
recibir la respuesta. No tocó la configuración local del kit, que es de la autora.
