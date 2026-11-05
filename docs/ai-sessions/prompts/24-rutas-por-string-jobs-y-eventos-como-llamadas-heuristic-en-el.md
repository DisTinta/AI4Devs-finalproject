# 24. Rutas por string, jobs y eventos como llamadas `heuristic` en el analizador PHP (DIS-97)

> Sección 24 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Enriquecer DIS-63 y dividirla

Texto literal enviado: `/enrich-us DIS-63`.

**Por qué funcionó.** El Reality map leyó el analizador y el fixture en vez de fiarse del ticket. Así
salieron tres datos que el ticket no traía:
- el sitio 4 (`$order->subtotal`) es una *lectura* sobre un *parámetro* tipado, dos cosas que la spec
  vigente excluía de forma explícita;
- `routes.ts` emitía cada ruta con `endLine` igual a su primera línea, en contra de la spec;
- tras las reglas nuevas, acme-shop queda con 0 sitios «no resueltos».

**Ajuste humano.** La autora no aceptó el primer borrador. Una auditoría (F1–F6) pidió:
- presentar el contador como opciones A/B/C, porque la primera recomendación chocaba con el «core
  vacío» de la HU padre;
- dar una cifra concreta de no resueltos;
- completar el delta con el escenario de `File classification`;
- aclarar la regla de las lecturas en cadena;
- recalcular las 11 aristas nuevas.

Después firmó cinco decisiones: contador solo en el adapter PHP (A), división inmediata en DIS-97
(rutas, jobs, eventos) y DIS-98 (Eloquent + contador), no tocar DIS-55, «no resuelto» = patrón Laravel
reconocido sin destino, y parámetros tipados solo para lecturas.

### Prompt 2 — Corregir los artefactos del propose

Texto literal enviado:

````
Actualiza SOLO los artefactos de openspec/changes/php-laravel-heuristics-2a
(proposal / design / specs / tasks). No implementes código ni abras PR.

Correcciones obligatorias:

1) Delta spec — MODIFIED «Symbol extraction»
   Añade la requirement (copiando del principal lo necesario) y cambia la bullet
   de route a algo inequívoco, p.ej.:
   «one `route` symbol per route statement (array- or string-action form),
   as defined in "Array-action routes"».
   Actualiza proposal.md → Capabilities para listar también Symbol extraction.

2) Escenario «Malformed string actions produce no route»
   Añade dos rutas con parte vacía, p.ej.:
   Route::get('/g', '@run');
   Route::get('/h', 'App\Ghost@');
   El THEN sigue: solo GET /a tiene símbolo; el resto no.
   Asegura que task 3.2 cubre /g y /h.

3) tasks.md — partir 3.1
   - 3.1a (solo tests / RED): actualizar structure/edges/calls MODIFIED,
     escribir escenario string-routes + acceptance heuristic-calls a 11
     (queda RED hasta el final). Confirmar suite RED en esos tests.
   - 3.1b (GREEN): actionOf string, RouteFact.form, split buildRouteEdges
     + appendUnshadowed. Verde excepto acceptance hasta 5.2/6.1.

Correcciones menores:
4) Task 5.4: añadir event(new static) a los extra cases sin arista.
5) Task 6.2: definir «anchor» = literal exacto a reemplazar; el script
   falla si el número de matches ≠ 1.
6) Opcional: nota al inicio de «Array-action routes» de que la sección
   cubre también string-action (sin renombrar la capability si complica sync).

Al terminar: lista «cambios vs artefacto anterior» y confirma que cada
#### Scenario: del delta tiene tarea con el mismo nombre.
No toques packages/ ni tests/ todavía.
````

**Por qué funcionó.** Separar RED y GREEN de las rutas en dos tareas convirtió el «exactamente tres
tests en rojo» en algo comprobable. Durante la implementación se vio así: `structure`, la ruta string
de acme-shop y el test de aceptación fallaron solos, y el resto siguió verde. Definir el *anchor* como
literal exacto con un único match dejó el script de fallos forzados sin ambigüedad.

**Ajuste humano.** Las seis correcciones son de la autora. El modelo añadió los nombres de los 34
escenarios a la tarea 7.3, porque su comprobación encontró que los 7 de `Symbol extraction` no
aparecían por nombre.

### Prompt 3 — Implementación completa

Texto literal enviado: `/opsx:apply php-laravel-heuristics-2a`.

**Por qué funcionó.** DIS-97 pasó a In Progress antes de nada. El test de aceptación (11 `heuristic`)
quedó escrito en la tarea 3.1a y se vio pasar de «símbolo no encontrado» a 7, 9 y 11 a medida que
entraban las rutas, los jobs y los eventos. Las dudas de gramática (`'App\Http\…'` con una sola barra
sale como un único `string_content`) se resolvieron con el parser del proyecto antes de escribir código.

**Ajuste humano.** Ninguno durante la implementación. Después, `/verify-against-spec` encontró
una ambigüedad y tres comportamientos no especificados. La autora aprobó tal cual las cuatro
recomendaciones del modelo (tareas §12):
- leer `$listen` entrada a entrada, y que la spec lo diga;
- declarar que un fichero de rutas con varios namespace conserva sus símbolos pero no tiene aristas;
- hacer que los colectores de Laravel no lean clases declaradas dentro de una función top-level;
- añadir a la spec la excepción de la regla 4 en «PHP name resolution».

Después, `/adversarial-review` dio PASS WITH GAPS. La autora aprobó cinco de las seis propuestas (§13):
- quitar la arista inventada de una ruta duplicada;
- ignorar los comentarios dentro de `$listen`;
- dar escenario con nombre a dos reglas de §12;
- abrir la deuda DIS-99;
- añadir a la spec la frase sobre los destinos anidados.

Corrigió la sexta: el modelo proponía recuperar el assert «`routes/web.php` no origina aristas», pero
contradice el sitio 12. Pidió reformularlo al comportamiento actual: la única arista de ese fichero es
la `heuristic` de `POST /checkout`.

Tropiezos del propio modelo, registrados en `tasks.md`:
1. El fallo forzado (f), que deja pasar las arrow functions, no rompió el escenario de eventos, porque
   su `event()` apuntaba a un evento sin listeners válidos. Se añadió un caso extra con listener real,
   que sí falla.
2. `jobs-events.spec.ts` se creó en la 4.1 y no en la 1.2: un fichero sin tests rompe Vitest.
3. El primer bucle de fallos forzados solo ejecutó la (a), porque `npx` consumía el stdin del bucle y
   `fc.exe` no abría rutas con `/`. Se corrigió con `< /dev/null` y `Get-FileHash`.
