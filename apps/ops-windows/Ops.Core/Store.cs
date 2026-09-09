using Microsoft.Data.Sqlite;
using System.Text.Json.Nodes;
namespace Ops.Core;

public sealed record Pending(string Id, string Path, JsonObject Body, string State, string? Error);
public sealed class Store : IDisposable
{
    readonly SqliteConnection db;
    public Store(string path)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(path))!);
        db = new SqliteConnection(new SqliteConnectionStringBuilder { DataSource = path }.ToString()); db.Open();
        Execute("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS cache(key TEXT PRIMARY KEY,json TEXT NOT NULL,updated TEXT NOT NULL); CREATE TABLE IF NOT EXISTS outbox(id TEXT PRIMARY KEY,path TEXT NOT NULL,json TEXT NOT NULL,state TEXT NOT NULL,error TEXT);");
    }
    void Execute(string sql, params (string, object?)[] values)
    {
        using var cmd = db.CreateCommand(); cmd.CommandText = sql;
        foreach (var (key, value) in values) cmd.Parameters.AddWithValue(key, value ?? DBNull.Value);
        cmd.ExecuteNonQuery();
    }
    public void Cache(string key, JsonObject value) => Execute("INSERT INTO cache VALUES($k,$j,$t) ON CONFLICT(key) DO UPDATE SET json=$j,updated=$t", ("$k",key),("$j",value.ToJsonString()),("$t",DateTimeOffset.UtcNow.ToString("O")));
    public (JsonObject? Value, string? Updated) Read(string key)
    {
        using var cmd = db.CreateCommand(); cmd.CommandText = "SELECT json,updated FROM cache WHERE key=$k";cmd.Parameters.AddWithValue("$k",key);
        using var r = cmd.ExecuteReader();return r.Read() ? (JsonNode.Parse(r.GetString(0))!.AsObject(),r.GetString(1)) : (null,null);
    }
    public void Queue(string path, JsonObject command)
    {
        if (command["type"]?.ToString() is "run.dispatch" or "run.cancel" or "proposal.decide") throw new InvalidOperationException("This action requires online confirmation.");
        Execute("INSERT INTO outbox VALUES($id,$p,$j,'pending',NULL)",("$id",Wire.Id(command["commandId"])),("$p",path),("$j",command.ToJsonString()));
    }
    public void RecordOnline(string path, JsonObject command) => Execute("INSERT INTO outbox VALUES($id,$p,$j,'uncertain',NULL)",("$id",Wire.Id(command["commandId"])),("$p",path),("$j",command.ToJsonString()));
    public void MarkConflict(string id,string error) => Execute("UPDATE outbox SET state='conflict',error=$e WHERE id=$id",("$e",error),("$id",id));
    public List<Pending> Pending()
    {
        using var cmd=db.CreateCommand();cmd.CommandText="SELECT id,path,json,state,error FROM outbox ORDER BY rowid";
        using var r=cmd.ExecuteReader();var result=new List<Pending>();
        while(r.Read()) result.Add(new(r.GetString(0),r.GetString(1),JsonNode.Parse(r.GetString(2))!.AsObject(),r.GetString(3),r.IsDBNull(4)?null:r.GetString(4)));
        return result;
    }
    public void Remove(string id) => Execute("DELETE FROM outbox WHERE id=$id",("$id",id));
    public async Task Flush(Hub hub, CancellationToken ct = default)
    {
        foreach(var item in Pending().Where(x=>x.State=="uncertain"))
        {
            try { await hub.Get("/api/ops/commands/"+Wire.Segment(item.Id),ct);Remove(item.Id); }
            catch(HubException ex) when (ex.Status == System.Net.HttpStatusCode.NotFound) { }
        }
        foreach(var item in Pending().Where(x=>x.State=="pending"))
        {
            try { await hub.Post(item.Path,item.Body,ct); Remove(item.Id); }
            catch(HubException ex) when ((int)ex.Status is >=400 and <500 && (int)ex.Status != 429)
            { Execute("UPDATE outbox SET state='conflict',error=$e WHERE id=$id",("$e",ex.Body.ToJsonString()),("$id",item.Id)); }
        }
    }
    public void Reset() => Execute("DELETE FROM outbox; DELETE FROM cache;");
    public void Dispose()=>db.Dispose();
}
