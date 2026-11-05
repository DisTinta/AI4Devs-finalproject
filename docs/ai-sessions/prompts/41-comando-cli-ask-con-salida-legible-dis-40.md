# 41. Comando CLI `ask` con salida legible (DIS-40)

> Sección 41 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Aplicar el change

La sesión de apply arrancó con el comando, sin más texto: `/opsx:apply`.

**Por qué funcionó.** La issue enriquecida (P1–P5) y el design (D1–D9) fijaban el orden de las
comprobaciones, la tabla de errores y el formato línea a línea, así que el apply solo paró para lo
que la tarea 12.3 reserva a la autora: qué modelo usar en la ejecución live.

**Ajuste humano.** La autora eligió `llama3.2`, el único modelo de chat instalado.

### Prompt 2 — Llevar Ollama a CPU

Ollama devolvía `500` y el modelo dio por imposible la ejecución live («live run not possible»).
La autora preguntó y corrigió:

```
¿que pasa con Ollama?
```

```
la vez anterior que usaste Ollama tuviste que llevarlo directo a CPU por que mi ordenador es algo antiguo y te funcionó
```

**Por qué funcionó.** Remitía a una solución ya probada (DIS-17, informe del paso 12 de
`llm-adapter`): el modelo la encontró en el archivo y la reaplicó, en lugar de dejar el paso sin
evidencia live.

**Ajuste humano.** `CUDA_VISIBLE_DEVICES=-1` ya no bastaba: Ollama 0.40.2 pasaba a Vulkan, que también
se caía con el prompt largo; hubo que ocultar también Vulkan (`GGML_VK_VISIBLE_DEVICES=-1`,
`OLLAMA_LLM_LIBRARY=cpu`). En CPU, `ask` funcionó de punta a punta y respondió
`UNKNOWN (invalid-model-output)`: el modelo de 3B no produce el JSON estricto que pide `explain`.
