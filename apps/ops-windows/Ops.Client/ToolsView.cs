using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Ops.Core;
using System.Globalization;
using System.Text.Json.Nodes;

namespace Ops.Client;

public sealed partial class MainWindow
{
    async Task ToolsHome()
    {
        var view = new StackPanel { Spacing = 16 };
        var navigation = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8 };
        navigation.Children.Add(Button("Usage & providers", () => CapacityView(view)));
        navigation.Children.Add(Button("Cloud files", () => FilesView(view)));
        navigation.Children.Add(Button("Assistant memory", () => MemoryView(view)));
        navigation.Children.Add(Button("This PC", () => { RunnerView(view); return Task.CompletedTask; }));
        content.Children.Add(new ScrollViewer { Content = navigation, HorizontalScrollBarVisibility = ScrollBarVisibility.Auto, VerticalScrollBarVisibility = ScrollBarVisibility.Disabled });
        content.Children.Add(view);
        await CapacityView(view);
    }

    static Border ToolCard(string title, string description, out StackPanel body)
    {
        body = new StackPanel { Spacing = 12 };
        body.Children.Add(Text(title, 19));
        if (description.Length > 0) body.Children.Add(NativeStyle.Label(description, 13));
        var card = NativeStyle.Surface();
        card.Child = body;
        return card;
    }

    async Task CapacityView(StackPanel view)
    {
        var inventoryTask = hub!.Get("/api/ops/providers");
        var usageTask = hub.Get("/api/ops/usage");
        await Task.WhenAll(inventoryTask, usageTask);
        var inventory = await inventoryTask;
        var measured = await usageTask;
        view.Children.Clear();
        view.Children.Add(NativeStyle.Label("Account allowances and measured work are different. Missing readings remain unknown.", 13));
        view.Children.Add(Button("Refresh capacity", () => CapacityView(view)));
        foreach (var provider in inventory["providers"]?.AsArray().OfType<JsonObject>() ?? [])
        {
            var id = Wire.Id(provider["id"]);
            var capacity = provider["capacity"] as JsonObject;
            var card = ToolCard(provider["label"]?.ToString() ?? id, capacity?["message"]?.ToString() ?? "Account quota not reported", out var body);
            if (capacity?["stale"]?.GetValue<bool>() == true) body.Children.Add(NativeStyle.Chip("Last reported · stale", "Review"));
            body.Children.Add(NativeStyle.Chip(provider["enabled"]?.GetValue<bool>() == false ? "Disabled" : provider["status"]?.ToString() ?? "Runtime status unknown", "Blue"));
            foreach (var window in capacity?["windows"]?.AsArray().OfType<JsonObject>() ?? [])
            {
                var remaining = Number(window["remainingPercent"]) ?? (Number(window["usedPercent"]) is double used ? 100 - used : null);
                var observed = Timestamp(window["observedAt"]) ?? Timestamp(capacity?["observedAt"]);
                var reset = Timestamp(window["resetsAt"]);
                var stale = capacity?["stale"]?.GetValue<bool>() == true || capacity?["status"]?.ToString() == "error" || observed is null || observed > DateTimeOffset.UtcNow || DateTimeOffset.UtcNow - observed > TimeSpan.FromMinutes(5);
                var expired = reset <= DateTimeOffset.UtcNow;
                var label = window["label"]?.ToString() ?? "Account window";
                body.Children.Add(Text(label, 14));
                if (expired) body.Children.Add(NativeStyle.Label("Reset time passed. Waiting for a new reading."));
                else if (remaining is double value)
                {
                    value = Math.Clamp(value, 0, 100);
                    var meter = new ProgressBar { Minimum = 0, Maximum = 100, Value = 100 - value, Height = 7, Opacity = stale ? 0.45 : 1 };
                    AutomationProperties.SetName(meter, label + (stale ? ": last reported used, stale" : ": used"));
                    body.Children.Add(meter);
                    body.Children.Add(NativeStyle.Label($"{100-value:0.#}% used · {value:0.#}% remaining" + (stale ? " · Last reported, stale" : "")));
                }
                else body.Children.Add(NativeStyle.Label("Allowance not reported"));
                if (reset is not null) body.Children.Add(NativeStyle.Label("Resets " + reset.Value.ToLocalTime().ToString("g"), 11));
            }
            if (capacity?["readiness"] is JsonObject readiness)
            {
                var ready = Number(readiness["ready"]);
                var total = Number(readiness["total"]);
                if (ready is not null && total is > 0)
                {
                    body.Children.Add(Text($"{ready:0} of {total:0} routes ready", 14));
                    body.Children.Add(new ProgressBar { Minimum = 0, Maximum = total.Value, Value = Math.Clamp(ready.Value, 0, total.Value), Height = 7 });
                    body.Children.Add(NativeStyle.Label("Route readiness, not a subscription allowance. Upstream limits vary.", 12));
                }
            }
            foreach (var balance in capacity?["balances"]?.AsArray().OfType<JsonObject>() ?? [])
            {
                var amount = Number(balance["remaining"]);
                body.Children.Add(NativeStyle.Label((balance["label"]?.ToString() ?? "Balance") + ": " + (amount?.ToString("N2") ?? "not reported") + " " + balance["unit"]));
            }
            var usage = measured["providers"]?.AsArray().OfType<JsonObject>().FirstOrDefault(item => Wire.Id(item["provider"]) == id);
            if (usage is not null)
            {
                body.Children.Add(Text("Measured activity", 14));
                body.Children.Add(NativeStyle.Label($"{Number(usage["attempts"])?.ToString("N0") ?? "Unknown"} attempts · {Number(usage["input_tokens"])?.ToString("N0") ?? "Unknown"} input tokens · {Number(usage["output_tokens"])?.ToString("N0") ?? "Unknown"} output tokens", 12));
                if (Number(usage["unmeasured_token_attempts"]) is > 0 and var missing) body.Children.Add(NativeStyle.Label($"Token usage was not reported for {missing:0} attempts.", 12));
            }
            else body.Children.Add(NativeStyle.Label("No measured activity reported.", 12));
            if (Timestamp(capacity?["observedAt"]) is DateTimeOffset at) body.Children.Add(NativeStyle.Label("Last observed " + at.ToLocalTime().ToString("g"), 11));
            view.Children.Add(card);
        }
    }

    async Task FilesView(StackPanel view)
    {
        var response = await hub!.Get("/api/ops/workspaces");
        view.Children.Clear();
        view.Children.Add(Text("Cloud workspaces", 20));
        view.Children.Add(NativeStyle.Label("Browse source and inspect changes in the workspace where your cloud agents work."));
        var choices = new ComboBox { Header = "Workspace", DisplayMemberPath = "Label", MinWidth = 260, ItemsSource = response["workspaces"]?.AsArray().OfType<JsonObject>().Select(item => new Choice(Wire.Id(item["workspaceId"]), item["title"]?.ToString() ?? "Workspace", item)).ToList() };
        var directory = new StackPanel { Spacing = 12 };
        view.Children.Add(choices);
        view.Children.Add(directory);
        choices.SelectionChanged += async (_, _) => { if (choices.SelectedItem is Choice workspace) await Guard(() => DirectoryView(directory, workspace.Id, "")); };
        if (choices.Items.Count > 0) choices.SelectedIndex = 0;
        else view.Children.Add(NativeStyle.Label("No cloud workspaces have been registered yet."));
    }

    async Task DirectoryView(StackPanel view, string workspace, string path)
    {
        var query = "?workspace=" + Wire.Segment(workspace) + "&path=" + Wire.Segment(path);
        var listing = await hub!.Get("/api/ops/files" + query);
        view.Children.Clear();
        var bar = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8 };
        bar.Children.Add(Button("Workspace root", () => DirectoryView(view, workspace, "")));
        if (path.Length > 0) bar.Children.Add(Button("Up one folder", () => DirectoryView(view, workspace, path.Contains('/') ? path[..path.LastIndexOf('/')] : "")));
        bar.Children.Add(Button("Refresh", () => DirectoryView(view, workspace, path)));
        view.Children.Add(bar);
        view.Children.Add(NativeStyle.Label(path.Length == 0 ? "/" : path));
        var list = new ListView { MaxHeight = 440, SelectionMode = ListViewSelectionMode.None, IsItemClickEnabled = true };
        AutomationProperties.SetName(list, "Workspace files");
        foreach (var entry in listing["entries"]?.AsArray().OfType<JsonObject>() ?? [])
        {
            var directory = entry["directory"]?.GetValue<bool>() == true;
            var row = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 12, Margin = new Thickness(4,6,4,6) };
            row.Children.Add(new SymbolIcon(directory ? Symbol.Folder : Symbol.Document) { Width = 20, Height = 20 });
            row.Children.Add(Text(entry["name"]?.ToString() ?? "File"));
            list.Items.Add(new ListViewItem { Content = row, Tag = entry });
        }
        list.ItemClick += async (_, args) =>
        {
            if (args.ClickedItem is not ListViewItem { Tag: JsonObject entry }) return;
            await Guard(() => entry["directory"]?.GetValue<bool>() == true ? DirectoryView(view, workspace, Wire.Id(entry["path"])) : FilePreview(workspace, Wire.Id(entry["path"])));
        };
        var surface = NativeStyle.Surface(); surface.Child = list; view.Children.Add(surface);
        if (listing["truncated"]?.GetValue<bool>() == true) view.Children.Add(NativeStyle.Label("This folder is large. Showing the first 500 entries."));
    }

    async Task FilePreview(string workspace, string path)
    {
        var panel = new StackPanel { Spacing = 12, MinWidth = 400 };
        var mode = new ComboBox { Header = "Preview", ItemsSource = new[] { "Source", "Changes" }, SelectedIndex = 0 };
        var note = NativeStyle.Label("");
        var preview = new TextBox { IsReadOnly = true, AcceptsReturn = true, TextWrapping = TextWrapping.NoWrap, FontFamily = new FontFamily("Cascadia Mono, Consolas"), FontSize = 12, Height = 360 };
        panel.Children.Add(NativeStyle.Label(path)); panel.Children.Add(mode); panel.Children.Add(note); panel.Children.Add(preview);
        async Task Load()
        {
            var source = await hub!.Get((mode.SelectedIndex == 1 ? "/api/ops/files/diff" : "/api/ops/files/read") + "?workspace=" + Wire.Segment(workspace) + "&path=" + Wire.Segment(path));
            preview.Text = source["content"]?.ToString() ?? "";
            note.Text = source["binary"]?.GetValue<bool>() == true ? "Binary file. Text preview is unavailable." : source["truncated"]?.GetValue<bool>() == true ? "Preview is truncated to the server's size limit." : mode.SelectedIndex == 1 && preview.Text.Length == 0 ? "No tracked changes against HEAD." : "Read-only cloud preview";
        }
        mode.SelectionChanged += async (_, _) => await Guard(Load);
        await Load(); await Dialog("File preview", panel, "Close");
    }

    async Task MemoryView(StackPanel view)
    {
        var saved = await hub!.Get("/api/ops/memory");
        var version = Wire.Id(saved["version"]);
        view.Children.Clear();
        var surface = ToolCard("Assistant memory", "Notes your assistant carries across sessions and providers. Updates are checked against the saved version.", out var body);
        var editor = new TextBox { Text = saved["body"]?.ToString() ?? "", AcceptsReturn = true, TextWrapping = TextWrapping.Wrap, MinHeight = 280, MaxHeight = 520, FontSize = 14, MaxLength = 64000 };
        AutomationProperties.SetName(editor, "Persistent assistant memory");
        body.Children.Add(editor); var feedback = NativeStyle.Label(""); body.Children.Add(feedback);
        body.Children.Add(Button("Save memory", async () =>
        {
            var draft = editor.Text;
            try
            {
                var result = await hub.Post("/api/ops/memory", new() { ["body"] = draft, ["version"] = version });
                version = Wire.Id(result["version"]); feedback.Text = "Saved. Your assistant will use these notes.";
            }
            catch (HubException error) when (error.Status == System.Net.HttpStatusCode.Conflict)
            {
                var current = await hub.Get("/api/ops/memory");
                if (current["body"]?.ToString() == draft) { version = Wire.Id(current["version"]); feedback.Text = "Your notes are already saved."; return; }
                var comparison = new StackPanel { Spacing = 12 }; comparison.Children.Add(Text("Memory changed elsewhere", 19)); comparison.Children.Add(NativeStyle.Label("Your draft is preserved. Compare the current notes before replacing them.")); comparison.Children.Add(Text("Current saved notes", 14)); comparison.Children.Add(Text(current["body"]?.ToString() ?? "")); comparison.Children.Add(Text("Your draft", 14)); comparison.Children.Add(Text(draft));
                if (await Dialog("Resolve memory changes", comparison, "Save my draft"))
                {
                    var result = await hub.Post("/api/ops/memory", new() { ["body"] = draft, ["version"] = current["version"]!.DeepClone() });
                    version = Wire.Id(result["version"]); feedback.Text = "Saved your reviewed draft.";
                }
                else feedback.Text = "Your draft remains here. Saved memory has not been overwritten.";
            }
        }));
        view.Children.Add(surface);
    }

    void RunnerView(StackPanel view)
    {
        view.Children.Clear();
        var surface = ToolCard("This PC", "The local runner is a separate process. Pair it, approve its workspaces, and keep accepted work running when this window closes.", out var body);
        body.Children.Add(Button("Pair local runner", () => StartRunner("pair", origin)));
        body.Children.Add(Button("Start local runner", () => StartRunner("run")));
        body.Children.Add(Button("Open runner configuration", () => { var path = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Ops", "runner"); Directory.CreateDirectory(path); System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(path) { UseShellExecute = true }); return Task.CompletedTask; }));
        body.Children.Add(Button("Pending changes and conflicts", Outbox));
        body.Children.Add(Button("Disconnect this client", () => { timer.Stop(); hub?.Dispose(); hub = null; File.Delete(Path.Combine(Identity.Root, "identity.bin")); PairView(); return Task.CompletedTask; }));
        view.Children.Add(surface);
    }

    static double? Number(JsonNode? value) => double.TryParse(value?.ToString(), NumberStyles.Float, CultureInfo.InvariantCulture, out var number) && double.IsFinite(number) ? number : null;
    static DateTimeOffset? Timestamp(JsonNode? value)
    {
        if (Number(value) is double milliseconds && milliseconds >= -62135596800000 && milliseconds <= 253402300799999) return DateTimeOffset.FromUnixTimeMilliseconds((long)milliseconds);
        return DateTimeOffset.TryParse(value?.ToString(), CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var date) ? date : null;
    }
}
