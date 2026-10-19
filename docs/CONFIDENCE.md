# Confianza

CODEMIND da a cada claim guardado y a cada respuesta contestada una `confidence`, calculada por
`packages/core/src/knowledge/confidence.ts` a partir de señales observables de las citas: nunca la
declara el modelo. El valor de un claim es la confianza de su propia afirmación; el de una respuesta es
la confianza de todas sus afirmaciones juntas. Las respuestas `UNKNOWN` no llevan ninguna.

## Fórmula

```text
confidence = σ(w1·evidence + w2·diversity + w3·crossConfirmation + w4·resolution + w5·entailment − w6·contradiction)
σ(z)       = 1 / (1 + e^(−z))
```

No hay término independiente. Todos los pesos son positivos, así que ninguna señal positiva puede bajar
el valor y una contradicción siempre lo baja. La suma se hace en un orden fijo, de modo que las mismas
citas y veredictos dan el mismo número sea cual sea el orden de las afirmaciones y de las citas. El
valor no se redondea.

## Señales

Cada señal es un número en [0, 1], calculado sobre un conjunto de afirmaciones con sus citas. Una cita
lleva su tramo (id del fichero, primera y última línea), el tipo del fichero citado, el origen del tramo
y el veredicto del verificador para su par (afirmación, cita), `entailed` o `cited`. La categoría de una
cita es `code` para los ficheros `source` y `config`, `test` para `test` y `doc` para `doc`; `history`
es una cuarta categoría que ninguna cita puede tener todavía.

| Señal | Definición |
| --- | --- |
| `evidence` | min(E, `EVIDENCE_SATURATION`) / `EVIDENCE_SATURATION`, donde E es el número de tramos distintos con al menos una cita `entailed` |
| `diversity` | Categorías distintas entre las citas `entailed`, divididas entre 4 (`history` incluida) |
| `crossConfirmation` | 1 cuando una afirmación tiene una cita `code` `entailed` y una cita `test` `entailed`, 0 en otro caso |
| `resolution` | Tramos citados distintos cuyas citas tienen todas origen `anchor` o `exact`, divididos entre los tramos citados distintos; cuenta cualquier veredicto, y cualquier otro origen cuenta como no resuelto |
| `entailment` | Citas `entailed` divididas entre todas las citas, contando cada cita tal como se da |
| `contradiction` | 1 cuando existe evidencia contraria para el conjunto, 0 en otro caso |

Las señales leen solo los metadatos de los tramos y los veredictos: nunca el texto de una afirmación, un
fragmento, un estado ni la salida del modelo. Un conjunto sin afirmaciones, o una afirmación sin citas,
no tiene confianza (la función lanza `RangeError`).

## Pesos

| Nombre | Señal | Valor | Motivo |
| --- | --- | --- | --- |
| w1 | `evidence` | 0.5 | Más tramos que respaldan la respuesta suman apoyo; con tope, para no premiar las respuestas largas. |
| w2 | `diversity` | 0.5 | Las fuentes de distinto tipo fallan de forma independiente; las preguntas de desarrollo no la ejercitan. |
| w3 | `crossConfirmation` | 0.5 | Código y test que respaldan la misma afirmación coinciden; las preguntas de desarrollo no la ejercitan. |
| w4 | `resolution` | 0.5 | Las aristas `heuristic` (fachadas, convenciones de Laravel) pueden fallar; pesa menos que el veredicto del verificador. |
| w5 | `entailment` | 1.0 | La única señal que comprueba que la cita respalda la afirmación; el verificador también se equivoca. |
| w6 | `contradiction` | 1.5 | La evidencia contraria debe pesar más que cualquier señal positiva por separado. |
| EVIDENCE_SATURATION | — | 4 | Las respuestas citan pocos tramos; saturar evita que las respuestas largas ganen por longitud. |

La autora fijó estos valores y motivos el 2026-10-15, tras ejecutar las preguntas de desarrollo de
abajo sobre `acme-shop` con `qwen2.5-coder` (Ollama, CPU) como modelo de respuesta y verificador
(`openspec/changes/archive/2026-10-15-confidence-score/reports/2026-10-15-9-weights-session.md`):

1. ¿Cómo aplica DiscountService los descuentos a un pedido?
2. ¿Cómo calcula TaxService el impuesto de un pedido?
3. ¿Qué hace la fachada Pricing?
4. ¿Qué ocurre cuando se dispara el evento OrderPlaced?
5. ¿Qué tarifas de envío y umbral de envío gratis configura la tienda?
6. ¿Qué dice la documentación sobre el orden de impuestos y descuentos?
7. ¿Qué valida StoreOrderRequest al crear un pedido?
8. ¿Cómo se envía la factura en PDF al cliente?

`entailment` fue la que más separó las afirmaciones y `resolution` las ordenó dentro de un mismo
veredicto; `diversity`, `crossConfirmation` y `contradiction` no se activaron nunca en estas preguntas,
así que sus pesos conservan su valor inicial.

Estos valores viven en `CONFIDENCE_WEIGHTS` y `EVIDENCE_SATURATION`;
`tests/unit/knowledge/confidence-doc.spec.ts` falla cuando esta tabla y el código no coinciden. Los
pesos se fijaron una sola vez con las preguntas de desarrollo de los repositorios de muestra y nunca se
reajustan con las preguntas de medición.

## Límites

- El valor es ordinal y no está calibrado: ordena las respuestas de este sistema, no es una
  probabilidad.
- La señal de contradicción vale 0 en todas las respuestas hasta DIS-71: ningún componente produce
  todavía evidencia contraria (el `entails: false` del verificador deja una cita en `cited`, no la
  contradice).
- Ninguna cita tiene todavía la categoría `history`, así que `diversity` vale como máximo 0.75.
- Un conjunto sin ninguna señal (todas las citas `cited`, ningún tramo resuelto) vale exactamente 0.5.
- `entailment` viene del verificador, una llamada al modelo: el valor es reproducible para las mismas
  citas y veredictos (la caché de verificación por par conserva un veredicto dentro de un proceso).
- Añadir afirmaciones bien respaldadas a una respuesta puede subir el valor de la respuesta, ya que el
  valor de un conjunto nunca baja al añadir una cita `entailed` y resuelta. Cada claim conserva el valor
  de su propia afirmación, así que una afirmación débil sigue visible en su claim.
- Una cita que queda en `cited` porque el verificador no estaba disponible o se quedó sin presupuesto
  baja para siempre el valor guardado de su claim: el registro no distingue un veredicto degradado de
  uno real, y los valores guardados no se recalculan.
- Los pesos no se reajustan con las preguntas de medición.
