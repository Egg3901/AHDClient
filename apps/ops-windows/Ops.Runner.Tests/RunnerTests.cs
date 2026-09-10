using System.Text.Json;
using System.Net;
using System.Net.Http.Json;
using System.Collections.Concurrent;
using System.Threading.Channels;
using Ops.Runner;
using Xunit;

namespace Ops.Runner.Tests;

public sealed class RunnerTests : IDisposable
{
    private readonly string directory = Path.Combine(Path.GetTempPath(), "ops-runner-tests-" + Guid.NewGuid());
    public RunnerTests() => Directory.CreateDirectory(directory);
    private string Database => Path.Combine(directory, "receipts.sqlite");
    private static RunClaim Claim(string prompt = "hello") => new("run-1", "card-1", 1, 7, "local", "muse", "model", "medium", prompt, "read", 1, DateTimeOffset.UtcNow.AddMinutes(1));
    private ProviderConfig Provider => new("muse", Path.Combine(AppContext.BaseDirectory, "fixture", "Fixture.exe"), "json-adapter", ["model"], true);
    private RunnerConfig Config => new("https://hub.example", [new Workspace("local", "Local", directory)], [Provider]);

    [Fact]
    public void DurableStartedReceiptCannotBeAcceptedOrStartedAgain()
    {
        using (var store = new ReceiptStore(Database)) { Assert.True(store.Accept(Claim())); store.MarkStarted("run-1"); }
        using (var reopened = new ReceiptStore(Database))
        {
            Assert.Equal("started", Assert.Single(reopened.Pending()).State);
            Assert.False(reopened.Accept(Claim() with { Fence = 8 }));
            Assert.Throws<InvalidOperationException>(() => reopened.MarkStarted("run-1"));
        }
    }
    [Fact]
    public void UnconfirmedEventsReplayWithSameIdsAfterRestart()
    {
        var item = new RunEvent("stable-event", "text", "result");
        using (var store = new ReceiptStore(Database)) { store.Accept(Claim()); store.Append("run-1", item); store.Append("run-1", item); }
        using var reopened = new ReceiptStore(Database);
        Assert.Equal(item, Assert.Single(reopened.Events("run-1")));
        reopened.ConfirmEvents(reopened.Events("run-1")); Assert.Empty(reopened.Events("run-1"));
    }
    [Fact]
    public void CompletionIsDurableAndTombstonesBlockDuplicateExecution()
    {
        var finish = new FinishPayload(7, "completed", "Done");
        using (var store = new ReceiptStore(Database)) { store.Accept(Claim()); store.MarkStarted("run-1"); store.Finish("run-1", finish); }
        using var reopened = new ReceiptStore(Database);
        Assert.Equal(finish, Assert.Single(reopened.Pending()).Finish);
        reopened.MarkDone("run-1"); Assert.Empty(reopened.Pending()); Assert.False(reopened.Accept(Claim()));
    }
    [Fact]
    public void EventsUploadInBoundedInsertionOrder()
    {
        using var store = new ReceiptStore(Database); store.Accept(Claim());
        for (var i = 0; i < 55; i++) store.Append("run-1", new RunEvent(i.ToString(), "status", "ok"));
        var first = store.Events("run-1"); Assert.Equal(50, first.Count); Assert.Equal("0", first[0].Id); Assert.Equal("49", first[^1].Id);
        store.ConfirmEvents(first); Assert.Equal(5, store.Events("run-1").Count);
    }
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task RestartReconcilesWithoutSpawningAcceptedOrStartedJobs(bool started)
    {
        using var store = new ReceiptStore(Database); store.Accept(Claim()); if (started) store.MarkStarted("run-1");
        using var stop = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        var paths = new ConcurrentQueue<string>();
        var handler = new StubHandler(async request =>
        {
            var path = request.RequestUri!.AbsolutePath; paths.Enqueue(path);
            if (path.EndsWith("/finish"))
            {
                var payload = await request.Content!.ReadFromJsonAsync<FinishPayload>(RunnerConfig.Json);
                Assert.Equal("failed", payload!.Status); Assert.Contains("not restarted", payload.Result);
                stop.Cancel();
            }
            return new HttpResponseMessage(HttpStatusCode.OK) { Content = JsonContent.Create(new { ok = true, cancelRequested = false }) };
        });
        using var hub = new HubClient("https://hub.example", handler: handler);
        try { await new RunnerService(Config with { Providers = [] }, hub, store).Run(stop.Token); }
        catch (OperationCanceledException) when (stop.IsCancellationRequested) { }
        Assert.Contains("/api/ops/runner/runs/run-1/reconcile", paths);
        Assert.Contains("/api/ops/runner/runs/run-1/finish", paths);
        Assert.DoesNotContain("/api/ops/runner/claim", paths);
    }
    [Theory]
    [InlineData("http://hub.example")]
    [InlineData("https://user:pass@hub.example")]
    [InlineData("https://hub.example/path")]
    [InlineData("https://hub.example/?token=secret")]
    public void OriginRejectsCredentialAndRoutingAmbiguity(string origin) => Assert.Throws<InvalidDataException>(() => RunnerConfig.ValidateOrigin(origin));
    [Fact]
    public void WorkspaceIdsNeverBecomePaths()
    {
        Assert.Equal(Path.GetFullPath(directory), RunnerConfig.ResolveWorkspace(Config, "local"));
        Assert.Throws<InvalidDataException>(() => RunnerConfig.ResolveWorkspace(Config, "../local"));
        Assert.Throws<InvalidDataException>(() => RunnerConfig.ResolveWorkspace(Config, directory));
    }
    [Fact]
    public void WorkspaceCannotTraverseSymlink()
    {
        if (OperatingSystem.IsWindows()) return; // Junction creation requires different Windows privileges.
        var target = Path.Combine(directory, "target"); Directory.CreateDirectory(target);
        var link = Path.Combine(directory, "link"); Directory.CreateSymbolicLink(link, target);
        var config = Config with { Workspaces = [new Workspace("local", "Local", link)] };
        Assert.Throws<InvalidDataException>(() => RunnerConfig.ResolveWorkspace(config, "local"));
    }
    [Fact]
    public void ClaimAcceptsAdditiveHubMetadataAndAutoEffort()
    {
        var json = JsonSerializer.Serialize(Claim() with { Effort = "auto" }, RunnerConfig.Json);
        json = json.TrimEnd()[..^1] + ",\"hostId\":\"runner-device\",\"status\":\"claimed\"}";
        var claim = JsonSerializer.Deserialize<RunClaim>(json, RunnerConfig.Json)!;
        var executable = Path.Combine(directory, "fixture.exe"); File.WriteAllText(executable, "test");
        ProviderProcess.ValidateClaim(Config, Provider with { Executable = executable }, claim);
    }
    [Fact]
    public void ChildEnvironmentNeverInheritsCredentials()
    {
        Environment.SetEnvironmentVariable("OPS_TEST_OWNER_TOKEN", "must-not-inherit");
        try
        {
            var info = ProviderProcess.StartInfo(Provider, directory);
            Assert.False(info.UseShellExecute); Assert.False(info.Environment.ContainsKey("OPS_TEST_OWNER_TOKEN"));
            Assert.False(info.Environment.ContainsKey("OPENAI_API_KEY")); Assert.False(info.Environment.ContainsKey("ANTHROPIC_API_KEY"));
            Assert.True(info.RedirectStandardInput);
        }
        finally { Environment.SetEnvironmentVariable("OPS_TEST_OWNER_TOKEN", null); }
    }
    [Fact]
    public void ClaimCannotExpandLocalCapabilities()
    {
        var executable = Path.Combine(directory, "fixture.exe"); File.WriteAllText(executable, "test");
        var provider = Provider with { Executable = executable };
        ProviderProcess.ValidateClaim(Config, provider, Claim());
        foreach (var invalid in new[] { Claim() with { Model = "unknown" }, Claim() with { Access = "admin" }, Claim() with { MaxMinutes = 121 }, Claim() with { Attempt = 2 }, Claim() with { Effort = "high; do evil" } })
            Assert.Throws<InvalidDataException>(() => ProviderProcess.ValidateClaim(Config, provider, invalid));
    }
    [Fact]
    public async Task UnapprovedProviderIsNeverAdvertised() => Assert.False(await ProviderProcess.Probe(Provider with { Approved = false }, CancellationToken.None));
    [WindowsFact]
    public async Task AdapterProbeAndJsonLinesExecuteThroughRealProcess()
    {
        Assert.True(await ProviderProcess.Probe(Provider, CancellationToken.None));
        var channel = Channel.CreateUnbounded<RunEvent>();
        var result = await ProviderProcess.Execute(Provider, Claim(), directory, channel.Writer, CancellationToken.None);
        Assert.Equal("completed", result.Status); Assert.Equal("fixture completed", (await channel.Reader.ReadAsync()).Text);
    }
    [WindowsTheory]
    [InlineData("bad")]
    [InlineData("oversize")]
    public async Task InvalidOutputFailsRun(string prompt)
    {
        var channel = Channel.CreateUnbounded<RunEvent>();
        var result = await ProviderProcess.Execute(Provider, Claim(prompt), directory, channel.Writer, CancellationToken.None);
        Assert.Equal("failed", result.Status);
    }
    [WindowsFact]
    public async Task CancellationTerminatesProvider()
    {
        var channel = Channel.CreateUnbounded<RunEvent>(); using var stop = new CancellationTokenSource(TimeSpan.FromSeconds(1));
        var result = await ProviderProcess.Execute(Provider, Claim("hang"), directory, channel.Writer, stop.Token).WaitAsync(TimeSpan.FromSeconds(10));
        Assert.Equal("cancelled", result.Status);
    }
    public void Dispose()
    {
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools(); Directory.Delete(directory, true);
    }
}
public sealed class WindowsFactAttribute : FactAttribute
{
    public WindowsFactAttribute() { if (!OperatingSystem.IsWindows()) Skip = "Requires Windows Job objects and native executable."; }
}
public sealed class WindowsTheoryAttribute : TheoryAttribute
{
    public WindowsTheoryAttribute() { if (!OperatingSystem.IsWindows()) Skip = "Requires Windows Job objects and native executable."; }
}

internal sealed class StubHandler(Func<HttpRequestMessage, Task<HttpResponseMessage>> send) : HttpMessageHandler
{
    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) => send(request);
}
