# 81. Suite E2E con Playwright y job `e2e` en CI (DIS-75)

> Sección 81 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Paso de apply del cambio `e2e-playwright-suite` en la ejecución autónoma

El encargo del paso `apply` del workflow para el change `e2e-playwright-suite` es el texto estándar de las ejecuciones autónomas, igual que en [§63](63-analizador-typescript-estructura-spans-y-aristas-dis-30.md) salvo el ticket, la rama y el change; no se repite aquí.

**Por qué funcionó.** El `design.md` fijaba las opciones de Playwright, el módulo de opciones separado del
fichero raíz, los selectores por rol y el job de CI copiado del de `verify`, así que el agente solo tenía que
escribir cada test en rojo y completarlo (texto del agente).

**Ajuste humano.** Ninguno: ejecución autónoma (texto del agente). Tres cosas no seguían el plan al pie de la
letra: el campo de la pregunta se alcanza con `getByRole('textbox', { name: 'Pregunta' })`, porque
`getByLabel('Pregunta')` también casa con el botón «Preguntar»; el marco de página tiene `overflow-hidden`, de
modo que un elemento inyectado en `main` no ensanchaba el documento y la comprobación de desbordamiento mira
también `main`; y un Vite arrancado sin `--host 127.0.0.1` solo escucha en `localhost`, así que no contaba
como puerto ocupado en la prueba 11.2.
