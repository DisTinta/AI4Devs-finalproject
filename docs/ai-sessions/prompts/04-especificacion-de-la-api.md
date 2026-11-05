# 4. Especificación de la API

> Sección 4 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Diseño de los tres endpoints

```
Diseña la API REST de CODEMIND en OpenAPI 3.0.3.

Restricción fuerte: exactamente 3 endpoints como máximo (lo exige la
plantilla de entrega). Elige los tres que cubren las 3 historias de usuario
must-have sin dejar ninguna a medias.

Requisitos de la respuesta de la consulta:
- cada afirmación por separado, con su tipo (FACT/INFERENCE) y el resultado
  de la verificación de su evidencia
- las evidencias referenciables desde las afirmaciones
- el consumo: tokens, coste, latencia, y cuántos tokens habría costado
  enviar contexto bruto

Incluye ejemplos realistas de peticiones y respuestas, con datos coherentes
entre sí. Nada de "string" ni "example value".
```

**Por qué funcionó.** «Datos coherentes entre sí» evitó el ejemplo típico donde el `answer` habla de un fichero que no aparece en `evidence`. Los ejemplos del documento se pueden leer como una respuesta real.

**Ajuste humano.** Añadí el campo `baselineTokens`, que no estaba. Sin él, mostrar el ahorro en la interfaz obliga a recalcularlo en el cliente. Con él, el dato viaja con la respuesta y queda registrado en `QUERY_LOG`, que es lo que alimenta la tabla de mediciones.

### Prompt 2 — Formato del informe de impacto

```
El endpoint de impacto devuelve un conjunto de elementos afectados por un
cambio. Esos elementos vienen de dos fuentes muy distintas:

1. el grafo estático (fiable, pero incompleto en PHP)
2. la señal histórica de co-cambio en Git (ruidosa, pero captura relaciones
   que el análisis estático no ve)

Diseña el formato de respuesta de manera que quien lo lee pueda distinguir
siempre de dónde viene cada elemento y con qué fiabilidad.

Argumenta por qué mezclarlos sin distinguir sería un error.
```

**Ajuste humano.** Ninguno significativo. El argumento que devolvió —que sin distinguir el origen el usuario no puede calibrar cuánto confiar en cada línea, y acaba desconfiando de todas— se incorporó a la justificación de la HU3. La estructura con `origin` y `resolution` por elemento se adoptó tal cual.
