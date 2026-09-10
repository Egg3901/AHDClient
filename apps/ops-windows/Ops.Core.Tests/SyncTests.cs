using Ops.Core;
using System.Net;
using System.Text;
using System.Text.Json.Nodes;
using Xunit;
namespace Ops.Core.Tests;
public sealed class SyncTests
{
    sealed class Handler(Func<HttpRequestMessage,Task<HttpResponseMessage>> respond):HttpMessageHandler
    {protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,CancellationToken ct)=>respond(request);}
    static HttpResponseMessage Response(HttpStatusCode code,string json)=>new(code){Content=new StringContent(json,Encoding.UTF8,"application/json")};
    [Fact] public async Task RestartRetriesSameCommandAfterLostResponse()
    {
        var path=Path.Combine(Path.GetTempPath(),Guid.NewGuid()+".db");var command=Wire.Command("comment.add",new(){["text"]="hello"});
        using(var store=new Store(path))store.Queue("/api/ops/boards/studio/commands",command);
        string? first=null;
        using(var store=new Store(path))
        {
            using var offline=new Hub("https://hub.example",handler:new Handler(async request=>{first=await request.Content!.ReadAsStringAsync();throw new HttpRequestException("Lost response");}));
            await Assert.ThrowsAsync<HttpRequestException>(()=>store.Flush(offline));Assert.Single(store.Pending());
        }
        using(var store=new Store(path))
        {
            using var online=new Hub("https://hub.example",handler:new Handler(async request=>{Assert.Equal(first,await request.Content!.ReadAsStringAsync());return Response(HttpStatusCode.OK,"{\"status\":\"accepted\"}");}));
            await store.Flush(online);Assert.Empty(store.Pending());
        }
    }
    [Fact] public async Task ConflictRetainsBothIntentAndServerStateAcrossSnapshot()
    {
        using var store=new Store(Path.Combine(Path.GetTempPath(),Guid.NewGuid()+".db"));store.Queue("/api/ops/boards/studio/commands",Wire.Command("card.move",new(){["columnId"]="done"}));
        using var hub=new Hub("https://hub.example",handler:new Handler(_=>Task.FromResult(Response(HttpStatusCode.Conflict,"{\"error\":\"Changed elsewhere\",\"current\":{\"columnId\":\"review\"}}"))));
        await store.Flush(hub);store.Cache("board:studio",new(){["cards"]=new JsonArray()});var pending=Assert.Single(store.Pending());Assert.Equal("conflict",pending.State);Assert.Contains("review",pending.Error);Assert.Equal("done",pending.Body["payload"]!["columnId"]!.ToString());
    }
    [Fact] public async Task UncertainDispatchOnlyQueriesReceiptAndNeverReposts()
    {
        using var store=new Store(Path.Combine(Path.GetTempPath(),Guid.NewGuid()+".db"));var command=Wire.Command("run.dispatch",new(){["hostId"]="cloud"});store.RecordOnline("/api/ops/boards/studio/commands",command);
        var calls=0;using var hub=new Hub("https://hub.example",handler:new Handler(request=>{calls++;Assert.Equal(HttpMethod.Get,request.Method);Assert.EndsWith(Wire.Id(command["commandId"]),request.RequestUri!.AbsolutePath);return Task.FromResult(Response(calls==1?HttpStatusCode.NotFound:HttpStatusCode.OK,calls==1?"{\"error\":\"Not found\"}":"{\"status\":\"accepted\"}"));}));
        await store.Flush(hub);Assert.Equal("uncertain",Assert.Single(store.Pending()).State);await store.Flush(hub);Assert.Empty(store.Pending());
    }
    [Theory][InlineData("run.dispatch")][InlineData("run.cancel")][InlineData("proposal.decide")]
    public void ConsequentialActionsCannotQueueOffline(string type)
    {
        using var store=new Store(Path.Combine(Path.GetTempPath(),Guid.NewGuid()+".db"));Assert.Throws<InvalidOperationException>(()=>store.Queue("/api/ops/boards/studio/commands",Wire.Command(type,new())));
    }
    [Theory][InlineData("http://hub.example")][InlineData("https://owner:secret@hub.example")][InlineData("https://hub.example/private")]
    public void RejectsUnsafeOrigins(string origin)=>Assert.Throws<ArgumentException>(()=>new Hub(origin));
    [Fact] public void NumericLegacyIdsRemainCompatible()=>Assert.Equal("42",Wire.Id(JsonValue.Create(42)));
}
