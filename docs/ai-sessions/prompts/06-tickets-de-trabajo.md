# 6. Tickets de Trabajo

> Sección 6 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Ticket del componente diferencial

```
Escribe el ticket de trabajo para el verificador de evidencias de CODEMIND:
el componente que comprueba, para cada afirmación de una respuesta generada,
si sus citas la sustentan realmente.

Nivel de detalle: alguien que no conozca el proyecto debe poder
implementarlo de principio a fin con este ticket.

Incluye: descripción, tareas numeradas, criterios de aceptación, definición
de hecho, dependencias y estimación.

Requisito específico: un criterio de aceptación que acote el coste añadido
en llamadas al LLM, porque este componente añade una llamada por consulta y
no quiero que duplique la factura.
```

**Ajuste humano.** Añadí la tarea 7 (cachear resultados por par afirmación-span), que no estaba y es lo que hace alcanzable el criterio de coste que yo misma había pedido. Es un caso claro de haber pedido un límite sin dar el mecanismo para respetarlo: el modelo puso el criterio, pero no la forma de cumplirlo.

### Prompt 2 — Ticket de base de datos con las restricciones como entregable

```
Escribe el ticket de base de datos de CODEMIND, a partir del modelo de datos
adjunto.

Debe incluir explícitamente como tareas:
- las dos restricciones CHECK que protegen la distinción FACT/INFERENCE
- el trigger de invalidación de claims cuando cambia el hash de un fichero
- la generación de las semillas con los dos repositorios de muestra ya
  indexados

Y un criterio de aceptación que verifique que insertar un FACT en la capa
inferida falla EN LA BASE DE DATOS, no en la aplicación.
```

**Ajuste humano.** Ninguno de fondo. Sí añadí el criterio sobre `npm run db:seed`: que deje el sistema consultable sin necesidad de tener PHP instalado ni de clonar repositorios ajenos. Es lo que hace que el arranque local funcione como evidencia.

### Prompt 3 — Ticket de frontend con la evidencia como objetivo de diseño

```
Escribe el ticket de la pantalla principal de la web de CODEMIND.

El objetivo de diseño no es que sea bonita: es que la fiabilidad de la
respuesta sea legible de un vistazo. Concretamente, que una afirmación
inferida se distinga de un hecho SIN necesidad de leer texto adicional, y
que el ahorro de tokens se vea sin abrir ningún panel.

Incluye los componentes a construir, criterios de aceptación, accesibilidad
y el test E2E que lo cubre.

La definición de hecho NO puede incluir capturas de pantalla: la evidencia
del proyecto es la demo alojada y el arranque local.
```

**Ajuste humano.** La propuesta inicial distinguía hechos de inferencias solo por color. **Lo cambié**: color más icono más etiqueta textual. Depender del color excluye a quien no lo distingue, y en un sistema cuyo argumento central es la fiabilidad de la información sería una contradicción incómoda.

**Nota posterior.** La última línea del prompt —«la definición de hecho NO puede incluir capturas de pantalla»— sigue vigente para la definición de hecho del ticket, que se cierra con el E2E y con `docs/DEMO.md`. Lo que cambió es la sección 1.3 del README, que ahora sí lleva wireframes: son la referencia de diseño **de entrada** para construir la pantalla, no la prueba **de salida** de que funciona.
