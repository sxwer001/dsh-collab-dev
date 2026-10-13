# DSH Collaborative Development

[中文](README.md) · [Download v1.0.0](https://github.com/sxwer001/dsh-collab-dev/releases/tag/v1.0.0)

A main agent plans the work; native workers implement in parallel, followed by verification, independent review and integration.

## Install

Requires **DSH `0.2.0-rc.2`**, a configured model and Node.js ≥22.19.0.

```sh
dsh plugin --profile desktop add https://github.com/sxwer001/dsh-collab-dev/releases/download/v1.0.0/dsh-collab-dev-1.0.0.tgz
```

Use `web` for a web profile. Restart when requested by the host. The package includes its team component; do not enable the standalone AgentTeams bundle in the same profile.

## Use

1. Run `/collab-dev <goal>`. The main agent prepares shared scaffolding, interfaces and the complete plan.
2. Review the plan in the native team panel, then choose **Approve & Run**.
3. Two workers implement independent scopes, a verifier runs checks, and a reviewer reviews the results before integration.
4. Run `/collab-status` for progress, verification results and delivery blockers.

Plans and architecture are saved in `.collab-dev/`. Invalid dependencies, missing acceptance stages and overlapping parallel scopes are rejected. Incomplete uploads cannot be approved. To change the number of draft tasks, discard the draft and save/start a new plan.

## Scope

Version 1.0.0 uses native DSH agents in a shared workspace with scope audits. It provides no filesystem isolation, separate worktrees or external Codex/Claude Code backend. Verified on Windows, Node 24.15.0 and the DSH version above.

[Development and testing](DEVELOPMENT.md) · [Verification record](VERIFICATION.json) · [Example plan](examples/plan.json)

MIT · [Third-party notices](THIRD_PARTY_NOTICES.md)
