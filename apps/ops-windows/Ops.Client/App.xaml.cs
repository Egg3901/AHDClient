using Microsoft.UI.Xaml;
namespace Ops.Client;
public partial class App : Application
{
    Window? window;
    public App() { InitializeComponent(); }
    protected override void OnLaunched(LaunchActivatedEventArgs args) { window = new MainWindow(args.Arguments.Contains("--smoke", StringComparison.Ordinal)); window.Activate(); }
}
