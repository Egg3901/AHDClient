using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
namespace Ops.Client;
internal static class Identity
{
    public static string Root => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Ops","client");
    public static void Save(string origin,string token)
    {
        Directory.CreateDirectory(Root);
        var encrypted=ProtectedData.Protect(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new[]{origin,token})),null,DataProtectionScope.CurrentUser);
        var temp=Path.Combine(Root,"identity.tmp");File.WriteAllBytes(temp,encrypted);File.Move(temp,Path.Combine(Root,"identity.bin"),true);
    }
    public static string[]? Load()
    {
        var path=Path.Combine(Root,"identity.bin");
        return File.Exists(path)?JsonSerializer.Deserialize<string[]>(ProtectedData.Unprotect(File.ReadAllBytes(path),null,DataProtectionScope.CurrentUser)):null;
    }
}
