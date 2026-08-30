.DEFAULT_GOAL := help
.PHONY: help setup dev test check verify clean docker-build docker-run

help: ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

setup: ## Install exact dependencies from the lockfile
	npm ci

dev: ## Run with hot reload
	npm run dev

test: ## Run the test suite
	npm run test

check: ## Typecheck, lint and test
	npm run check

verify: ## Full pre-submission reproducibility gate
	npm run verify

clean: ## Remove build artifacts
	rm -rf dist coverage node_modules

docker-build: ## Build the container image
	docker build -t buzzba-ledger .

docker-run: ## Run inside the container
	docker run --rm -it buzzba-ledger

cases: ## Regenerate the 12 evaluation cases from seeds
	npx tsx scripts/gen-cases.ts

score: ## Score a run directory, e.g. make score RUN=runs/baseline
	npx tsx scripts/score.ts $(RUN)

baseline: ## Run the baseline over all 12 cases (needs ANTHROPIC_API_KEY)
	npx tsx scripts/run.ts baseline && npx tsx scripts/score.ts runs/baseline
