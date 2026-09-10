# Independent per-user Windows runner

Requires Windows 10/11 and .NET 10 (or a self-contained published build). The WinUI client launches this separate executable; closing the UI does not stop a running runner. No Windows service or administrator access is required.

```
Ops.Runner.exe pair https://your-hub.example
Ops.Runner.exe run
```

Both commands accept `--config C:\absolute\path\config.json`. Default state is `%LOCALAPPDATA%\Ops\runner`: `config.json`, `device.dpapi`, `receipts.sqlite` and an exclusive process lock. Pairing creates an empty configuration, opens the Hub approval page, and prints only the approval code. The token is protected by Windows DPAPI for the current user and exact Hub origin. Client and runner credentials are separate. Pairing a second Hub requires a separate configuration directory so receipts are never sent to a different Hub. Run only one instance per config directory. Stop with Ctrl+C; Windows Job objects kill provider descendants if the runner exits or crashes.

Edit `config.json` using `config.example.json` as a reference, then restart. Empty capability lists are intentional. Add only approved local workspace directories and trusted absolute `.exe` paths. Junctions, symlinks, network roots and whole drive roots are rejected. Workspace paths resolve exclusively from local IDs. Model IDs are an explicit local allowlist, not automatically discovered. Set `approved: true` only after installing/authenticating and testing that provider. Startup and pre-spawn probes must also pass. Provider binaries must remain under control of the Windows user. This is a per-user trust boundary, not a sandbox against another process running as the same user.

## Providers

Codex uses its native executable: `codex.exe --version` must identify Codex. Runs use `exec --json --sandbox read-only|workspace-write`, optional `--model` and reasoning effort, and the prompt on stdin. Use native `codex.exe`, not npm's `.cmd` shim. Authenticate the provider separately using its own supported login. The runner never supplies Hub credentials to children. Child environments contain only Windows profile/system directories, a restricted PATH containing the executable directory and Windows system directory, and NO_COLOR. Provider children can use their own profile authentication; add no owner or Hub tokens to adapters. Model availability beyond the local model allowlist is checked by the provider at execution time; failures remain visible as failed runs.

Muse/Grok are supported only through an explicitly trusted adapter executable, never guessed CLI flags. Configure `id` as `muse` or `grok`, `kind` as `json-adapter`, absolute `executable`, approved models and `approved: true`. Implement:

* `--ops-probe`: exit 0 within 5 seconds and write one JSON object: `{"protocol":"ops-provider-v1","provider":"muse","readOnlySupported":true}`. The Grok adapter reports `grok`. This is a mandatory tested capability declaration.
* `--ops-run`: read the JSON request from stdin until EOF with `protocol`, `prompt`, `access`, `model`, `effort`, `maxMinutes`. The JSON may be formatted over multiple lines. The working directory is the approved workspace. Enforce `access: "read"` without writes and `change` scoped to this workspace. The runner trusts this adapter's read-only declaration; it does not invent a sandbox for an unknown CLI. Translate to a real installed provider and preserve its exit status.
* Write JSON lines to stdout: `{"kind":"text|tool|status","text":"..."}`. No banners, ANSI escapes, or plaintext stdout. Diagnostics may use stderr, which counts toward output limits and is not uploaded. A nonzero exit fails the run. An adapter must not detach a background process or forward credentials in output.

Each stdout/stderr line is bounded to 16,000 characters, total output to 4 million characters and events to 5,000 per run. A limit violation terminates the process tree and fails the run. Execution is bounded by the dispatch limit, 1 to 120 minutes, including while offline. Cancellation is polled with acknowledgements every 10 seconds during execution. The Hub transport refuses redirects and bounds response bodies. Provider/model fields in final receipts reflect only known actual values: provider is reported, model remains absent because it cannot be inferred from the request.

## Recovery

SQLite uses WAL and FULL synchronous durability. Accepted and started receipts are committed before spawning. Event UUIDs are committed before upload and reused until acknowledged. Completion persists before upload and retries with the original run ID/fence. A process that was accepted or started when the runner exited is reconciled as interrupted and reported failed; it is never automatically spawned again. Completed receipt IDs remain tombstones to prevent duplicate dispatch. Do not delete receipts to retry a run. A new owner-authorized run must get a new ID.

Offline execution continues only until its local timeout. Pending receipts block new dispatch until uploaded. If the Hub rejects a receipt or fence, it is retained for diagnosis instead of silently discarded or run elsewhere. The Hub's lease expiry never authorizes another local spawn. Database write failure stops the runner and terminates the child. Provider processes are attached to a kill-on-close Windows Job before prompt input is supplied. There is a short OS scheduling window between process creation and Job attachment; do not use adapters that execute work before reading their request. Local output is stored as task data and can contain source content; protect the Windows profile accordingly.

## Build and tests

```
dotnet test apps/ops-windows/Ops.Runner.Tests/Ops.Runner.Tests.csproj
dotnet publish apps/ops-windows/Ops.Runner/Ops.Runner.csproj -c Release -r win-x64 --self-contained true
```

The tests cover durable duplicate prevention, stable event replay, terminal recovery, local path/claim validation, credential environment exclusion, and (on Windows) the executable adapter contract, malformed output and cancellation. SQLite's native bundle is explicitly patched beyond the transitive version shipped by Microsoft.Data.Sqlite 10.0.0.
