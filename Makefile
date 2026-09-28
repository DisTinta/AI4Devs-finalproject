# CODEMIND — Makefile
# Sintaxis GNU Make. Requiere Git Bash o WSL en Windows.
# En PowerShell nativo usa: npm run <script> directamente.

# Carga .env si existe y exporta sus variables a todas las recetas: así `npm run db:migrate`
# recibe DATABASE_URL tras `cp .env.example .env`. Los scripts npm a pelo no leen .env.
ifneq (,$(wildcard .env))
include .env
export
endif

.PHONY: up down logs ps

## Levanta el sistema completo (secuencia §1.4 del readme)
up:
	docker compose up -d
	npm install
	npm run db:migrate
	npm run db:seed
	npm run dev

## Para y elimina los contenedores
down:
	docker compose down

## Muestra logs del compose
logs:
	docker compose logs -f

## Estado de los contenedores
ps:
	docker compose ps
