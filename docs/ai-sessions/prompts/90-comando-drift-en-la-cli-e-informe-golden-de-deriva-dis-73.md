# 90. Comando `drift` en la CLI e informe golden de deriva (DIS-73)

> Sección 90 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

Esta sección se escribió el 05-11-2026, en la sesión de la §89, para cerrar uno de los dos huecos del registro que
señala el readme (§8.2): el bloque autónomo de la deriva no la dejó escrita. El prompt es el encargo literal del paso
de apply que el workflow guardado genera para este change (`.claude/workflows/autonomous-sdd.js`), igual que en las
§86–§88; el resto sale de los informes del change archivado
(`openspec/changes/archive/2026-11-04-add-cli-drift/`).

### Prompt 1 — Paso de apply del cambio `add-cli-drift` en la ejecución autónoma

El encargo del paso `apply` del workflow para el change `add-cli-drift` es el texto estándar de las ejecuciones autónomas, igual que en [§63](63-analizador-typescript-estructura-spans-y-aristas-dis-30.md) salvo el ticket, la rama y el change; no se repite aquí.

**Por qué funcionó.** La auditoría necesitó tres rondas (dos `CHANGES REQUIRED` y un `APPROVED`). Sus hallazgos
fijaron antes del apply el orden de la lectura del reloj, qué rechazos escriben fila en `query_log`, que el golden se
genere después de las tareas que tocan sus huellas, y cómo forzar el modo evaluación en la captura de PowerShell, así
que el apply no tuvo que decidir nada de producto (texto del agente).

**Ajuste humano.** Ninguno en el apply: ejecución autónoma, PR #107. `npm run drift:build` falló en la primera
ejecución porque Ollama servía con 2 048 tokens de contexto y recortaba los prompts; el agente paró la segunda para leer
las salidas en bruto, Ollama se reinició con `OLLAMA_CONTEXT_LENGTH=16384`, y la tercera escribió el informe en 7
minutos. El informe no está revisado: encuentra la
deriva del envío gratis (50 € frente a 75 €), no encuentra la del impuesto antes del descuento, y una de sus dos
contradicciones es un falso positivo. Se publica así, y lo dicen `fixtures/README.md`, `docs/DEMO.md` y la guía de
evaluación del readme.
