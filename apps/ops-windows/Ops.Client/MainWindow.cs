using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Automation;
using Ops.Core;
using Hub = Ops.Core.Hub;
using System.Diagnostics;
using System.Text.Json.Nodes;

namespace Ops.Client;
public sealed partial class MainWindow : Window
{
    readonly StackPanel root = new() { Spacing=22, Margin=new Thickness(28,28,28,24) };
    readonly TextBlock status = NativeStyle.Label("",12);
    readonly TextBlock pageTitle = NativeStyle.Label("Work",30,"OpsTextBrush");
    readonly TextBlock pageSubtitle = NativeStyle.Label("A clear view of what matters, and what needs you.",14);
    readonly Dictionary<string,Button> navigation = new();
    Border? detailSurface;
    bool smokeMode;
    string renderedFingerprint="";
    string boardListFingerprint="";
    JsonObject? draggingCard;
    string draggingBoardId="";
    readonly StackPanel content = new() { Spacing=18 };
    readonly Store store;
    readonly Microsoft.UI.Dispatching.DispatcherQueueTimer timer;
    Hub? hub; string origin=""; string boardId=""; string conversationId=""; JsonObject? board; JsonObject? selected;
    readonly ComboBox boards = new() { MinWidth=170, DisplayMemberPath="Label", PlaceholderText="Choose board" };
    readonly StackPanel lanes = new() { Orientation=Orientation.Horizontal,Spacing=16 };
    readonly StackPanel detail = new() { Spacing=14, MaxWidth=680, HorizontalAlignment=HorizontalAlignment.Left };
    bool busy; string destination="Work"; Func<Task>? assistantRefresh;
    sealed record Choice(string Id,string Label,JsonObject Data);
    static TextBox Input(string header,string text="",bool multiline=false) => new() { Header=header,Text=text,AcceptsReturn=multiline,TextWrapping=TextWrapping.Wrap,MinWidth=240,MaxHeight=180 };
    Button Button(string label,Func<Task> action) { var b=new Button { Content=label };b.Click+=async(_,_)=>{b.IsEnabled=false;try{await Guard(action);}finally{b.IsEnabled=true;}};return b; }
    async Task Guard(Func<Task> action) { try { await action(); } catch(Exception ex) { status.Text=ex.Message; } }
    static TextBlock Text(string value,int size=14) {var text=NativeStyle.Label(value,size,"OpsTextBrush");text.IsTextSelectionEnabled=true;if(size>=18)text.FontWeight=Microsoft.UI.Text.FontWeights.SemiBold;return text;}
    public MainWindow(bool smoke = false, bool smokeDark = false)
    {
        smokeMode=smoke;
        store = new Store(smoke ? Path.Combine(Path.GetTempPath(),"Ops-smoke",Environment.ProcessId+".db") : Path.Combine(Identity.Root,"work.db"));
        Title=smoke?"Ops smoke fixture":"Ops";AppWindow.Resize(new Windows.Graphics.SizeInt32(1440,960));
        var icon=Path.Combine(AppContext.BaseDirectory,"Assets","Ops.ico");if(File.Exists(icon))AppWindow.SetIcon(icon);
        var shell=new Grid();shell.ColumnDefinitions.Add(new(){Width=new GridLength(176)});shell.ColumnDefinitions.Add(new(){Width=new GridLength(1,GridUnitType.Star)});
        var canvas=NativeStyle.Surface("OpsCanvasBrush",0,0,false);if(smoke)canvas.RequestedTheme=smokeDark?ElementTheme.Dark:ElementTheme.Light;canvas.Child=shell;Content=canvas;
        var sidebar=NativeStyle.Surface("OpsSidebarBrush",0,16);sidebar.BorderThickness=new Thickness(0,0,1,0);
        var sideLayout=new Grid();sideLayout.RowDefinitions.Add(new(){Height=GridLength.Auto});sideLayout.RowDefinitions.Add(new(){Height=new GridLength(1,GridUnitType.Star)});sideLayout.RowDefinitions.Add(new(){Height=GridLength.Auto});
        var brand=new StackPanel{Spacing=5,Margin=new Thickness(6,16,0,34)};
        var mark=NativeStyle.Surface("OpsAccentSurfaceBrush",11,0,false);mark.Width=40;mark.Height=40;mark.HorizontalAlignment=HorizontalAlignment.Left;var wave=NativeStyle.Label("≈",28,"OpsAccentBrush");wave.HorizontalAlignment=HorizontalAlignment.Center;wave.VerticalAlignment=VerticalAlignment.Center;mark.Child=wave;brand.Children.Add(mark);
        var wordmark=NativeStyle.Label("LAKESIDE",10);wordmark.CharacterSpacing=160;wordmark.Margin=new Thickness(0,8,0,0);brand.Children.Add(wordmark);brand.Children.Add(Text("Ops",27));sideLayout.Children.Add(brand);
        var nav=new StackPanel{Spacing=7};Grid.SetRow(nav,1);nav.Children.Add(NativeStyle.Label("WORKSPACE",10));
        foreach(var (name,glyph) in new[]{("Assistant","\uE8F2"),("Work","\uE8A5"),("Staff","\uE716"),("Tools","\uE713")})
        {
            var button=Button(name,()=>Navigate(name));button.Style=(Style)Application.Current.Resources[name=="Work"?"OpsNavigationSelectedStyle":"OpsNavigationStyle"];
            var label=new StackPanel{Orientation=Orientation.Horizontal,Spacing=11};label.Children.Add(new FontIcon{Glyph=glyph,FontSize=16});label.Children.Add(new TextBlock{Text=name,FontSize=14,FontWeight=Microsoft.UI.Text.FontWeights.SemiBold});button.Content=label;navigation[name]=button;nav.Children.Add(button);
        }
        sideLayout.Children.Add(nav);var footer=new StackPanel{Spacing=8,Margin=new Thickness(6,20,0,8)};footer.Children.Add(NativeStyle.Chip("WINDOWS","Blue"));footer.Children.Add(NativeStyle.Label("Your work.\nOne place.",12));Grid.SetRow(footer,2);sideLayout.Children.Add(footer);sidebar.Child=sideLayout;shell.Children.Add(sidebar);
        var scroll=new ScrollViewer{Content=root,HorizontalScrollBarVisibility=ScrollBarVisibility.Disabled,VerticalScrollBarVisibility=ScrollBarVisibility.Auto};Grid.SetColumn(scroll,1);shell.Children.Add(scroll);
        var heading=new StackPanel{Spacing=6};pageTitle.FontWeight=Microsoft.UI.Text.FontWeights.SemiBold;heading.Children.Add(pageTitle);heading.Children.Add(pageSubtitle);root.Children.Add(heading);root.Children.Add(status);root.Children.Add(content);
        timer=DispatcherQueue.CreateTimer();timer.Interval=TimeSpan.FromSeconds(3);timer.Tick+=async(_,_)=>{if(!busy&&hub is not null){if(destination=="Work")await Guard(Refresh);else if(destination=="Assistant"&&assistantRefresh is not null)await Guard(assistantRefresh);}};
        Closed+=(_,_)=>{timer.Stop();hub?.Dispose();store.Dispose();};
        if(smoke){SmokeView();return;}
        _=Guard(async()=>{var identity=Identity.Load();if(identity is null)PairView();else{origin=identity[0];hub=new Hub(origin,identity[1]);await Navigate("Work");timer.Start();}});
    }
    void SmokeView()
    {
        status.Text="Preview workspace · All changes saved";boardId="sample";BuildWorkView();
        var columns=new JsonArray();var names=new[]{"Inbox","Ready","Doing","Review","Done"};var categories=new[]{"queued","queued","active","review","done"};
        for(var i=0;i<names.Length;i++)columns.Add(new JsonObject{["id"]=names[i].ToLowerInvariant(),["title"]=names[i],["category"]=categories[i]});
        var cards=new JsonArray();var titles=new[]{"Shape the next release","A calmer first-run experience","Windows validation","Review the research","A clearer changelog","Make keyboard navigation feel natural","Check the onboarding copy"};
        var objectives=new[]{"Gather the priorities and decisions for the next cycle.","Make the first five minutes clear and welcoming.","Verify the native client, local runner and recovery paths.","A sourced recommendation is ready for your decision.","Tell people what changed and why it matters.","Walk the core flows without reaching for the mouse.","Keep every step short, useful and human."};
        var stages=new[]{"inbox","ready","doing","review","done","ready","inbox"};
        for(var i=0;i<titles.Length;i++)cards.Add(new JsonObject{["id"]="sample-"+i,["title"]=titles[i],["objective"]=objectives[i],["columnId"]=stages[i],["version"]=1,["positionVersion"]=1,["staff_name"]=new[]{"Research","Design","Engineering"}[i%3],["task_type"]=i%2==0?"analysis":"design",["review"]=new JsonObject{["state"]=i is 0 or 3?"proposed":i is 1 or 4?"approved":"unreviewed"}});
        var sampleBoard=new JsonObject{["id"]=boardId,["name"]="Studio",["version"]=1,["columns"]=columns};boards.ItemsSource=new List<Choice>{new(boardId,"Studio",sampleBoard)};boards.SelectedIndex=0;
        Render(new(){["board"]=sampleBoard,["cards"]=cards});
    }
    static void Detach(FrameworkElement element)
    {
        if(element.Parent is Panel panel)panel.Children.Remove(element);
        else if(element.Parent is Border border)border.Child=null;
        else if(element.Parent is ScrollViewer scroll)scroll.Content=null;
    }
    void BuildWorkView()
    {
        Detach(boards);Detach(lanes);Detach(detail);content.Children.Clear();
        var bar=new StackPanel{Orientation=Orientation.Horizontal,Spacing=8};bar.Children.Add(boards);
        var create=Button("+ New card",CreateCard);create.Style=(Style)Application.Current.Resources["OpsPrimaryButtonStyle"];bar.Children.Add(create);bar.Children.Add(Button("Refresh",Refresh));bar.Children.Add(Button("Pending",Outbox));
        var settings=new DropDownButton{Content="Board settings",CornerRadius=new CornerRadius(8),Padding=new Thickness(12,9,12,9)};var menu=new MenuFlyout();
        foreach(var (label,action) in new (string,Func<Task>)[]{("Create board",CreateBoard),("Edit columns and name",ConfigureBoard)}){var item=new MenuFlyoutItem{Text=label};item.Click+=async(_,_)=>await Guard(action);menu.Items.Add(item);}settings.Flyout=menu;bar.Children.Add(settings);
        content.Children.Add(new ScrollViewer{Content=bar,HorizontalScrollBarVisibility=ScrollBarVisibility.Auto,VerticalScrollBarVisibility=ScrollBarVisibility.Disabled});
        var boardViewport=new ScrollViewer{Content=lanes,HorizontalScrollBarVisibility=ScrollBarVisibility.Visible,VerticalScrollBarVisibility=ScrollBarVisibility.Disabled,HorizontalScrollMode=ScrollMode.Enabled,MinHeight=350};content.Children.Add(boardViewport);
        content.Children.Add(NativeStyle.Label("Select a card to see the work, conversation and decisions.",12));
        detailSurface=NativeStyle.Surface();detailSurface.Child=detail;detailSurface.Visibility=selected is null?Visibility.Collapsed:Visibility.Visible;content.Children.Add(detailSurface);
        boards.SelectionChanged-=BoardChanged;if(!smokeMode)boards.SelectionChanged+=BoardChanged;
    }
    void PairView()
    {
        pageTitle.Text="Welcome to Ops";pageSubtitle.Text="Connect your workspace. Keep the work moving.";content.Children.Clear();var address=Input("Hub address","https://hub.lakesidegames.net");content.Children.Add(address);
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
        destination=page;assistantRefresh=null;pageTitle.Text=page;pageSubtitle.Text=page switch{"Work"=>"A clear view of what matters, and what needs you.","Assistant"=>"Think it through. Turn the next step into work.","Staff"=>"A team with context, memory and a clear purpose.",_=>"Your workspace, devices and execution tools."};
        foreach(var item in navigation)item.Value.Style=(Style)Application.Current.Resources[item.Key==page?"OpsNavigationSelectedStyle":"OpsNavigationStyle"];
        if(smokeMode){SmokeView();return;}if(hub is null){PairView();return;}content.Children.Clear();
        if(page=="Work")
        {
            BuildWorkView();
            await Refresh();
        }
        else if(page=="Tools")await ToolsHome();
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
        var fingerprint=list.ToJsonString();if(boardListFingerprint==fingerprint)return;boardListFingerprint=fingerprint;
        var choices=list["boards"]!.AsArray().OfType<JsonObject>().Select(b=>new Choice(Wire.Id(b["id"]),b["name"]!.ToString(),b)).ToList();
        if(!choices.Any(x=>x.Id==boardId))boardId=choices.FirstOrDefault()?.Id??"";
        boards.ItemsSource=choices;boards.SelectedItem=choices.FirstOrDefault(x=>x.Id==boardId);
    }
    void Render(JsonObject snapshot)
    {
        board=snapshot["board"]!.AsObject();
        var fingerprint=board.ToJsonString()+snapshot["cards"]!.ToJsonString()+string.Join("|",store.Pending().Select(item=>item.Id+item.State));
        if(renderedFingerprint==fingerprint)return;renderedFingerprint=fingerprint;lanes.Children.Clear();
        foreach(var column in board["columns"]!.AsArray().OfType<JsonObject>())
        {
            var lane=new StackPanel{Width=240,Spacing=14};var cards=snapshot["cards"]!.AsArray().OfType<JsonObject>().Where(c=>Wire.Id(c["columnId"])==Wire.Id(column["id"])).ToList();
            var header=new Grid{Margin=new Thickness(4,0,4,0)};header.ColumnDefinitions.Add(new(){Width=new GridLength(1,GridUnitType.Star)});header.ColumnDefinitions.Add(new(){Width=GridLength.Auto});
            var title=Text(column["title"]!.ToString(),14);title.FontWeight=Microsoft.UI.Text.FontWeights.SemiBold;header.Children.Add(title);var count=NativeStyle.Chip(cards.Count.ToString(),column["category"]?.ToString()=="review"?"Review":"Blue");Grid.SetColumn(count,1);header.Children.Add(count);lane.Children.Add(header);
            var list=new ListView{MaxHeight=360,MinHeight=260,SelectionMode=ListViewSelectionMode.Single,Padding=new Thickness(0),IsItemClickEnabled=false,CanDragItems=true,AllowDrop=true};AutomationProperties.SetName(list,column["title"]!.ToString());
            foreach(var card in cards)
            {
                var pending=store.Pending().Any(p=>Wire.Id(p.Body["cardId"])==Wire.Id(card["id"]));
                list.Items.Add(new ListViewItem{Content=CardTile(card,pending),Tag=card,Padding=new Thickness(0),Margin=new Thickness(0,0,0,10),HorizontalContentAlignment=HorizontalAlignment.Stretch});
            }
            list.DragItemsStarting+=(_,args)=>
            {
                draggingCard=(args.Items.OfType<ListViewItem>().FirstOrDefault()?.Tag as JsonObject)?.DeepClone().AsObject();draggingBoardId=boardId;
                if(draggingCard is null){args.Cancel=true;return;}
                args.Data.SetText(Wire.Id(draggingCard["id"]));args.Data.RequestedOperation=Windows.ApplicationModel.DataTransfer.DataPackageOperation.Move;
            };
            list.DragOver+=(_,args)=>
            {
                if(draggingCard is null||draggingBoardId!=boardId||!args.DataView.Contains(Windows.ApplicationModel.DataTransfer.StandardDataFormats.Text))return;
                args.AcceptedOperation=Windows.ApplicationModel.DataTransfer.DataPackageOperation.Move;args.DragUIOverride.Caption="Move to "+column["title"];args.DragUIOverride.IsCaptionVisible=true;args.Handled=true;
            };
            list.Drop+=async(_,args)=>
            {
                var dragged=draggingCard;if(dragged is null||draggingBoardId!=boardId||!args.DataView.Contains(Windows.ApplicationModel.DataTransfer.StandardDataFormats.Text))return;
                args.Handled=true;var point=args.GetPosition(list);var deferral=args.GetDeferral();
                try
                {
                    string? before=null;
                    foreach(var item in list.Items.OfType<ListViewItem>())
                    {
                        if(item.Tag is not JsonObject candidate||Wire.Id(candidate["id"])==Wire.Id(dragged["id"])||!item.IsLoaded)continue;
                        var top=item.TransformToVisual(list).TransformPoint(new Windows.Foundation.Point(0,0)).Y;
                        if(point.Y<top+item.ActualHeight/2){before=Wire.Id(candidate["id"]);break;}
                    }
                    await Guard(async()=>
                    {
                        if(await args.DataView.GetTextAsync()!=Wire.Id(dragged["id"]))return;
                        if(smokeMode){status.Text="Preview: move to "+column["title"]+". Connected work uses the same version-checked move command.";return;}
                        await Queue("card.move",new(){["columnId"]=column["id"]!.DeepClone(),["beforeId"]=before},dragged);
                    });
                }
                finally{draggingCard=null;deferral.Complete();}
            };
            list.DragItemsCompleted+=(_,_)=>draggingCard=null;
            list.SelectionChanged+=async(_,_)=>{if(list.SelectedItem is ListViewItem{Tag:JsonObject card})await Guard(()=>ShowCard(card));};lane.Children.Add(list);
            if(cards.Count==0)lane.Children.Add(NativeStyle.Label("Room for the next step",12));
            var surface=NativeStyle.Surface("OpsLaneBrush",14,12,false);surface.VerticalAlignment=VerticalAlignment.Top;surface.Child=lane;lanes.Children.Add(surface);
        }
    }
    Border CardTile(JsonObject card,bool pending)
    {
        var surface=NativeStyle.Surface("OpsCardBrush",10,14);var body=new StackPanel{Spacing=12};surface.Child=body;
        var kind=NativeStyle.Label((card["task_type"]?.ToString()??"Work").ToUpperInvariant(),10);kind.CharacterSpacing=90;body.Children.Add(kind);
        var title=Text(card["title"]!.ToString(),15);title.FontWeight=Microsoft.UI.Text.FontWeights.SemiBold;title.MaxLines=3;body.Children.Add(title);
        var objective=NativeStyle.Label(card["objective"]?.ToString()??"",12);objective.MaxLines=2;objective.TextTrimming=TextTrimming.CharacterEllipsis;body.Children.Add(objective);
        var review=card["review"]?["state"]?.ToString();
        if(pending)body.Children.Add(NativeStyle.Chip("Pending sync","Blue"));
        else if(review=="proposed")body.Children.Add(NativeStyle.Chip("Needs your review","Review"));
        else if(review=="approved")body.Children.Add(NativeStyle.Chip("Reviewed & approved"));
        else if(review is "rejected" or "redirected")body.Children.Add(NativeStyle.Chip("Changes requested","Review"));
        var staff=card["staff_name"]?.ToString()??(card["staff_id"] is null?"Unassigned":"Team member");var footer=new StackPanel{Orientation=Orientation.Horizontal,Spacing=8};footer.Children.Add(NativeStyle.StaffGlyph(card["staff_id"]?.ToString()??staff));var name=NativeStyle.Label(staff,12);name.VerticalAlignment=VerticalAlignment.Center;footer.Children.Add(name);body.Children.Add(footer);
        return surface;
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
        var command=Wire.Command(type,payload,card);store.Queue(Commands,command);await Refresh();
        if(card is not null&&!store.Pending().Any(item=>item.Id==Wire.Id(command["commandId"])))
        {
            var current=store.Read("board:"+boardId).Value?["cards"]?.AsArray().OfType<JsonObject>().FirstOrDefault(item=>Wire.Id(item["id"])==Wire.Id(card["id"]));
            if(current is not null)await ShowCard(current);
        }
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
        selected=card;if(detailSurface is not null)detailSurface.Visibility=Visibility.Visible;detail.Children.Clear();detail.Children.Add(Text(card["title"]!.ToString(),22));
        if(card["review"] is JsonObject review)
        {
            var state=review["state"]?.ToString()??"unreviewed";
            detail.Children.Add(NativeStyle.Chip(state switch{"proposed"=>"Agent proposal · Needs your review","approved"=>"Approved for the reviewed result","rejected"=>"Proposal rejected","redirected"=>"Changes requested",_=>"Not yet reviewed"},state is "proposed" or "rejected" or "redirected"?"Review":"Accent"));
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
        detail.Children.Add(Button("Review proposal",async()=>{var decision=new ComboBox{Header="Decision",ItemsSource=new[]{"approve","reject","redirect"},SelectedIndex=0};var note=Input("Decision note","",true);var p=new StackPanel{Spacing=8};p.Children.Add(decision);p.Children.Add(note);if(await Dialog("Record scoped decision",p,"Confirm")){await Online(Wire.Command("proposal.decide",new(){["decision"]=decision.SelectedItem.ToString(),["note"]=note.Text},card));await Refresh();var updated=await hub!.Get("/api/ops/cards/"+Wire.Segment(Wire.Id(card["id"])));await ShowCard(updated["card"]!.AsObject());}}));
        if(smokeMode)return;
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
        var team=await hub.Get("/api/ops/staff");var staffChoices=new List<Choice>{new("","Temporary worker",new())};staffChoices.AddRange(team["staff"]?.AsArray().OfType<JsonObject>().Select(item=>new Choice(Wire.Id(item["id"]),item["name"]?.ToString()??"Team member",item))??[]);var staff=new ComboBox{Header="Assign to",DisplayMemberPath="Label",ItemsSource=staffChoices,SelectedIndex=0};
        var host=new ComboBox{Header="Run on",DisplayMemberPath="Label",ItemsSource=hosts.Select(h=>new Choice(Wire.Id(h["id"]),h["name"]!.ToString(),h)).ToList()};
        var provider=new ComboBox{Header="Provider",DisplayMemberPath="Label"};var workspace=new ComboBox{Header="Workspace",DisplayMemberPath="Label"};var model=Input("Model (optional)");var effort=new ComboBox{Header="Effort",ItemsSource=new[]{"auto","low","medium","high"},SelectedIndex=0};var minutes=new NumberBox{Header="Maximum minutes",Minimum=1,Maximum=120,Value=15,SpinButtonPlacementMode=NumberBoxSpinButtonPlacementMode.Inline};var access=new ComboBox{Header="Workspace access",ItemsSource=new[]{"read","change"},SelectedIndex=0};
        host.SelectionChanged+=(_,_)=>{if(host.SelectedItem is Choice h){provider.ItemsSource=h.Data["providers"]!.AsArray().OfType<JsonObject>().Where(p=>p["available"]?.GetValue<bool>()==true).Select(p=>new Choice(Wire.Id(p["id"]),Wire.Id(p["id"]),p)).ToList();workspace.ItemsSource=h.Data["workspaces"]!.AsArray().OfType<JsonObject>().Select(w=>new Choice(Wire.Id(w["id"]),w["name"]!.ToString(),w)).ToList();}};
        provider.SelectionChanged+=(_,_)=>{var textOnly=provider.SelectedItem is Choice choice&&choice.Id=="freerouter";workspace.IsEnabled=!textOnly;access.IsEnabled=!textOnly;if(textOnly){workspace.SelectedItem=null;access.SelectedIndex=0;}};
        var p=new StackPanel{Spacing=8};foreach(var control in new FrameworkElement[]{staff,host,workspace,provider,model,effort,minutes,access})p.Children.Add(control);
        if(await Dialog("Dispatch bounded work",p,"Dispatch")&&host.SelectedItem is Choice h&&provider.SelectedItem is Choice pr)
        {
            if(pr.Id!="freerouter"&&workspace.SelectedItem is not Choice)throw new InvalidOperationException("Select a workspace for this provider.");
            await Online(Wire.Command("run.dispatch",new(){["staffId"]=(staff.SelectedItem as Choice)?.Id is string staffId&&staffId.Length>0?staffId:null,["hostId"]=h.Id,["workspaceId"]=(workspace.SelectedItem as Choice)?.Id??"",["provider"]=pr.Id,["model"]=string.IsNullOrWhiteSpace(model.Text)?null:model.Text,["effort"]=effort.SelectedItem.ToString(),["maxMinutes"]=(int)minutes.Value,["access"]=access.SelectedItem.ToString()},card));status.Text="Dispatch accepted by Hub.";await ShowCard(card);
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
