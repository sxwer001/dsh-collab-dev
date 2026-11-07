# DSH 0.2.2-rc.1 candidate assessment — 2026-11-07

The declared host range remains `0.2.0-rc.2 || 0.2.1-rc.5`. This work does not
publish a release or certify normal installation on 0.2.2-rc.1. The new host's
version admission correctly rejects the released 1.0.1 manifest by default.

## Necessary changes

- New `tools.execute()` accepts batches, not the old single execution object.
  Composite tool calls now use the new host's public `ToolExecutionPipeline`
  prepare/dispatch/complete stages, preserving the host-created execution token,
  root call, parent, Agent, signal and step `toolSet`. Policy, approval denial,
  guards, cancellation draining, deferred context and terminal results remain
  host-owned. The existing trusted `/collab-status` command is identified
  separately; a model-tool forwarding call without its host token is rejected.
- AgentTeams is pinned to 0.1.29. Upstream supplies the Agent-owned model setup
  and modern fallback continuation: change selection, cancel while retaining the
  inbox, and continue in a new turn instead of changing a fixed retry route.
- The bundled scoped patch now prefers `captain.model.current()` over a stale
  request header, while retaining the older host fallback. The two existing
  requirements-binding and incomplete-plan approval fixes remain applied.
- Prompt sections do not modify assembly-owned tool declarations. This plugin
  and AgentTeams do not directly register Session projections, so no speculative
  projection adapter is introduced. Session metadata used for ownership and
  workspace paths remains available in the inspected new Session interface.
- Static comparison of AgentTeams 0.1.28/0.1.29's client exports, injected UI
  services and external modules found no new host UI dependency. Changes are in
  its own activity polling/cache and workspace rendering; DOM behavior was not
  exercised in this assessment.

Reference: [official 0.2.2-rc.1 release](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.2-rc.1),
the exact official npm packages for both host versions, and AgentTeams 0.1.29's
published `lib/members.js`. DSH 0.2.2-rc.1 requires Node >=24.9; this assessment
uses Windows and Node 24.15.0.

## Automated verification

`npm run check` and the nine pure plan/status unit tests remain separate from
host verification. With task-owned host dependencies prepared, run:

```sh
npm run test:host
npm run test:runtime
```

The host check uses real Cordis, prompt/tool registries, Native execution and,
on the new host, the real PTC executor with a deterministic program-backend
fixture. It covers nested dispatch, conditional denial, guard and unavailable
approval denial, cancellation draining, deferred/terminal results, captain model
selection and two rounds of registration/disposal. PTC model-direct native calls
remain rejected. This is an executor-contract test, not a sandbox backend test.

The CLI fixture uses real host loading, Agents, Session persistence, native
subagents, team scheduling and actual file-validation commands, with an entirely
scripted provider. Scenarios cover successful delivery, a real failed command,
explicit halt, and four member quota failures that switch to a configured
fallback without repeating the eight unique task checks or task attempts.

| Host | Real registry/executor checks | Native CLI success / failure / fallback |
| --- | --- | --- |
| 0.2.0-rc.2 | Passed (legacy Native path) | Passed / passed / passed |
| 0.2.1-rc.5 | Passed (legacy Native path) | Passed / passed / passed |
| 0.2.2-rc.1 | Passed (Native and PTC contracts) | Passed / passed / passed, under the task-only admission described below |

The original single-execution wrapper fails against the new Native executor.
Removing only the captain-selection patch also fails the pending-choice
regression (`old-provider` instead of `selected-provider`). Both regressions pass
with the candidate changes. New-host trace checks confirm two implementation
workers actually overlap. AgentTeams 0.1.29 also reads the completed eight-task
state produced by 0.1.28 without rewriting its JSON.

The 0.2.2 CLI probe uses only this task-owned profile:
`.scratch/runtime-1794037638789/success/home/profiles/headless`.
An exact-version `dsh plugin allow-version` exemption was granted there solely
to reach candidate runtime testing, then revoked through the official CLI.
This is not evidence that the unchanged published manifest permits installation.
The candidate launcher also retains the new headless startup service needed by
the host's sandbox/working-directory composition; its ordinary task runner stays
disabled so only the fixture drives Agents.

Completed and explicitly halted/failed teams are resumed in a fresh process,
checking delivery/failure evidence, unchanged tasks, and no new member/model
work. An approved team that has not been halted may legitimately wake its ready
repair tasks on a status query; that existing contract is preserved.

## Limits

No real model/provider API, GUI, live user profile or workspace is used. Scoped
registry unload/reload does not certify Desktop package hot-update failure and
rollback. The transport bridge targets the official Native/PTC contracts, not
private restrictions owned by arbitrary third-party executors. Keep the declared
host range until the broader installation/UI acceptance is performed.

`VERIFICATION.json` is historical v1.0.1 / AgentTeams 0.1.28 real-model evidence
from 2026-11-04; it is not reused as certification for this dependency upgrade or
the 0.2.2 candidate. This document describes the present automated checks.
