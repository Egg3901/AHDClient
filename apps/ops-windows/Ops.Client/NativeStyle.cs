using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace Ops.Client;

internal static class NativeStyle
{
    // Compiled styles retain ThemeResource scope and update with system theme changes.
    // XamlReader fragments have no application resource scope.
    public static Border Surface(string resource = "OpsCardBrush", int radius = 12, int padding = 16, bool stroke = true)
        => new()
        {
            Style = (Style)Application.Current.Resources[resource + "SurfaceStyle"],
            BorderThickness = new Thickness(stroke ? 1 : 0),
            CornerRadius = new CornerRadius(radius),
            Padding = new Thickness(padding)
        };

    public static TextBlock Label(string text, int size = 13, string resource = "OpsMutedBrush")
        => new()
        {
            Style = (Style)Application.Current.Resources[resource + "TextStyle"],
            Text = text,
            FontSize = size
        };

    public static Border Chip(string text, string tone = "Accent")
    {
        var border = Surface($"Ops{tone}SurfaceBrush", 6, 0, false);
        border.Padding = new Thickness(8, 4, 8, 4);
        border.HorizontalAlignment = HorizontalAlignment.Left;
        var label = Label(text, 11, $"Ops{tone}Brush");
        label.FontWeight = Microsoft.UI.Text.FontWeights.SemiBold;
        border.Child = label;
        return border;
    }

    public static Border StaffGlyph(string identity, int size = 28)
    {
        var index = identity.Sum(character => (int)character) % 3;
        var tone = new[] { "Accent", "Blue", "Purple" }[index];
        var frame = Surface($"Ops{tone}SurfaceBrush", 9, 0, false);
        frame.Width = size;
        frame.Height = size;
        var symbol = Label(new[] { "✦", "◈", "✿" }[index], 17, $"Ops{tone}Brush");
        symbol.HorizontalAlignment = HorizontalAlignment.Center;
        symbol.VerticalAlignment = VerticalAlignment.Center;
        frame.Child = symbol;
        return frame;
    }
}
