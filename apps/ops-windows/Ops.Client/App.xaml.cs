using Microsoft.UI.Xaml;
namespace Ops.Client;
public partial class App : Application
{
    Window? window;
    public App() { InitializeComponent(); }
    protected override void OnLaunched(LaunchActivatedEventArgs args) { window = new MainWindow(Environment.GetCommandLineArgs().Contains("--smoke", StringComparer.Ordinal)); window.Activate(); }
}
