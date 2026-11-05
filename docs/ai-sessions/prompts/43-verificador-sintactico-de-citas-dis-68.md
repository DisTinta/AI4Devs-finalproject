# 43. Verificador sintáctico de citas (DIS-68)

> Sección 43 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Aplicar el change

La sesión de apply arrancó con el comando, sin más texto: `/opsx:apply evidence-verifier-syntactic`.

**Por qué funcionó.** Las decisiones D1–D7 de la issue y el design (V1–V12) fijaban el commit y la raíz
de la relectura, la regla del texto esperado (una sola función compartida con el pack) y el evento
`evidence_broken`, así que el apply solo paró en el modelo de la prueba en vivo. Varios tests pasaron
nada más escribirse porque la regla extraída en la tarea 1.1 ya los cubría; se comprobó con mutaciones
manuales y con Stryker que no eran vacíos, y los supervivientes con sentido (el fallo de lote que no es
`missing`, U+FFFF, la cita sin corte más larga que el límite) se cerraron con tests en el mismo change.

**Ajuste humano.** La autora eligió un stub local compatible con OpenAI, fuera del repositorio, en lugar
de `llama3.2` para el paso 10: es determinista y sirvió también para provocar el `range-out-of-file`
real (un símbolo cuyo rango pasa del final de su fichero), que `ask` escribió en stderr con nivel
`error` y respondió `UNKNOWN (broken-evidence)`.
