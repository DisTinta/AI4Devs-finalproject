# 1. Descripción general del producto

> Sección 1 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Crítica adversarial de la propuesta inicial

Contexto: había escrito una primera propuesta de 40 páginas y quería saber si se sostenía antes de invertir semanas en ella.

```
Actúa como un revisor exigente de propuestas de proyecto técnico.

Adjunto CODEMIND.md, mi propuesta de proyecto final.

No quiero que la mejores ni que la reescribas. Quiero que la audites y me
digas qué grietas tiene, ordenadas por gravedad: qué se cae en cuanto
alguien pregunte, qué es inconsistente entre secciones, y qué falta.

Presta atención específicamente a:
- afirmaciones que no puedo demostrar con lo que propongo construir
- contradicciones entre lo que declaro como principio y lo que planifico
- viabilidad técnica real de la extracción de código que doy por hecha
- si el alcance es ejecutable por una persona

Para cada grieta: qué es, por qué importa, y qué cambio concreto la cierra.
Si algo está bien, no lo menciones — no necesito validación, necesito los
problemas.
```

**Por qué funcionó.** Tres elementos: prohibir la reescritura, pedir orden por gravedad, y prohibir explícitamente el refuerzo positivo. Sin la última frase, la mitad de la respuesta habría sido «tu idea es sólida y…».

**Ajuste humano.** La auditoría fue correcta en el fondo pero **calibrada al objetivo equivocado**: me empujó hacia rigor académico —estado del arte con 25 referencias, hipótesis con umbrales estadísticos, validación de juez con κ de Cohen— porque mi documento estaba escrito con forma de tesis de investigación. No lo era. El error fue mío, por no dar el enunciado. Ver §1 Prompt 2.

### Prompt 2 — Corrección de rumbo con el enunciado real

```
Antes de seguir, lee TMF.docx: son las indicaciones oficiales que tengo para
construir y entregar este proyecto. Contiene enlaces; ábrelos también.

Después dime, sin suavizarlo:
1. En qué se desvía mi propuesta de lo que realmente se me pide.
2. Qué partes de tu revisión anterior dejan de ser válidas a la luz de esto.
3. Cuál es el calendario real y si mi alcance cabe en él.
```

**Por qué este prompt es el más importante del proyecto.** El punto 2 es el que lo hace útil: obliga al modelo a revisar su propio trabajo anterior en lugar de acumular recomendaciones sobre una premisa falsa. Sin él habría tenido dos capas de consejos incompatibles.

**Ajuste humano.** El resultado cambió el proyecto entero. El enunciado no pedía una tesis: pedía un MVP funcional evaluado por idea/arquitectura, calidad de código y uso de IA. Y el calendario era de 13 semanas, no de las 20 que se habían planificado. **Recorté el alcance a la mitad y reasigné todo el tiempo ganado a construir producto.** Aquí es donde tuve que decidir yo: el modelo había producido una propuesta más ambiciosa y mejor argumentada, pero inviable.

### Prompt 3 — Definición del valor diferencial

```
Necesito la sección 1.1 (Objetivo) del README.

Restricción: no puede describir CODEMIND como "un asistente que responde
preguntas sobre código". Eso ya existe. Tiene que dejar claro en un párrafo
qué hace este sistema que un asistente con RAG sobre el repositorio no hace.

Escribe primero, en una lista, los 3 o 4 comportamientos concretos y
verificables que lo diferencian. Después el texto.
No uses las palabras "revolucionario", "potente" ni "innovador".
```

**Ajuste humano.** La lista inicial tenía cinco puntos y dos eran el mismo. Los fusioné y **añadí uno que el modelo no había propuesto: que el sistema sepa responder `UNKNOWN`**. Salió de mi experiencia usando asistentes de código: lo que más desconfianza genera no es que fallen, es que fallen con seguridad y una cita que parece válida. Ese comportamiento acabó siendo el criterio de aceptación más distintivo de la HU2 y el paso 3 del guion de demostración.
