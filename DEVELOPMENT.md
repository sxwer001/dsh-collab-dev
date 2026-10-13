# Development and verification

## Build

```sh
npm install --ignore-scripts
npm pack
```

Prepack applies the two documented fixes to the bundled AgentTeams 0.1.23,
then runs syntax and unit checks. Install the resulting `.tgz` with DSH;
unpacked source does not include the patched dependency.

## Tests

```sh
npm run check
npm test
```

For native runtime and installation tests, prepare an isolated runtime using
DSH 0.2.0-rc.2 dependencies and the extracted npm package of AgentTeams 0.1.23:

```sh
node scripts/prepare-runtime.mjs <host-node_modules> <extracted-agent-teams>
npm run test:runtime
node scripts/install-check.mjs
node scripts/runtime-check.mjs <installed-package-directory>
```

`install-check.mjs` also accepts a published `.tgz` URL. Runtime regressions use
scripted model responses with real DSH loading, tools, native agents and commands.
They cover concurrent workers, partial-plan approval rejection, duplicate starts,
member tool restrictions, status summaries and failed checks blocking integration.

## Real models

`node scripts/live-check.mjs` explicitly opts into billable model calls. The current
test adapter uses the desktop profile's OpenCode Go model route and native credential
service without copying credential values. Set `COLLAB_PACKAGE_ROOT` to test a
specific installed release; otherwise it tests the desktop installation.

The main agent creates an order library's framework and eight-task plan. Native
workers implement pricing and shipping, then verify, review and integrate. The
driver checks concurrency, independently reruns tests and checks `/collab-status`.
Run `node test/live-acceptance.mjs <test-workspace>` for additional contract checks.
Evidence stays in ignored `.scratch/`; publish only aggregate results without
credentials or private session logs. See `VERIFICATION.json` for actual coverage.

The native status call may wake already approved work. It never approves a staged
plan or resumes a halted team. Status aggregates verification/integration task
outputs; it does not infer a test-case count from completed tasks. Native delivery
gates remain authoritative, including warnings about repaired historical failures.
