# prompts.md — Registro de uso de IA

**Proyecto:** CODEMIND
**Autora:** Cristina Rodríguez Núñez
**Máster:** AI4Devs — Proyecto Final

> Este documento recoge los prompts y workflows principales usados en la creación del proyecto, siguiendo la estructura de la plantilla oficial: máximo 3 prompts por sección, priorizando los de creación inicial y los de corrección o adición de funcionalidades más relevantes.
>
> Cada sección incluye además **qué ajustes humanos** hubo que hacer sobre la salida del modelo. Esa parte es deliberada: es donde se ve el criterio propio, y en varios casos es más informativa que el prompt.

---

## Índice

0. [Flujo de trabajo con IA](#0-flujo-de-trabajo-con-ia)
1. [Descripción general del producto](#1-descripción-general-del-producto)
2. [Arquitectura del sistema](#2-arquitectura-del-sistema)
3. [Modelo de datos](#3-modelo-de-datos)
4. [Especificación de la API](#4-especificación-de-la-api)
5. [Historias de usuario](#5-historias-de-usuario)
6. [Tickets de trabajo](#6-tickets-de-trabajo)
7. [Pull requests](#7-pull-requests)
8. [Lecciones sobre el uso de IA en este proyecto](#8-lecciones-sobre-el-uso-de-ia-en-este-proyecto)
9. [Construcción de `fixtures`](#9-construcción-de-fixtures)

---

# 0. Flujo de trabajo con IA

## 0.1. Herramientas y modelos por fase

| Fase | Herramienta | Modelo | Por qué ese |
|---|---|---|---|
| Definición y crítica de la propuesta | Claude (Cowork) | Opus | Razonamiento largo sobre un documento completo; necesitaba que sostuviera 40 páginas de contexto y detectara contradicciones entre secciones |
| Investigación de referencias | Claude (Cowork) con búsqueda web | Opus | Verificación de citas reales en vez de generarlas de memoria |
| Redacción de documentación técnica | Claude (Cowork) | Opus | Documentos largos con estructura fija |
| Diseño de esquema de datos y API | Claude (Cowork) | Opus | Decisiones con consecuencias en cascada |

Esta tabla recoge **solo las fases ya ejecutadas**, que en esta entrega son las de documentación. El reparto previsto para las fases de código —Cursor con Sonnet para implementación y tests, Claude Code con Opus para revisión de pull requests— se registrará aquí cuando se haya usado, en la Entrega 3.

**Criterio de reparto.** Opus para lo que tiene consecuencias difíciles de revertir —arquitectura, esquema de base de datos, decisiones de seguridad—; Sonnet para lo que es rápido de verificar y de rehacer —código, tests, refactors—. El coste de un error de Opus en el esquema de datos se paga durante semanas; el de Sonnet en una función se paga en cinco minutos.

## 0.2. Skills, subagentes y comandos personalizados

### El harness de trabajo

Antes de arrancar el desarrollo construí un **harness propio de Spec-Driven Development**, `sdd-harness-kit`, para no montar el andamiaje de trabajo con IA desde cero en cada proyecto. Es un instalable que deja en el repositorio destino 27 skills y 9 subagentes como fuente canónica en `ai-specs/`, 9 hooks deterministas del ciclo de vida, estándares por capa en `docs/`, adaptadores por stack y los cuatro ficheros de memoria de copiloto apuntando a una doctrina única. Su huella en este repositorio está descrita en la sección 2.3 del readme.

**Es un repositorio privado, así que no se puede enlazar aquí.** Lo digo explícitamente porque conviene: es la única afirmación de este documento que quien evalúa no puede comprobar por sí mismo. Lo que sí es verificable es su resultado, que está instalado y a la vista en este repositorio — `ai-specs/`, `.claude/hooks/`, los estándares de `docs/` y el `.mcp.json`.

**Procedencia.** El harness sale de los apuntes de las clases del máster y toma como punto de partida ideas de [`LIDR-academy/lidr-specboot`](https://github.com/LIDR-academy/lidr-specboot) (MIT), el repositorio de referencia del propio máster: la disposición de `ai-specs/` con skills y subagentes como fuente canónica, los estándares en `docs/`, y los cuatro ficheros de memoria apuntando a una doctrina única. Lo añadido por mí es el instalable con detección de stack, los 9 hooks deterministas, los adaptadores, el `doctor`, el soporte en Windows y los gates de secretos. Queda declarado en el `CREDITS.md` y el `LICENSE` del kit, que conserva el aviso de copyright de specboot.

**Lo que hubo que hacer para este proyecto.** El kit traía adaptadores para Laravel, AdonisJS y React, y CODEMIND es **Fastify sobre un monorepo hexagonal**: no había ninguno que sirviera. Escribí el adaptador `fastify`, y su guarda de arquitectura codifica la regla de dependencias de la sección 2.3 del readme — si un fichero de `packages/core` menciona `adapters/` o `analyzers/`, el hook avisa al guardar.

**Y aquí está la conexión con el producto**, que es lo que más me interesa señalar de todo este apartado. Los hooks del harness, según su propia documentación, *«actúan sobre la ruta del fichero, no sobre qué comando lo escribió»*. Es exactamente el razonamiento por el que CODEMIND verifica sus propias citas en lugar de pedirle al modelo que las aporte bien, y por el que la independencia del lenguaje es un test en CI y no un párrafo en el readme. **Tres veces la misma idea: no se le pide al modelo que cumpla, se monta un mecanismo que lo comprueba.** Que aparezca en mi herramienta de trabajo, en la arquitectura del producto y en el pipeline no es casualidad: es la única convicción técnica que sostiene el proyecto entero.

### Recursos concretos

**Usado en esta entrega:**

| Recurso | Tipo | Para qué |
|---|---|---|
| `critico-adversarial` | Subagente | Recibe una sección de documentación y devuelve solo objeciones, sin reformularla. Se usó sobre todas las secciones del readme |
| Adaptador `fastify` | Adaptador de stack del harness | Escrito para este proyecto: comandos, rutas de capa y guardas de arquitectura del monorepo hexagonal. Ya en el kit, aún no instalado en el repositorio |

**Previsto para las fases de código** (Entregas 2 y 3), aquí por decisión tomada, no por uso:

| Recurso | Tipo | Para qué |
|---|---|---|
| `/revisar-arquitectura` | Comando personalizado (Cursor) | Aplicar sobre un fichero la regla de dependencias: comprobar que `packages/core` no importe de `adapters`, `analyzers` ni `api`, y explicar cada violación |
| `verificador-de-evidencias` | Subagente | Ejecutar el proceso del Ticket 1 sobre respuestas de prueba, para validar el diseño antes de implementar el componente |
| Reglas de proyecto (`.cursorrules`) | Rules | Fijar el estilo: TypeScript estricto, sin `any`, errores como tipos y no como excepciones, y prohibición de importar infraestructura desde `core` |

**Nota sobre `critico-adversarial`.** Fue el recurso más rentable del proyecto. Pedir «mejora este texto» produce texto más largo; pedir «dame solo las objeciones, sin reescribir nada» produce los agujeros. Casi todos los cambios de fondo en la propuesta salieron de ahí.

## 0.3. Conversaciones completas

Las sesiones que originaron los prompts de este documento se archivan en `docs/ai-sessions/`, una por sesión de trabajo y con la fecha en el nombre. Los prompts que siguen se reproducen **literalmente**, tal como se enviaron: cuando una decisión posterior los deja desfasados, se dice en el «ajuste humano» en lugar de reescribir el prompt.

---

# 1. Descripción general del producto

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

---

# 2. Arquitectura del Sistema

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

---

# 3. Modelo de Datos

### Prompt 1 — Traducir una decisión conceptual a esquema

```
CODEMIND distingue entre conocimiento observado (extraído por un parser, sin
LLM) y conocimiento inferido (producido por un LLM a partir de evidencias).
Esa distinción es central: no quiero que una inferencia pueda presentarse
nunca como un hecho.

Diseña el esquema PostgreSQL que hace esa distinción IMPOSIBLE de violar a
nivel de base de datos, no solo por convención en el código.

Incluye: entidades, tipos exactos, claves primarias y foráneas,
restricciones CHECK, e índices necesarios para travesía del grafo y búsqueda
vectorial con pgvector.
Entrégalo como diagrama Mermaid erDiagram más el DDL de las restricciones.
```

**Por qué funcionó.** «Imposible de violar a nivel de base de datos» es lo que produjo las dos restricciones `CHECK` que son, probablemente, el detalle del que estoy más satisfecha:

```sql
ALTER TABLE claim ADD CONSTRAINT fact_only_from_l1
  CHECK (type <> 'FACT' OR layer = 'L1');

ALTER TABLE claim ADD CONSTRAINT l2_requires_provenance
  CHECK (layer <> 'L2' OR provenance IS NOT NULL);
```

Un principio de diseño que la base de datos hace cumplir no se erosiona con las prisas.

**Ajuste humano.** El primer esquema tenía `layer` y `type` fusionados en un solo campo. **Los separé**: `layer` dice de dónde salió la afirmación, `type` dice qué garantía tiene. Son cosas distintas y fusionarlas habría impedido justamente la restricción que quería.

### Prompt 2 — Campo `resolution` en las aristas

```
Problema concreto. En PHP/Laravel, muchas llamadas no se pueden resolver con
certeza: facades, bindings del contenedor de servicios, rutas por string,
atributos mágicos de Eloquent. En TypeScript, en cambio, el compilador las
resuelve con precisión.

Quiero que el grafo refleje esa diferencia de fiabilidad en lugar de
esconderla, y que se propague hasta la respuesta que ve el usuario.

Propón el diseño. Debe permitir: (a) filtrar por fiabilidad al recuperar
contexto, (b) impedir que una arista poco fiable sustente un hecho, y
(c) comparar la calidad de los dos analizadores con datos.
```

**Ajuste humano.** El diseño propuesto usaba una puntuación continua de 0 a 1. **Lo cambié a un enum de dos valores, `exact` | `heuristic`.** Una puntuación continua obliga a elegir umbrales que no puedo justificar con datos, y da una precisión aparente que no tengo. Dos valores son honestos y suficientes para las tres cosas que pedía. Añadí también el campo `extractor`, que no estaba propuesto, para poder auditar el origen de cada arista y comparar analizadores.

### Prompt 3 — Incrementalidad e invalidación

```
El README afirma que CODEMIND mantiene una "memoria viva" del proyecto, pero
no tengo diseñado qué pasa cuando llegan commits nuevos. Reindexar todo en
cada cambio no es viable.

Diseña la política de actualización incremental, incluyendo qué ocurre con
las inferencias del LLM cuyo código de soporte ha cambiado.

Sé concreta sobre el mecanismo: qué campo dispara la invalidación, cuándo se
recalcula, y qué se muestra al usuario mientras un dato está obsoleto.
```

**Ajuste humano.** Acepté el mecanismo —`content_hash` por fichero, `status = stale` en los claims afectados, re-inferencia perezosa— y descarté la propuesta de un sistema de versionado completo del grafo. Es correcto en abstracto y no cabe en 13 semanas. Queda anotado como trabajo futuro.

---

# 4. Especificación de la API

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

---

# 5. Historias de Usuario

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

---

# 6. Tickets de Trabajo

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

---

# 7. Pull Requests

*(pendiente — Entrega 3)*

En esta entrega no hay código, luego no hay pull requests y no hay prompts que registrar aquí. La sección 7 del readme lo dice en los mismos términos, y las dos deben coincidir: un registro de uso de IA que documentase la revisión de una pull request inexistente sería, precisamente, el tipo de divergencia entre documentación y realidad que este proyecto se propone detectar.

El enfoque previsto está descrito en el ticket correspondiente del readme; los prompts que realmente se usen se transcribirán aquí cuando existan las PR.

---

# 8. Lecciones sobre el uso de IA en este proyecto

Cinco cosas que aprendí, incluyendo las que salieron mal.

**1. El error más caro fue no dar el contexto de evaluación.** Pedí una auditoría de mi propuesta sin adjuntar el enunciado del proyecto. Recibí una crítica excelente y calibrada al objetivo equivocado, que me habría llevado a construir una tesis de investigación en lugar del MVP que se me pedía. El modelo no podía saberlo. Lo detecté al leer el documento oficial de indicaciones, y la corrección exigió reescribir la propuesta entera. **Antes de pedir una evaluación, hay que dar el criterio con el que a ti te evalúan.**

**2. Prohibir explícitamente da mejores resultados que pedir.** Los prompts más productivos de este proyecto llevan una prohibición: «no lo reescribas», «no me propongas un detector», «no incluyas criterios no verificables», «no lo distingas solo por color». La salida por defecto de un modelo tiende a lo convencional; la restricción es lo que la empuja fuera de ahí.

**3. Preguntar «cómo se comprueba» convierte opiniones en mecanismos.** La misma pregunta sobre arquitectura, formulada como «qué patrón usar», da una recomendación. Formulada como «cómo compruebo automáticamente que la separación no se ha roto», da un test en CI. La segunda es la que sirve.

**4. Los ajustes humanos se concentraron en el mismo sitio: la honestidad del sistema.** Repasando este documento, casi todas mis correcciones van en una dirección: la tasa de falsos positivos que faltaba, el enum de dos valores en lugar de la puntuación continua falsamente precisa, la respuesta `UNKNOWN`, el icono además del color. El modelo tiende a producir sistemas que parecen más seguros y más precisos de lo que son. **Corregir eso, sistemáticamente, fue mi aportación principal.**

**5. Pedir autorrevisión dentro del mismo prompt es barato y rentable.** «Después, revisa tu propio resultado y señala cuál sería más difícil de cumplir» identificó correctamente el criterio de latencia como el punto frágil, y me hizo subir una estimación antes de comprometerme con ella. Cuesta una frase.

**6. Decisión de producto (5 sep 2026) — evidencia solo local, LLM híbrido, Ollama.** En una sesión de criterio (Cursor), sin un único prompt de «genera documento», cerré dos bloqueos que la Entrega 1 había dejado abiertos: (a) **sin demo web alojada** — quien evalúa levanta con Docker/`make up`; (b) **`LLM_API_KEY` opcional** — evaluación y `npm run verify` desde caché/golden; desarrollo de pregunta libre con **Ollama** local (API compatible OpenAI), sin obligar a gastar en API cloud. Claude Pro/Max y Cursor siguen siendo herramientas de autoría, no el backend del producto. El detalle vivo está en `readme.md` (callouts «Decisión (5 sep 2026)») y en `proposal-codemind/05-propuesta-v4-evidencia-local-hibrido-ollama.md`; la propuesta 04 queda histórica en esos puntos. **Lección:** cuando el coste y la fricción del evaluador chocan con un «Camino A» cómodo en el papel, conviene recortar el Camino A antes de construir infraestructura que no se va a mantener.

---

*A partir de aquí, empezaremos a construir el proyecto y las conversaciones completas archivadas estarán en `docs/ai-sessions/`.*

---

# 9. Construcción de `fixtures`

Primer hito de código de la Entrega 2: crear los dos repositorios de muestra
`fixtures/acme-shop` (Laravel) y `fixtures/task-api` (TypeScript), con su historia
de Git, su *drift* plantado y el documento de verdad-terreno `fixtures/README.md`.

### Prompt 1 — Encargo de construcción de los fixtures

Prompt literal con el que se abrió la fase (define contexto, objetivo, fuera de
alcance, requisitos de contenido y forma de trabajo):

```
## Contexto

Trabajas en **CODEMIND**, el proyecto final de AI4Devs de Cristina Rodríguez Núñez. Repositorio: fork `DisTinta/AI4Devs-finalproject`. Hoy no hay una sola línea de código de producto: la Entrega 1 fue solo documentación.

Antes de escribir nada, lee estos ficheros de la raíz y trabaja a partir de ellos, no de suposiciones:

- `CODEMIND-ROADMAP.md` — brújula viva: estado, bloqueos, cola de hitos y reglas duras.
- `readme.md` — producto y diseño. Secciones que te afectan directamente: **1.2** (F1–F7), **1.4** (instalación y comandos de ejemplo), **2.2** (componentes y analizadores), **2.3** (árbol de ficheros), **2.5** (seguridad), **2.6** (los fixtures como arnés de pruebas y las Tablas 1 y 2), **3** (modelo de datos), **5** (HU1–HU3), **6** (Ticket 3, tarea 9: `seed:build`).
- `prompts.md` — registro de uso de IA; §6 del roadmap fija la norma de registro.

`ai4devs-requisitos-y-encaje.md` y `proposal-codemind/` son histórico. No son spec viva. No los uses como fuente de requisitos.

## Objetivo de esta fase

**Hito 1 de la cola del roadmap y nada más:** crear los dos repositorios de muestra en `fixtures/`, con su historia de Git, su *drift* plantado y su documento de verdad-terreno.

- `fixtures/acme-shop/` — Laravel 11, PHP 8.2, ~47 ficheros, con drift plantado.
- `fixtures/task-api/` — TypeScript + Fastify, ~38 ficheros.

Estos dos árboles tienen **uso cuádruple** (readme §2.6): tests deterministas, demo alojada, arranque local sin dependencias y caso de la funcionalidad F6. Todo lo que decidas aquí condiciona los tests de integración, las semillas SQL y las mediciones publicadas. No son código de relleno.

## Fuera de alcance — no lo hagas

- **No** inicialices el esqueleto del monorepo (workspaces, `docker-compose`, `Makefile`, CI). Es el hito 2.
- **No** instales el harness (`sdd-harness-kit`) ni crees `docs/project-context.md`, `AGENTS.md`, `CLAUDE.md`, `ai-specs/` ni `openspec/`. Los genera el kit, después del esqueleto.
- **No** escribas nada de `packages/`, ni analizadores, ni migraciones, ni `seeds/graph-dump.sql`.
- **No** elijas proveedor de LLM, ni añadas claves, ni configures despliegue. Son los dos bloqueos abiertos del roadmap §2 y los decide la autora.
- **No** copies código de proyectos reales ni de tutoriales con licencia restrictiva. Todo original.

## Requisitos de contenido

### Comunes a los dos fixtures

1. **Tamaño y forma.** Respeta el orden de magnitud del readme §1.4 (47 y 38 ficheros). No inventes ni ajustes las cifras de símbolos y aristas (312/1840, 264/2110): esas salen del analizador, que aún no existe. Si tu recuento final de ficheros se desvía, **no toques el readme**: anótalo en el informe final para que la autora decida.
2. **Historia de Git real.** El extractor de Git (`simple-git`) consume commits, ficheros modificados por commit, señal de co-cambio y número de PR extraído del mensaje. Un árbol de ficheros sin historia deja HU3 y media Tabla 1 sin material. Necesitas **entre 25 y 40 commits por fixture**, con:
   - fechas escalonadas y coherentes (varios meses),
   - al menos 2–3 autores distintos (nombres ficticios; el sistema los seudonimiza igualmente),
   - varios mensajes con formato `... (#123)` para que `pr_number` tenga de dónde salir,
   - **pares de co-cambio deliberados**: ficheros que cambian sistemáticamente juntos sin que ninguna arista estática los relacione. Esa es la señal `[git]` que HU3 debe separar de la señal `[grafo]`.
3. **Decisión pendiente — cómo se versiona esa historia.** Un repositorio Git anidado dentro del repositorio de entrega no se puede commitear tal cual. Antes de generar nada, **párate y presenta a la autora 2 o 3 opciones** con sus consecuencias sobre `npm run seed:build`, el clonado del evaluador y el peso del repositorio (por ejemplo: `.gitbundle` versionado y desempaquetado por un script; guion determinista que reconstruye la historia desde parches; historia sintética en un fichero de datos que el extractor sepa leer en modo fixture). Recomienda una y **espera confirmación** antes de implementarla.
4. **Un secreto plantado, obviamente falso.** HU1 exige que un secreto detectable se almacene redactado. Necesitas exactamente uno por fixture, detectable por `gitleaks`, con valor manifiestamente sintético y un comentario que lo declare como fixture. Anota en el informe que habrá que añadir una excepción de `gitleaks` a nivel de repositorio cuando exista CI, para que el escaneo del propio proyecto no falle por su material de pruebas.
5. **Sin dependencias instaladas.** Nada de `vendor/` ni `node_modules/` versionados. Los fixtures son **árboles de código fuente que se analizan, no aplicaciones que se ejecutan**: los tests que contienen son ficheros que el grafo lee, no suites que este proyecto corra. Que sean coherentes y creíbles como código sí importa; que arranquen, no.

### `acme-shop` (PHP/Laravel) — el fixture difícil, a propósito

El readme §2.1 declara que el grafo de llamadas nunca será completo en PHP y que eso **se mide y se publica** en lugar de disimularse. Este fixture es el que produce esa medición, así que tiene que contener de forma deliberada lo que rompe el análisis estático:

- Dominio: pedidos, líneas de pedido, descuentos, impuestos, envío. La consulta de referencia de la demo es *«¿Cómo se calcula el precio final de un pedido?»* y su respuesta correcta implica que **los descuentos se aplican antes de los impuestos**. Esa cadena debe existir en el código, ser rastreable y estar cubierta por tests.
- La consulta de impacto de referencia es *«cambiar el cálculo de descuentos»*: tiene que haber impacto directo, impacto indirecto a 2 saltos, tests afectados y documentación relacionada.
- **Trampas para el analizador, repartidas y anotadas**: facades, resolución por contenedor de servicios, `__call`, atributos mágicos de Eloquent, rutas resueltas por *string*, `dispatch` de jobs y eventos. Cada una es un sitio de llamada que el analizador solo podrá marcar `heuristic`, nunca `exact`.
- **Drift plantado (F6), dos casos distintos y documentados**:
  - una divergencia real entre documentación y código — el `README` o un doc del fixture describe un comportamiento que el código contradice (p. ej. el orden descuento/impuesto, o un umbral que cambió y el doc no);
  - una regla de negocio **implementada y cubierta por tests pero no documentada en ningún sitio**.
  - El drift debe ser detectable por diferencia de fechas: el commit que cambió el código es **posterior** al último que tocó el documento que lo describe.

### `task-api` (TypeScript + Fastify) — el fixture preciso

Su función es el contraste: mismo núcleo, grafo notablemente mejor, porque el compilador resuelve referencias.

- Dominio: API de tareas (CRUD, filtros, paginación, estados). La consulta de referencia es *«¿Cómo se validan las peticiones entrantes?»*, así que la validación por esquema (Zod o el JSON Schema de Fastify) tiene que ser el patrón real y visible del código, no un detalle.
- Referencias **resolubles**: imports explícitos, tipos anotados, sin `any` gratuito ni acrobacias dinámicas. Aquí no se plantan trampas: la gracia es que salga limpio.
- Tests unitarios y de integración como ficheros del árbol, con la misma calidad de escritura.
- No hace falta plantar drift aquí: F6 se demuestra en `acme-shop`.

## Entregable adicional: la verdad-terreno

Escribe `fixtures/README.md` — es el documento que hace que los fixtures sirvan como arnés de pruebas en vez de ser dos carpetas de código bonito. Debe contener, para cada fixture:

- qué es, qué stack y qué recuento real de ficheros;
- el **inventario del drift plantado**: qué afirma el documento, qué hace el código, en qué commit divergieron;
- la **regla de negocio no documentada** y los tests que la cubren;
- las **preguntas de demostración** con su respuesta esperada y los ficheros y rangos de línea que deberían aparecer como evidencia (esto es la base del `npm run verify` del hito 6, y de las ~12 preguntas cacheadas del modo demo);
- los **sitios de llamada anotados**: cuáles esperas `exact` y cuáles `heuristic`, con el motivo. El readme §2.6 pide 50 anotados a mano por lenguaje para la Tabla 2; deja al menos el formato y una primera tanda, y di en el informe cuántos faltan;
- los **pares de co-cambio** plantados en la historia de Git;
- dónde está el secreto plantado.

Rangos de línea: si te resulta frágil fijarlos ahora, ancla la evidencia a símbolos (clase y método) y deja el rango como pendiente de generar. No inventes números de línea que no hayas comprobado.

## Cómo trabajar

1. **Lee primero, planifica después.** Empieza por los ficheros de la sección Contexto. No escribas código hasta haber presentado el plan.
2. **Plan antes de generar**: propuesta de árbol de ficheros de cada fixture, dominio concreto, lista de trampas de PHP, inventario de drift previsto, y las opciones del punto 3 de Requisitos comunes. **Párate ahí y espera revisión.**
3. Después, por partes y en este orden: `task-api` (el simple, para fijar el criterio de calidad) → `acme-shop` → historia de Git de ambos → `fixtures/README.md`.
4. **Git**: crea `feature/entrega-2-CRN` a partir de `main` y trabaja ahí, en commits pequeños de un solo objetivo. **No hagas push ni abras PR sin confirmación.** Ojo al estado actual del repositorio: la rama activa es `feature/entrega-1-CRN`, `readme.md` tiene cambios en el índice y `CODEMIND-ROADMAP.md` está sin versionar — pregunta qué hacer con eso antes de cambiar de rama, no lo resuelvas por tu cuenta.

## Criterios de aceptación

- `fixtures/acme-shop/` y `fixtures/task-api/` existen, con recuentos de ficheros del orden documentado, y todo el código es original y coherente.
- Cada fixture tiene historia de Git con el rango de commits pedido, autores múltiples, referencias a PR y pares de co-cambio deliberados; y la forma de versionar esa historia es la que la autora aprobó.
- `acme-shop` contiene los dos casos de drift y las trampas de análisis estático, todos ellos inventariados en `fixtures/README.md`.
- `task-api` no tiene trampas: sus referencias son resolubles por el compilador.
- Un secreto sintético por fixture, detectable por `gitleaks`, declarado en el inventario.
- Nada de `vendor/`, `node_modules/`, claves reales ni ficheros de más de 1 MB.
- `fixtures/README.md` cubre los siete puntos de la sección anterior.
- No se ha tocado `packages/`, ni `docs/`, ni la configuración del monorepo, ni el harness.

## Al cerrar

1. Marca la fila 1 de la cola en `CODEMIND-ROADMAP.md` §4 y reescribe §3 «Siguiente paso concreto» en una o dos frases (pasa a ser el esqueleto del monorepo). Actualiza la fecha del encabezado.
2. Aplica la norma §6 del roadmap sobre `prompts.md`: registra en **esta misma sesión** el prompt significativo de esta fase, **literal**, en bloque de código, con su `**Ajuste humano.**`. Máximo 3 por sección. Prohibido reconstruir prompts de memoria y presentarlos como transcripción.
3. Informe final, breve: recuentos reales, decisiones tomadas, desviaciones respecto a lo pedido y lo que queda pendiente para la Tabla 2.
```

**Por qué funcionó.** Dos condiciones de parada dentro del propio prompt: «no escribas código hasta haber presentado el plan» y, en el punto 3 de requisitos comunes, «párate y presenta 2 o 3 opciones … espera confirmación». Eso convirtió una tarea de generación en una con dos revisiones humanas antes de tocar nada — el estado Git y la estrategia de versionado de la historia, que son justo donde un agente mete la pata de forma cara.

### Prompt 2 — Estado Git antes de cambiar de rama - Versionado de la historia y del readme

```
En vez de salir de la rama main sal de la rama feature/entrega-1-CRN, así no perdemos el acumulativo. Guion determinista reconstruye historia
```

**Ajuste humano.** El prompt inicial pedía ramificar `feature/entrega-2-CRN` **desde `main`**; lo corregí a ramificar **desde `feature/entrega-1-CRN`**, porque `main` no tenía ni el roadmap ni el retoque del readme y salir de ahí habría perdido el acumulativo de la entrega. La regla escrita cede ante el hecho concreto de dónde vive el trabajo. Y de las tres formas de versionar la historia Git anidada que se me ofrecieron —bundle binario, datos sintéticos en «modo fixture», o guion determinista que la reconstruye— elegí el **guion determinista**: es la única que deja un `.git` real sobre el que corre el extractor `simple-git` de verdad, sin blob binario y revisable en diff. El fichero de datos era más cómodo de versionar pero habría dejado sin probar justo el componente que los fixtures existen para alimentar.

### Prompt 3 — Corrección de los cuatro defectos del hito 1

Prompt con el que se abrió la sesión de corrección. Proviene del informe de revisión de ingeniería (`revision-fixtures-y-prompt-correccion.md` §3), preparado por un modelo diferente (con Cursor) en una sesión anterior y revisado mi antes de pegarlo:

```
## Contexto

Trabajas en **CODEMIND** (fork `DisTinta/AI4Devs-finalproject`). El hito 1 de la Entrega 2 —los fixtures `fixtures/acme-shop` y `fixtures/task-api`— está construido y commiteado en la rama `feature/entrega-2-CRN`. Una revisión de ingeniería ha encontrado cuatro defectos que hay que corregir **antes** de seguir con el esqueleto del monorepo.

Lee antes de tocar nada: `CODEMIND-ROADMAP.md`, `fixtures/README.md`, `readme.md` §1.1, §1.2, §2.5, §2.6 y §5 (HU1). El informe completo de la revisión está en `revision-fixtures-y-prompt-correccion.md` §2, en la raíz.

## Reglas duras — léelas dos veces

1. **Solo se toca `fixtures/`.** Nada de `packages/`, `docs/`, `openspec/`, `ai-specs/`, `.claude/`, harness, `docker-compose`, `Makefile` ni workspaces. El esqueleto del monorepo es el hito 2 y no es esta tarea.
2. **El comportamiento del dominio no cambia.** Ni un número.
3. **No se renombra ni se mueve ningún fichero existente.**
4. **Todo fichero que añadas o elimines debe reflejarse en el manifiesto de historia correspondiente.**
5. **No toques `readme.md` ni `CODEMIND-ROADMAP.md` sin preguntar.**
6. **No inventes.** Si una comprobación no la puedes ejecutar, dilo.
7. **Commits pequeños, uno por defecto corregido.**

[…prompt completo de 165 líneas en `revision-fixtures-y-prompt-correccion.md` §3…]
```

**Ajuste humano.** El prompt llegaba con cuatro defectos numerados y un «menor» que requería decisión. Decidí antes de dejar actuar al agente: (a) opción del menor → declarar en `fixtures/README.md` que el fixture PHP se analiza pero no se ejecuta, sin añadir `bootstrap/app.php`. El agente cumplió la restricción de tocar solo `fixtures/` y no tocó `readme.md` ni `CODEMIND-ROADMAP.md`. El único ajuste de fondo: el mecanismo de snapshots del Defecto 2 requirió dos iteraciones para ubicar el campo `before` en el commit correcto (toque previo al semántico, no en el semántico mismo).

---

# 10. Esqueleto del monorepo

Segundo hito de código de la Entrega 2: inicializar el esqueleto del monorepo con workspaces npm, Postgres + pgvector en Compose, Makefile, TypeScript estricto en todos los paquetes, y gate de arquitectura con `dependency-cruiser`.

### Prompt 1 — Encargo del esqueleto del monorepo

Prompt literal enviado a Claude Code vía `/plan` (modo planificación previo a ejecución):

````
## Contexto

Trabajas en **CODEMIND**, proyecto final AI4Devs de Cristina Rodríguez Núñez.
Repositorio: fork `DisTinta/AI4Devs-finalproject`. Rama activa: `feature/entrega-2-CRN`.

El **hito 1 (fixtures)** está cerrado y verificado. No lo reabras.

Antes de escribir nada, lee en este orden y trabaja solo a partir de ellos:

1. `CODEMIND-ROADMAP.md` — estado, **decisiones cerradas** (§2), cola, reglas duras,
   norma de `prompts.md`.
2. `readme.md` §1.4 (instalación, `make up`, variables de entorno — LLM opcional /
   Ollama), §2.2 (Fastify, componentes), §2.3 (árbol exacto), §2.4 (Local + CI;
   sin hosting público), §2.6 (dependency-cruiser en CI), §6 Ticket 3 (solo para
   saber qué NO implementar aún).
3. `fixtures/README.md` — solo si necesitas saber cómo se reconstruye la historia
   (`node fixtures/build-history.mjs`); no modifiques fixtures.
4. `.gitignore` existente — respétalo y amplíalo solo si falta algo del esqueleto.

`ai4devs-requisitos-y-encaje.md` y `proposal-codemind/01`–`04` son histórico.
La enmienda `proposal-codemind/05-…` detalla evidencia/LLM, pero **manda el
readme + roadmap**; no la uses para ampliar el alcance de este hito.

## Objetivo — Hito 2 y nada más

Inicializar el **esqueleto del monorepo** de forma que:

- exista el árbol de paquetes de `readme.md` §2.3 (workspaces npm),
- `docker compose up -d` levante **PostgreSQL 16 + pgvector** saludable en `:5432`,
- `make up` ejecute la secuencia documentada en §1.4,
- TypeScript estricto compile en los paquetes,
- un chequeo de arquitectura con `dependency-cruiser` falle si `packages/core`
  importa de `adapters`, `analyzers` o `api`,
- **no** haya lógica de dominio, analizadores reales, esquema BD completo ni harness.

Al terminar, `docker compose ps` debe mostrar postgres healthy, y
`npm run typecheck` + `npm run lint:architecture` (o el nombre que fijes y
documentes) deben pasar en verde sobre el esqueleto vacío.

## Fuera de alcance — prohibido en esta sesión

- **No** instales el harness (`sdd-harness-kit`) ni crees `ai-specs/`, `openspec/`,
  `.claude/`, `.cursor/` de hooks, `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`,
  `codex.md`, `.mcp.json`, ni `docs/project-context.md`. Eso es el **hito 3**.
- **No** implementes el Ticket 3: ni las 10 tablas, ni CHECK, ni triggers, ni
  `seeds/graph-dump.sql` con datos reales, ni indexado de fixtures.
- **No** implementes Context Engine, verificador, analizadores PHP/TS, CLI real
  de `ask`/`impact`/`index`, ni la web de consulta (Ticket 1 / 2).
- **No** implementes el adaptador LLM real ni instales/configures Ollama en esta
  sesión (eso es hito 6). Las decisiones de roadmap §2 **ya están cerradas**:
  respétalas en `.env.example` (ver entregable §5) — key vacía, `LLM_BASE_URL`
  documentado para Ollama, sin claves reales, sin asumir Anthropic/OpenAI como
  vendor obligatorio. **No** reabras el bloqueo ni inventes un hosting/PaaS.
- **No** toques el contenido de `fixtures/acme-shop` ni `fixtures/task-api`
  (código, historia, README de fixtures).
- **No** inventes cifras de mediciones, DEMO.md con salidas falsas, ni pesos de
  CONFIDENCE.md. Si creas `docs/DEMO.md` / `TESTING.md` / `DEPLOYMENT.md` /
  `CONFIDENCE.md`, que sean stubs de una línea: "pending — Entrega 2/3".
- **No** crees ocho docs numerados espejando el readme (decisión explícita §2.3).
- **No** hagas push ni abras PR sin confirmación explícita de la autora.
- **No** merges a `main`.

## Entregables concretos

### 1. Monorepo npm workspaces (Node 20+)

Raíz con `package.json` workspaces apuntando a:

```
packages/core
packages/analyzers/php
packages/analyzers/typescript
packages/adapters/store-postgres
packages/adapters/llm
packages/adapters/git
packages/api
packages/cli
packages/web
```

Cada paquete: `package.json` con nombre `@codemind/<…>`, `tsconfig.json` estricto
(`strict`, sin `any` relajado), y un `src/index.ts` mínimo (export vacío o
placeholder tipado). `packages/core` **no** declara dependencias de otros
paquetes del monorepo ni de infra (no `pg`, no `fastify`, no tree-sitter).

`packages/core/src/ports/` puede contener interfaces vacías o con métodos
comentados como TODO Ticket 3+, con los nombres del readme:
`AnalyzerPort`, `LlmPort`, `StorePort`, `GitPort`. Sin implementaciones.

Stack fijado por el readme (no sustituyas):

- API: Fastify + Zod (esqueleto: servidor que escuche `:3000` y exponga
  `GET /health` y, si quieres, stub OpenAPI en `/docs` — **sin** los 3 endpoints
  de negocio todavía).
- Web: React + Vite en `:5173` (página mínima "CODEMIND — pending").
- CLI: binario `npm run cli` que por ahora solo imprima ayuda / "not implemented"
  (no inventes el comportamiento de `ask`).
- Tests runner previsto: Vitest (puedes dejar script `test` que pase con 0 tests
  o un test smoke del health). No hace falta Playwright aún.

### 2. `docker-compose.yml`

Solo lo necesario para el camino local del readme:

- servicio `postgres` (o nombre equivalente), imagen con **Postgres 16 + pgvector**,
- puerto anfitrión `5432`,
- volumen persistente (respetar `pgdata/` / `docker/pgdata/` del `.gitignore`),
- healthcheck,
- variable/credenciales locales documentadas en `.env.example` y
  `DATABASE_URL` por defecto apuntando al contenedor.

No añadas Redis, Neo4j, ni otros servicios "por si acaso". El readme no los pide.

### 3. `Makefile`

Debe exponer al menos:

- `make up` — secuencia **exacta** de espíritu §1.4:
  `docker compose up -d` → `npm install` → `npm run db:migrate` →
  `npm run db:seed` → `npm run dev`
- `make down` — para el compose
- Opcional: `make logs`, `make ps`

En Windows la autora usa PowerShell; escribe el Makefile en sintaxis Make
portable (Git Bash / WSL). Si un target no puede ser 100 % portable, documéntalo
en un comentario del Makefile, no inventes un `make.bat` paralelo salvo que sea
imprescindible y lo declares en el informe.

### 4. Scripts npm raíz (nombres alineados al readme)

Obligatorios:

| Script | Comportamiento en este hito |
|---|---|
| `dev` | API `:3000` + web `:5173` (concurrently o equivalente) |
| `db:migrate` | **Stub** que exit 0 e imprime claramente `pending Ticket 3` (aún no hay esquema). No inventes migraciones reales. |
| `db:seed` | **Stub** igual: exit 0 + mensaje `pending Ticket 3 / seed:build`. No cargues fixtures a Postgres todavía. |
| `seed:build` | Stub que recuerde que debe invocar `node fixtures/build-history.mjs` antes de indexar (Ticket 3 tarea 9); no indexar ahora. |
| `cli` | Ayuda mínima |
| `verify` | Stub exit 0 con mensaje pending (o falla con mensaje claro "not implemented"); no finjas respuestas de ask. |
| `typecheck` | `tsc` en workspaces |
| `lint:architecture` (o `depcruise`) | dependency-cruiser: **falla** si `packages/core` importa de `adapters`/`analyzers`/`api` |

### 5. `.env.example`

Variables del readme §1.4, sin secretos reales. Alineado a decisiones cerradas
(roadmap §2 / readme §1.4):

- `LLM_API_KEY=` (vacía; comentario: opcional — sin valor = modo evaluación /
  solo caché en hitos posteriores; con Ollama suele bastar placeholder `ollama`)
- `LLM_BASE_URL=` (comentario: API compatible OpenAI; ejemplo de desarrollo
  `http://localhost:11434/v1` para **Ollama**; vacío + key vacía = solo evaluación)
- `LLM_MODEL=` (comentario: modelo de generación; lo elige quien configure Ollama
  u otro endpoint — sin fijar Anthropic/OpenAI como obligatorio)
- `LLM_MODEL_VERIFY=` (comentario: modelo económico para verify en vivo; mismo criterio)
- `DATABASE_URL=` (default al compose local)
- `ALLOWED_REPOS_DIR=`
- `DAILY_BUDGET_USD=` (comentario: solo relevante con proveedor cloud de pago;
  irrelevante con Ollama local)

Ninguna clave inventada. Documentar Ollama como **ejemplo por defecto de
desarrollo** está permitido y es lo decidido; no implements el cliente HTTP aún.

### 6. `dependency-cruiser`

Config versionada en la raíz. Regla explícita: `core` ↛ `adapters|analyzers|api|cli|web`.
Incluye un test o script CI-local que demuestre el fallo si alguien rompe la regla
(puedes documentar el comando en el informe; un job mínimo en
`.github/workflows/ci.yml` que solo corra `typecheck` + arquitectura es bienvenido;
no hace falta la suite completa de integración).

### 7. Carpetas placeholder

Crea lo mínimo del árbol §2.3 que aún no exista:

- `seeds/` con un `graph-dump.sql` que sea solo comentarios SQL:
  `-- pending Ticket 3 — real dump will be produced by seed:build`
- `tests/unit/`, `tests/integration/`, `tests/e2e/` con `.gitkeep` si no hay tests aún
- `docs/adr/`, `docs/ai-sessions/` vacíos o con `.gitkeep`
- Stubs de una línea para `docs/DEMO.md`, `docs/TESTING.md`, `docs/DEPLOYMENT.md`,
  `docs/CONFIDENCE.md` si quieres alinear el árbol; **sin contenido inventado**.
  `DEPLOYMENT.md` = reproducible local/CI (Compose + verify), **no** guía de VPS
  ni demo alojada.

No crees los ficheros del harness listados en fuera de alcance.

### 8. Actualizar brújula y registro de IA (obligatorio, misma sesión)

1. `CODEMIND-ROADMAP.md`:
   - §1: código/monorepo = esqueleto listo; harness sigue pendiente
   - §3: siguiente paso = instalar harness + adaptador fastify → migrar roadmap
   - §4: marcar hito 2 con ✅
   - fecha de actualización = hoy
2. `prompts.md`: añade sección **`# 10. Esqueleto del monorepo`** con
   `### Prompt 1 — …` y este prompt **literal** en bloque de código, más
   `**Ajuste humano.**` (aunque diga "ninguno de fondo" si aplica).
   Norma §6 del roadmap. No reconstruyas prompts.

## Forma de trabajo

1. Primero propone el plan de ficheros a crear (lista corta). Espera confirmación
   solo si necesitas una decisión; si todo está cubierto por este prompt, ejecuta.
2. Commits pequeños y temáticos, por ejemplo:
   - `chore: scaffold npm workspaces and package stubs`
   - `chore: add postgres+pgvector compose and Makefile`
   - `chore: add dependency-cruiser architecture gate`
   - `docs: mark hito 2 done in roadmap + prompts.md`
3. No mezcles el esqueleto con cambios a fixtures.
4. Si una comprobación no la puedes ejecutar (p. ej. Docker no disponible),
   **dilo** y no finjas la salida. Es preferible "no corrí X" a inventar ✓.

## Verificación — pega salida real

```bash
# 1. Contenedor
docker compose up -d
docker compose ps
# postgres healthy en :5432

# 2. Install + tipos + arquitectura
npm install
npm run typecheck
npm run lint:architecture   # o el nombre que hayas fijado

# 3. Stubs de BD no deben fallar
npm run db:migrate
npm run db:seed

# 4. Dev (smoke): levanta y comprueba puertos
npm run dev
# GET http://localhost:3000/health  → 200
# http://localhost:5173            → responde HTML

# 5. Prueba negativa de arquitectura (debe FALLAR el comando)
# Añade temporalmente en core un import ilegal, corre lint:architecture,
# demuestra el fallo, y REVIERTE el import. Documenta ambos pasos.
```

## Criterios de aceptación

- Árbol de `packages/` existe según §2.3; `fixtures/` intacto.
- `core` sin deps de infra; dependency-cruiser rojo ante import ilegal y verde en el estado limpio.
- Compose solo Postgres+pgvector; healthy.
- `make up` / scripts §1.4 existen; migrate/seed/verify/seed:build son stubs honestos.
- `.env.example` con `LLM_*` opcionales + `LLM_BASE_URL` ejemplo Ollama; sin secretos
  reales; sin Anthropic/OpenAI como vendor obligatorio; sin hosting inventado.
- Cero ficheros del harness.
- Roadmap hito 2 ✅ y `prompts.md` §10 Prompt 1 literal.
- Informe final breve: qué se creó, salidas de verificación, commits, y
  "siguiente = hito 3 harness (no empezado)".

## Al cerrar

Pregunta explícitamente si la autora quiere que hagas push. Por defecto: no push.
````

**Por qué funcionó.** La estructura de «Lee primero, ejecuta después» y los apartados explícitos de fuera de alcance evitaron que el agente inicializara el harness, creara migraciones reales o tocara fixtures. La condición de parada del plan mode forzó una revisión humana antes de escribir código.

**Ajuste humano.** Tres bloques de ajuste. **Config (ejecución original):** Primera corrección: faltaba `@types/node` y el campo `"types": ["node"]` en `tsconfig.base.json`; el typecheck fallaba con `Cannot find name 'process'` en `packages/api` y `packages/cli` — se añadió al root devDependencies y al base tsconfig. Segunda corrección: el `tsConfig.fileName` de `.dependency-cruiser.cjs` apuntaba a `packages/core/tsconfig.json` y causaba un error de resolución del `extends`; se cambió a `tsconfig.json` (raíz) y funcionó. Ambos ajustes son de configuración, ninguno de fondo sobre el esqueleto. **Prueba negativa de arquitectura (verificación):** se añadió temporalmente `import '@codemind/api'` en `packages/core/src/index.ts`; `npm run lint:architecture` falló con `core-no-infra` (exit 1, 1 violation, 7 modules); se revirtió el import y el comando volvió a verde (exit 0, «no dependency violations found», 6 modules). **Cierre de revisión (5 sep 2026):** revisión de ingeniería detectó tres defectos: (1) `package-lock.json` no versionado — añadido a git; (2) Vitest recogía tests de `fixtures/task-api` — se creó `vitest.config.ts` en la raíz con `exclude: ['fixtures/**']` y `passWithNoTests: true`, `npm test` pasa con 0 tests (exit 0); (3) este bloque de `prompts.md` §10 estaba truncado con elipsis — restaurado con el texto literal de `prompt-esqueleto-monorepo.md`. Adicionalmente, se eliminaron las dependencias huérfanas `@fastify/swagger`, `@fastify/swagger-ui` y `zod` de `packages/api/package.json` (declaradas pero sin uso en `src/`).
