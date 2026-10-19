# Guion de la demo

Los seis pasos de `readme.md` §1.3, ejecutados desde una terminal contra el proyecto de muestra
`acme-shop`, más un recorrido por la web. Cada paso da el comando exacto y, debajo, la salida de una
ejecución real pegada tal como se capturó. Donde la Entrega 2 todavía no llega a lo que describe §1.3,
el paso lo dice y muestra lo que hace hoy el sistema.

**Los comandos son los mismos en PowerShell y en Bash** (Windows, macOS o Linux): se escriben tal cual,
sin exportar variables ni definir funciones. Los comandos que lee `.env` lo cargan solos, y una
variable ya definida en la terminal gana sobre `.env`.

## Cómo se capturó

| Dato | Valor |
|---|---|
| Fecha | [pendiente de la prueba desde cero] |
| Commit | [pendiente de la prueba desde cero] |
| Máquina | [pendiente de la prueba desde cero] |
| Terminales | [pendiente de la prueba desde cero] |
| Node / npm | [pendiente de la prueba desde cero] (el proyecto necesita Node 20.11 o posterior; la CI usa Node 20) |
| LLM | ninguno: **modo evaluación**, todas las variables `LLM_*` vacías |
| Base de datos | una base de datos nueva y vacía (ver el paso 0) |

Los únicos cambios hechos a la salida pegada:

- **(a)** `npm run up` se queda en primer plano (`npm run dev`); su salida se corta tras las líneas de
  arranque, marcadas con `[… sigue en marcha; se para con Ctrl+C]`.
- **(b)** una ruta absoluta del clon se sustituiría por `<repo>`.
- **(c)** se quitan los códigos de color de la terminal.
- **(d)** el nombre de la máquina en la línea de arranque de la API se sustituye por `<host>`.

**Campos que cambian en cada ejecución**, que hay que ignorar al comparar: el número de paquetes, el
tiempo y las líneas de auditoría de `npm install`; el prefijo `(node:<pid>)` y el `ready in … ms` de
Vite; `time` y `pid` en la línea de log de la API; y `latencyMs` en las respuestas de la API. El id del
proyecto lo fija la semilla.

## Antes de empezar

Comprueba que Docker está en marcha, que Node es la versión 20.11 o posterior y que Git está instalado:

```shell
docker info
node -v
git --version
```

`docker info` debe terminar sin error (si dice que no puede conectar con el daemon, arranca Docker
Desktop); `node -v` debe mostrar `v20.11.0` o posterior.

Desde la raíz de un clon del repositorio (`readme.md` §1.4), copia la configuración de ejemplo, que
deja todas las variables `LLM_*` vacías (modo evaluación, sin cuenta ni API key):

```shell
cp .env.example .env
```

**Si el puerto 5432 ya está ocupado.** El contenedor de PostgreSQL publica el puerto `POSTGRES_PORT`
de `.env` (`5432` por defecto). Si otro contenedor ya lo usa, el paso 0 se para en su primer paso y
`docker compose` dice `port is already allocated`; si lo usa otro programa, dice
`Ports are not available`. Con un PostgreSQL local ya escuchando en 5432, el arranque puede llegar más
lejos y fallar en `npm run db:migrate` con `password authentication failed for user "codemind"`. En
cualquiera de los tres casos, abre `.env` con un editor de texto (no con una redirección de la
terminal) y cambia a un puerto libre las dos líneas, con el mismo número:

```text
POSTGRES_PORT=5433
DATABASE_URL=postgresql://codemind:codemind@localhost:5433/codemind
```

Después vuelve a ejecutar el paso 0.

## Paso 0 — Arrancar el sistema

Terminal 1, desde la raíz del clon:

```shell
npm run up
```

```text
[pendiente de la prueba desde cero]
[… sigue en marcha; se para con Ctrl+C]
```

`npm run up` escribe una línea `[up] <comando>` antes de cada paso: arranca PostgreSQL y espera a que
acepte conexiones, instala las dependencias, migra la base de datos, carga la semilla y arranca la API
(`http://127.0.0.1:3000`) y la web (`http://localhost:5173/`). Se queda en primer plano: el resto de la
demo va en una **segunda terminal**, abierta en la misma carpeta.

> **Entrega 2.** La semilla carga **un** proyecto, `1 project loaded`; `task-api` entra en la semilla
> con CM-HU-18 (PH-02). `readme.md` §1.4 cita un extracto de esta salida.

Terminal 2. `npm run cli` lee `DATABASE_URL` de `.env`, así que basta con:

```shell
npm run cli -- projects
```

```text
[pendiente de la prueba desde cero]
```

## Paso 1 — Preguntar cómo se calcula el precio final

La CLI imprime la respuesta, cada afirmación tipada con su evidencia `ruta:inicio-fin`, y los
fragmentos citados (cinco líneas como máximo cada uno):

```shell
npm run cli -- ask acme-shop "¿Cómo se calcula el precio final de un pedido?"
```

```text
[pendiente de la prueba desde cero]
```

La CLI no imprime el uso de tokens; la API sí. `npm run demo:ask` envía la pregunta a
`POST /api/projects/{projectId}/ask` (el id es el que imprimió `projects`) y muestra el estado HTTP,
cuántas afirmaciones y evidencias volvieron y el bloque `usage`, o el cuerpo del error cuando el estado
no es 2xx. Termina con código `0` para un estado 2xx y `1` para cualquier otro:

```shell
npm run demo:ask -- a794456d-6d1b-5b55-a360-13fec83dc7bc "¿Cómo se calcula el precio final de un pedido?"
```

```text
[pendiente de la prueba desde cero]
```

> **Entrega 2.** En modo evaluación cada pregunta contestada sale de las respuestas golden que cargó
> `db:seed`, así que esta primera llamada ya es un acierto de caché: `cacheHit: true`, `costUsd: 0`,
> `inputTokens: 0`. `savingsPct: 100` es el ahorro de una respuesta servida desde la caché frente a la
> línea base guardada de contexto en bruto (`baselineTokens`, estimada como caracteres / 4). El ahorro
> de una generación en vivo se mide en la Entrega 3 (`readme.md` §2.6).

## Paso 2 — Abrir una evidencia

Todas las afirmaciones de arriba citan `app/Services/PriceCalculator.php:16-44`. La cita es relativa a
la raíz del proyecto de muestra, `fixtures/acme-shop`; `npm run demo:excerpt` imprime esas líneas del
fichero:

```shell
npm run demo:excerpt -- acme-shop app/Services/PriceCalculator.php:16-44
```

```text
[pendiente de la prueba desde cero]
```

Son las líneas del fragmento que imprimió la CLI (las cinco primeras) y que devolvió la API (todas).
`demo:excerpt` solo lee ficheros de `fixtures/<proyecto>`: una ruta que sale de él se rechaza.

## Paso 3 — Preguntar algo que el repositorio no puede responder

Los reembolsos no están implementados en `acme-shop`:

```shell
npm run cli -- ask acme-shop "¿Cómo se gestionan los reembolsos de un pedido?"
```

```text
[pendiente de la prueba desde cero]
```

`UNKNOWN (no-anchor)`: ningún símbolo del grafo ancla la pregunta, así que el sistema dice que no lo
sabe en lugar de inventar una respuesta. Lo decide antes de consultar ningún modelo ni la caché, y
termina con código `0` porque `UNKNOWN` es una respuesta.

## Paso 4 — Preguntar por el impacto de cambiar los descuentos

```shell
npm run cli -- impact acme-shop "cambiar el cálculo de descuentos"
```

```text
[pendiente de la prueba desde cero]
```

Termina con código `0`.

> **Entrega 2.** `impact` todavía es un stub. El análisis de impacto, que separa el grafo determinista
> de la señal histórica, es CM-HU-16, previsto para la Entrega 3.

## Paso 5 — Repetir el paso 1

La misma pregunta del paso 1, literalmente:

```shell
npm run demo:ask -- a794456d-6d1b-5b55-a360-13fec83dc7bc "¿Cómo se calcula el precio final de un pedido?"
```

```text
[pendiente de la prueba desde cero]
```

Una variante que solo cambia mayúsculas, tildes y puntuación. **No** es una reformulación: tiene la
misma clave normalizada, así que es la misma entrada de la caché (DIS-21):

```shell
npm run demo:ask -- a794456d-6d1b-5b55-a360-13fec83dc7bc "como se calcula el precio final de un pedido"
```

```text
[pendiente de la prueba desde cero]
```

> **Entrega 2.** `readme.md` §1.3 pide *reformular* la pregunta y obtener un acierto de caché por
> similitud. Eso es CM-HU-19 (PH-05); hoy un acierto de caché necesita la misma pregunta normalizada,
> como arriba. Y como el paso 1 ya se sirvió desde la caché (modo evaluación), lo que muestra este paso
> es que la pregunta repetida resuelve a la misma entrada, con `cacheHit: true` y `costUsd: 0`. El
> fallo de caché de una primera pregunta solo se ve en modo vivo, con `LLM_*` definidas, que esta
> captura no usa.

## Paso 6 — Cambiar a `task-api` y repetir el paso 1

```shell
npm run cli -- ask task-api "¿Cómo se calcula el precio final de un pedido?"
```

```text
[pendiente de la prueba desde cero]
```

> **Entrega 2.** `task-api`, la muestra en TypeScript, todavía no está en la semilla (`projects` en el
> paso 0 solo listó `acme-shop`), así que la CLI responde `PROJECT_NOT_FOUND` en stderr y termina con
> código `1` (npm añade después sus propias líneas `npm error`). Entra en la semilla con CM-HU-18
> (PH-02).

## Comprobar la instalación

`npm run verify` hace cada pregunta golden de la semilla y compara la estructura de cada respuesta con
la guardada, sin llamar a ningún modelo (`docs/DEPLOYMENT.md` →
[Verificar una instalación](DEPLOYMENT.md#verificar-una-instalación) explica sus fallos). Termina con
código `0`:

```shell
npm run verify
```

```text
[pendiente de la prueba desde cero]
```

## Recorrido por la web

Con `npm run up` en marcha, abre `http://localhost:5173/` en el navegador. Las dos pantallas siguen los
wireframes de `readme.md` §1.3 (`images/pantalla-1-seleccion.svg`, `images/pantalla-2-consulta.svg`).

**Pantalla 1 — Selección de proyecto** (`/`):

1. Arriba, la cabecera «CODEMIND» con «Comprensión de repositorios con evidencia verificable»; debajo,
   el título «Elige un proyecto para explorar» y «Repositorios precargados · sin registro · sin
   instalación».
2. La tarjeta de acme-shop: «PHP / Laravel» y sus cuatro recuentos (ficheros, símbolos, aristas y
   commits del grafo de la semilla), la insignia «✓ indexado» y, en cuanto la API contesta a su
   comprobación de salud, la insignia «listo» (mientras tanto, «comprobando…»).
3. El enlace «Explorar proyecto →» abre la pantalla 2 de ese proyecto.
4. Debajo de la tarjeta, «+ Indexar mi propio repositorio» es una indicación, no un botón: muestra el
   comando de la CLI (`npm run cli -- index <carpeta> --name <nombre> --language php`) y sus
   requisitos.

**Pantalla 2 — Consulta con evidencia verificada** (`/p/<id del proyecto>`):

5. Arriba, la barra del proyecto: «←» (vuelve a la pantalla 1), «acme-shop» y «PHP / Laravel · 170
   aristas»; debajo, el campo de la pregunta con el botón «→».
6. «Prueba:» y las tres preguntas sugeridas, que son las preguntas golden de la semilla: «¿Cómo se
   calcula el precio final de un pedido?», «¿Cómo se validan los cupones?» y «¿Qué hace OrderObserver
   al crear un pedido?». Pulsar una la envía; en modo evaluación las tres se responden desde la caché.
7. «Respuesta»: el texto de la respuesta y sus afirmaciones numeradas, cada una con la insignia de su
   tipo, «HECHO» o «INFERIDO», y la de su verificación, «verificado» o «sin verificar».
8. «Evidencia»: una entrada por cita, «ev-1 · app/Services/PriceCalculator.php:16-44». Al pulsarla (o
   con Intro o Espacio) se despliega el mismo fragmento que imprimió `npm run demo:excerpt` en el
   paso 2; al pulsarla otra vez se pliega.
9. Debajo, el panel de uso: «Confianza» con su valor, los tokens, el coste («$0»), la latencia en
   milisegundos, «ahorro 100 % vs bruto», «caché ✓» y la línea base («… tokens sin selección de
   contexto → 0 con CODEMIND»). En modo evaluación todas las preguntas sugeridas son aciertos de caché.
10. Una pregunta libre escrita en el campo, como «¿Qué hace ShippingService con los pedidos
    internacionales?», muestra en modo evaluación el aviso «Hace falta un modelo de lenguaje», que
    explica que la API solo responde las preguntas que tiene en caché y que para preguntas libres hay
    que configurar las variables `LLM_*`; añade que las preguntas sugeridas siguen respondiendo desde la
    caché.
11. Una pregunta que no nombra nada del código, como la del paso 3 («¿Cómo se gestionan los reembolsos
    de un pedido?»), muestra «Sin respuesta verificada», la frase que explica el motivo y «Motivo:
    no-anchor»: CODEMIND prefiere no inventar una respuesta.

**La API no disponible.** Para ver este estado, para el sistema (ver
[Parar el sistema](#parar-el-sistema)) y arranca solo la web:

```shell
npm -w packages/web run dev
```

12. En `http://localhost:5173/` la tarjeta de acme-shop sigue visible, sin «listo», y entre el subtítulo
    y la tarjeta aparece la alerta «La API de CODEMIND no está disponible. Puedes ver los proyectos, pero
    no preguntar hasta que vuelva. Arráncala con npm run up y pulsa Reintentar.» con el botón
    «Reintentar». Pulsarlo vuelve a comprobar la API una sola vez; si sigue parada, la alerta se queda.
    Para la web con Ctrl+C.

**Diferencias con los wireframes**, por los datos de la Entrega 2: hay una sola tarjeta (`task-api`
entra en la semilla con CM-HU-18), los recuentos son los del grafo de la semilla y no los ilustrativos
del wireframe, la pantalla 2 no tiene el botón «⟳» ni evidencias de PR (el historial de Git como
evidencia llega en la Entrega 3), las preguntas sugeridas son las golden y no las del wireframe, y el
indexado de un repositorio propio es una indicación del comando de la CLI en lugar de un botón. Los
valores del panel de uso son los de una respuesta servida desde la caché (0 tokens, «$0»), no los del
wireframe, que ilustra una generación en vivo.

## Parar el sistema

En la terminal 1, pulsa Ctrl+C. `npm run up` termina entonces con la línea `[up] stopped (Ctrl+C)`,
seguida de las líneas propias de npm con `code 130`: es el final esperado, no un fallo. Después, en
cualquier terminal:

```shell
npm run down
```

```text
[pendiente de la prueba desde cero]
```

`npm run down` para y elimina el contenedor; los datos se conservan en el volumen `pgdata`, así que el
siguiente `npm run up` no vuelve a crear la base de datos desde cero.
