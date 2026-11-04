# Changelog

## 1.0.1 — 2026-11-04

- Support DSH 0.2.1-rc.5 alongside 0.2.0-rc.2; rely on the host's declared compatibility check instead of a hardcoded old-runtime exception.
- Bundle AgentTeams 0.1.28 for the managed-activation API. Preserve requirements artifact binding and incomplete-plan approval protection.
- Retry transient Windows EPERM/EBUSY atomic renames with a bounded delay, clean failed plan drafts and retain original errors.
- Keep test dependencies separate per host and record their actual versions. Verify nine unit groups and successful/failed native collaboration on both hosts with a scripted model.
- Complete rc.5 real-model acceptance with the 1.0.1 package: eight tasks, two concurrent workers, 30 passing delivered tests, smoke, 46 independent contract checks and native executable restart. Preserve the first integration failure and subsequent repair in the evidence.
- Enable and inject native credentials in the real-model test adapter, accounting for rc.5's headless default. Keep 1.0.0 evidence under `previousRelease` in `VERIFICATION.json`.
