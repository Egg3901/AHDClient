tauri::ios_plugin_binding!(init_plugin_briefing_widgets);

/// Native lifecycle observer only. There are no JavaScript commands.
pub fn init<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
  tauri::plugin::Builder::new("briefing-widgets")
    .setup(|_app, api| {
      api.register_ios_plugin(init_plugin_briefing_widgets)?;
      Ok(())
    })
    .build()
}
