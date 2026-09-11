use serde::Deserialize;
use tauri::{plugin::PluginHandle, Manager, Runtime};

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_briefing_widgets);

pub struct NativeCompanion<R: Runtime>(PluginHandle<R>);
impl<R: Runtime> NativeCompanion<R> {
  pub fn status<T: for<'de> Deserialize<'de>>(&self) -> Result<T, String> {
    self.0.run_mobile_plugin("pushStatus", ()).map_err(|_| "Could not read push settings".to_string())
  }
  pub fn configure<T: for<'de> Deserialize<'de>>(&self, enabled: bool) -> Result<T, String> {
    self.0.run_mobile_plugin("configurePush", serde_json::json!({ "enabled": enabled }))
      .map_err(|_| "Could not update push settings".to_string())
  }
  pub fn show_ask(&self) -> Result<serde_json::Value, String> {
    self.0.run_mobile_plugin("showAsk", ())
      .map_err(|_| "Could not open native Ask".to_string())
  }
}

/// The launcher calls narrow app commands. No remote page gets plugin IPC.
pub fn init<R: Runtime>() -> tauri::plugin::TauriPlugin<R> {
  tauri::plugin::Builder::new("briefing-widgets")
    .setup(|app, api| {
      #[cfg(target_os = "ios")]
      let handle = api.register_ios_plugin(init_plugin_briefing_widgets)?;
      #[cfg(target_os = "android")]
      let handle = api.register_android_plugin("net.lakesidegames.briefing", "BriefingPlugin")?;
      app.manage(NativeCompanion(handle));
      Ok(())
    })
    .build()
}
