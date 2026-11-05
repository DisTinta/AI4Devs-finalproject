# 5. Historias de Usuario

> Sección 5 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Criterios de aceptación verificables

```
Adjunto la lista de funcionalidades de CODEMIND.

Escribe las 3 historias de usuario must-have en formato "Como / quiero /
para", cada una con criterios de aceptación en formato Dado-Cuando-Entonces.

Reglas para los criterios:
- cada uno debe poder convertirse en un test automático; si no es
  verificable, no lo incluyas
- incluye al menos un criterio de comportamiento negativo (qué NO debe
  hacer el sistema)
- incluye criterios de rendimiento con números concretos
- no repitas en los criterios lo que ya dice la narrativa de la historia

Después, revisa tu propio resultado y señala cuál de los criterios sería
más difícil de cumplir y por qué.
```

**Por qué funcionó.** Dos cosas. La exigencia de un criterio negativo produjo el mejor criterio del proyecto: *«dada una pregunta sin evidencia suficiente, el sistema responde que no lo sabe en lugar de generar una explicación plausible»*. Y la autorrevisión final identificó correctamente que el criterio de latencia (<10 s) sería el más difícil, dado que la verificación de evidencias añade una llamada al modelo.

**Ajuste humano.** Subí la estimación de la HU2 de 13 a 21 puntos precisamente por lo que señaló la autorrevisión. Y reescribí el criterio de la HU1 sobre multi-lenguaje para que dijera **«sin que el núcleo haya cambiado»**: así el criterio de aceptación de una historia de usuario es comprobable con un `git diff`, no con una opinión.

### Prompt 2 — Priorización del backlog

```
Tengo 7 funcionalidades candidatas para CODEMIND y 13 semanas, con la
documentación entregada en la semana 6 y el código funcional en la 10.

Ayúdame a clasificarlas en must-have y should-have. Criterio de decisión: el
proyecto se evalúa por idea/arquitectura, calidad de código y uso de IA — no
por número de funcionalidades.

Para cada una que propongas como must, dime qué se rompe si falta. Si algo
es must solo porque "queda bien", dímelo.
```

**Ajuste humano.** El modelo proponía como *should* la funcionalidad de poder probar el sistema sin configurar nada. **La subí a must**, y fue la decisión de producto más importante que tomé: al no haber ni vídeo ni capturas de un sistema en marcha, esa funcionalidad **es** toda la evidencia de funcionamiento del proyecto. Lo que empezó siendo comodidad para el usuario acabó siendo el soporte de la evaluación.
