using System.Diagnostics;
using System.Text;
using System.Text.Json;
using System.Threading.Channels;

namespace Ops.Runner;

public sealed record ProviderResult(string Status, string Result);
public static class ProviderProcess
{
    public const int MaxLineChars = 16000;
    public const int MaxOutputChars = 4_000_000;
    public static ProcessStartInfo StartInfo(ProviderConfig provider, string workspace)
    {
        var start = new ProcessStartInfo(provider.Executable)
        {
            WorkingDirectory = workspace, UseShellExecute = false, CreateNoWindow = true,
            RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true,
            StandardOutputEncoding = Encoding.UTF8, StandardErrorEncoding = Encoding.UTF8
        };
        // Never inherit arbitrary API tokens, owner credentials, or the runner token.
        start.Environment.Clear();
        foreach (var key in new[] { "SystemRoot", "WINDIR", "COMSPEC", "TEMP", "TMP", "USERPROFILE", "LOCALAPPDATA", "APPDATA", "ProgramFiles", "ProgramFiles(x86)", "ProgramData", "DOTNET_ROOT", "DOTNET_ROOT_X64", "DOTNET_ROOT_ARM64" })
            if (Environment.GetEnvironmentVariable(key) is { } value) start.Environment[key] = value;
        // Explicit executable lookup only. Tools can resolve Windows system programs and siblings.
        start.Environment["PATH"] = Path.GetDirectoryName(provider.Executable) + ";" + Environment.GetFolderPath(Environment.SpecialFolder.System);
        start.Environment["NO_COLOR"] = "1";
        return start;
    }
    public static async Task<bool> Probe(ProviderConfig provider, CancellationToken token)
    {
        if (!provider.Approved) return false;
        try
        {
            RunnerConfig.RejectReparsePoints(provider.Executable);
            var info = StartInfo(provider, Path.GetDirectoryName(provider.Executable)!);
            info.ArgumentList.Add(provider.Kind == "codex" ? "--version" : "--ops-probe");
            using var process = new Process { StartInfo = info };
            using var job = new ProcessJob();
            process.Start(); job.Attach(process); process.StandardInput.Close();
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(token); timeout.CancelAfter(TimeSpan.FromSeconds(5));
            using var kill = timeout.Token.Register(() => Kill(process));
            var outputTask = ReadProbe(process.StandardOutput, timeout.Token);
            var errorTask = ReadProbe(process.StandardError, timeout.Token);
            await Task.WhenAll(process.WaitForExitAsync(timeout.Token), outputTask, errorTask);
            if (process.ExitCode != 0) return false;
            var output = await outputTask;
            if (provider.Kind == "codex") return output.TrimStart().StartsWith("codex", StringComparison.OrdinalIgnoreCase);
            using var json = JsonDocument.Parse(output);
            return json.RootElement.GetProperty("protocol").GetString() == "ops-provider-v1" &&
                json.RootElement.GetProperty("provider").GetString() == provider.Id &&
                json.RootElement.GetProperty("readOnlySupported").GetBoolean();
        }
        catch (Exception exception) when (exception is not OutOfMemoryException) { return false; }
    }
    private static async Task<string> ReadProbe(StreamReader reader, CancellationToken token)
    {
        var buffer = new char[4096]; var text = new StringBuilder();
        while (true)
        {
            var count = await reader.ReadAsync(buffer.AsMemory(), token); if (count == 0) return text.ToString();
            if (text.Length + count > 8192) throw new InvalidDataException("Probe output too large.");
            text.Append(buffer, 0, count);
        }
    }
    public static void ValidateClaim(RunnerConfig config, ProviderConfig provider, RunClaim claim)
    {
        RunnerConfig.ResolveWorkspace(config, claim.WorkspaceId);
        RunnerConfig.RejectReparsePoints(provider.Executable);
        if (!provider.Approved || claim.Provider != provider.Id || claim.Attempt != 1 || claim.Fence < 1 ||
            claim.MaxMinutes is < 1 or > 120 || claim.Access is not ("read" or "change") ||
            string.IsNullOrWhiteSpace(claim.Id) || string.IsNullOrWhiteSpace(claim.Prompt) || claim.Prompt.Length > 200_000 ||
            claim.Model is not null && !provider.Models.Contains(claim.Model, StringComparer.Ordinal) ||
            claim.Effort is not null && claim.Effort is not ("auto" or "none" or "minimal" or "low" or "medium" or "high" or "xhigh"))
            throw new InvalidDataException("Run parameters are outside the locally approved capability.");
    }
    public static async Task<ProviderResult> Execute(ProviderConfig provider, RunClaim claim, string workspace, ChannelWriter<RunEvent> events, CancellationToken token)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(token);
        timeout.CancelAfter(TimeSpan.FromMinutes(claim.MaxMinutes));
        var info = StartInfo(provider, workspace);
        if (provider.Kind == "codex")
        {
            foreach (var arg in new[] { "exec", "--json", "-c", "approval_policy=\"never\"", "--sandbox", claim.Access == "read" ? "read-only" : "workspace-write" }) info.ArgumentList.Add(arg);
            if (claim.Model is not null) { info.ArgumentList.Add("--model"); info.ArgumentList.Add(claim.Model); }
            if (claim.Effort is not null and not "auto") { info.ArgumentList.Add("-c"); info.ArgumentList.Add("model_reasoning_effort=" + JsonSerializer.Serialize(claim.Effort)); }
            info.ArgumentList.Add("-");
        }
        else info.ArgumentList.Add("--ops-run");
        using var process = new Process { StartInfo = info };
        using var job = new ProcessJob();
        var total = 0;
        var eventCount = 0;
        try
        {
            process.Start(); job.Attach(process);
            using var kill = timeout.Token.Register(() => Kill(process));
            var stdout = Pump(process.StandardOutput, true);
            var stderr = Pump(process.StandardError, false);
            var input = provider.Kind == "codex" ? claim.Prompt : JsonSerializer.Serialize(new
            { protocol = "ops-provider-v1", prompt = claim.Prompt, access = claim.Access, model = claim.Model, effort = claim.Effort, maxMinutes = claim.MaxMinutes }, RunnerConfig.Json);
            await process.StandardInput.WriteLineAsync(input.AsMemory(), timeout.Token);
            process.StandardInput.Close();
            await Task.WhenAll(process.WaitForExitAsync(timeout.Token), stdout, stderr);
            return new ProviderResult(process.ExitCode == 0 && eventCount > 0 ? "completed" : "failed", eventCount == 0 ? "Provider returned no machine-readable events." : $"Provider exited with code {process.ExitCode}.");
        }
        catch (OperationCanceledException)
        { return new ProviderResult(token.IsCancellationRequested ? "cancelled" : "failed", token.IsCancellationRequested ? "Run cancelled locally or by Hub." : "Run exceeded its local time limit."); }
        catch (Exception exception) when (exception is not OutOfMemoryException)
        { return new ProviderResult("failed", "Provider failed to start or violated the bounded JSON output protocol."); }
        finally { Kill(process); events.TryComplete(); }

        async Task Pump(StreamReader reader, bool emit)
        {
            var buffer = new char[2048]; var line = new StringBuilder();
            try
            {
                while (true)
                {
                    var count = await reader.ReadAsync(buffer.AsMemory(), timeout.Token);
                    if (count == 0) { if (emit && line.Length > 0) await Emit(line.ToString()); return; }
                    if (Interlocked.Add(ref total, count) > MaxOutputChars) throw new InvalidDataException("Output budget exceeded.");
                    for (var index = 0; index < count; index++)
                    {
                        var character = buffer[index];
                        if (character == '\n') { if (emit && line.Length > 0) await Emit(line.ToString()); line.Clear(); }
                        else if (character != '\r')
                        {
                            if (line.Length >= MaxLineChars) throw new InvalidDataException("Output line too long.");
                            line.Append(character);
                        }
                    }
                }
            }
            catch { Kill(process); throw; }
        }
        async Task Emit(string line)
        {
            if (++eventCount > 5000) throw new InvalidDataException("Event count limit exceeded.");
            using var document = JsonDocument.Parse(line);
            if (document.RootElement.ValueKind != JsonValueKind.Object) throw new InvalidDataException("Provider output must be JSON objects.");
            if (provider.Kind == "json-adapter")
            {
                var kind = document.RootElement.GetProperty("kind").GetString();
                var text = document.RootElement.GetProperty("text").GetString() ?? "";
                if (kind is not ("text" or "tool" or "status") || text.Length > MaxLineChars) throw new InvalidDataException("Invalid adapter event.");
                await events.WriteAsync(new RunEvent(Guid.NewGuid().ToString(), kind, text), timeout.Token);
            }
            else await events.WriteAsync(new RunEvent(Guid.NewGuid().ToString(), "tool", line), timeout.Token);
        }
    }
    private static void Kill(Process process)
    {
        try { if (!process.HasExited) process.Kill(entireProcessTree: true); }
        catch (InvalidOperationException) { }
        catch (System.ComponentModel.Win32Exception) { }
    }
}
