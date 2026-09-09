using System.Net;
using System.Text.Json;
using System.Threading.Channels;

namespace Ops.Runner;

public sealed class RunnerService(RunnerConfig config, HubClient hub, ReceiptStore store)
{
    private ProviderConfig[] providers = [];
    private string? activeRunId;
    public async Task Run(CancellationToken stop)
    {
        var verified = new List<ProviderConfig>();
        foreach (var provider in config.Providers)
            if (await ProviderProcess.Probe(provider, stop)) verified.Add(provider);
        providers = verified.ToArray();
        Console.WriteLine($"Runner ready: {providers.Length} verified provider(s), {config.Workspaces.Length} workspace(s).");
        // Accepted records are also interrupted: no ambiguous recovery path can cause another spawn.
        foreach (var receipt in store.Pending().Where(x => x.State is "accepted" or "started"))
            store.Finish(receipt.Claim.Id, new FinishPayload(receipt.Claim.Fence, "failed", "Runner interrupted before durable completion. This run was not restarted."));
        using var heartbeatStop = CancellationTokenSource.CreateLinkedTokenSource(stop);
        var heartbeatTask = HeartbeatLoop(heartbeatStop.Token);
        try
        {
        while (!stop.IsCancellationRequested)
        {
            try
            {
                foreach (var receipt in store.Pending()) await UploadCompletion(receipt, stop);
                // A terminal receipt that the Hub cannot reconcile holds dispatch until the owner resolves it.
                if (store.Pending().Count == 0 && providers.Length > 0)
                {
                    var response = await hub.Post("/api/ops/runner/claim", new { }, stop);
                    if (response.TryGetProperty("run", out var value) && value.ValueKind != JsonValueKind.Null)
                    {
                        var claim = value.Deserialize<RunClaim>(RunnerConfig.Json) ?? throw new InvalidDataException("Invalid claim.");
                        if (!store.Accept(claim))
                        {
                            // A repeated ID can never execute, including IDs whose finish response was lost.
                            await hub.Post(PathFor(claim, "reconcile"), new { fence = claim.Fence, state = "interrupted" }, stop);
                        }
                        else await Execute(claim, stop);
                    }
                }
            }
            catch (OperationCanceledException) when (stop.IsCancellationRequested) { break; }
            catch (Exception exception) when (IsRecoverable(exception))
            { Console.Error.WriteLine("Hub unavailable or rejected operation. Durable receipts retained; retrying."); }
            await Task.Delay(TimeSpan.FromSeconds(10), stop);
        }
        }
        finally
        {
            heartbeatStop.Cancel();
            try { await heartbeatTask; } catch (OperationCanceledException) when (heartbeatStop.IsCancellationRequested) { }
        }
    }
    private async Task HeartbeatLoop(CancellationToken token)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(10));
        do
        {
            try
            {
                var current = Volatile.Read(ref activeRunId);
                await Heartbeat(current is null ? [] : [current], token);
            }
            catch (Exception exception) when (IsRecoverable(exception)) { }
        } while (await timer.WaitForNextTickAsync(token));
    }
    private Task<JsonElement> Heartbeat(string[] activeRunIds, CancellationToken token) => hub.Post("/api/ops/runner/heartbeat", new
    {
        providers = providers.Select(p => new { id = p.Id, models = p.Models.Select(m => new { id = m }), available = true }),
        workspaces = config.Workspaces.Select(w => new { id = w.Id, name = w.Name }), activeRunIds
    }, token);
    private static string PathFor(RunClaim claim, string operation) => "/api/ops/runner/runs/" + Uri.EscapeDataString(claim.Id) + "/" + operation;
    private async Task Execute(RunClaim claim, CancellationToken stop)
    {
        var provider = providers.SingleOrDefault(p => p.Id == claim.Provider);
        try
        {
            if (provider is null) throw new InvalidDataException("Provider is not locally verified.");
            ProviderProcess.ValidateClaim(config, provider, claim);
            // Re-probe immediately before spawn, rather than trusting an old heartbeat.
            if (!await ProviderProcess.Probe(provider, stop)) throw new InvalidDataException("Provider verification failed.");
            var ack = await hub.Post(PathFor(claim, "ack"), new { fence = claim.Fence }, stop);
            if (Cancelled(ack))
            {
                store.Finish(claim.Id, new FinishPayload(claim.Fence, "cancelled", "Cancelled before process start.")); return;
            }
        }
        catch (Exception exception) when (exception is not OutOfMemoryException)
        {
            store.Finish(claim.Id, new FinishPayload(claim.Fence, "failed", "Run could not be validated or acknowledged. No provider was started.")); return;
        }
        using var localStop = CancellationTokenSource.CreateLinkedTokenSource(stop);
        var events = Channel.CreateBounded<RunEvent>(new BoundedChannelOptions(100) { SingleWriter = true, SingleReader = true, FullMode = BoundedChannelFullMode.Wait });
        store.MarkStarted(claim.Id);
        Volatile.Write(ref activeRunId, claim.Id);
        var process = ProviderProcess.Execute(provider!, claim, RunnerConfig.ResolveWorkspace(config, claim.WorkspaceId), events.Writer, localStop.Token);
        var nextBeat = DateTimeOffset.UtcNow.AddSeconds(10);
        try
        {
            while (!process.IsCompleted || events.Reader.TryPeek(out _))
            {
                while (events.Reader.TryRead(out var item)) store.Append(claim.Id, item);
                if (DateTimeOffset.UtcNow >= nextBeat && !stop.IsCancellationRequested)
                {
                    nextBeat = DateTimeOffset.UtcNow.AddSeconds(10);
                    try
                    {
                        // Ack first: cancellation has priority over telemetry and event transfer.
                        async Task Acknowledge()
                        {
                            var ack = await hub.Post(PathFor(claim, "ack"), new { fence = claim.Fence }, stop);
                            if (Cancelled(ack)) localStop.Cancel();
                        }
                        await Task.WhenAll(Acknowledge(), UploadEvents(claim, stop, () => localStop.Cancel()));
                    }
                    catch (HubRejectedException exception) when (exception.Status is HttpStatusCode.Conflict or HttpStatusCode.Forbidden or HttpStatusCode.Unauthorized or HttpStatusCode.NotFound)
                    { localStop.Cancel(); }
                    catch (Exception exception) when (IsRecoverable(exception)) { /* Local timeout remains authoritative while offline. */ }
                }
                if (!process.IsCompleted) await Task.Delay(100, CancellationToken.None);
            }
            var result = await process;
            store.Finish(claim.Id, new FinishPayload(claim.Fence, result.Status, result.Result, ActualProvider: provider!.Id));
        }
        finally
        {
            localStop.Cancel();
            await process;
            Volatile.Write(ref activeRunId, null);
        }
    }
    private async Task UploadEvents(RunClaim claim, CancellationToken token, Action? cancel = null)
    {
        var batch = store.Events(claim.Id);
        if (batch.Count == 0) return;
        var response = await hub.Post(PathFor(claim, "events"), new { fence = claim.Fence, events = batch }, token);
        store.ConfirmEvents(batch);
        if (Cancelled(response)) cancel?.Invoke();
    }
    private async Task UploadCompletion(Receipt receipt, CancellationToken token)
    {
        if (receipt.Finish is null) throw new InvalidDataException("Missing durable finish payload.");
        if (receipt.Finish.Result.StartsWith("Runner interrupted", StringComparison.Ordinal))
            await hub.Post(PathFor(receipt.Claim, "reconcile"), new { fence = receipt.Claim.Fence, state = "interrupted" }, token);
        // Bounded batches; never discard events before acknowledged receipt.
        for (var batch = 0; batch < 100 && store.Events(receipt.Claim.Id).Count > 0; batch++)
            await UploadEvents(receipt.Claim, token);
        if (store.Events(receipt.Claim.Id).Count > 0) return;
        await hub.Post(PathFor(receipt.Claim, "finish"), receipt.Finish, token);
        store.MarkDone(receipt.Claim.Id);
    }
    private static bool Cancelled(JsonElement response) => response.TryGetProperty("cancelRequested", out var cancel) && cancel.ValueKind == JsonValueKind.True;
    private static bool IsRecoverable(Exception exception) => exception is HttpRequestException or HubRejectedException or TaskCanceledException;
}
