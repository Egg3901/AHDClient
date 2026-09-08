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

## Visual research: first-party screens

The following observations come from images actually downloaded and visually inspected, linked from the first-party pages. They are reference material, not assets to copy into the product. Marketing examples can differ from the currently installed app; no private vendor accounts were accessed.

| Reference viewed | Visible design choices | Application to Ops |
| --- | --- | --- |
| [Cursor Agents Window](https://cursor.com/docs/agent/agents-window), specifically its [file-view screenshot](https://cursor.com/docs-static/images/agent/file-agents-window-final.png) | The conversation occupies roughly 30% of the pictured window and the code area roughly 70%. A thin vertical separator divides them. The file pane has a compact toolbar, breadcrumb path, line numbers, and syntax color. The conversation contains summary and validation evidence above a bottom composer. Global navigation is hidden in this focused view. | Let review mode give files most of the width. Keep conversation available for follow-up and make the inspector dismissible. Files should feel like a working document surface, with structure and selectable text. |
| [Claude Code product page](https://claude.com/product/claude-code), specifically its [web screenshot](https://cdn.sanity.io/images/4zrzovbb/claude-com/050b07bf101bc4712abb3a7e1ba6f4d8dde33fcd-920x920.webp) | Warm pale surfaces, a large plain composer, a repository selector directly below it, and a searchable branch popover. Session entries use title and secondary repository context. The image is a crop, so it does not establish full-window proportions. | Make workspace selection visible near task entry. Reuse Ask's calm surface direction, with identity expressed through typography and a small mark rather than repeated illustrations. |
| [OpenAI desktop app documentation](https://learn.chatgpt.com/docs/app), specifically its [Codex demo poster](https://learn.chatgpt.com/images/codex/video-posters/proactive-teammate-v2.webp) | A neutral, nearly empty canvas centers one prompt heading, a small workspace chip, and a wide rounded composer. Attachment/access controls sit at its lower left, model controls and one solid send button at the lower right. There are no decorative metric cards around task entry. | Empty state should invite a concrete task. Let the composer be the visual anchor; move secondary usage detail to its own destination. This poster does not demonstrate the active conversation layout. |
| [Linear Inbox](https://linear.app/docs/inbox), specifically its [first-party image](https://webassets.linear.app/images/ornj730p/production/b442b340278740de70919c868dce1afca4335fe7-3600x2080.png?w=1440) | Priority and Other tabs carry counts. Each notification has one title, one quieter description, and a right-aligned status/time. Neutral dark surfaces and subtle boundaries keep attention on the rows. | Use this density for a Needs attention queue and completed worker list. Keep color for status; titles and supporting metadata should carry most of the hierarchy. |

### Concrete web layout recommendation

These dimensions are proposed Ops starting values, not measured vendor specifications:

- At desktop widths, use a 232 to 256 px collapsible sidebar, a 52 to 56 px workspace toolbar, and a central conversation column capped around 760 px. Keep 24 to 32 px horizontal breathing room around reading content.
- The sidebar should contain a compact Lakeside Ops identity, new conversation, recent conversations, and stable destinations for Agents, Files, and Usage. Show attention counts only where actionable. Put account/settings at the bottom.
- Opening a worker or file should reveal a 360 to 440 px inspector when space permits. Full review mode should expand the artifact to about 60 to 70% of the available content area, matching the task's needs. Collapse navigation before squeezing code into a narrow gutter.
- Below about 1100 px, prefer a drawer or full detail destination over three cramped columns. Below about 760 px, use one content pane and explicit Back navigation. Preserve conversation, selected workspace, file, and scroll position while switching.
- Use one sans-serif family for navigation and conversation. Start at 15 to 16 px body with 1.5 line height, 13 to 14 px secondary information, and 13 px monospace code. Use weight and spacing before adding color or boxes. Use Ask's actual font and token choices where already established.
- Use a 4/8 px spacing rhythm, 8 to 12 px control radii, and subtle one-pixel separators. Reserve stronger elevation for the composer, menus, and sheets. Avoid putting every message, metric, and activity row in its own raised card.
- A turn's activity summary should be one 36 to 40 px row with disclosure, current action, and elapsed time. Expanded rows should share a quiet timeline surface. Keep approval controls close to the exact action requiring input.

### Native iOS interpretation

- Use Ask's native font hierarchy and surface palette with a small Ops mark. Keep the top bar compact and let the conversation fill the screen. A normal completed answer should read as text, not a large padded status card.
- Keep a persistent bottom composer that respects the keyboard and safe area. Show workspace context compactly above or within it. Route advanced provider choices through a menu instead of filling the composer with chips.
- Use a single-column agent list grouped by attention state. A tap opens a detail destination with Activity, Report, and Files. Preserve the parent breadcrumb and provide clear return navigation.
- Expand short tool activity inline; open long output, file content, or a diff in a full-height detail view. Use a unified diff on phone and make horizontal scrolling local to code. Keep Copy and Ask about file accessible from the detail toolbar.
- Use at least 44 pt hit regions, Dynamic Type, text selection, and VoiceOver status labels. The compact visual style must not shrink touch targets. On iPad, restore a sidebar and detail/inspector arrangement when width supports it.

The common visual direction is clear: a quiet shell, one primary task surface, concise attention signals, and deep detail revealed on demand. The recommendations above translate that direction to Ops while preserving its own Lakeside identity.
