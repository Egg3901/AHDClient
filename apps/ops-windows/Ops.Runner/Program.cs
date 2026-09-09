using Ops.Runner;

if (!OperatingSystem.IsWindows()) { Console.Error.WriteLine("Ops.Runner requires Windows."); return 1; }
var arguments = args.ToList();
var configPath = RunnerConfig.DefaultPath;
var configIndex = arguments.IndexOf("--config");
if (configIndex >= 0)
{
    if (configIndex + 1 >= arguments.Count) { Console.Error.WriteLine("--config requires a path."); return 1; }
    configPath = Path.GetFullPath(arguments[configIndex + 1]); arguments.RemoveRange(configIndex, 2);
}
var directory = Path.GetDirectoryName(configPath)!;
Directory.CreateDirectory(directory);
using var cancellation = new CancellationTokenSource();
Console.CancelKeyPress += (_, e) => { e.Cancel = true; cancellation.Cancel(); };
try
{
    // Exclusive file lock survives await/thread switches and is released by Windows on crash.
    using var instanceLock = new FileStream(Path.Combine(directory, "runner.lock"), FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None);
    if (arguments.Count == 2 && arguments[0] == "pair")
    {
        var origin = RunnerConfig.ValidateOrigin(arguments[1]).GetLeftPart(UriPartial.Authority);
        if (File.Exists(configPath))
        {
            var existing = RunnerConfig.Load(configPath);
            if (RunnerConfig.ValidateOrigin(existing.Origin) != RunnerConfig.ValidateOrigin(origin))
                throw new InvalidOperationException("Use a different config directory to pair with another Hub; existing receipts are bound to this Hub.");
        }
        else
        {
            var config = new RunnerConfig(origin, [], []);
            await File.WriteAllTextAsync(configPath, System.Text.Json.JsonSerializer.Serialize(config, RunnerConfig.Json), cancellation.Token);
        }
        await DevicePairing.Pair(origin, Path.Combine(directory, "device.dpapi"), cancellation.Token);
        return 0;
    }
    if (arguments.Count == 1 && arguments[0] == "run")
    {
        var config = RunnerConfig.Load(configPath);
        using var hub = new HubClient(config.Origin, DevicePairing.ReadToken(Path.Combine(directory, "device.dpapi"), config.Origin));
        using var receipts = new ReceiptStore(Path.Combine(directory, "receipts.sqlite"));
        await new RunnerService(config, hub, receipts).Run(cancellation.Token);
        return 0;
    }
    Console.Error.WriteLine("Usage: Ops.Runner.exe pair <https-origin> [--config <path>] | run [--config <path>]");
    return 1;
}
catch (OperationCanceledException) when (cancellation.IsCancellationRequested) { return 0; }
catch (Exception exception)
{
    // Do not print exception bodies: network and process diagnostics can contain credentials.
    Console.Error.WriteLine($"Runner stopped ({exception.GetType().Name}). Check configuration, pairing, and whether another instance is running.");
    return 1;
}
