# 57. Experimento: workflow autónomo para cerrar la Entrega 2 (DIS-101)

> Sección 57 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

Las últimas tareas de la Entrega 2 (DIS-76, DIS-78, DIS-21, DIS-26, DIS-34, DIS-44, DIS-45, DIS-58,
DIS-60, DIS-65, DIS-66 y esta DIS-101) se hicieron con la herramienta
Workflow de Claude Code: un subagente con contexto limpio por paso, en serie, sin la autora en las
puertas del plan, de los tests y del merge (ADR `20261016-autonomous-workflow-run-entrega-2`). El
planteamiento está en `docs/ai-sessions/04-experimento-workflow-autonomo-entrega-2.md` y el resultado,
con cifras, en `readme.md` §8.6. Los prompts de cada paso de esos tickets están en su propia sección
(§47 en adelante); aquí solo están los de la autora que dieron forma al experimento.

### Prompt 1 — Preguntar si el resto de la entrega se podía hacer sin la autora

```
¿hay alguna forma para que hicieras el resto de tareas de Linear (CODEMIND — Entrega 2)  en automático con el flujo definido? Y si te surgen preguntas o decisiones investigues como ingeniero de software jefe para ressolverlas sin tener que preguntarme? No tendrías que mostrar en esta terminal nada más que al final una lista de los tickets resueltos y un mensaje tipo tareas finalizadas.
¿como ves esta idea? es posible? ¿cómo se tendría que hacer?
```

**Por qué funcionó.** Preguntar «¿cómo se tendría que hacer?» en lugar de pedir que lo hiciera llevó a
una respuesta con los choques antes que con el plan: los principios 2, 3, 8 y 9 de
`docs/base-standards.md` (puerta humana en el plan, tests supervisados, el porqué escrito por una
persona, merges firmados) y DIS-34, definida como no delegable. Cada choque se convirtió en una
decisión explícita de la autora, y el conjunto en un ADR, en vez de quedar como una excepción
silenciosa.

### Prompt 2 — Las decisiones de la autora

Respuesta a las opciones cerradas que propuso el agente:

```
- la B, el híbrido.
- el merge lo harías tú
- Ollama lo intentas (las últimas pruebas salieron bien, revisa tu memoria)
- el porqué lo pones tú

alguna pregunta mas? entonces explícame cual sería el plan
```

**Por qué funcionó.** Opciones cerradas con su consecuencia escrita permiten decidir en cuatro líneas.
En un mensaje posterior la autora autorizó el tamaño dinámico del workflow, pidió que cada ticket
empezara con `/enrich-us`, que DIS-101 contara el experimento y que se midieran los tokens antes y
después de un piloto, para comprobar la estimación de coste en lugar de aceptarla.

### Prompt 3 — Lanzar la tanda 2

Prompt literal: `sí, lanza la tanda 2`.

**Por qué funcionó.** A partir de aquí no hay más prompts de la autora: las instrucciones de cada paso
(«YOUR STEP 3/6 — implement…», citada en la §53) las genera el script del workflow con los datos de
cada ticket, y no son prompts de la autora. Este ticket, DIS-101, lo redactó el agente dentro de esa
tanda; sus decisiones (D1 en adelante) están en la descripción Enhanced del ticket en Linear.

### Prompt 4 — Lanzar DIS-65 y DIS-66 tras el merge de la Pantalla 1

```
ya hice el merge del #54, lanza DIS-65 y DIS-66 (DIS-101 marca conflictos en el archivo prompts.md)
```

**Por qué funcionó.** La tanda 2 había saltado DIS-65 y DIS-66 porque dependían de DIS-60, cuyo merge
denegó el clasificador. Con el #54 ya fusionado, una línea bastó para lanzar una tanda 3 solo con esos
dos tickets, sobre la rama de entrega actualizada.

**Ajuste humano.** Lo que la autora hizo durante la ejecución, que el readme cuenta como lecciones:

- Fusionó a mano los PR cuyo merge denegó el clasificador de permisos (#45, #49, #51, #52, #54 y #56;
  el #55 de este ticket espera su merge) y, tras el piloto, añadió una regla de permiso para
  `gh pr merge`. Cuando el clasificador siguió denegando
  algunos, descartó cualquier rodeo: «vale, nos quedamos con la espera».
- En DIS-34 revisó las tres respuestas *golden*, pidió regenerar una («Q1 ok, Q4 ok, regenera Q3, he
  firmado Q1 y Q4, cuando veamos Q3 acabo las firmas») y las firmó. Antes había pedido al agente que
  firmase en su nombre, y el agente se negó.
- Tras la parada nocturna de DIS-58 desactivó en local la confirmación de instalación de dependencias
  y pidió a cambio una comprobación automática: «he añadido la rule. Pero puedes ponerle una cpa de
  verificación de que el paquete exista y no sea un paquete malicioso?».
- Aplicó en Windows Defender la exclusión del falso positivo que rompía dos tests de git en local.
