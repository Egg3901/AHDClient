# Ops 1.3: agent workspace research

Researched 2026-09-08 against opened primary documentation. Recommendations below are product and engineering judgments, not claims that Ops already implements them. Current documentation can describe newer versions than the installed runtime; inspect local capabilities before exposing controls.

## What the leading tools establish

| Evidence | Implication for Ops |
| --- | --- |
| Codex app-server is intended for custom rich clients and exposes history, streamed events, approvals, and tool item start/completion. Command and file-change approvals have explicit request and resolution events. [App-server](https://learn.chatgpt.com/docs/app-server) | Represent work as structured activity with stable IDs and real status. Expand rows for command arguments, file paths, output, and approval context. |
| Codex review reflects repository state, including changes made outside Codex. It supports staged, unstaged, branch, commit, and last-turn views, collapsible file diffs, and line-specific feedback. [Code review](https://learn.chatgpt.com/docs/code-review) | Make Files and Changes a real workspace surface. Label the diff scope accurately; do not imply every modification belongs to the current agent. |
| Codex worktrees isolate parallel chats. Mobile controls work on the connected computer; repositories and commands remain there. [Worktrees](https://learn.chatgpt.com/docs/environments/git-worktrees) | Keep execution server-side. Give each coding worker a visible workspace and branch, with direct navigation to its files and changes. |
| Claude Code agent view groups sessions by attention state, permits a lightweight peek and reply, and supports attaching to the full conversation. Background work continues after the view closes. The current feature is a research preview. [Agent view](https://code.claude.com/docs/en/agent-view) | Prioritize Needs input, Working, and Completed. A worker card should expose the latest useful action and open a real detail screen. Closing a sheet must not stop a job. |
| Claude subagents isolate context and can have scoped tools, permissions, and persistent memory. They are distinct from separate background sessions and coordinated teams. [Subagents](https://code.claude.com/docs/en/sub-agents) | Record parent identity and job ownership. Distinguish Ops-managed workers from provider-internal subagents when that hierarchy is available. Avoid presenting unrelated sessions as children. |
| Cursor subagents isolate noisy exploration, shell output, and browser work. They return results to a parent and can operate in foreground or background. [Subagents](https://cursor.com/docs/subagents) | Collapse intermediate details without hiding their existence. Keep the main conversation readable while preserving drilldown and report provenance. |
| Paseo's daemon manages agents for mobile, desktop, web, and CLI. Its SDK creates agents; its CLI supports live attachment and follow-up messages. Source is Apache-2.0. [Official repository](https://github.com/getpaseo/paseo) | Extend the existing runtime adapter where supported. Keep provider-specific protocols behind the server; native screens should consume a stable Ops contract. Verify the installed version instead of assuming current README features exist locally. |

## Recommended 1.3 priorities

1. **A restrained workspace shell.** Follow Ask's existing type, spacing, composer, and surface treatments while retaining the Lakeside Games identity. Use neutral surfaces, subtle separators, one accent, and a strong content hierarchy. Replace oversized identity banners and repeated status badges with a compact title and workspace context. On phone, use focused screens; on wide web layouts, use a sidebar, conversation, and optional inspector.
2. **Collapsible actual activity.** Group a turn's tool actions under a compact summary such as “Reading 3 files” or “Running tests”, derived only from emitted events. Keep the currently running action visible. Each row expands to its useful details and final outcome. Completed activity collapses; errors and unresolved approvals remain discoverable. Do not call tool output hidden reasoning or claim to expose a model's private chain of thought.
3. **A subagent inspector.** Show parent, task, provider, workspace, state, latest activity, and elapsed time. Open activity and the final report independently. Provide only controls the runtime can perform: cancel, permission response, and follow-up where supported. Differentiate queued, running, awaiting input, reconciling, completed, failed, and cancelled. A generic spinner erases operationally important distinctions.
4. **Files and Changes.** Add workspace selection, lazy folder navigation, filename search, breadcrumbs, selectable text with line numbers, and a changed-file list with per-file diffs. Link file activity directly into this inspector. Default initial access to read-only. Offer “Ask about this file” using an explicit path reference. Display truncation, binary files, deleted files, and unsupported formats honestly.
5. **Actionable completion.** A finished worker should have a concise result, available validation evidence, and a route to its changed files. Keep “work completed” separate from “reviewed” or “merged”. Preserve the artifact when the worker is archived.

## Implementation and performance guidance

These are engineering recommendations rather than benchmark claims from the sources:

- Normalize activity into `id`, `parentId`, `turnId`, `agentId`, `kind`, `title`, `status`, timestamps, and bounded detail. Persist lifecycle transitions and retain replay cursors. Do not replay arbitrary external actions after reconnect.
- Keep initial snapshots compact. Fetch output, file contents, and diffs only when opened. Cache them by workspace, path, and revision; discard late responses when selection changes.
- Batch streaming text updates, use lazy lists, and preserve scroll position while the user reads older content. Auto-follow only while near the bottom. Respect reduced motion and Dynamic Type.
- Bound directory entries, preview bytes, diff size, output retention, and search duration. Restrict file access to approved workspace roots after canonical path resolution, including symlink checks. Do not allow the explorer to become a general server filesystem browser.
- Measure cold and warm launch, time to first usable conversation, first stream update, reconnect replay, file open, and large-transcript scrolling. Separate server timings from actual device/network timings.
- Verify 1.3 with a long tool-heavy conversation, several simultaneous workers, an unresolved permission, an offline/reconnect cycle, large files, deleted paths, and changed workspace selection during an outstanding fetch.

## Scope honesty

The strongest achievable direction is a polished remote agent workspace with inspectable work and concrete artifacts. This research does not establish that Ops currently has provider-internal subagent discovery, arbitrary session import, APNS notifications, inline editing, or full terminal interaction. Those require runtime and security contracts beyond adding UI. Expose supported features well rather than simulating missing capabilities.
