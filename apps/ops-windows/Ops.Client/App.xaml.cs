using Microsoft.UI.Xaml;
namespace Ops.Client;
public partial class App : Application
{
    Window? window;
    public App()
    {
        UnhandledException += (_, args) => RecordSmokeFailure(args.Exception);
        try { Directory.SetCurrentDirectory(AppContext.BaseDirectory); InitializeComponent(); }
        catch (Exception error) { RecordSmokeFailure(error); throw; }
    }
    protected override void OnLaunched(LaunchActivatedEventArgs args)
    {
        try
        {
            // Initialize dictionaries explicitly before constructing code-created controls.
            Resources.MergedDictionaries.Add(new Microsoft.UI.Xaml.Controls.XamlControlsResources());
            var theme = new ResourceDictionary { Source = new Uri("ms-appx:///OpsThemeResources.xaml") };
            if (!theme.ContainsKey("OpsMutedBrushTextStyle")) throw new InvalidOperationException("The compiled Ops theme dictionary is missing its required text style.");
            Resources.MergedDictionaries.Add(theme);
            if (!Resources.ContainsKey("OpsMutedBrushTextStyle")) throw new InvalidOperationException("The Ops theme dictionary was not merged into application resources.");
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
