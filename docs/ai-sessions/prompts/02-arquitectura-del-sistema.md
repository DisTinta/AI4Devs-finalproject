# 2. Arquitectura del Sistema

> Sección 2 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

## 2.1. Diagrama de arquitectura

### Prompt 1 — Elección de patrón con la extensibilidad como restricción

```
Quiero decidir el patrón arquitectónico de CODEMIND, no que me lo confirmes.

Requisito que manda sobre los demás: el núcleo debe ser independiente del
lenguaje analizado. Va a haber dos analizadores (PHP/Laravel y TypeScript) y
quiero poder demostrar —no afirmar— que añadir el segundo no obliga a tocar
el núcleo.

Propón 2 o 3 patrones candidatos. Para cada uno:
- cómo satisface ese requisito
- qué cuesta en complejidad para un proyecto de 13 semanas
- cómo se COMPRUEBA automáticamente que la separación no se ha roto

Recomienda uno y explica qué sacrifico al elegirlo.
```

**Por qué funcionó.** La tercera viñeta. Preguntar «cómo se comprueba» convirtió una decisión estética en una decisión con mecanismo: de ahí salió el test de arquitectura en CI con `dependency-cruiser` que falla el build si alguien importa infraestructura desde `core`.

**Ajuste humano.** Escogí hexagonal, pero **rechacé la propuesta de crear un paquete de puertos separado** por lenguaje. Con dos analizadores es sobreingeniería: un solo `AnalyzerPort` basta y se ve de un vistazo. Añadí por mi cuenta el criterio de aceptación de la PR 3: *el diff no toca `packages/core`*. Eso hace la afirmación falsable con un `git diff`, que era el objetivo original del prompt.

### Prompt 2 — Sacrificios de la arquitectura

```
La plantilla de documentación exige, en la sección de arquitectura, no solo
los beneficios sino "los sacrificios o déficits que implica".

Dame los sacrificios REALES de la arquitectura que hemos elegido para
CODEMIND. No los de cortesía tipo "requiere disciplina del equipo".

Quiero los que un revisor técnico usaría para atacar la propuesta. Para cada
uno: en qué situación concreta duele, y si lo mitigo o lo acepto.
```

**Ajuste humano.** De seis sacrificios propuestos descarté dos por genéricos y **reescribí el primero**, que es el importante: el grafo de llamadas nunca será completo en Laravel por las facades, el contenedor de servicios y las rutas resueltas por string. El modelo lo planteaba como una debilidad a minimizar. Le di la vuelta: **lo convertí en una medición**. Si el mismo núcleo produce un grafo peor en PHP que en TypeScript —donde el compilador resuelve referencias— eso es un resultado interesante, no una vergüenza. De ahí salió la Tabla 2 de la sección 2.6.

### Prompt 3 — Justificación del framework

```
Estoy dudando entre NestJS y Fastify para la API de CODEMIND.

Datos: son 3 endpoints, la plantilla exige especificación OpenAPI, el
proyecto es un monorepo con el dominio ya aislado en packages/core, y lo
desarrollo yo sola en 13 semanas.

No me des una comparativa general de los dos frameworks. Dime cuál elegir
CON ESOS DATOS y qué me estaría comprando de más con el otro.
```

**Ajuste humano.** Ninguno de fondo: Fastify, y la razón —con el dominio ya aislado, la inyección de dependencias de NestJS resuelve un problema que no tengo— se incorporó tal cual a la sección 2.2. Sí acorté la respuesta: llegó con una tabla de ocho criterios de los que seis eran irrelevantes para el caso.

## 2.2. Descripción de componentes principales

### Prompt 1 — Pedir criterio en lugar de aprobar en bloque

Contexto: una revisión cruzada había devuelto una lista de inconsistencias entre el readme y la propuesta. La tentación era aprobarlas todas de golpe.

```
y propones arreglarlas?
```

**Por qué funcionó.** Es el prompt más corto del proyecto y uno de los más rentables. Aprobar una lista de correcciones en bloque trata todos los defectos como equivalentes; preguntar si se propone arreglarlos obliga a justificar cada uno por separado, y ahí se ve que **dos de ellos no eran defectos que borrar sino decisiones que documentar**.

**Ajuste humano.** Dos cambios de fondo salieron de esa distinción:

- El comando `drift` aparecía en el diagrama, en la tabla de componentes y en el enum `capability`, pero su funcionalidad (F6) es *should-have*. La respuesta inicial era quitarlo. Decidí **conservarlo y marcarlo como previsto**: añadir un valor a un enum con datos dentro es una migración, no un cambio de código, así que el punto de extensión se diseña ahora. Lo que había que arreglar era la promesa, no el diseño.
- El Ticket 3 hablaba de «9 tablas» y el diagrama tenía una relación de muchos a muchos entre `FILE` y `COMMIT`, que necesita tabla intermedia. En lugar de corregir el número, **añadí la tabla**: `FILE_COMMIT` es de donde sale el peso de las aristas `co_changed`, que es lo que sostiene el análisis de impacto justo donde el análisis estático de PHP no llega. Un error de recuento resultó ser una tabla que faltaba.

La lección es que una inconsistencia señala un sitio donde no habías pensado del todo, y a veces la salida no es tachar sino terminar de pensarlo.

## 2.3. Descripción de alto nivel del proyecto y estructura de ficheros

### Prompt 1 — Nombres que digan lo que son, con una parada antes de ejecutar

```
Revisa detalladamente: primero el ai4devs-requisitos-y-encaje.md y después
todo lo demás.

Necesito poner un poco de orden. [...] los nombres de los archivos .md en la
raíz de la carpeta no los veo coherentes a lo que son, es un recorrido hasta
afinar la propuesta final.

Tu primera tarea es: vamos a crear una nueva carpeta y dentro vas a crear
estos archivos de nuevo, pero con nombres más coherentes.
El contenido de los archivos, si tienen inconsistencias avísame antes de
seguir.
```

**Por qué funcionó.** La última frase. Sin ella habría recibido cuatro ficheros renombrados y nada más; con ella, el trabajo se detuvo antes de ejecutar y devolvió **nueve inconsistencias** entre los documentos, tres de ellas en el readme de la entrega: afirmaciones sobre la ausencia de imágenes que habían dejado de ser ciertas, un valor de confianza que se mostraba en tres sitios y no se explicaba en ninguno, y una carpeta referenciada que no figuraba en la estructura de ficheros.

Poner una condición de parada en el propio prompt —«avísame antes de seguir»— convierte una tarea mecánica en una revisión. Cuesta una línea.

**Ajuste humano.** Decidí que los cuatro documentos del recorrido se copiaran **literalmente**, con sus contradicciones dentro, y que las correcciones se aplicaran solo a los documentos vivos. Un registro de cómo cambió el criterio pierde su valor si se reescribe para que parezca coherente desde el principio. Las inconsistencias que sí importaban eran las de la entrega, no las del histórico.

### Prompt 2 — La estructura oficial, no la que yo suponía

```
ahora que sabes todo lo necesario, como me recomiendas proceder? no hagas
cambios en la carpeta todavía. Si la idea es subirlo al repo, ¿Qué estructura
de carpetas me recomiendas hacer? lo que está dentro de la carpeta
final-project era temporal también. Quiero empezar a crear ya el proyecto y
la estructura de carpetas debe ser la oficial ya.
```

**Por qué funcionó.** Dos restricciones explícitas. «No hagas cambios todavía» separó la decisión de la ejecución, que en cuestiones de estructura es donde se cometen los errores caros. Y «debe ser la oficial ya» forzó ir a **comprobar** la plantilla y los dos repositorios de ejemplo en lugar de deducirla: resultó que la plantilla trae únicamente `readme.md` y `prompts.md` en la raíz, que el código va arriba y que la carpeta `final-project/` que estaba usando de trabajo no formaba parte de nada.

**Ajuste humano.** El más importante de esta sección, y va contra el ejemplo oficial. La estructura propuesta incluía ocho documentos numerados en `docs/` espejando el readme sección por sección, como hace el Ejemplo 1 del máster. **Lo rechacé.** Duplicar el documento evaluado en ocho ficheros más es crear ocho sitios donde el contenido puede desincronizarse — y detectar exactamente eso es la funcionalidad F6 de este producto. Documentar de una forma que genere el problema que el sistema resuelve habría sido una mala señal sobre el criterio con el que está hecho. `docs/` quedó para lo que el readme no contiene: el guion de demostración, los pesos de la fórmula de confianza, las guías de tests y despliegue, y las transcripciones de estas sesiones.

## 2.4. Infraestructura y despliegue

### Prompt 1 — Diagrama, paridad de entornos y demo de coste acotado

```
Actúas como un Arquitecto de Software y Lead DevOps evaluando la documentación técnica para el Trabajo de Fin de Máster (TFM) del programa AI4Devs.

Tarea: Redacta la sección "2.4. Infraestructura y despliegue" del documento de arquitectura. Debe documentar de forma clara, directa y estructurada la estrategia de CI/CD, entornos, optimización de costes y gestión de secretos.

Requisitos de contenido y estructura:

Diagrama: Incluye un diagrama Mermaid (flowchart LR) que represente el flujo completo desde el desarrollo local (make up con Postgres + pgvector), paso por GitHub / GitHub Actions (lint, tests, build), registro de imágenes, servidor propio (API + web + TLS), base de datos y conexión a la API del LLM.

Proceso de despliegue: Explica brevemente el pipeline de CI/CD, enfatizando la ejecución de pruebas (unitarias, integración con contenedor Postgres, E2E) y el paso de verificación final (npm run verify).

Estrategia de Entornos: Compara en una tabla el entorno Local y la demo alojada. Subraya por qué ambos usan el mismo docker-compose (paridad dev/prod) y qué garantías ofrece cada uno.

Modo Demo y Gestión de Costes: Explica cómo se sostiene la demo pública sin agotar cuota de API LLM mediante un sistema de caché de embeddings/respuestas precalculadas, límites por IP y fallback a "modo solo-caché". Resume la estrategia de costes en una tabla comparativa.

Gestión de Secretos: Resume la política de seguridad (uso de .env.example, .gitignore y gestor de secretos del proveedor).

Evita introducciones genéricas o paja narrativa; ve directo al contenido técnico.
```

**Por qué funcionó.** El prompt no pedía «diseñar» la infraestructura: pedía **documentar decisiones ya tomadas**, con forma fija (diagrama Mermaid, tabla de entornos, tabla de costes, secretos) y con la prohibición de paja al final. Eso evita la respuesta por defecto —comparativas de PaaS, listas de buenas prácticas— y fuerza el contenido que la plantilla evalúa: flujo, paridad local/demo y techo de coste de la demo pública.

**Ajuste humano.** Tres cambios de fondo sobre la primera salida. Primero: **añadí la carga de semillas y el test de arquitectura al pipeline** — el prompt pedía lint, tests y `npm run verify`, pero sin semillas el despliegue deja un sistema vacío, y sin el test de arquitectura la regla del núcleo no se comprueba en CI. Segundo: **recorté el párrafo de alternativas gestionadas** (Railway, Render, Fly.io, Cloud Run) que el modelo añadió como «por si acaso»; en la entrega el destino es servidor propio, y enumerar PaaS sin comprometerse diluye la decisión. Tercero: **exige que la métrica de acierto de caché se muestre en la interfaz**, no solo que exista el mecanismo: si el modo demo es el argumento de coste, tiene que ser auditable desde fuera.

## 2.5. Seguridad

### Prompt 1 — Modelo de amenazas de un sistema con LLM y agentes

```
CODEMIND lee repositorios de código y envía fragmentos a un LLM. El
contenido del repositorio (comentarios, mensajes de commit, cuerpos de
issues) no es de confianza: puede contener instrucciones dirigidas al modelo.

Construye el modelo de amenazas. Referencias: OWASP Top 10 for LLM
Applications y OWASP Top 10 for Agentic Applications (busca las ediciones
vigentes, no las cites de memoria).

Para cada amenaza: vector concreto en ESTE sistema, mitigación, y cómo se
mide que la mitigación funciona.

Importante: no me propongas "detectar inyecciones de prompt" como mitigación
principal. Quiero defensas arquitectónicas, del tipo que funcionan aunque el
detector falle.
```

**Por qué funcionó.** La última restricción. La respuesta por defecto a la inyección de prompt es «añade un detector», que tiene falsos negativos conocidos y da una falsa sensación de seguridad. Prohibirlo explícitamente forzó las defensas que de verdad sostienen: sistema de solo lectura, agente en cuarentena sin acceso a herramientas, validación de salida por esquema.

**Ajuste humano.** Dos añadidos míos. Primero: **detectar secretos antes de indexar, no antes de enviar al modelo** — un secreto que nunca entra en la base de datos no puede filtrarse por una consulta posterior. El modelo lo había puesto en el paso de envío. Segundo, y más importante: **añadí la tasa de falsos positivos como métrica obligatoria**. Solo se medía la tasa de bloqueo, y un detector que bloquea todo obtiene un 100 % de bloqueo. Medir solo el acierto es engañarse.

### Prompt 2 — Datos personales en el historial de Git

```
Una de las fuentes de CODEMIND es el historial de Git, que contiene nombres
y direcciones de correo de contribuidores.

¿Qué implicaciones de RGPD tiene esto y cuál es el diseño mínimo que las
respeta sin perder funcionalidad útil?

Considera también que una funcionalidad que descarté era detectar qué
personas concentran el conocimiento de un módulo. Dime si ese descarte fue
acertado y por qué.
```

**Ajuste humano.** Confirmó el descarte y aportó el argumento que no había formulado: además del RGPD, una métrica de concentración de conocimiento por persona es **sensible en el plano laboral**, porque se puede leer como evaluación de individuos. Adopté la seudonimización del autor por defecto (hash con sal) y lo dejé escrito en la descripción de la entidad `COMMIT`, para que la decisión quede en el esquema y no solo en la intención.

## 2.6. Tests

### Prompt 1 — Estrategia de pruebas atada a los criterios de aceptación

```
Adjunto las 3 historias de usuario de CODEMIND con sus criterios de
aceptación, y los 3 tickets.

Diseña la estrategia de tests. Restricciones:
- cada nivel (unitario, integración, E2E) debe justificar por qué existe;
  no quiero pirámide por costumbre
- debe haber un test que compruebe la regla de arquitectura (core no importa
  infraestructura) y que falle el build si se rompe
- la evidencia de funcionamiento del proyecto NO serán capturas ni vídeo,
  así que necesito una comprobación ejecutable que alguien externo pueda
  correr para verificar que su instalación reproduce lo documentado

Para cada criterio de aceptación, indica qué nivel de test lo cubre.
Si algún criterio no es testeable como está escrito, dímelo.
```

**Por qué funcionó.** La última línea. Devolvió tres criterios de aceptación mal formulados —incluido uno mío que decía «la respuesta es útil», que no es verificable— y los reescribí antes de seguir. Es más barato arreglar un criterio que un test.

**Ajuste humano.** De aquí salió `npm run verify`, que no estaba en mi plan: una prueba de humo que consulta cada proyecto de muestra y compara con la salida esperada. Cumple doble función —test de integración en CI y verificación para quien evalúa— y es la forma en que se demuestra que el sistema funciona.

**Nota posterior.** La restricción que escribí en el prompt —«la evidencia NO serán capturas ni vídeo»— se matizó después: la sección 1.3 del README incluye wireframes de las tres pantallas. No es una marcha atrás, es una distinción que al escribir el prompt no había hecho: **un wireframe documenta el diseño, una captura documenta un sistema en marcha.** En la Entrega 1 no hay código, así que la captura era imposible y el wireframe es lo que corresponde. El vídeo sigue descartado y la evidencia de funcionamiento sigue siendo ejecutable.
