using System.Text.Json;
using System.Text.Json.Serialization;

namespace Ops.Runner;

public sealed record Workspace(string Id, string Name, string Root);
public sealed record ProviderConfig(string Id, string Executable, string Kind, string[] Models, bool Approved = false);
public sealed record RunnerConfig(string Origin, Workspace[] Workspaces, ProviderConfig[] Providers)
{
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true,
        UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow
    };
    public static string DefaultPath => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Ops", "runner", "config.json");
    public static RunnerConfig Load(string path)
    {
        var result = JsonSerializer.Deserialize<RunnerConfig>(File.ReadAllText(path), Json) ?? throw new InvalidDataException("Empty configuration.");
        ValidateOrigin(result.Origin);
        if (result.Workspaces is null || result.Providers is null) throw new InvalidDataException("Workspaces and providers are required.");
        if (result.Workspaces.Select(x => x.Id).Distinct(StringComparer.Ordinal).Count() != result.Workspaces.Length ||
            result.Providers.Select(x => x.Id).Distinct(StringComparer.Ordinal).Count() != result.Providers.Length)
            throw new InvalidDataException("Duplicate IDs.");
        foreach (var workspace in result.Workspaces) ResolveWorkspace(result, workspace.Id);
        foreach (var provider in result.Providers)
        {
            if (provider.Id is not ("codex" or "muse" or "grok") || provider.Kind is not ("codex" or "json-adapter") ||
                (provider.Kind == "codex") != (provider.Id == "codex") || provider.Models is null || provider.Models.Length == 0 ||
                provider.Models.Any(string.IsNullOrWhiteSpace)) throw new InvalidDataException("Invalid provider configuration.");
            if (!Path.IsPathFullyQualified(provider.Executable) || !File.Exists(provider.Executable) ||
                !string.Equals(Path.GetExtension(provider.Executable), ".exe", StringComparison.OrdinalIgnoreCase))
                throw new InvalidDataException("Provider executable must be an existing absolute .exe path.");
            RejectReparsePoints(provider.Executable);
        }
        return result;
    }
    public static Uri ValidateOrigin(string value)
    {
        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri) || uri.Scheme != "https" ||
            !string.IsNullOrEmpty(uri.UserInfo) || uri.AbsolutePath != "/" || !string.IsNullOrEmpty(uri.Query) || !string.IsNullOrEmpty(uri.Fragment))
            throw new InvalidDataException("Hub must be an HTTPS origin without path, credentials, query or fragment.");
        return uri;
    }
    public static string ResolveWorkspace(RunnerConfig config, string id)
    {
        var workspace = config.Workspaces.SingleOrDefault(x => string.Equals(x.Id, id, StringComparison.Ordinal))
            ?? throw new InvalidDataException("Workspace is not approved on this machine.");
        if (string.IsNullOrWhiteSpace(id) || !Path.IsPathFullyQualified(workspace.Root) || !Directory.Exists(workspace.Root))
            throw new InvalidDataException("Workspace must be an existing absolute directory.");
        var root = Path.GetFullPath(workspace.Root);
        if (root.StartsWith(@"\\", StringComparison.Ordinal) || root == Path.GetPathRoot(root))
            throw new InvalidDataException("Network paths and drive roots are not workspaces.");
        RejectReparsePoints(root);
        return root;
    }
    public static void RejectReparsePoints(string path)
    {
        for (var current = Path.GetFullPath(path); !string.IsNullOrEmpty(current); current = Path.GetDirectoryName(current))
            if ((File.GetAttributes(current) & FileAttributes.ReparsePoint) != 0)
                throw new InvalidDataException("Configured paths may not traverse links or junctions.");
    }
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Skip)]
public sealed record RunClaim(string Id, string CardId, int Attempt, long Fence, string WorkspaceId, string Provider,
    string? Model, string? Effort, string Prompt, string Access, int MaxMinutes, DateTimeOffset LeaseUntil);
public sealed record RunEvent(string Id, string Kind, string Text);
public sealed record FinishPayload(long Fence, string Status, string Result, string? ActualModel = null, string? ActualProvider = null);
public sealed record Receipt(RunClaim Claim, string State, FinishPayload? Finish);
