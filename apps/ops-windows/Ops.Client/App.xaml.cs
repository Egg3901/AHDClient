using Microsoft.UI.Xaml;
namespace Ops.Client;
public partial class App : Application
{
    Window? window;
    public App()
    {
        UnhandledException += (_, args) => RecordSmokeFailure(args.Exception);
        try { InitializeComponent(); }
        catch (Exception error) { RecordSmokeFailure(error); throw; }
    }
    protected override void OnLaunched(LaunchActivatedEventArgs args)
    {
        try
        {
            var arguments = Environment.GetCommandLineArgs();
            window = new MainWindow(arguments.Contains("--smoke", StringComparer.Ordinal), arguments.Contains("--smoke-dark", StringComparer.Ordinal));
            window.Activate();
        }
        catch (Exception error) { RecordSmokeFailure(error); throw; }
    }
    static void RecordSmokeFailure(Exception error)
    {
        if (!Environment.GetCommandLineArgs().Contains("--smoke", StringComparer.Ordinal)) return;
        var directory = Environment.GetEnvironmentVariable("OPS_SMOKE_LOG_DIR");
        if (string.IsNullOrEmpty(directory)) return;
        try
        {
            Directory.CreateDirectory(directory);
            File.AppendAllText(Path.Combine(directory, "startup-errors.txt"), error + Environment.NewLine);
        }
        catch (IOException) { }
        catch (UnauthorizedAccessException) { }
    }
}
