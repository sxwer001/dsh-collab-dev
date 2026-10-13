# Third-party notices

This plugin depends on @nanmicoder/dsh-agent-teams 0.1.23, authored by 程序员阿江 (Relakkes), https://github.com/NanmiCoder/dsh-agent-teams. Team scheduling, persistent members, quality gates and the existing UI are provided by that dependency. This plugin does not claim those components as an original implementation. Runtime fixtures follow the upstream project's Harness testing approach.

DeepSeek Harness is the MIT-licensed host platform: https://github.com/deepseek-ai/deepseek-harness. This is an independent community extension, without endorsement from DeepSeek or the AgentTeams author.

The AgentTeams license follows. Its package retains its own notices and dependency licenses.

MIT License

Copyright (c) 2026 程序员阿江(Relakkes)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

# Local compatibility fix

The bundled AgentTeams 0.1.23 has one local change in `bindReviewToRevision`:
a requirements verdict without an implementation target binds its own contract
and immutable architecture/plan artifacts. The original function otherwise
returns early and cannot record the reviewed bytes. Scheduling, permissions,
attempt ownership and other quality gates are unchanged. The reproducible patch
is `scripts/patch-agent-teams.mjs`; the original MIT notice above still applies.
