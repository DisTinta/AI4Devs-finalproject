# 40. Caso de uso `explain`, política `UNKNOWN` y persistencia de afirmaciones (DIS-39)

> Sección 40 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Aplicar el change

La sesión de apply arrancó con el comando, sin más texto: `/opsx:apply`.

**Por qué funcionó.** La issue enriquecida y el change ya cerraban cada decisión (D1, D5, D6, los
códigos nuevos, el tope de 20 afirmaciones previas), así que el apply no tuvo que preguntar nada salvo
lo que la tarea 9.11 reserva a la autora. La medida antes/después de 39c salió del mismo script con el
mismo método: Q1 pasó de 145 procesos git y 10,8 s a 6 procesos y 0,58 s.

**Ajuste humano.** En la parada de la tarea 9.11 el modelo presentó la mediana y dos opciones; la
autora eligió **sin tope** de ficheros por paquete, y la decisión quedó en `design.md` → Follow-ups.
