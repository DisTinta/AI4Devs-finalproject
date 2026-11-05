# 62. Deuda de `npm audit`: Vitest, Vite, Stryker y la base de Node 22 (DIS-105)

> Sección 62 del registro completo de uso de IA. El resumen, las herramientas, el contexto y los prompts más significativos están en [`prompts.md`](../../../prompts.md).

### Prompt 1 — Continuar el apply dentro del workflow autónomo

El script del workflow envió a este paso, entre otras reglas, este texto literal:

```
Ticket: DIS-105. Branch: feature/dis-105-npm-audit-debt. Change: openspec/changes/dis-105-npm-audit-debt. Step: apply.
Continue /opsx:apply on change dis-105-npm-audit-debt from the first unchecked task in tasks.md: the pending items include the full mutation run, steps 8 and 9, the documentation, the ADR and the PR. Every behaviour change in TDD, marking tasks.md as you go, with the mandatory verification steps. Run tests, lint and typecheck. Commit, push and open the PR to final-project-CRN with /pr-describe (write the "why" yourself and mark it as agent-written). Return pr.
```

**Por qué funcionó.** La mutación completa se lanzó antes que nada y enseñó lo que ningún test habría visto:
con Vitest 5.0.5 el runner de Stryker 10.0.0 no activa los mutantes (2 924 de 2 987 sobrevivieron, y un
fichero de 71 mutantes sacó 9,86 % frente a 97,18 % con Vitest 4.1.12). Parar la ejecución a los 12
minutos, aislar el fichero y comparar versiones costó unos minutos; dejarla terminar habría costado casi dos
horas para un resultado inservible.

**Ajuste humano.** Ninguno: ejecución autónoma. Decisiones del agente (`design.md` → D16, D17): quedarse en
Vitest 4.1.12 con Stryker 10 y Vite 8, y registrar lo que no se pudo ejecutar (el `.env` y la captura en
PowerShell 7 por permisos, y la captura de pantalla por falta de navegador).
