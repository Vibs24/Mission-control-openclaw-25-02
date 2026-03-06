# TEST_RESULTS

## 1) Initial workspace test attempt (failed, fixed)
Command:
```bash
npm run test
```
Output excerpt:
```text
> @pulsedesk/api@1.0.0 test
> vitest run
sh: vitest: command not found
...
> @pulsedesk/web@1.0.0 test
> vitest run
sh: vitest: command not found
```

## 2) API tests (after fixes)
Command:
```bash
cd apps/api
node ../../node_modules/vitest/vitest.mjs run
```
Output:
```text
Test Files  3 passed (3)
     Tests  3 passed (3)
Duration  698ms
```

## 3) Web tests
Command:
```bash
cd apps/web
node ../../node_modules/vitest/vitest.mjs run
```
Output:
```text
✓ src/app.test.ts (1 test)
Test Files  1 passed (1)
     Tests  1 passed (1)
Duration  262ms
```

## 4) Build validation
Commands:
```bash
cd apps/api && node ../../node_modules/typescript/bin/tsc -p tsconfig.json
cd apps/web && node ../../node_modules/typescript/bin/tsc -p tsconfig.json && node ../../node_modules/vite/bin/vite.js build
```
Output excerpt:
```text
✓ built in 1.21s
```
