# Lakeside Ops frontier comparison and implementation criteria

Research date: 2026-09-09 UTC. Research only; no application changes, deployments, or provider inference performed by this researcher. Current Ops implementation is being independently audited by the parent agent. Accordingly, the matrix below names gaps to verify, not unsupported assertions that a feature is absent.

## Evidence and scope

Paseo source was cloned read-only to `/tmp/ops-paseo-research-20260909`. Inspected revision: `da8c1b5c94e752b01d451645e5fa52aba2c1b2f0`, commit timestamp 2026-09-08T13:40:21+02:00, subject “Make orchestration setup, profiles, and agent communication discoverable (#4486)”. All Paseo links below pin that revision. This is current repository source, not proof that the installed production daemon or App Store client contains every feature. No Paseo tests or performance benchmarks were executed here. Public first-party documentation was fetched on the research date; publication dates are reported only where supplied.

There is no objective “100% frontier” certification. A defensible target is a measured, reliable personal agent control system that matches the strongest relevant workflows, preserves provider capabilities, and has explicit evidence for its quality and performance. The useful comparison is task completion from iPhone and browser, not counting buttons.

## Verified Paseo behavior

### Usage is a typed capability, separate from agent execution

The protocol request is `{type:"provider.usage.list.request",requestId}`. The matching response has `payload:{requestId,fetchedAt,providers}`. Provider rows include `providerId`, `displayName`, `status` (`available`, `unavailable`, `error`), `planLabel`, optional source and refresh timestamps, `windows`, optional `balances`, optional text `details`, and error. Windows distinguish nullable used/remaining percentages, reset time, optional depletion forecast, and tone. Balances distinguish used/remaining/limit and units (`usd`, `credits`, `requests`, `tokens`). This does not imply every adapter supplies every optional field. [Protocol schema](https://github.com/getpaseo/paseo/blob/da8c1b5c94e752b01d451645e5fa52aba2c1b2f0/packages/protocol/src/messages.ts#L5928)

The service caches for five minutes, shares one in-flight refresh, and fetches adapters through `Promise.allSettled`. One failing provider does not reject all rows. Its manifest contains Claude, Codex, Copilot, Cursor, Z.ai, Grok, Kimi and MiniMax; there is no Muse or FreeRouter adapter in this inspected manifest. [Service](https://github.com/getpaseo/paseo/blob/da8c1b5c94e752b01d451645e5fa52aba2c1b2f0/packages/server/src/services/quota-fetcher/service.ts), [manifest](https://github.com/getpaseo/paseo/blob/da8c1b5c94e752b01d451645e5fa52aba2c1b2f0/packages/server/src/services/quota-fetcher/manifest.ts)

The Grok adapter calls its CLI billing endpoint with `format=credits`. Its comment explicitly warns that omitting this returns a zeroed legacy monthly shape for unified-billing accounts. It handles legacy and nested CLI auth layouts, monthly credits, and a weekly/monthly percentage window. This is evidence of Paseo's implementation, not a promise that the endpoint is a stable public xAI API. The Codex adapter directly uses the ChatGPT usage endpoint, which is distinct from the documented App Server integration. [Grok adapter](https://github.com/getpaseo/paseo/blob/da8c1b5c94e752b01d451645e5fa52aba2c1b2f0/packages/server/src/services/quota-fetcher/providers/grok.ts), [Codex adapter](https://github.com/getpaseo/paseo/blob/da8c1b5c94e752b01d451645e5fa52aba2c1b2f0/packages/server/src/services/quota-fetcher/providers/codex.ts)

### Mobile continuity is an explicit protocol contract

Paseo distinguishes live events from authoritative paginated history. Epoch and sequence cursors detect gaps and rewinds. Reconnection can paint a durable cached replica immediately, then reconcile a bounded tail. Live gaps page forward until complete. Stable client message identifiers reconcile accepted submissions without duplicating transcript rows. Tool output is bounded to 64 KiB in both live and restored history. Presence affects notification routing, not delivery correctness. This is documented architecture, with corresponding cursor planning implementation inspected. [Timeline contract](https://github.com/getpaseo/paseo/blob/da8c1b5c94e752b01d451645e5fa52aba2c1b2f0/docs/timeline-sync.md), [sync planner](https://github.com/getpaseo/paseo/blob/da8c1b5c94e752b01d451645e5fa52aba2c1b2f0/packages/app/src/timeline/timeline-sync-plan.ts)

### Staff and provider subagents are different objects

Managed Paseo agents have lifecycle controls. Provider-native children have separate descriptors and timelines, optional nested parent identity, and read-only transcript tabs sharing the main transcript renderer. Closing a child tab is layout-only. Archiving, detaching and runtime completion are different actions. The documentation warns that completed child presentation can accumulate under long-lived parents. [Agent lifecycle](https://github.com/getpaseo/paseo/blob/da8c1b5c94e752b01d451645e5fa52aba2c1b2f0/docs/agent-lifecycle.md), [provider child panel](https://github.com/getpaseo/paseo/blob/da8c1b5c94e752b01d451645e5fa52aba2c1b2f0/packages/app/src/panels/provider-subagent-panel.tsx)

### Performance is bounded work, not cosmetic animation

Paseo coalesces agent deltas with an immediate leading flush and trailing flush at a 60 ms default. Client updates batch per frame; history and terminal traffic have different budgets. Its terminal documentation reports local historical benchmark numbers, but also admits large agent payloads can delay terminal echo. Those figures are not transferable targets or measurements of Ops. The important pattern is measuring event-loop delay, queue pressure, serialization and input-to-paint separately. [Stream implementation](https://github.com/getpaseo/paseo/blob/da8c1b5c94e752b01d451645e5fa52aba2c1b2f0/packages/server/src/server/agent/agent-stream-coalescer.ts), [stream performance](https://github.com/getpaseo/paseo/blob/da8c1b5c94e752b01d451645e5fa52aba2c1b2f0/docs/agent-stream-performance.md), [terminal performance](https://github.com/getpaseo/paseo/blob/da8c1b5c94e752b01d451645e5fa52aba2c1b2f0/docs/terminal-performance.md)

Compact Paseo uses one mutually exclusive agent-list/chat/explorer selection. Retained panels preserve identity; hidden animations and polling stop via an activity signal. Files and Changes reuse panel implementations across mobile and desktop shells. File watching is bounded and falls back to polling on resource failures. [Mobile panels](https://github.com/getpaseo/paseo/blob/da8c1b5c94e752b01d451645e5fa52aba2c1b2f0/docs/mobile-panels.md), [explorer](https://github.com/getpaseo/paseo/blob/da8c1b5c94e752b01d451645e5fa52aba2c1b2f0/docs/explorer-sidebar.md), [file observation](https://github.com/getpaseo/paseo/blob/da8c1b5c94e752b01d451645e5fa52aba2c1b2f0/docs/file-observation.md)

Paseo semantic permissions distinguish principals, credentials and expiring invitations. Current documented grants are daemon-wide; workspace-scoped enforcement is described as future work. This is a useful explicit limitation, not evidence of per-workspace isolation today. [Permissions](https://github.com/getpaseo/paseo/blob/da8c1b5c94e752b01d451645e5fa52aba2c1b2f0/docs/permissions.md)

## Other frontier reference points

- **Codex App Server:** official integration exposes threads, turn start/steer/interrupt, item lifecycle and tool progress. Steering uses an expected turn ID. Documented ChatGPT quota reads include multiple limit buckets, used percentage, window duration and reset timestamp; retain all buckets rather than flattening them into one guessed weekly bar. [Official App Server documentation](https://learn.chatgpt.com/docs/app-server), retrieved 2026-09-09, publication date not supplied.
- **Codex subagents:** inspectable child threads and parent-mediated steering/closure are documented. The web subagent list is described as read-only; do not copy an assumed direct-control feature that the source does not claim. [Official subagents documentation](https://learn.chatgpt.com/docs/agent-configuration/subagents), retrieved 2026-09-09.
- **Claude Remote Control:** synchronizes local sessions and subagent progress across mobile/browser/terminal, accepts attachments, and queues messages, permissions and updates during reconnection. It preserves local execution. [Remote Control](https://code.claude.com/docs/en/remote-control), retrieved 2026-09-09.
- **Claude teams:** documentation explicitly marks teams experimental and notes resumption/coordination/shutdown limitations. It distinguishes independent teammates from children that report only to a parent. [Agent teams](https://code.claude.com/docs/en/agent-teams), retrieved 2026-09-09.
- **Claude memory:** human instructions and agent-authored memory are different. Memory can be inspected/edited; the startup index is bounded and detailed topic files load on demand. This supports an auditable memory surface, not endlessly enlarging system prompts. [Memory](https://code.claude.com/docs/en/memory), retrieved 2026-09-09.
- **Claude checkpoints:** rewind does not undo ordinary shell side effects and generally does not restore subagent edits. Ops should never imply universal undo. [Checkpointing limitations](https://code.claude.com/docs/en/checkpointing), retrieved 2026-09-09.
- **Cursor Cloud Agents:** dedicated environments, user takeover, and screenshots/videos/logs demonstrating completion are documented. This sets a higher bar than a green task badge based solely on model prose. [Cloud agent explanation](https://prod.cursor.com/help/ai-features/background-agents), [environment setup](https://prod.cursor.com/docs/cloud-agent/setup), retrieved 2026-09-09.
- **OpenCode:** its server exposes a typed client/server interface; permissions and agent configuration are first-class concepts. Treat protocol adapters as capability boundaries rather than parsing a terminal screen. [Server](https://opencode.ai/docs/server/), [permissions](https://opencode.ai/docs/permissions/), [agents](https://opencode.ai/docs/agents/), retrieved 2026-09-09.
- **ACP:** session setup and prompt turns provide a shared integration vocabulary. The usage document found is an RFD, not proof of universal deployed support. Its separation of per-turn tokens, context occupancy and session cost is valuable; negotiate actual provider capability. [Session setup](https://agentclientprotocol.com/protocol/v1/session-setup), [prompt turn](https://agentclientprotocol.com/protocol/v1/prompt-turn), [usage RFD](https://agentclientprotocol.com/rfds/session-usage), retrieved 2026-09-09; RFD initial draft 2025-12-07, last listed revision 2025-12-19.
- **Agent evaluation:** Anthropic recommends realistic tasks, outcome grading, distinguishing capability from regression suites, and repeated trials. Pass@k and consistency across k trials answer different questions. [Demystifying evals](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents), published 2026-01-09, retrieved 2026-09-09.

## Prioritized gap matrix and proposed acceptance criteria

These are proposed Ops requirements informed by the references, not claims about existing functionality. Confirm each against code and running behavior before implementing.

| Priority | Capability to verify or improve | Concrete acceptance evidence |
| --- | --- | --- |
| P0 | Every configured provider appears in usage | Codex, Muse, Grok and FreeRouter render independently on iOS and web, including explicit unsupported, stale and authentication-required states. A provider failure cannot blank the whole panel. |
| P0 | Honest usage semantics | Account quota, Ops-observed usage, model context, credits and local budget have distinct labels. A bar requires a known denominator. Unknown is never rendered as 0% used or 100% remaining. Preserve provider windows and timestamps. |
| P0 | Durable accepted work | Kill/reopen client during a tool call, disconnect after submit before acknowledgement, reconnect after several minutes, and attach a second client. Exactly one logical submission and one tool execution survive; transcript catches up without duplicate text or stuck spinner. |
| P0 | Staff lifecycle and cancellation | Main staff identity/memory survives worker runtime closure. Every job has owner, purpose, provider/model/effort, start/end, terminal reason and result. Cancellation has acknowledgement and eventual terminal state. Process closure cannot erase history. |
| P0 | Safe adaptive routing | Filter by capabilities, permission scope, provider health and budget before scoring. Log why a provider was chosen and why others were excluded. Retry only safely repeatable work; do not silently restart a partly executed tool task with another provider. |
| P1 | Inspect and intervene | Main and worker transcripts use one event vocabulary. Expand tool input/result, duration, failures and artifacts. Direct worker messages preserve parent ownership. Unsupported native children are visibly read-only. |
| P1 | Working review surface | Phone can inspect changed files, unified diffs, test results, image artifacts and shell output. File preview has size limits and path authorization. Display actual worktree/branch association and conflict state. |
| P1 | Permission inbox | Pending action identifies agent, exact action/resource, reason and scope. Approval is tied to a stable request and current run. Reconnect cannot approve twice or apply an old approval to a new turn. |
| P1 | Measured mobile responsiveness | Record first-byte, first-visible-token, event-to-render and reconnect latency independently. Profile long history and simultaneous staff streams. Finished history does not reparse for every delta. Background views stop needless animation/polling. |
| P1 | Benchmark-backed router | Version task, repo snapshot, harness, model, effort and limits. Include small bug fixes, implementation, research, tool use and vision. Score executable outcomes, latency, cost, retries and cleanup. Expose sample count and age. |
| P2 | Inspectable memory | Every durable memory has source, scope, modified time and correction/deletion path. Retrieved memory is attributable in the run. Separate instructions, facts and speculative summaries. |
| P2 | Completion evidence | A completed coding task links its diff and actual checks; a research task links sources. A worker timeout is not completion. Notifications open the precise result or permission request. |
| P2 | Scheduled work and capacity | Schedule records trigger, missed-run policy, deadline, concurrency and budget. Idle does not mean a permanent process. Expired workers cleanly release slots and persist a compact handoff. |

## Recommended build order

1. Freeze the telemetry contract and establish fixtures for real provider response shapes. Make native and web share semantics through server-normalized data. Add stale age, last good sample and refresh state without unnecessary account polling.
2. Implement the all-provider bars and provider detail view. Distinguish measured counters from estimated spend, and preserve fallback explanation. Treat upstream schema drift as unknown/error with the previous sample marked stale.
3. Validate lifecycle, reconnect and cancellation before adding more autonomous workers. Introduce durable run and submission identities where missing.
4. Unify staff activity, tool disclosure and artifacts, then expand review and intervention surfaces. Keep the main chat as the primary workspace; staff, files and usage should be one or two taps away rather than separate administrative dashboards.
5. Build a small representative evaluation suite and run each candidate provider/effort under identical tool and runtime constraints. Record practical quality and p50/p95 completion latency, not merely tokens/second. Promote successful capability cases into regression checks.
6. Add a constrained routing policy using evidence from those trials. Reserve stronger reasoning for ambiguous, architectural or high-impact work; use cheaper eligible workers for bounded research and mechanical tasks. This is a hypothesis to test, not a universal model ranking.
7. Soak iOS and web with several active workers, long transcripts, bursty tool output, app background/foreground transitions and simulated poor network before considering release.

## Specific implementation cautions

- Do not transplant Paseo React Native UI into the native Swift app. Reuse contracts, lifecycle ideas and measured techniques; implement appropriate SwiftUI presentation.
- Direct billing endpoints may change independently of an installed CLI. Prefer documented capability when available and contain vendor parsing in one adapter.
- A free provider is not guaranteed unlimited or reliable. FreeRouter needs its own known quota source or truthful locally observed counters; no invented account limit.
- Global percentage aggregation across credits, requests and subscription windows is meaningless. An overall health summary can name constrained providers, but it should not claim one universal remaining percentage.
- Token counts are not always billable totals. Paseo explicitly warns that replayed Claude child `totalTokens` can represent context size. Do not sum every cached prefix into spend.
- Failover after code edits needs a checkpoint/handoff containing task state, worktree and tool results. A generic replay of the original request can duplicate side effects.
- The proposed acceptance tests are the release criteria. This report is research input, not evidence that Ops meets them yet.

## Integration follow-up from parent audit

The parent independently verified the installed daemon's SDK `listProviderUsage()` on 2026-09-09: it returned Codex and Grok usage through a separate WebSocket service while Muse was absent. The existing Ops MCP adapter was not consuming that service. This is parent-reported live evidence, not a test performed by this researcher.

A source-level defect matters when adapting those rows: Paseo's Codex adapter hardcodes the primary window as `Session` and secondary as `Weekly`, while its parsed window schema retains only `used_percent` and `reset_at`. It also defaults an absent `used_percent` to zero. The parent's live primary window reset was several days away, making the Session label misleading. Ops should not infer the full window duration from time remaining. Prefer the documented App Server `windowDurationMins`; when only normalized legacy data is available, use a neutral quota-window label and preserve the precise reset. Avoid inventing zero where raw usage is absent. [Exact adapter](https://github.com/getpaseo/paseo/blob/da8c1b5c94e752b01d451645e5fa52aba2c1b2f0/packages/server/src/services/quota-fetcher/providers/codex.ts#L28)

## Local audit and selected work

Audit of the current Ops implementation confirms that only Codex allowances are wired. Both clients discard reset times and catalogue freshness; their token rings depict output share, which can be mistaken for capacity. The installed Paseo SDK exposes account usage separately from the MCP agent tools. Muse is not present in that usage manifest. Free Router exposes configured route availability and cooldowns, not a global subscription quota. These observations are schema/implementation evidence, not a public disclosure of account balances.

Grok 4.6 independently researched the current native/web surfaces and primary reference material. Muse Spark1.3 contributor independently audited telemetry and the MSP bridge; its first pass missed Paseo's Grok billing integration and that finding was corrected during synthesis. Missing a field in MSP is not proof that a provider lacks a separate account endpoint.

Selected implementation sequence, with no version bump or release:
1. Normalize per-provider quota windows, freshness, source, balances and known-unavailable states independently of runtime discovery. Fetch on demand with shared refresh work, bounded timeouts and last-good samples. Render quota separately from locally measured Ops traffic and Free Router route readiness.
2. Add a polished capacity view on native iOS and web: visible reset/age, exact status, accessible bars, expandable details, graceful individual provider failures, and visible-only refresh.
3. Harden mobile continuity: stable submission IDs, accepted-message reconciliation, controlled reconnect and no duplicate token replay. Preserve drafts on uncertain sends.
4. Improve compact main/worker activity and expose genuine provider child timelines when supported, with capability-aware read-only inspection. Closed runtimes must retain useful history.
5. Exercise network failure, stale quota, malformed values, concurrency, long history, and narrow-screen accessibility. Add measured performance evidence and record remaining gaps rather than claiming universal parity.

No production restart, store submission or signed build is part of this refinement pass. Changes remain reviewable in feature branches.


## Visual references inspected



### Paseo desktop

Three stable areas dominate: a narrow work queue, a wide readable transcript, and a narrower changes pane. Status groups distinguish work requiring review, active work and done work. Row-level project context and compact diff statistics provide density without large cards. The composer keeps provider, effort and permissions on one secondary line. A compact subagent count sits immediately above it. Changes show real code and per-file additions/deletions instead of a separate analytics dashboard.

Lesson for Ops web: use one primary workspace with staff navigation and a contextual review inspector. Place usage in a compact provider surface and a drill-down, not a large permanent row of decorative cards that pushes the conversation below the fold.

### Paseo phone

The list is flat and grouped, with project headers and indented branch/session rows. The chat gives most width to prose, reduces tools to short muted rows, and anchors the composer near the bottom. The model remains selectable at the composer. Files/Changes becomes its own full-screen surface with branch context, PR action and unified line-numbered diff.

Useful tension: the mobile screenshot truncates long session titles and shell commands. Ops should retain compact rows, but expand them into selectable full content. The mobile diff shows horizontal overflow, which is appropriate for code; do not wrap code into unreadable tall paragraphs. Long names need an accessible full-title view.

### Cursor desktop and phone

The inspected 2025 composite uses an orderly neutral palette. Desktop task list, conversation and review share aligned borders. The selected task includes model-result tiles, a compact checklist and changed-file rows. The phone uses the same task vocabulary in a single-column list, with a new-task composer above it. Status is a small icon plus descriptive text, not merely color.

Lesson for Ops: a staff row should name the actual task first, then show provider/project/status underneath. Put outcome evidence such as changed files and passed checks directly with the result. The image is an older launch capture; do not treat its precise controls as current Cursor requirements.

### Claude Code

The inspected tool timeline uses a quiet vertical connector, small status dots, bold action verbs and monospaced paths. A code result expands inline under its action, while a restrained accent marks ongoing work. The composer exposes queueing, current permission behavior and attached context close to the send/stop control. The web image keeps repository and branch selection directly under task entry.

Lesson for Ops: collapsed tool groups need a concise summary and visual continuity; expanded content should retain attribution and stay in the same transcript. Place the effective provider/effort, attachment context and stop action at the point of writing. Keep decorative brand color subordinate to content.

## Concrete design direction for Ops

These are proposed design decisions, not claims that screenshot inspiration alone validates usability.

1. **Make the active task the screen title.** Show the staff member and project as secondary context. Preserve the long title through an accessible detail action.
2. **Use compact staff rows.** Task title, literal runtime status, provider/model and elapsed time. A small badge can show pending intervention. Use sections for Needs attention, Working and Recent; persistent staff identity belongs in the same system without pretending every identity is running.
3. **Keep a single chat renderer.** Main and child transcripts share typography, tool groups, timestamps, artifact presentation and error states. A provider-owned read-only child gets an explicit subtitle and no misleading composer.
4. **Create a slim provider strip or summary.** Show provider name, known remaining percentage or balance, and stale/error indicator. Tap opens all windows, reset timestamps and source. Unknown quota has textual unavailable state, not an empty healthy bar.
5. **Use one Files/Changes inspector.** Wide web shows it beside chat; compact iPhone opens a full-screen view or sheet. Include branch identity and link from a tool result to the exact file/diff.
6. **Put disclosure where work happens.** A collapsed row such as “Read 4 files, ran 2 checks” expands to action names, arguments, result, duration and errors. Keep failures visible even when routine tool output is collapsed.
7. **Keep the composer stable.** Attachment affordance, provider choice, effort and stop/send are predictable. A short staff activity strip can sit above it; do not stack multiple large dashboards between transcript and composer.
8. **Brand with restraint.** Use Lakeside's own logo, consistent spacing and one controlled accent. Neutral surfaces, subtle separators and text hierarchy should do most of the work. Do not borrow competitor logos, illustrations or screenshots as shipped assets.

## Review criteria for the next implementation

- At iPhone width, can the user identify who is working, on what, and whether action is needed without opening every conversation?
- Can a usage row explain what its percentage measures in one tap?
- Can the user reach a worker transcript and a changed file from main chat within two deliberate actions?
- Can expanded tool output be selected/copied without disrupting scroll position?
- Does the same long task retain its title, branch and status when moving between phone and web?
- Are stale data, failed work and unsupported capabilities visibly different from idle or zero usage?
- Does large text preserve functional tap targets and avoid clipping provider controls?
- Do animations stop offscreen and respect reduced motion? Still images cannot establish this; test it separately.

The strongest shared pattern is operational clarity: a readable task-centered conversation, a compact queue, inspectable evidence and controls next to the relevant action. That is the useful visual benchmark for Ops.


Visual sources: [Paseo pinned promotional assets](https://github.com/getpaseo/paseo/tree/da8c1b5c94e752b01d451645e5fa52aba2c1b2f0/packages/website/public), [Cursor cloud agents, October 2025](https://cursor.com/blog/cloud-agents), [Claude Code product images](https://claude.com/product/claude-code), [Codex app screenshot](https://developers.openai.com/images/codex/app/codex-app-basic-light.webp). Actual image inspection, not search captions. Capture dates are unknown unless specified; screenshots establish layout, not latency or present capability.

## Implementation and validation checkpoint

The first implementation adds provider capacity on iOS and web, shared bounded quota collection, and retry-safe message receipts. Codex uses actual local telemetry timestamps and window durations. Grok uses the installed Paseo usage protocol. Free Router exposes configured route readiness separately from quota. Subsequent runtime investigation verified Muse subscription quota in its Responses SSE stream. The backend wrapper captures session and weekly usage during normal agent work; see the follow-up below.

The Paseo Codex fallback was deliberately excluded because its adapter supplies a fixed window label and defaults missing usage to zero. The local telemetry source preserves the actual duration and observation time. Fresh verified windows also inform dispatch; expired, future and failed readings cannot block routing as if they were current quota.

At the September 9 checkpoint, 132 backend tests passed, including restart-safe receipts, source failure isolation, hung-source deadlines, timestamp validation and exhausted Grok routing. A read-only live check measured 415 ms for the initial capacity snapshot and approximately 1 ms for 100 cached reads. This is a single server-side observation with provider-side caching, not an iPhone latency benchmark or a throughput guarantee.

Browser checks cover reply-stream reconnection without duplicate text, stable request IDs across retry, acknowledgement despite refresh failure, four provider cards, missing quota without a meter, retained disclosures and phone-width overflow. Native simulator validation remains separate. This branch does not bump versions, sign an archive, deploy the backend or cut a release.

Display preference confirmed by the owner: GPT/Codex and Grok quota bars count upward as usage is consumed. Their labels say percent used; higher consumption approaches the warning threshold. The routing contract still evaluates remaining capacity internally. A reset does not manufacture either zero usage or a full remaining balance before a fresh reading arrives.


## Muse quota follow-up

The installed Muse client 1.0.3-R2198.1 recognizes `response.subscription_usage`,
but its high-level `exec --json` stream omits that event. A bounded authenticated
Responses request returned a valid subscription frame. A second bounded run
through the actual CLI and a loopback stream observer completed successfully
and captured both windows. Account readings and raw probe output remain private.

The observed payload has `subscription.window` and `subscription.weekly`, each
with `used_percent` and `resets_at` in Unix seconds. The current window also has
`window_duration_mins`. The backend normalizes these into the existing capacity
contract. The observer stores only allowlisted numeric fields and does not
retain account identifiers, credentials, prompts or response content. It makes
no additional inference requests during normal usage. The separate Paseo Muse
bridge needs its executable configured to use the wrapper at deployment.

This supplies observed quota without fitting an assumed tokens-per-percent
formula. It is refreshed by agent work, not a continuously polled account feed.
Readings older than five minutes are stale; expired windows never synthesize a
refill. Other-device usage appears in the next account frame. Token forecasting
remains separate work. The official SDK also distinguishes counted-once token
usage from context occupancy and excludes child-session usage from root totals:
[session/tokenUsage](https://meta-models.github.io/muse-code-sdk/generated/msp/notifications/session-tokenusage/).

Backend validation now passes 138 tests, including fragmented SSE, malformed
frames, private cache writes, stale/reset handling and byte-preserving stream
forwarding. Browser checks cover both Muse windows as count-up bars. Native
simulator testing found and fixed a cancelled-refresh race during tab changes;
its rerun is tracked on draft PR45. No production deployment or release is part
of this checkpoint.
