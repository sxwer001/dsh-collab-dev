# Development and verification

## Build

```sh
npm install --ignore-scripts --omit=peer
npm pack
```

Prepack applies the two documented fixes to the bundled AgentTeams 0.1.28,
then runs syntax and unit checks. Install the resulting `.tgz` with DSH;
unpacked source does not include the patched dependency.

## Tests

```sh
npm run check
npm test
```

For native runtime and installation tests, prepare an isolated runtime using
DSH 0.2.0-rc.2 or 0.2.1-rc.5 dependencies and the extracted npm package of AgentTeams 0.1.28:

```sh
node scripts/prepare-runtime.mjs <host-node_modules> <extracted-agent-teams>
npm run test:runtime
node scripts/install-check.mjs
node scripts/runtime-check.mjs <installed-package-directory>
```

Run preparation in a clean checkout or with the project's existing task-owned
runtime link. Dependencies are isolated per host and AgentTeams version under
`.test-runtime/`; preparation never replaces a normal npm `node_modules` directory.
`runtime-check.mjs` records the actual host/dependency versions, rather than a
hardcoded old-host label. Run both scenarios once for each declared host.

Plan commits and dependency patches retain atomic renames. On Windows only,
EPERM/EBUSY receives four retries with 50/100/200/400 ms delays; other errors fail
immediately. Unit tests inject temporary and persistent failures and verify cleanup
without masking the original error.

`install-check.mjs` also accepts a published `.tgz` URL. Runtime regressions use
scripted model responses with real DSH loading, tools, native agents and commands.
They cover concurrent workers, partial-plan approval rejection, duplicate starts,
member tool restrictions, status summaries and failed checks blocking integration.

## Real models

`node scripts/live-check.mjs` explicitly opts into billable model calls. The current
test adapter uses the desktop profile's OpenCode Go model route and native credential
service without copying credential values. Set `COLLAB_PACKAGE_ROOT` to test a
specific installed release; otherwise it tests the desktop installation.
The adapter explicitly enables and injects native credentials: rc.5's headless
bundle disables that service by default. No launch-time secret export is needed.

The main agent creates an order library's framework and eight-task plan. Native
workers implement pricing and shipping, then verify, review and integrate. The
driver checks concurrency, independently reruns tests and checks `/collab-status`.
Run `node test/live-acceptance.mjs <test-workspace>` for additional contract checks.
Evidence stays in ignored `.scratch/`; publish only aggregate results without
credentials or private session logs. See `VERIFICATION.json` for actual coverage.

The rc.5 / 1.0.1 real-provider run on 2026-11-04 completed all eight tasks with
82.216 seconds of worker overlap and 116 model requests. Independent checks passed
30 delivered tests, smoke and 46 additional contract assertions. The first
integration attempt caught an incorrect captain-authored overflow test; its owner
fixed the fixture and the verifier passed the second attempt. Native executable
restart and delivery status were checked separately. These results cover OpenCode
Go's deepseek-v4.1-flash route; they do not establish acceptance for other models.

The native status call may wake already approved work. It never approves a staged
plan or resumes a halted team. Status aggregates verification/integration task
outputs; it does not infer a test-case count from completed tasks. Native delivery
gates remain authoritative, including warnings about repaired historical failures.
