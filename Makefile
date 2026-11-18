.PHONY: install page-loader test lint lint-fix publish

install:
	npm ci

page-loader:
	node bin/page-loader.js

test:
	npm test

lint:
	npx oxlint && npx oxfmt --ignore-path=.oxfmtignore --check

lint-fix:
	npx oxfmt && npx oxlint --fix

publish:
	npm publish --dry-run
