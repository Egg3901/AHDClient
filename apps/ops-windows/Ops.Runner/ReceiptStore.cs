using Microsoft.Data.Sqlite;
using System.Text.Json;

namespace Ops.Runner;

// All operations run on the runner control loop. Every spawn boundary and event ID is committed first.
public sealed class ReceiptStore : IDisposable
{
    private readonly SqliteConnection db;
    public ReceiptStore(string path)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(path))!);
        db = new SqliteConnection(new SqliteConnectionStringBuilder { DataSource = path }.ToString());
        db.Open();
        Execute("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;");
        Execute("CREATE TABLE IF NOT EXISTS receipts(id TEXT PRIMARY KEY, claim TEXT NOT NULL, state TEXT NOT NULL, finish TEXT);" +
            "CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT UNIQUE NOT NULL,run_id TEXT NOT NULL,payload TEXT NOT NULL);");
    }
    private void Execute(string sql, params (string, object?)[] parameters)
    {
        using var command = db.CreateCommand(); command.CommandText = sql;
        foreach (var (name, value) in parameters) command.Parameters.AddWithValue(name, value ?? DBNull.Value);
        command.ExecuteNonQuery();
    }
    public bool Accept(RunClaim claim)
    {
        using var command = db.CreateCommand();
        command.CommandText = "INSERT OR IGNORE INTO receipts(id,claim,state) VALUES($id,$claim,'accepted')";
        command.Parameters.AddWithValue("$id", claim.Id);
        command.Parameters.AddWithValue("$claim", JsonSerializer.Serialize(claim, RunnerConfig.Json));
        return command.ExecuteNonQuery() == 1;
    }
    public void MarkStarted(string id)
    {
        using var command = db.CreateCommand();
        command.CommandText = "UPDATE receipts SET state='started' WHERE id=$id AND state='accepted'";
        command.Parameters.AddWithValue("$id", id);
        if (command.ExecuteNonQuery() != 1) throw new InvalidOperationException("Receipt cannot be started again.");
    }
    public void Finish(string id, FinishPayload result) => Execute("UPDATE receipts SET state='finishing',finish=$finish WHERE id=$id AND state!='done'",
        ("$id", id), ("$finish", JsonSerializer.Serialize(result, RunnerConfig.Json)));
    public void MarkDone(string id) => Execute("UPDATE receipts SET state='done' WHERE id=$id", ("$id", id));
    public IReadOnlyList<Receipt> Pending()
    {
        using var command = db.CreateCommand(); command.CommandText = "SELECT claim,state,finish FROM receipts WHERE state!='done' ORDER BY rowid";
        using var reader = command.ExecuteReader(); var rows = new List<Receipt>();
        while (reader.Read()) rows.Add(new Receipt(JsonSerializer.Deserialize<RunClaim>(reader.GetString(0), RunnerConfig.Json)!, reader.GetString(1),
            reader.IsDBNull(2) ? null : JsonSerializer.Deserialize<FinishPayload>(reader.GetString(2), RunnerConfig.Json)));
        return rows;
    }
    public void Append(string runId, RunEvent item) => Execute("INSERT OR IGNORE INTO events(id,run_id,payload) VALUES($id,$run,$payload)",
        ("$id", item.Id), ("$run", runId), ("$payload", JsonSerializer.Serialize(item, RunnerConfig.Json)));
    public IReadOnlyList<RunEvent> Events(string runId)
    {
        using var command = db.CreateCommand(); command.CommandText = "SELECT payload FROM events WHERE run_id=$run ORDER BY seq LIMIT 50";
        command.Parameters.AddWithValue("$run", runId); using var reader = command.ExecuteReader(); var rows = new List<RunEvent>();
        while (reader.Read()) rows.Add(JsonSerializer.Deserialize<RunEvent>(reader.GetString(0), RunnerConfig.Json)!);
        return rows;
    }
    public void ConfirmEvents(IReadOnlyList<RunEvent> events)
    {
        using var transaction = db.BeginTransaction();
        foreach (var item in events)
        {
            using var command = db.CreateCommand(); command.Transaction = transaction;
            command.CommandText = "DELETE FROM events WHERE id=$id"; command.Parameters.AddWithValue("$id", item.Id); command.ExecuteNonQuery();
        }
        transaction.Commit();
    }
    public void Dispose() => db.Dispose();
}
