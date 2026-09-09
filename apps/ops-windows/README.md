# Ops Windows unsigned pilot

Native C# WinUI 3 Work client and a separate per-user local runner. Targets Windows 11 x64, .NET 10 LTS, Windows App SDK 1.8. The unsigned ZIP bundles application runtimes. CI launch screenshots use synthetic local work records and no account credentials. No WebView, Tauri, Apple signing, public installer identity, or automatic update channel is involved.

## Start

Extract the entire ZIP to a writable application folder. Run `Ops.Client.exe`, enter your Hub HTTPS origin, and pair in your default browser. Compare the displayed code before approving. The client credential is protected with Windows DPAPI for the current user. No token belongs in configuration files or command-line arguments.

Work contains board creation, renaming, column editing and empty-board archival, cards, field edits, moves, comments, artifact links, proposal decisions, host/workspace/provider selection, bounded dispatch, cancellation and activity. Board archival is the pilot's removal operation. The server prevents removal of occupied columns. The native sidebar, lane surfaces, bordered cards, review chips and staff glyphs follow the system light/dark theme and high contrast. The smoke fixture uses the same board components as the connected view. Unchanged snapshots preserve rendered cards and keyboard focus. Keyboard users can select cards and use the explicit Move action.

Assistant provides native conversation selection/creation, message send, file upload, response polling, route/model labels and stop controls. Staff provides native profiles, run history, creation and editing. Tools includes provider capacity and measured usage, cloud workspace files with source/diff previews, version-checked assistant memory editing, and independent runner controls. Dispatch can use a temporary worker or an existing staff member. All four destinations use native controls. Work artifacts accept existing HTTPS/upload links; Assistant uploads files through the existing Hub upload API.

Tools starts and pairs the independent runner executable. Read `Ops.Runner/README.md` in source for configuration and capability verification; the ZIP includes a configuration example. Pairing a client does not pair a runner. Closing the client leaves accepted runner work running. A runner must be started separately after Windows sign-in; automatic installation as a service or startup task is not enabled.

## Offline and conflicts

SQLite stores confirmed board snapshots and an operation outbox under `%LOCALAPPDATA%/Ops/client`. Every planning command is saved before sending. The same command ID and payload are retried after a lost response, including after client restart. Snapshot updates preserve pending commands. A new pairing clears the prior cached account and outbox, preventing commands from crossing identities.

The status line shows cache age and pending/conflict counts. Cards with queued changes are marked pending; new card intents are visible in Pending / conflicts until confirmed. HTTP conflicts preserve the original intent and server response for inspection. Discard the local intent, refresh the card, then apply the desired change against current state. Conflicts never overwrite server state automatically.

Dispatch, cancellation and proposal decisions require an online response and are never put in the offline outbox. If their HTTP response is lost, a durable uncertain receipt is retained and queried on reconnect without replaying the action. Inspect card/run activity before trying again. This pilot polls snapshots every three seconds while Work is visible. It does not claim the architecture's one-second event-to-paint performance target.

## Build and test

On Windows with the .NET 10 SDK:

```powershell
dotnet test Ops.Core.Tests/Ops.Core.Tests.csproj -c Release
dotnet test Ops.Runner.Tests/Ops.Runner.Tests.csproj -c Release
dotnet publish Ops.Client/Ops.Client.csproj -c Release -r win-x64 -p:Platform=x64 --self-contained true -o pilot
dotnet publish Ops.Runner/Ops.Runner.csproj -c Release -r win-x64 --self-contained true -o pilot/runner
```

The `Ops Windows pilot` GitHub workflow performs Windows builds, runs both suites, launches the native client with a local fixture, captures light and dark screenshots, and creates an unsigned ZIP artifact retained for seven days. Artifacts from this public repository may be publicly accessible. This is an unsigned pilot, not a signed production release. Linux can run the core and portable runner unit tests, but cannot execute the Windows XAML compiler or establish Windows behavior.

## Device acceptance still required

Validate on a real Windows PC before declaring the pilot accepted:

- Pair/revoke both identities; confirm expired/revoked tokens cannot mutate state.
- Create and move cards between two clients, disconnect, edit concurrently, reconnect, inspect conflicts, and restart with a queued command.
- Dispatch cloud and configured local providers; verify workspace, actual provider/model report, cancellation and time limits.
- Close the UI while a local run works. Crash the runner around process start; verify recovery reports uncertainty/interruption without spawning a duplicate.
- Disconnect the network during output delivery and completion; reconnect and verify stable event/finish receipts.
- Inspect light/dark mode, high contrast, keyboard focus, Narrator, 125/150/200 percent scaling, and a board with 80 cards.
- Measure first display, refresh latency, reconnect catch-up and memory on designated hardware. No performance measurements are claimed by the build.

## Framework references

[Microsoft native desktop guidance](https://learn.microsoft.com/en-us/windows/apps/get-started/), [unpackaged deployment](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/), [Windows App SDK package](https://www.nuget.org/packages/Microsoft.WindowsAppSDK/1.8.260804001), [.NET support policy](https://dotnet.microsoft.com/en-us/platform/support/policy).
