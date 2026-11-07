# DSH Collaborative Development

[中文](README.md) · [Download v1.0.1](https://github.com/sxwer001/dsh-collab-dev/releases/tag/v1.0.1)

A main agent plans the work; native workers implement in parallel, followed by verification, independent review and integration.

## Install

Requires **DSH `0.2.0-rc.2` or `0.2.1-rc.5`**, a configured model and Node.js 22.19+ (22.x) or 24+. Includes AgentTeams 0.1.29 with the requirements snapshot and incomplete-plan approval fixes.

Install the `.tgz` through Desktop's plugin manager. For a web profile:

```sh
dsh plugin --profile web add https://github.com/sxwer001/dsh-collab-dev/releases/download/v1.0.1/dsh-collab-dev-1.0.1.tgz
```

Restart when requested by the host. The package includes its team component; do not enable the standalone AgentTeams bundle in the same profile.

## Use

1. Run `/collab-dev <goal>`. The main agent prepares shared scaffolding, interfaces and the complete plan.
2. Review the plan in the native team panel, then choose **Approve & Run**.
3. Two workers implement independent scopes, a verifier runs checks, and a reviewer reviews the results before integration.
4. Run `/collab-status` for progress, verification results and delivery blockers.

Plans and architecture are saved in `.collab-dev/`. Invalid dependencies, missing acceptance stages and overlapping parallel scopes are rejected. Incomplete uploads cannot be approved. To change the number of draft tasks, discard the draft and save/start a new plan.

## Scope

Version 1.0.1 uses native DSH agents in a shared workspace with scope audits. It provides no filesystem isolation, separate worktrees or external Codex/Claude Code backend. Transient Windows EPERM/EBUSY rename failures receive bounded retries; persistent failures remain visible and unpublished plans are cleaned up.

Verification uses Windows, Node 24 and both hosts above, including scripted success/failure gate regressions. On 2026-11-04, the 1.0.1 package passed real-model acceptance on rc.5 with `opencode-go / deepseek-v4.1-flash`: eight completed tasks, 82.216 seconds of overlapping worker execution, 30 passing tests, smoke and 46 independent contract checks. Integration correctly blocked an incorrect captain-authored overflow test; the captain fixed it and the verifier reran acceptance. The original failure remains in the test evidence. The workflow made 116 model requests, recovering upstream connection failures through native retries. Restart through the installed DSH executable and a deliverable `/collab-status` also passed. Live acceptance covers this model only; earlier release results remain historical evidence.

[Development and testing](DEVELOPMENT.md) · [Verification record](VERIFICATION.json) · [Example plan](examples/plan.json)

MIT · [Third-party notices](THIRD_PARTY_NOTICES.md)
