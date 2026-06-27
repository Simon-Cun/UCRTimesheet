.PHONY: setup dev lint format check

setup:
	npm install
	cd frontend && npm install

dev:
	@echo "Starting backend (Express + tsx watch) and frontend (Vite)..."
	@trap 'kill 0' SIGINT; \
	npx tsx --watch backend/server.ts & \
	cd frontend && npm run dev

lint:
	npm run lint
	cd frontend && npm run lint

format:
	npm run format
	cd frontend && npm run format

check:
	npx tsc --noEmit
	cd frontend && npm run build
