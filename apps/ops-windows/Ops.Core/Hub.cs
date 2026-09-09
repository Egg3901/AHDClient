using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Ops.Core;

public sealed class Hub : IDisposable
{
    readonly HttpClient http;
    public Hub(string origin, string? token = null, HttpMessageHandler? handler = null)
    {
        var uri = new Uri(origin);
        if (uri.Scheme != "https" || uri.AbsolutePath != "/" || !string.IsNullOrEmpty(uri.UserInfo) || !string.IsNullOrEmpty(uri.Query) || !string.IsNullOrEmpty(uri.Fragment))
            throw new ArgumentException("Enter an HTTPS Hub origin without a path or credentials.");
        http = handler is null ? new HttpClient(new HttpClientHandler { AllowAutoRedirect = false }) : new HttpClient(handler);
        http.BaseAddress = uri; http.Timeout = TimeSpan.FromSeconds(20);
        if (token is not null) http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
    }
    public Task<JsonObject> Get(string path, CancellationToken ct = default) => Send(HttpMethod.Get, path, null, ct);
    public Task<JsonObject> Post(string path, JsonObject body, CancellationToken ct = default) => Send(HttpMethod.Post, path, body, ct);
    async Task<JsonObject> Send(HttpMethod method, string path, JsonObject? body, CancellationToken ct)
    {
        if (!(path.StartsWith("/api/ops/", StringComparison.Ordinal) || path.StartsWith("/api/chat/", StringComparison.Ordinal) || path == "/api/conversations" || path.StartsWith("/api/conversations/", StringComparison.Ordinal)) || path.Contains("://")) throw new ArgumentException("Invalid API path.");
        using var request = new HttpRequestMessage(method, path);
        if (body is not null) request.Content = JsonContent.Create(body);
        using var response = await http.SendAsync(request, ct);
        var raw = await response.Content.ReadAsStringAsync(ct);
        JsonObject data;
        try { data = JsonNode.Parse(raw)?.AsObject() ?? new(); }
        catch (JsonException) { throw new HttpRequestException("Hub returned an invalid response."); }
        if (!response.IsSuccessStatusCode) throw new HubException(response.StatusCode, data);
        return data;
    }
    public async Task<JsonObject> Upload(Stream stream,string name,string mime,CancellationToken ct=default)
    {
        using var request=new HttpRequestMessage(HttpMethod.Post,"/api/chat/upload");request.Content=new StreamContent(stream);request.Content.Headers.ContentType=new MediaTypeHeaderValue(mime);request.Headers.Add("X-Filename",Uri.EscapeDataString(name));
        using var response=await http.SendAsync(request,ct);var data=JsonNode.Parse(await response.Content.ReadAsStringAsync(ct))!.AsObject();
        if(!response.IsSuccessStatusCode)throw new HubException(response.StatusCode,data);return data;
    }
    public void Dispose() => http.Dispose();
}
public sealed class HubException(HttpStatusCode status, JsonObject body) : Exception(body["error"]?.ToString() ?? $"Hub returned {(int)status}")
{
    public HttpStatusCode Status { get; } = status;
    public JsonObject Body { get; } = body;
}
public static class Wire
{
    public static string Id(JsonNode? node) => node?.ToString() ?? "";
    public static string Segment(string value) => Uri.EscapeDataString(value);
    public static JsonObject Command(string type, JsonObject payload, JsonObject? card = null) => new()
    {
        ["commandId"] = Guid.NewGuid().ToString(), ["type"] = type, ["payload"] = payload,
        ["cardId"] = card?["id"]?.DeepClone(), ["baseVersion"] = card?["version"]?.DeepClone(),
        ["basePositionVersion"] = card?["positionVersion"]?.DeepClone()
    };
}
