using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Markup;

namespace Ops.Client;

internal static class NativeStyle
{
    const string Namespace = "xmlns=\"http://schemas.microsoft.com/winfx/2006/xaml/presentation\"";

    public static Border Surface(string resource = "OpsCardBrush", int radius = 12, int padding = 16, bool stroke = true)
        => (Border)XamlReader.Load($"<Border {Namespace} Background=\"{{ThemeResource {resource}}}\" BorderBrush=\"{{ThemeResource OpsBorderBrush}}\" BorderThickness=\"{(stroke ? 1 : 0)}\" CornerRadius=\"{radius}\" Padding=\"{padding}\" />");

    public static TextBlock Label(string text, int size = 13, string resource = "OpsMutedBrush")
    {
        var block = (TextBlock)XamlReader.Load($"<TextBlock {Namespace} Foreground=\"{{ThemeResource {resource}}}\" TextWrapping=\"Wrap\" FontSize=\"{size}\" />");
        block.Text = text;
        return block;
    }

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
