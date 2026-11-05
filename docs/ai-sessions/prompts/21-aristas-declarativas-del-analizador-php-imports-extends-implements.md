# 21. Aristas declarativas del analizador PHP: `imports`, `extends`, `implements`, rutas, `tested_by`, `describes` (DIS-49)

> Sección 21 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Arranque de la implementación completa

Texto literal enviado (comando, sin argumento de nombre de change): `/opsx:apply`.

**Por qué funcionó.** El change `php-declarative-edges` ya estaba propuesto y archivado desde una
sesión anterior, así que el comando bastó para que el agente leyera `proposal.md`/`design.md`/
`specs/code-analysis/spec.md`/`tasks.md`, pusiera DIS-49 a In Progress, creara la rama
`feature/DIS-49-php-declarative-edges` desde `feature/entrega-2-CRN` y recorriera las 49 tareas en
TDD: orden y unicidad de aristas en core (`edge-order.ts`), `describes` en core (`doc-mentions.ts`),
resolución de nombres por FQN (`names.ts`), aristas `imports`/`extends`/`implements`
(`edges.ts`), rutas por array (`routes.ts`), `tested_by`, las dos pruebas de fallo forzado y el score
de mutación (ambos ficheros de core muy por encima de `MIN_MUTATION_SCORE=70`), hasta dejar el
analizador PHP emitiendo exactamente las aristas descritas en el delta spec contra `fixtures/acme-shop`.

**Ajuste humano.** Dos correcciones durante la sesión:
1. Un rechazo accidental de una edición de test ("le di sin querer, no quiero rechazarte el test") que
   el agente simplemente reintentó sin cambios.
2. El agente intentó activar `KIT_ALLOW_WIP=1` para saltarse temporalmente el gate de tests del stop
   hook mientras una aserción de `structure.spec.ts` quedaba obsoleta a mitad de TDD; el clasificador de
   auto mode lo bloqueó como "Safety Bypass Flag". En vez de insistir, el agente corrigió esa aserción
   en el momento (el contenido real de la tarea 7.2, adelantado) y mantuvo el suite en verde en todo
   momento — mejor resultado que el atajo que había intentado.
   Al revisar la propia implementación también se encontró, sin que nadie lo señalara, un bug real: la
   función que normalizaba nombres (`rawNameOf`) le quitaba la barra invertida inicial a un nombre ya
   completamente cualificado (`extends \App\One\Dup`) antes de que `resolveClassName` pudiera verla, lo
   que rompía silenciosamente esa rama de resolución; se corrigió y se añadió un caso de test dedicado
   para que no pudiera volver a pasar inadvertido.
