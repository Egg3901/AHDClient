package net.lakesidegames.briefing

import android.Manifest
import android.app.Activity
import android.app.Application
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.webkit.WebView
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.Permission
import app.tauri.annotation.PermissionCallback
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@InvokeArg
class PushOptions { var enabled: Boolean = false }

@TauriPlugin(permissions = [Permission(strings = [Manifest.permission.POST_NOTIFICATIONS], alias = "notifications")])
class BriefingPlugin(private val activity: Activity) : Plugin(activity), Application.ActivityLifecycleCallbacks {
  private val handler = Handler(Looper.getMainLooper())
  private val poll = object : Runnable {
    override fun run() { NativePush.sync(activity); handler.postDelayed(this, 5000) }
  }
  override fun load(webView: WebView) {
    activity.application.registerActivityLifecycleCallbacks(this)
    handler.post(poll)
  }
  @Command
  fun pushStatus(invoke: Invoke) {
    NativePush.sync(activity)
    invoke.resolve(JSObject(NativePush.status(activity).toString()))
  }
  @Command
  fun configurePush(invoke: Invoke) {
    val enabled = invoke.parseArgs(PushOptions::class.java).enabled
    NativePush.setEnabled(activity, enabled)
    if (enabled && Build.VERSION.SDK_INT >= 33 && !NativePush.permitted(activity)) {
      requestPermissionForAlias("notifications", invoke, "pushPermissionResult")
    } else {
      NativePush.sync(activity, true)
      invoke.resolve(JSObject(NativePush.status(activity).toString()))
    }
  }
  @PermissionCallback
  fun pushPermissionResult(invoke: Invoke) {
    NativePush.sync(activity, true)
    invoke.resolve(JSObject(NativePush.status(activity).toString()))
  }
  override fun onActivityResumed(target: Activity) { if (target === activity) { handler.removeCallbacks(poll); handler.post(poll) } }
  override fun onActivityPaused(target: Activity) { if (target === activity) { handler.removeCallbacks(poll); NativePush.sync(activity) } }
  override fun onActivityDestroyed(target: Activity) { if (target === activity) { handler.removeCallbacks(poll); activity.application.unregisterActivityLifecycleCallbacks(this) } }
  override fun onActivityCreated(target: Activity, state: Bundle?) {}
  override fun onActivityStarted(target: Activity) {}
  override fun onActivityStopped(target: Activity) {}
  override fun onActivitySaveInstanceState(target: Activity, state: Bundle) {}
}
