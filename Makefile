# CODEMIND — Makefile
# GNU Make shortcuts for the npm commands (Git Bash or WSL on Windows). Every shell, PowerShell
# included, can run the npm commands directly: `npm run up`, `npm run down`.
# `npm run up` loads .env itself, so this file neither includes .env nor exports variables: a
# variable set in the environment wins over .env through make exactly as through npm (DIS-102).

.PHONY: up down logs ps

## Starts the whole system (readme.md section 1.4): npm run up
up:
	npm run up

## Stops and removes the containers; the data volume stays
down:
	npm run down

## Follows the compose logs
logs:
	docker compose logs -f

## Shows the containers' state
ps:
	docker compose ps
