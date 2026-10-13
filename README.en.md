# DSH Collaborative Development

[中文](README.md) · [Release and installation package](https://github.com/sxwer001/dsh-collab-dev/releases/tag/v0.1.1)

`dsh-collab-dev` is a workflow extension on `@nanmicoder/dsh-agent-teams@0.1.23`, targeting DeepSeek Harness `0.2.0-rc.2`.

The main agent specifies architecture, interfaces and a complete quality plan. Two native workers implement independent scopes, a verifier runs checks, and a separate reviewer reviews each implementation before integration. Scheduling, messages, bounded repair and UI come from AgentTeams.

Download [dsh-collab-dev-0.1.1.tgz](https://github.com/sxwer001/dsh-collab-dev/releases/download/v0.1.1/dsh-collab-dev-0.1.1.tgz) and add it in DSH's plugin manager, or run:

```sh
dsh plugin --profile desktop add https://github.com/sxwer001/dsh-collab-dev/releases/download/v0.1.1/dsh-collab-dev-0.1.1.tgz
```

Use `web` for a web profile, or your custom profile name. Only DSH `0.2.0-rc.2` has been verified. The release bundles the fixed AgentTeams dependency and requires no install-time build scripts. Do not enable the standalone AgentTeams bundle in the same profile; this bundle already mounts it. Restart when requested by the host.

To build from source, run `npm install --ignore-scripts`, then `npm pack`. Prepack applies the documented requirements snapshot fix and runs syntax and unit checks. Install the resulting `.tgz`; an unpacked GitHub source install does not guarantee the fixed dependency.

Use `/collab-dev <goal>`. `collab_dev_plan` validates and saves the plan; `collab_dev_start` creates the complete staged quality DAG. Approve through the native panel. Planning starts no members. Inspect progress with `agent_teams_status` and use the panel to stop or resume.

Plans are immutable artifacts under `.collab-dev/<session-key>/<plan-id>/`; team state remains in `.agent-teams/`. Only the owning root session can start its plan. Cycles, incomplete gates and overlapping parallel write scopes are rejected. Replace sample commands in `examples/plan.json` with actual project checks.

Version 0.1.1 bundles AgentTeams 0.1.23 with one documented requirements snapshot fix. This preview uses a shared workspace, native same-session cold recovery and scope audits. It does not implement worktrees, external backends, hard read-only roles or deployment. A partially created team remains staged on failure, without starting writers.

`npm run check`, `npm test`, and `npm run test:runtime` cover syntax, plan/storage rules, and real DSH CLI/Loader/tools/native members with a scripted model. Coding workers overlap; verified and reviewed work integrates; a real failed command blocks integration. Windows/Node 24.15.0 is verified. Real-model planning quality and speed are not benchmarked. UI registration is checked; browser pixels are not inspected.

Real-model acceptance completed an eight-task plan with opencode-go/deepseek-v4.1-flash: two native coding windows overlapped by 69.419 seconds, 26 delivery tests passed, and 46 additional contract checks passed. A main-agent integration test defect was found by a worker and fixed. This is a functional sample, not a speed benchmark. See `README.md`, `compatibility.json`, `VERIFICATION.json`, and `THIRD_PARTY_NOTICES.md`. MIT.
