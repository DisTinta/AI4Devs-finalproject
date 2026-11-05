# 20. Contrato `AnalyzerPort`, `file-kind` y parser PHP Tree-sitter (DIS-47)

> Sección 20 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Auditoría del change antes de implementar

Texto literal enviado tras una auditoría externa que marcó el change `needs-fixes`:

````
Auditoría del change analyzer-port-and-php-structure: needs-fixes. No implementes código; solo corrige los artefactos OpenSpec y el [enhanced] de DIS-47.

## Fix bloqueante (obligatorio)

El fixture acme-shop tiene 35 clases con nombre, no 27.
Conteo verificado: 26 en app/, 2 en database/ (OrderFactory, DatabaseSeeder), 7 en tests/ (TestCase + 2 Feature + 4 Unit). El trait CreatesApplication NO cuenta como clase nombrada; las 5 migraciones anónimas tampoco.

Actualiza "27" → "35" en: [...]
[...]
Cuando termines: confirma validate --strict, lista los ficheros tocados y el diff conceptual (27→35 + opcionales).
````

**Por qué funcionó.** Dio el conteo exacto por carpeta y la regla de exclusión (trait y anónimas no
cuentan), así que el modelo pudo verificar con `grep` antes de tocar nada en vez de confiar en el
número. El fix bloqueante tocó 4 artefactos (spec, design, tasks, Linear); los dos opcionales
(contentHash/redacted, routes/config sin símbolos) se aceptaron porque eran baratos.

**Ajuste humano.** Ninguno sobre lo pedido explícitamente. El modelo sí detectó y corrigió un efecto
colateral no pedido: añadir el escenario opcional 5 subía el conteo de `#### Scenario:` de 11 a 12, así
que actualizó también el mapeo de la tarea 7.2 (`3.1 (2)` → `3.1 (3)`) para que no quedara
desincronizado con el nuevo escenario.

### Prompt 2 — Arranque de la implementación completa

Texto literal enviado: `pon DIS-47 a In Progress y  /opsx:apply`.

**Por qué funcionó.** Un comando corto disparó todo el protocolo ya acordado en `docs/project-context.md`
y `docs/openspec-tasks-mandatory-steps.md`: estado de Linear primero, rama desde `feature/entrega-2-CRN`,
y después las 44 tareas de `tasks.md` en TDD (RED → GREEN → REFACTOR) sin que hiciera falta reexplicar
nada del contrato ya fijado en `design.md`. El `/opsx:apply` resolvió instalación de dependencia
(`web-tree-sitter` + `tree-sitter-php`, WASM, sin compilación nativa), el contrato `AnalyzerPort`, la
regla `file-kind` en core y el analizador PHP completo (clases, interfaces, métodos, funciones, traits
codificados como `class`, clases anónimas) contra las 12 escenarios del delta spec, con las tres
pruebas de fallo forzado (6.3) y el ADR de la dependencia.

**Ajuste humano.** Ninguna corrección a mitad de sesión: la autora dejó correr el ciclo completo de
verificación (tests, lint, arquitectura, mutación, docs, prueba manual de la interfaz) sin intervenir.
