# CODEMIND — Makefile
# Sintaxis GNU Make. Requiere Git Bash o WSL en Windows.
# En PowerShell nativo usa: npm run <script> directamente.

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
