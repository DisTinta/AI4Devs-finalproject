# 15. Arnés de integración: transacción por test y factories (DIS-22)

> Sección 15 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Propuesta OpenSpec desde la sub-issue

Comando literal en Claude Code, rama `feature/entrega-2-CRN`. El agente leyó DIS-22 con el MCP de
Linear, el `support.ts` existente y la HU padre CM-HU-02 (PH-23): `/opsx:propose DIS-22`.

**Por qué funcionó.** Antes de escribir nada, el agente vio que `support.ts` ya tenía `withRollback`
y el gate de `DATABASE_URL`, y que lo usaban tres specs de constraints. Además, anticipó el choque
del `COMMIT` de `saveGraph` (DIS-23) con la transacción del test.

**Ajuste humano.** La autora rechazó la pregunta de alcance con opciones cerradas y respondió con
su propio criterio (Prompt 2).

### Prompt 2 — Alcance: helpers nuevos sin migrar los specs existentes

Texto literal enviado:

````
Helpers = API nueva para DIS-23+ (db.ts con hooks + factories.ts).
support.ts se adelgaza: reutiliza DATABASE_URL/conexión de helpers; conserva withRollback, describeWithDatabase, migrateSharedDatabase, SQLSTATE como API estable de los specs actuales.
Non-goal explícito: no migrar graph-schema-constraints, history-claims-constraints, indexes-stale (ni migrations.spec.ts).
Un solo gate de “sin DATABASE_URL → skip local / fail en CI”; no duplicarlo.
El test de ejemplo vive en tests/integration/ (o helpers smoke), no reescribe los de constraints.
````

**Ajuste humano.** La autora fijó que hay un solo gate, que no se migra ningún spec y que el
anidamiento con `SAVEPOINT` queda para DIS-23. La detección del `COMMIT` por xid la propuso el
agente, y la autora la aceptó.

### Prompt 3 — Afinado del change antes del apply

Texto literal enviado (extracto de la corrección 1, que es la que cambió el resultado):

````
1) design.md — Riesgo de orden de hooks (y cualquier consejo/TSDoc previsto):
   - El default de Vitest 1.x `sequence.hooks` es `'stack'`, NO `'parallel'`
     (docs: https://vitest.dev/config/sequence#sequence-hooks).
   - Con `'stack'`, los `afterEach` corren en orden inverso al de registro (LIFO).
````

**Ajuste humano.** El agente aplicó las correcciones 2 a 7, pero la 1 no. En el Vitest instalado
(1.6.1) el default real es `'parallel'` (`cli-api`: `hooks ?? "parallel"`), y el `'stack'` llegó
en la 2.0. La autora eligió la opción A: mantener el default y limpiar en el cuerpo del test, en
lugar de fijar `sequence.hooks: 'stack'`. Durante el apply salió además un caso no previsto: una
transacción abortada (`25P02`) hacía fallar la comprobación de fin de test. Se corrigió y se
añadió el escenario a la spec.
