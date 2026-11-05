# 45. Confianza calculada, pesos publicados y salida del modelo con valla (DIS-72)

> Sección 45 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Aplicar el change

La sesión de apply arrancó con el comando, sin más texto: `/opsx:apply`.

**Por qué funcionó.** Las decisiones D1–D4 de la autora, los valores por defecto D5–D8 y las respuestas
Q1–Q3 al spec-audit fijaban las seis señales, la fórmula sin término independiente y los tipos de
entrada propios de `knowledge/confidence.ts`, así que los pasos 1–8 avanzaron sin paradas. Varios tests
pasaron nada más escribirse (las señales se implementaron de una vez) y se registraron como tests de
caracterización; la comprobación de que el test de sincronía doc ↔ código muerde (un peso cambiado solo
en un lado) y Stryker (97,06 %, solo sobreviven los mensajes del `RangeError`) confirmaron que no eran
vacíos.

**Ajuste humano.** La autora aprobó la lista de preguntas de desarrollo propuesta y eligió
`qwen2.5-coder` para responder y verificar.

### Prompt 2 — Preguntar por qué fallaba el modelo

Tras una primera sesión de pesos en la que todas las respuestas acabaron en `UNKNOWN`:

```
que se necesita para que funcione? que tipo de modelo?
```

**Por qué funcionó.** En lugar de proponer un modelo mayor, la pregunta llevó a leer el log de Ollama:
recortaba cada prompt a 2 050 tokens (`truncating input prompt`) y se perdía el system prompt con la
instrucción de responder en JSON. El fallo no era del modelo, y probablemente tampoco lo fue en DIS-70.
Se resolvió sirviendo Ollama con `OLLAMA_CONTEXT_LENGTH=16384`, sin código.

### Prompt 3 — Resolver las vallas de JSON en el mismo change

```
si y voy a querer que resuelvas en esta tarea lo de las vallas de json, no quiero dejar flecos y ahora que ha salido el problema lo vas a resolver
```

**Por qué funcionó.** El hallazgo se llevó primero a los artefactos con `/opsx:update` (delta `MODIFIED`
de `claims-and-typing`, decisión C9, grupo de tareas 8b) y después al código por TDD. La cuarentena
acepta solo una valla que envuelva toda la salida, y el tamaño y el evento siguen usando el texto
crudo; se descartó `response_format` por depender del proveedor.

**Ajuste humano.** Con el prompt completo, en CPU cada pregunta tardaba más que el límite de 300 s, así
que la sesión de pesos usó un `fetch` propio en un script del scratchpad. Con 5 respuestas reales, la
autora mantuvo los pesos iniciales con los motivos recomendados («si son los motivos que aconsejas,
confío en ti»). Pidió además una tarea nueva (DIS-101) para documentar en el readme los tiempos con
modelo real y el flujo de trabajo con IA.
