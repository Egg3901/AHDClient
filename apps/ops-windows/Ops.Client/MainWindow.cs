using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Automation;
using Ops.Core;
using Hub = Ops.Core.Hub;
using System.Diagnostics;
using System.Text.Json.Nodes;

namespace Ops.Client;
public sealed class MainWindow : Window
{
    readonly StackPanel root = new() { Spacing=12, Margin=new Thickness(20) };
    readonly TextBlock status = new() { TextWrapping=TextWrapping.Wrap, IsTextSelectionEnabled=true };
    readonly StackPanel content = new() { Spacing=12 };
    readonly Store store;
    readonly Microsoft.UI.Dispatching.DispatcherQueueTimer timer;
    Hub? hub; string origin=""; string boardId=""; string conversationId=""; JsonObject? board; JsonObject? selected;
    readonly ComboBox boards = new() { Header="Board", MinWidth=220, DisplayMemberPath="Label" };
    readonly StackPanel lanes = new() { Orientation=Orientation.Horizontal,Spacing=16 };
    readonly StackPanel detail = new() { Spacing=10, Width=360 };
    bool busy; string destination="Work"; Func<Task>? assistantRefresh;
    sealed record Choice(string Id,string Label,JsonObject Data);
    static TextBox Input(string header,string text="",bool multiline=false) => new() { Header=header,Text=text,AcceptsReturn=multiline,TextWrapping=TextWrapping.Wrap,MinWidth=240,MaxHeight=180 };
    Button Button(string label,Func<Task> action) { var b=new Button { Content=label };b.Click+=async(_,_)=>{b.IsEnabled=false;try{await Guard(action);}finally{b.IsEnabled=true;}};return b; }
    async Task Guard(Func<Task> action) { try { await action(); } catch(Exception ex) { status.Text=ex.Message; } }
    static TextBlock Text(string value,int size=14)=>new(){Text=value,FontSize=size,TextWrapping=TextWrapping.Wrap,IsTextSelectionEnabled=true};
    public MainWindow(bool smoke = false)
    {
        store = new Store(smoke ? Path.Combine(Path.GetTempPath(),"Ops-smoke",Environment.ProcessId+".db") : Path.Combine(Identity.Root,"work.db"));
        Title="Ops";AppWindow.Resize(new Windows.Graphics.SizeInt32(1440,960));
        var scroll=new ScrollViewer { Content=root, HorizontalScrollBarVisibility=ScrollBarVisibility.Auto };
        Content=scroll;root.Children.Add(Text("Ops",28));
        var nav=new StackPanel { Orientation=Orientation.Horizontal,Spacing=8 };
        foreach(var name in new[]{"Assistant","Work","Staff","Tools"}) nav.Children.Add(Button(name,()=>Navigate(name)));
        root.Children.Add(nav);root.Children.Add(status);root.Children.Add(content);
        timer=DispatcherQueue.CreateTimer();timer.Interval=TimeSpan.FromSeconds(3);timer.Tick+=async(_,_)=>{if(!busy&&hub is not null){if(destination=="Work")await Guard(Refresh);else if(destination=="Assistant"&&assistantRefresh is not null)await Guard(assistantRefresh);}};
        Closed+=(_,_)=>{timer.Stop();hub?.Dispose();store.Dispose();};
        if(smoke){SmokeView();return;}
        _=Guard(async()=>{var identity=Identity.Load();if(identity is null)PairView();else{origin=identity[0];hub=new Hub(origin,identity[1]);await Navigate("Work");timer.Start();}});
    }
    void SmokeView()
    {
        status.Text="Native UI smoke fixture. No Hub connection.";boardId="sample";
        var columns=new JsonArray();foreach(var name in new[]{"Inbox","Ready","Doing","Review","Done"})columns.Add(new JsonObject{["id"]=name.ToLowerInvariant(),["title"]=name,["category"]="queued"});
        var cards=new JsonArray();var titles=new[]{"Plan the next release","Check accessibility","Run Windows validation","Review the research","Publish the changelog"};
        for(var i=0;i<titles.Length;i++)cards.Add(new JsonObject{["id"]="sample-"+i,["title"]=titles[i],["objective"]="Keep the work, review and activity together.",["columnId"]=new[]{"inbox","ready","doing","review","done"}[i],["version"]=1,["positionVersion"]=1});
        content.Children.Add(Text("Studio work",22));content.Children.Add(lanes);Render(new(){["board"]=new JsonObject{["id"]=boardId,["name"]="Studio",["version"]=1,["columns"]=columns},["cards"]=cards});
        content.Children.Add(Text("Review the research",22));content.Children.Add(Text("Agent proposal · Needs your review"));content.Children.Add(Text("Keep the work, review and activity together. Run output and decisions stay attached to the card."));
    }
    void PairView()
    {
        content.Children.Clear();var address=Input("Hub HTTPS origin","https://");content.Children.Add(address);
        content.Children.Add(Button("Pair this client",async()=>
        {
            origin=address.Text.Trim();using var pairing=new Hub(origin);
            var start=await pairing.Post("/api/ops/pairing/start",new(){["name"]=Environment.MachineName+" client",["kind"]="client"});
            status.Text="Confirm code "+start["code"]+" in your browser.";
            var verify=new Uri(start["verificationUrl"]!.ToString());
            if(verify.Scheme!="https"||verify.Authority!=new Uri(origin).Authority)throw new InvalidOperationException("Unexpected pairing verification origin.");
            Process.Start(new ProcessStartInfo(verify.AbsoluteUri){UseShellExecute=true});
            var expires=DateTimeOffset.Parse(start["expiresAt"]!.ToString());
            while(DateTimeOffset.UtcNow<expires)
            {
                await Task.Delay(3000);var result=await pairing.Post("/api/ops/pairing/poll",new(){["pairId"]=start["pairId"]!.DeepClone(),["pollToken"]=start["pollToken"]!.DeepClone()});
                if(result["status"]?.ToString()=="approved") { store.Reset();Identity.Save(origin,result["accessToken"]!.ToString());hub=new Hub(origin,result["accessToken"]!.ToString());await Navigate("Work");timer.Start();return; }
                if(result["status"]?.ToString()=="expired")break;
            }
            status.Text="Pairing expired. Start again.";
        }));
    }
    async Task Navigate(string page)
    {
        destination=page;assistantRefresh=null;if(hub is null){PairView();return;}content.Children.Clear();
        if(page=="Work")
        {
            var bar=new StackPanel{Orientation=Orientation.Horizontal,Spacing=8};bar.Children.Add(boards);
            bar.Children.Add(Button("Refresh",Refresh));bar.Children.Add(Button("New board",CreateBoard));bar.Children.Add(Button("Edit board / columns",ConfigureBoard));bar.Children.Add(Button("New card",CreateCard));bar.Children.Add(Button("Pending / conflicts",Outbox));content.Children.Add(bar);
            var split=new StackPanel{Orientation=Orientation.Horizontal,Spacing=24};split.Children.Add(lanes);split.Children.Add(detail);content.Children.Add(split);
            boards.SelectionChanged-=BoardChanged;boards.SelectionChanged+=BoardChanged;
            await Refresh();
        }
        else if(page=="Tools")
        {
            content.Children.Add(Text("Local runner",22));content.Children.Add(Text("Pair the runner separately, configure approved workspaces and tested providers, then start it. Closing this window leaves the runner running."));
            content.Children.Add(Button("Pair runner",()=>StartRunner("pair",origin)));content.Children.Add(Button("Start runner",()=>StartRunner("run")));
            content.Children.Add(Button("Open runner configuration folder",()=>{var path=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Ops","runner");Directory.CreateDirectory(path);Process.Start(new ProcessStartInfo(path){UseShellExecute=true});return Task.CompletedTask;}));
            content.Children.Add(Button("Pending / conflicts",Outbox));
            content.Children.Add(Button("Disconnect client",()=>{timer.Stop();hub.Dispose();hub=null;File.Delete(Path.Combine(Identity.Root,"identity.bin"));PairView();return Task.CompletedTask;}));
        }
        else if(page=="Assistant")await Assistant();
        else if(page=="Staff")await Staff();
    }
    async Task Assistant()
    {
        var conversations=await hub!.Get("/api/conversations");
        var chooser=new ComboBox{Header="Conversation",DisplayMemberPath="Label",ItemsSource=conversations["conversations"]!.AsArray().OfType<JsonObject>().Select(c=>new Choice(Wire.Id(c["id"]),c["title"]?.ToString()??"Conversation",c)).ToList()};
        var attachments=new JsonArray();var attachmentLabel=Text("");var transcript=new StackPanel{Spacing=12};var compose=Input("Message","",true);var actions=new StackPanel{Orientation=Orientation.Horizontal,Spacing=8};
        async Task Load()
        {
            if(chooser.SelectedItem is not Choice c)return;conversationId=c.Id;var turns=await hub.Get("/api/chat/turns?c="+Wire.Segment(c.Id));transcript.Children.Clear();
            foreach(var turn in turns["turns"]?.AsArray().OfType<JsonObject>()??[])
            {
                transcript.Children.Add(Text(turn["role"]+" · "+turn["status"],16));
                if(turn["route"] is JsonObject route)transcript.Children.Add(Text(string.Join(" · ",new[]{route["label"]?.ToString()??route["provider"]?.ToString(),route["model"]?.ToString(),route["effort"]?.ToString()}.Where(x=>!string.IsNullOrEmpty(x)))));
                foreach(var attachment in turn["attachments"]?.AsArray()??new JsonArray())transcript.Children.Add(Text("Attachment: "+attachment?["name"]));
                transcript.Children.Add(Text(turn["body"]?.ToString()??""));
                if(turn["status"]?.ToString() is "running" or "pending")transcript.Children.Add(Button("Stop response",async()=>{await hub.Post("/api/chat/stop",new(){["turn"]=turn["id"]!.DeepClone()});await Load();}));
            }
        }
        chooser.SelectionChanged+=async(_,_)=>await Guard(Load);
        actions.Children.Add(Button("New conversation",async()=>{await hub.Post("/api/conversations",new(){["title"]="New conversation"});await Navigate("Assistant");}));actions.Children.Add(Button("Refresh replies",Load));
        actions.Children.Add(Button("Attach file",async()=>
        {
            var picker=new Windows.Storage.Pickers.FileOpenPicker();WinRT.Interop.InitializeWithWindow.Initialize(picker,WinRT.Interop.WindowNative.GetWindowHandle(this));picker.FileTypeFilter.Add("*");var file=await picker.PickSingleFileAsync();if(file is null)return;
            var properties=await file.GetBasicPropertiesAsync();if(properties.Size>20*1024*1024)throw new InvalidOperationException("Choose a file of at most 20 MB.");
            using var stream=File.OpenRead(file.Path);var upload=await hub.Upload(stream,file.Name,string.IsNullOrEmpty(file.ContentType)?"application/octet-stream":file.ContentType);attachments.Add(upload);attachmentLabel.Text=string.Join(", ",attachments.Select(a=>a?["name"]?.ToString()??"Attachment"));
        }));
        actions.Children.Add(Button("Clear attachments",()=>{attachments.Clear();attachmentLabel.Text="";return Task.CompletedTask;}));
        content.Children.Add(chooser);content.Children.Add(actions);content.Children.Add(transcript);content.Children.Add(attachmentLabel);content.Children.Add(compose);
        content.Children.Add(Button("Send",async()=>
        {
            if(chooser.SelectedItem is not Choice c||(string.IsNullOrWhiteSpace(compose.Text)&&attachments.Count==0))return;
            var key="chat-send:"+c.Id;var previous=store.Read(key).Value;
            var payload=previous is not null&&previous["text"]?.ToString()==compose.Text&&JsonNode.DeepEquals(previous["attachments"],attachments)?previous:new JsonObject{["conversation"]=c.Id,["text"]=compose.Text,["attachments"]=attachments.DeepClone(),["requestId"]=Guid.NewGuid().ToString()};
            store.Cache(key,payload);await hub.Post("/api/chat/send",payload);compose.Text="";attachments.Clear();attachmentLabel.Text="";store.Cache(key,new());await Load();
        }));
        assistantRefresh=Load;chooser.SelectedItem=(chooser.ItemsSource as List<Choice>)?.FirstOrDefault(c=>c.Id==conversationId);if(chooser.SelectedItem is null)chooser.SelectedIndex=0;
    }
    async Task Staff()
    {
        var data=await hub!.Get("/api/ops/staff");content.Children.Add(Button("New team member",()=>EditStaff(null)));
        foreach(var member in data["staff"]?.AsArray().OfType<JsonObject>()??[])
        {
            content.Children.Add(Button(member["name"]?.ToString()??"Team member",async()=>
            {
                var record=await hub.Get("/api/ops/staff/"+Wire.Segment(Wire.Id(member["id"])));var staff=record["staff"]!.AsObject();var panel=new StackPanel{Spacing=8};panel.Children.Add(Text(staff["name"]+"\n"+staff["role"],20));panel.Children.Add(Text(staff["memory"]?.ToString()??""));
                foreach(var run in record["runs"]?.AsArray().OfType<JsonObject>()??[])panel.Children.Add(Text(run["name"]+": "+run["job_status"]));
                if(await Dialog("Team member",panel,"Edit"))await EditStaff(staff);
            }));
        }
    }
    async Task EditStaff(JsonObject? staff)
    {
        var name=Input("Name",staff?["name"]?.ToString()??"");var role=Input("Role",staff?["role"]?.ToString()??"",true);var memory=Input("Persistent memory",staff?["memory"]?.ToString()??"",true);var panel=new StackPanel{Spacing=8};panel.Children.Add(name);panel.Children.Add(role);panel.Children.Add(memory);
        if(await Dialog("Team member",panel))
        {
            var payload=new JsonObject{["requestId"]=Guid.NewGuid().ToString(),["name"]=name.Text,["role"]=role.Text,["memory"]=memory.Text,["provider"]=staff?["provider"]?.DeepClone()??JsonValue.Create("auto"),["model"]=staff?["model"]?.DeepClone(),["version"]=staff?["version"]?.DeepClone()};
            await hub!.Post("/api/ops/staff"+(staff is null?"":"/"+Wire.Segment(Wire.Id(staff["id"]))),payload);await Navigate("Staff");
        }
    }
    Task StartRunner(params string[] args)
    {
        var exe=Path.Combine(AppContext.BaseDirectory,"runner","Ops.Runner.exe");if(!File.Exists(exe))exe=Path.Combine(AppContext.BaseDirectory,"Ops.Runner.exe");
        var info=new ProcessStartInfo(exe){UseShellExecute=true};foreach(var arg in args)info.ArgumentList.Add(arg);Process.Start(info);status.Text="Runner opened in a separate process.";return Task.CompletedTask;
    }
    async void BoardChanged(object sender,SelectionChangedEventArgs e)
    {
        if(boards.SelectedItem is Choice choice&&choice.Id!=boardId){boardId=choice.Id;selected=null;await Guard(Refresh);}
    }
    async Task Refresh()
    {
        if(busy||hub is null)return;busy=true;
        try
        {
            await store.Flush(hub);var list=await hub.Get("/api/ops/boards");store.Cache("boards",list);SetBoards(list);
            if(boardId.Length==0)return;
            var all=new JsonArray();JsonObject? snapshot=null;string? after=null;
            do{var page=await hub.Get($"/api/ops/boards/{Wire.Segment(boardId)}/snapshot?limit=100"+(after is null?"":"&afterId="+Wire.Segment(after)));snapshot??=page;foreach(var card in page["cards"]!.AsArray())all.Add(card!.DeepClone());after=page["nextCursor"]?.ToString();}while(!string.IsNullOrEmpty(after));
            snapshot!["cards"]=all;store.Cache("board:"+boardId,snapshot);Render(snapshot);status.Text=$"Synced {DateTimeOffset.Now:t}. {store.Pending().Count} pending or conflicting actions.";
        }
        catch(Exception ex)
        {
            var cachedBoards=store.Read("boards");if(cachedBoards.Value is not null)SetBoards(cachedBoards.Value);
            var cached=store.Read("board:"+boardId);if(cached.Value is not null)Render(cached.Value);
            status.Text=$"Offline or unavailable: {ex.Message}. Cached at {cached.Updated??"never"}. {store.Pending().Count} pending or conflicting actions.";
        }
        finally{busy=false;}
    }
    void SetBoards(JsonObject list)
    {
        var choices=list["boards"]!.AsArray().OfType<JsonObject>().Select(b=>new Choice(Wire.Id(b["id"]),b["name"]!.ToString(),b)).ToList();
        if(!choices.Any(x=>x.Id==boardId))boardId=choices.FirstOrDefault()?.Id??"";
        boards.ItemsSource=choices;boards.SelectedItem=choices.FirstOrDefault(x=>x.Id==boardId);
    }
    void Render(JsonObject snapshot)
    {
        board=snapshot["board"]!.AsObject();lanes.Children.Clear();
        foreach(var column in board["columns"]!.AsArray().OfType<JsonObject>())
        {
            var lane=new StackPanel{Width=230,Spacing=8};var cards=snapshot["cards"]!.AsArray().OfType<JsonObject>().Where(c=>Wire.Id(c["columnId"])==Wire.Id(column["id"])).ToList();
            lane.Children.Add(Text($"{column["title"]} ({cards.Count})",18));
            var list=new ListView{MaxHeight=660,SelectionMode=ListViewSelectionMode.Single};AutomationProperties.SetName(list,column["title"]!.ToString());
            foreach(var card in cards){var pending=store.Pending().Any(p=>Wire.Id(p.Body["cardId"])==Wire.Id(card["id"]));list.Items.Add(new ListViewItem{Content=Text(card["title"]+ (pending?"\nPending change":"")),Tag=card});}
            list.SelectionChanged+=async(_,_)=>{if(list.SelectedItem is ListViewItem{Tag:JsonObject card})await Guard(()=>ShowCard(card));};lane.Children.Add(list);lanes.Children.Add(lane);
        }
    }
    string Commands=>"/api/ops/boards/"+Wire.Segment(boardId)+"/commands";
    async Task Online(JsonObject command)
    {
        store.RecordOnline(Commands,command);
        try { await hub!.Post(Commands,command);store.Remove(Wire.Id(command["commandId"])); }
        catch(HubException ex) { store.MarkConflict(Wire.Id(command["commandId"]),ex.Body.ToJsonString());throw; }
    }
    async Task Queue(string type,JsonObject payload,JsonObject? card=null)
    {
        store.Queue(Commands,Wire.Command(type,payload,card));await Refresh();
    }
    async Task<bool> Dialog(string title,StackPanel panel,string primary="Save")
    {
        var d=new ContentDialog{Title=title,Content=new ScrollViewer{Content=panel,MaxHeight=580},PrimaryButtonText=primary,CloseButtonText="Cancel",XamlRoot=root.XamlRoot};
        return await d.ShowAsync()==ContentDialogResult.Primary;
    }
    async Task CreateBoard()
    {
        var name=Input("Board name");var p=new StackPanel{Spacing=8};p.Children.Add(name);if(await Dialog("New board",p)) {store.Queue("/api/ops/boards",new(){["commandId"]=Guid.NewGuid().ToString(),["name"]=name.Text});await Refresh();}
    }
    async Task ConfigureBoard()
    {
        if(board is null)return;
        var name=Input("Name",board["name"]!.ToString());var archive=new CheckBox{Content="Archive empty board"};var panel=new StackPanel{Spacing=12};panel.Children.Add(name);
        var rows=new StackPanel{Spacing=12};panel.Children.Add(rows);
        var editors=new List<(string Id,TextBox Title,ComboBox Category,NumberBox Limit,StackPanel Row)>();
        void AddColumn(JsonObject column)
        {
            var row=new StackPanel{Spacing=6};var title=Input("Column title",column["title"]?.ToString()??"New column");
            var category=new ComboBox{Header="Meaning",ItemsSource=new[]{"queued","active","review","done","cancelled"},SelectedItem=column["category"]?.ToString()??"queued"};
            var limit=new NumberBox{Header="Work in progress limit (0 = none)",Minimum=0,Maximum=1000,Value=column["wipLimit"]?.GetValue<int>()??0};
            var id=Wire.Id(column["id"]);if(id.Length==0)id=Guid.NewGuid().ToString();
            row.Children.Add(title);row.Children.Add(category);row.Children.Add(limit);
            row.Children.Add(Button("Remove column",()=>{editors.RemoveAll(e=>e.Row==row);rows.Children.Remove(row);return Task.CompletedTask;}));
            row.Children.Add(Button("Move column earlier",()=>{var index=editors.FindIndex(e=>e.Row==row);if(index>0){var editor=editors[index];editors.RemoveAt(index);editors.Insert(index-1,editor);rows.Children.RemoveAt(index);rows.Children.Insert(index-1,row);}return Task.CompletedTask;}));
            editors.Add((id,title,category,limit,row));rows.Children.Add(row);
        }
        foreach(var column in board["columns"]!.AsArray().OfType<JsonObject>())AddColumn(column);
        panel.Children.Add(Button("Add column",()=>{AddColumn(new());return Task.CompletedTask;}));panel.Children.Add(archive);
        if(await Dialog("Board settings",panel))
        {
            var columns=new JsonArray();foreach(var e in editors)columns.Add(new JsonObject{["id"]=e.Id,["title"]=e.Title.Text,["category"]=e.Category.SelectedItem?.ToString(),["wipLimit"]=e.Limit.Value>0?(int)e.Limit.Value:null});
            var command=Wire.Command("board.configure",new(){["name"]=name.Text,["columns"]=columns,["archived"]=archive.IsChecked==true});command["baseVersion"]=board["version"]!.DeepClone();store.Queue(Commands,command);await Refresh();
        }
    }
    async Task CreateCard()
    {
        if(board is null)return;var title=Input("Title");var objective=Input("Objective","",true);var p=new StackPanel{Spacing=8};p.Children.Add(title);p.Children.Add(objective);
        if(await Dialog("New card",p))await Queue("card.create",new(){["title"]=title.Text,["objective"]=objective.Text});
    }
    async Task ShowCard(JsonObject card)
    {
        selected=card;detail.Children.Clear();detail.Children.Add(Text(card["title"]!.ToString(),22));
        if(card["review"] is JsonObject review)
        {
            var state=review["state"]?.ToString()??"unreviewed";
            detail.Children.Add(Text(state switch{"proposed"=>"Agent proposal · Needs your review","approved"=>"Approved for the reviewed result","rejected"=>"Proposal rejected","redirected"=>"Changes requested",_=>"Not yet reviewed"},16));
            if(review["note"] is not null)detail.Children.Add(Text(review["note"]!.ToString()));
            if(review["artifact"] is not null)detail.Children.Add(Text("Reviewed artifact: "+review["artifact"]));
        }
        var title=Input("Title",card["title"]!.ToString());var objective=Input("Objective",card["objective"]?.ToString()??"",true);detail.Children.Add(title);detail.Children.Add(objective);
        detail.Children.Add(Button("Save changes",async()=>
        {
            var changes=new JsonObject();var bases=new JsonObject();
            foreach(var (field,value) in new[]{("title",title.Text),("objective",objective.Text)})
                if((card[field]?.ToString()??"")!=value){changes[field]=value;bases[field]=card[field]?.DeepClone();}
            if(changes.Count>0)await Queue("card.patch",new(){["changes"]=changes,["base"]=bases},card);
        }));
        if(card["conversation_id"] is not null)detail.Children.Add(Button("Open conversation",async()=>{conversationId=Wire.Id(card["conversation_id"]);await Navigate("Assistant");}));
        var move=new ComboBox{Header="Move to",DisplayMemberPath="Label",ItemsSource=board!["columns"]!.AsArray().OfType<JsonObject>().Select(c=>new Choice(Wire.Id(c["id"]),c["title"]!.ToString(),c)).ToList()};detail.Children.Add(move);
        detail.Children.Add(Button("Move card",async()=>{if(move.SelectedItem is Choice c)await Queue("card.move",new(){["columnId"]=c.Id},card);}));
        var comment=Input("Comment","",true);detail.Children.Add(comment);detail.Children.Add(Button("Add comment",()=>Queue("comment.add",new(){["text"]=comment.Text},card)));
        detail.Children.Add(Button("Attach link",async()=>{var name=Input("Name");var url=Input("HTTPS artifact URL");var p=new StackPanel{Spacing=8};p.Children.Add(name);p.Children.Add(url);if(await Dialog("Attach artifact",p))await Queue("artifact.attach",new(){["name"]=name.Text,["url"]=url.Text},card);}));
        detail.Children.Add(Button("Dispatch run",()=>Dispatch(card)));
        detail.Children.Add(Button("Review proposal",async()=>{var decision=new ComboBox{Header="Decision",ItemsSource=new[]{"approve","reject","redirect"},SelectedIndex=0};var note=Input("Decision note","",true);var p=new StackPanel{Spacing=8};p.Children.Add(decision);p.Children.Add(note);if(await Dialog("Record scoped decision",p,"Confirm")){await Online(Wire.Command("proposal.decide",new(){["decision"]=decision.SelectedItem.ToString(),["note"]=note.Text},card));await Refresh();}}));
        try
        {
            var record=await hub!.Get("/api/ops/cards/"+Wire.Segment(Wire.Id(card["id"])));store.Cache("card:"+Wire.Id(card["id"]),record);RenderActivity(record,card);
        }
        catch(HttpRequestException){var cache=store.Read("card:"+Wire.Id(card["id"]));if(cache.Value is not null)RenderActivity(cache.Value,card);}
    }
    void RenderActivity(JsonObject record,JsonObject card)
    {
        foreach(var run in record["runs"]?.AsArray().OfType<JsonObject>()??[])
        {
            detail.Children.Add(Text($"Run {run["id"]}: {run["status"]}"));detail.Children.Add(Text("Reported execution: "+(run["actualProvider"]?.ToString()??"not reported")+" · "+(run["actualModel"]?.ToString()??"model not reported")));
            detail.Children.Add(Button("Cancel run",async()=>{await Online(Wire.Command("run.cancel",new(){["runId"]=run["id"]!.DeepClone()},card));status.Text="Cancellation requested; waiting for runner acknowledgement.";}));
            detail.Children.Add(Button("Run output",async()=>{var data=await hub!.Get("/api/ops/runs/"+Wire.Segment(Wire.Id(run["id"])));var p=new StackPanel{Spacing=8};foreach(var e in data["events"]?.AsArray()??new JsonArray())p.Children.Add(Text(HistoryLabel(e)));await Dialog("Run activity",p,"Close");}));
        }
        foreach(var key in new[]{"comments","artifacts","events"}){detail.Children.Add(Text(key,18));foreach(var item in record[key]?.AsArray()??new JsonArray())detail.Children.Add(Text(HistoryLabel(item)));}
    }
    static string HistoryLabel(JsonNode? item)
    {
        if(item is not JsonObject entry)return "";
        var text=entry["text"]?.ToString()??entry["name"]?.ToString()??entry["result"]?.ToString();
        var kind=entry["type"]?.ToString()??entry["kind"]?.ToString()??"Activity";
        var label=kind switch{"card.create"=>"Created the card","card.patch"=>"Updated the card","card.move"=>"Moved the card","comment.add"=>"Added a comment","artifact.attach"=>"Attached an artifact","proposal.decide"=>"Recorded a review decision","run.dispatch"=>"Dispatched a run","run.cancel"=>"Requested cancellation",_=>kind.Replace('.',' ').Replace('_',' ')};
        var actor=entry["actor"] as JsonObject;var role=actor?["role"]?.ToString();
        return string.Join(" · ",new[]{entry["createdAt"]?.ToString()??entry["created_at"]?.ToString(),role,text??label}.Where(value=>!string.IsNullOrWhiteSpace(value)));
    }
    async Task Dispatch(JsonObject card)
    {
        var data=await hub!.Get("/api/ops/runners");var hosts=data["runners"]!.AsArray().OfType<JsonObject>().Where(h=>h["online"]?.GetValue<bool>()==true).ToList();if(data["cloud"] is JsonObject cloud)hosts.Insert(0,cloud);
        var host=new ComboBox{Header="Run on",DisplayMemberPath="Label",ItemsSource=hosts.Select(h=>new Choice(Wire.Id(h["id"]),h["name"]!.ToString(),h)).ToList()};
        var provider=new ComboBox{Header="Provider",DisplayMemberPath="Label"};var workspace=new ComboBox{Header="Workspace",DisplayMemberPath="Label"};var model=Input("Model (optional)");var effort=new ComboBox{Header="Effort",ItemsSource=new[]{"auto","low","medium","high"},SelectedIndex=0};var minutes=new NumberBox{Header="Maximum minutes",Minimum=1,Maximum=120,Value=15,SpinButtonPlacementMode=NumberBoxSpinButtonPlacementMode.Inline};var access=new ComboBox{Header="Workspace access",ItemsSource=new[]{"read","change"},SelectedIndex=0};
        host.SelectionChanged+=(_,_)=>{if(host.SelectedItem is Choice h){provider.ItemsSource=h.Data["providers"]!.AsArray().OfType<JsonObject>().Where(p=>p["available"]?.GetValue<bool>()==true).Select(p=>new Choice(Wire.Id(p["id"]),Wire.Id(p["id"]),p)).ToList();workspace.ItemsSource=h.Data["workspaces"]!.AsArray().OfType<JsonObject>().Select(w=>new Choice(Wire.Id(w["id"]),w["name"]!.ToString(),w)).ToList();}};
        provider.SelectionChanged+=(_,_)=>{var textOnly=provider.SelectedItem is Choice choice&&choice.Id=="freerouter";workspace.IsEnabled=!textOnly;access.IsEnabled=!textOnly;if(textOnly){workspace.SelectedItem=null;access.SelectedIndex=0;}};
        var p=new StackPanel{Spacing=8};foreach(var control in new FrameworkElement[]{host,workspace,provider,model,effort,minutes,access})p.Children.Add(control);
        if(await Dialog("Dispatch bounded work",p,"Dispatch")&&host.SelectedItem is Choice h&&provider.SelectedItem is Choice pr)
        {
            if(pr.Id!="freerouter"&&workspace.SelectedItem is not Choice)throw new InvalidOperationException("Select a workspace for this provider.");
            await Online(Wire.Command("run.dispatch",new(){["hostId"]=h.Id,["workspaceId"]=(workspace.SelectedItem as Choice)?.Id??"",["provider"]=pr.Id,["model"]=string.IsNullOrWhiteSpace(model.Text)?null:model.Text,["effort"]=effort.SelectedItem.ToString(),["maxMinutes"]=(int)minutes.Value,["access"]=access.SelectedItem.ToString()},card));status.Text="Dispatch accepted by Hub.";await ShowCard(card);
        }
    }
    async Task Outbox()
    {
        var p=new StackPanel{Spacing=12};foreach(var item in store.Pending())
        {
            p.Children.Add(Text($"{item.State}: {item.Body["type"]??item.Body["name"]}"));p.Children.Add(Text(item.Body.ToJsonString()));if(item.Error is not null)p.Children.Add(Text("Server response: "+item.Error));
            p.Children.Add(Button("Discard this local intent",()=>{store.Remove(item.Id);status.Text="Local intent discarded. Server state retained.";return Task.CompletedTask;}));
        }
        if(p.Children.Count==0)p.Children.Add(Text("All actions confirmed."));await Dialog("Pending actions and conflicts",p,"Close");
    }
}
