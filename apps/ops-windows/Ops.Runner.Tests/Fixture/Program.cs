using System.Text.Json;
if (args is ["--ops-probe"])
{
    Console.WriteLine("{\"protocol\":\"ops-provider-v1\",\"provider\":\"muse\",\"readOnlySupported\":true}"); return 0;
}
if (args is not ["--ops-run"]) return 2;
using var request = JsonDocument.Parse(await Console.In.ReadToEndAsync());
switch (request.RootElement.GetProperty("prompt").GetString())
{
    case "hang": await Task.Delay(TimeSpan.FromMinutes(5)); break;
    case "bad": Console.WriteLine("not json"); break;
    case "oversize": Console.WriteLine(new string('a', 16001)); break;
    default: Console.WriteLine("{\"kind\":\"text\",\"text\":\"fixture completed\"}"); break;
}
return 0;
