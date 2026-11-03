# Criterio de corrección de las respuestas

Este criterio se escribió y se congeló antes de que ningún revisor leyera una respuesta.

Cada respuesta se juzga solo contra el código ejecutable de su repositorio de ejemplo (el
«fixture»). Se lee el texto de `answer` y el de cada `statements[].text`. Un fragmento de `evidence` es
una indicación, no una prueba: lo que se afirma se comprueba en el fichero del fixture. El código
ejecutable prevalece sobre los comentarios, los docblocks y la documentación.

## Veredictos

Las afirmaciones centrales son las necesarias para contestar la pregunta tal como está formulada; todas
las demás son secundarias. Una afirmación con reserva («probablemente», «podría») se juzga como una
afirmación. La etiqueta `type` de un enunciado (`FACT`, `INFERENCE`) no cambia cómo se juzga.

- `correct`: la respuesta contesta la pregunta, toda afirmación central está respaldada por el código
  y ninguna afirmación de `answer` ni de `statements` queda contradicha por el código.
- `partial`: las afirmaciones centrales son correctas, pero una afirmación secundaria es falsa o no
  tiene respaldo en el código, o la respuesta omite una parte que la pregunta pide de forma explícita.
- `incorrect`: una afirmación central queda contradicha por el código, la respuesta contesta otra
  pregunta, o no da respuesta.

Una afirmación sobre el contenido de un fichero del fixture que no es código de la aplicación (sus
`tests/`, sus `docs/` o su `README.md`) se juzga solo por el comportamiento que enuncia, contra el
código de la aplicación; ese fichero no se lee. Una afirmación que solo dice lo que dice uno de esos
ficheros, sin un comportamiento comprobable en el código de la aplicación, cuenta como una afirmación
sin respaldo en el código.

## Respuestas UNKNOWN

Una respuesta `UNKNOWN` se juzga igual sea cual sea su `reason`, según el campo `expected` de la
pregunta en `docs/measurements/context/questions.json`.

- Pregunta con `expected` igual a `unknown`: la respuesta es `correct` cuando el fixture no implementa
  lo que se pregunta (se cita el `fichero:línea` más cercano que lo muestra, por ejemplo la lista de
  rutas o el servicio de esa área) e `incorrect` cuando sí lo implementa.
- Pregunta con `expected` igual a `answer`: la respuesta `UNKNOWN` es `incorrect`, porque no contesta
  la pregunta; se cita el código que la contesta.

Una respuesta con contenido a una pregunta cuyo `expected` es `unknown` es `correct` si dice que el
fixture no lo implementa y eso es verdad, `partial` si lo dice pero añade una afirmación secundaria
falsa, e `incorrect` si afirma un comportamiento que no existe en el código.

## Lo que no cuenta

No cuentan el idioma de la respuesta (español o inglés), su estilo ni su longitud, ni si el
`evidence` citado es el mejor posible: solo cuenta si lo que afirma es verdad en el código.

Cada veredicto lleva un motivo de una a tres frases con al menos una cita `fichero:línea`, con la ruta
relativa a la raíz del fixture.
