using System.Text.Json.Nodes;

namespace Ops.Core;

// A field keeps its original server base while locally edited, even as other fields refresh.
public sealed class CardDraft(JsonObject card)
{
    readonly JsonObject bases = card.DeepClone().AsObject();
    readonly JsonObject submitted = new();
    public void Submitted(JsonObject patch)
    {
        foreach(var field in patch["changes"]!.AsObject()) submitted[field.Key] = field.Value?.DeepClone();
    }
    public string RefreshField(string field, string draft, JsonObject latest)
    {
        var current = latest[field]?.ToString() ?? "";
        if (submitted.TryGetPropertyValue(field, out var sent) && JsonNode.DeepEquals(sent, latest[field]))
        {
            bases[field] = latest[field]?.DeepClone();
            submitted.Remove(field);
            return draft;
        }
        if (draft == (bases[field]?.ToString() ?? ""))
        {
            bases[field] = latest[field]?.DeepClone();
            return current;
        }
        if (draft == current) bases[field] = latest[field]?.DeepClone();
        return draft;
    }
    public JsonObject Patch(params (string Field, string Value)[] fields)
    {
        var changes = new JsonObject(); var originals = new JsonObject();
        foreach (var (field, value) in fields)
            if ((bases[field]?.ToString() ?? "") != value)
            {
                changes[field] = value;
                originals[field] = bases[field]?.DeepClone();
            }
        return new() { ["changes"] = changes, ["base"] = originals };
    }
}
