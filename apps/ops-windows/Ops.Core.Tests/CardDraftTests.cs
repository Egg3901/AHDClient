using System.Text.Json.Nodes;
using Xunit;

namespace Ops.Core.Tests;
public class CardDraftTests
{
    static JsonObject Card(string title, string objective) => new() { ["title"] = title, ["objective"] = objective };
    [Fact]
    public void RefreshPreservesDirtyFieldAndOriginalConflictBase()
    {
        var draft = new CardDraft(Card("Original", "Old objective"));
        var latest = Card("Other device", "Updated objective");
        Assert.Equal("My draft", draft.RefreshField("title", "My draft", latest));
        Assert.Equal("Updated objective", draft.RefreshField("objective", "Old objective", latest));
        var patch = draft.Patch(("title", "My draft"), ("objective", "Updated objective"));
        Assert.Equal("Original", patch["base"]!["title"]!.ToString());
        Assert.False(patch["changes"]!.AsObject().ContainsKey("objective"));
    }
    [Fact]
    public void AcknowledgedSaveRebasesNextEdit()
    {
        var draft = new CardDraft(Card("Original", "Objective"));
        Assert.Equal("First edit", draft.RefreshField("title", "First edit", Card("First edit", "Objective")));
        var patch = draft.Patch(("title", "Second edit"));
        Assert.Equal("First edit", patch["base"]!["title"]!.ToString());
        Assert.Equal("Second edit", patch["changes"]!["title"]!.ToString());
    }
    [Fact]
    public void TypingDuringSaveKeepsDraftAndRebasesAcknowledgedValue()
    {
        var draft = new CardDraft(Card("Original", "Objective"));
        draft.Submitted(draft.Patch(("title", "First edit")));
        Assert.Equal("Second edit", draft.RefreshField("title", "Second edit", Card("First edit", "Objective")));
        Assert.Equal("First edit", draft.Patch(("title", "Second edit"))["base"]!["title"]!.ToString());
    }
    [Fact]
    public void UnacknowledgedSaveKeepsPendingDraft()
    {
        var draft = new CardDraft(Card("Original", "Objective"));
        Assert.Equal("Offline edit", draft.RefreshField("title", "Offline edit", Card("Original", "Objective")));
        Assert.Equal("Original", draft.Patch(("title", "Offline edit"))["base"]!["title"]!.ToString());
    }
}
