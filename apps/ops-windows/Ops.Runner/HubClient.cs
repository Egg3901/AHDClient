using System.Diagnostics;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Ops.Runner;

public sealed class HubRejectedException(HttpStatusCode status) : Exception($"Hub rejected request ({(int)status}).")
{
    public HttpStatusCode Status { get; } = status;
}
public sealed class HubClient : IDisposable
{
    private readonly HttpClient http;
    public HubClient(string origin, string? token = null, HttpMessageHandler? handler = null)
    {
        http = new HttpClient(handler ?? new HttpClientHandler { AllowAutoRedirect = false })
        { BaseAddress = RunnerConfig.ValidateOrigin(origin), Timeout = TimeSpan.FromSeconds(8) };
        if (token is not null) http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
    }
    public async Task<JsonElement> Post(string path, object body, CancellationToken cancellationToken)
    {
        using var requestTimeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        requestTimeout.CancelAfter(TimeSpan.FromSeconds(8));
        cancellationToken = requestTimeout.Token;
        using var request = new HttpRequestMessage(HttpMethod.Post, path) { Content = JsonContent.Create(body, options: RunnerConfig.Json) };
        request.Headers.Add("X-Request-ID", Guid.NewGuid().ToString());
        using var response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        if (!response.IsSuccessStatusCode) throw new HubRejectedException(response.StatusCode);
        using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var bytes = new MemoryStream();
        var buffer = new byte[8192];
        while (true)
        {
            var count = await stream.ReadAsync(buffer.AsMemory(), cancellationToken); if (count == 0) break;
            if (bytes.Length + count > 2_000_000) throw new InvalidDataException("Hub response exceeds limit.");
            bytes.Write(buffer, 0, count);
        }
        using var document = JsonDocument.Parse(bytes.ToArray()); return document.RootElement.Clone();
    }
    public void Dispose() => http.Dispose();
}

public static class DevicePairing
{
    // Entropy binds this credential to this application's exact origin and role.
    private static byte[] Entropy(string origin) => SHA256.HashData(Encoding.UTF8.GetBytes("Ops.Runner/v1:" + RunnerConfig.ValidateOrigin(origin).AbsoluteUri));
    public static string ReadToken(string path, string origin) => Encoding.UTF8.GetString(ProtectedData.Unprotect(File.ReadAllBytes(path), Entropy(origin), DataProtectionScope.CurrentUser));
    public static async Task Pair(string origin, string tokenPath, CancellationToken token)
    {
        using var hub = new HubClient(origin);
        var start = await hub.Post("/api/ops/pairing/start", new { name = Environment.MachineName + " runner", kind = "runner" }, token);
        var verification = new Uri(start.GetProperty("verificationUrl").GetString()!, UriKind.Absolute);
        if (verification.GetLeftPart(UriPartial.Authority) != RunnerConfig.ValidateOrigin(origin).GetLeftPart(UriPartial.Authority))
            throw new InvalidDataException("Pairing URL must stay on the configured Hub origin.");
        Console.WriteLine("Approve runner code: " + start.GetProperty("code").GetString());
        Process.Start(new ProcessStartInfo(verification.AbsoluteUri) { UseShellExecute = true });
        var expiresAt = start.GetProperty("expiresAt").GetDateTimeOffset();
        var deadline = DateTimeOffset.UtcNow.AddMinutes(15);
        while (DateTimeOffset.UtcNow < expiresAt && DateTimeOffset.UtcNow < deadline)
        {
            await Task.Delay(TimeSpan.FromSeconds(3), token);
            var poll = await hub.Post("/api/ops/pairing/poll", new { pairId = start.GetProperty("pairId").GetString(), pollToken = start.GetProperty("pollToken").GetString() }, token);
            var status = poll.GetProperty("status").GetString();
            if (status == "expired") break;
            if (status != "approved") continue;
            var plaintext = Encoding.UTF8.GetBytes(poll.GetProperty("accessToken").GetString()!);
            try
            {
                var protectedBytes = ProtectedData.Protect(plaintext, Entropy(origin), DataProtectionScope.CurrentUser);
                Directory.CreateDirectory(Path.GetDirectoryName(tokenPath)!);
                using (var stream = new FileStream(tokenPath + ".tmp", FileMode.Create, FileAccess.Write, FileShare.None, 4096, FileOptions.WriteThrough))
                { stream.Write(protectedBytes); stream.Flush(true); }
                File.Move(tokenPath + ".tmp", tokenPath, true);
            }
            finally { CryptographicOperations.ZeroMemory(plaintext); }
            Console.WriteLine("Runner paired."); return;
        }
        throw new InvalidOperationException("Pairing expired. Start pairing again.");
    }
}
