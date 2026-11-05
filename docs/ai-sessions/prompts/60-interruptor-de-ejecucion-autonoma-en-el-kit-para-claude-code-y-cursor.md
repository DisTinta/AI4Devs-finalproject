# 60. Interruptor de ejecución autónoma en el kit, para Claude Code y Cursor (DIS-106)

> Sección 60 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Pedir el interruptor sin bloqueos

Con el experimento de la sección 57 todavía en marcha en otra sesión, la autora pidió añadir a su nota
para el repositorio del kit (`sdd-harness-kit-cambios-desde-codemind.md`) una sección final con el
interruptor:

```
Perfecto, gracias. Ahora, quiero una sección final donde se le pida un interruptor para utilizar el workflow de agentes que se está usando en la otra sesión, que se ha encargado de hacer todas las tareas de la entrega-2 hasta hacer los merge, utilizando el flujo de trabajo sdd y los auditores-revisores. Pero quiero que antes averigües como se tendría que configurar al completo para que los bloqueos que han surgido no ocurran. Un flujo de trabajo sin incidencias ni bloqueos para un workflow de agentes ¿me explico bien? si necesitas hacerme preguntas hazlas
```

### Prompt 2 — Llevarlo a este repositorio

```
/plan para aplicar en este repositorio lo necesario para cubrir esta necesidad del workflow autónomo ¿que necesitaríamos hacer?
```

El plan se convirtió en DIS-106 y en el change `autonomous-run-switch`, que pasó nueve rondas del
`spec-auditor` antes de aplicarse.

### Prompt 3 — Retomar al día siguiente y probarlo en vivo

```
/opsx:apply autonomous-run-switch
  Seguimos con DIS-106 desde la nota dis106-resume: primero arregla el fallo de CI de autonomous-protect en Linux del PR #61 y corrige el informe de la sección 11; después guíame con el paso 12.
```

**Por qué funcionó** (texto del agente, escrito a petición de la autora). Cada bloqueo del experimento
de la sección 57 se convirtió en un requisito con escenario y test: la confirmación de instalación, en
una comprobación automática del paquete; el merge denegado, en una puerta que lee el estado real del PR
en GitHub más una autorización en un perfil aparte; el `rmdir` parado, en una regla para el
scratchpad; los informes perdidos de los forks, en un modo en línea de las revisiones. Los hooks pasaron
a tener una suite de tests propia (`tests/harness/`) que ejecuta los scripts reales, y la prueba en
vivo del paso 12 encontró lo que la suite no veía: el doctor confundía una protección ilegible con una
rota cuando la cuenta de `gh` activa no era administradora, y un test que solo fallaba en Linux.

**Ajuste humano.** La autora respondió las preguntas abiertas de cada ronda de auditoría (dos modos en
vez de uno, el perfil aparte, la protección de la rama base con `enforce_admins`, el «porqué» escrito
por el agente), protegió `final-project-CRN` en GitHub cuando el clasificador denegó hacerlo al agente,
creó el perfil autónomo, cambió a mano el interruptor y la base en cada paso de la prueba en seco y
lanzó el merge desde la sesión del perfil. En el paso 12 rechazó el `git reset --hard` de prueba,
preguntó si había sido ella quien aprobó el primero (el agente lo había atribuido al auto mode y lo
corrigió tras revisar los tiempos de la transcripción) y no aceptó la oferta de la sesión del perfil
de integrar el PR #61 de verdad cuando un prompt pegado llegó cortado.
