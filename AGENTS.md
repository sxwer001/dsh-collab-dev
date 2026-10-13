# Development preferences

Use the installed Ponytail entry workflow and ponytail full for this project,
as requested by the user. Reuse NanmiCoder AgentTeams 0.1.23 and the public
DSH 0.2.0-rc.2 APIs. Do not duplicate the team scheduler, mailboxes or UI.
Preserve validation, cancellation, ownership and quality gates.
Bundle the documented AgentTeams requirements snapshot and complete-plan approval fixes; do not
patch shared dependency installations or conceal historical gate warnings.

Use isolated task-owned workspaces for tests. The user explicitly authorized
installing into the live desktop profile and testing with real models on
2026-10-12. Back up installation metadata first; resolve authentication through
the native provider without printing or copying credential values. This first release uses
the shared workspace with non-overlapping parallel write scopes. Worktree
is outside this release. Do not publish or push without user authorization.
