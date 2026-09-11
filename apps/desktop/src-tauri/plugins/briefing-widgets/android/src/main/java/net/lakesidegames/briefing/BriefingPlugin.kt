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
import org.json.JSONObject

@InvokeArg
class PushOptions { var enabled: Boolean = false }

@TauriPlugin(permissions = [Permission(strings = [Manifest.permission.POST_NOTIFICATIONS], alias = "notifications")])
class BriefingPlugin(private val activity: Activity) : Plugin(activity), Application.ActivityLifecycleCallbacks {
  private val handler = Handler(Looper.getMainLooper())
  private val poll = object : Runnable {
    override fun run() {
      syncSafely()
      handler.postDelayed(this, 5000)
    }
  }
  override fun load(webView: WebView) {
    activity.application.registerActivityLifecycleCallbacks(this)
    handler.post(poll)
  }
  @Command
  fun pushStatus(invoke: Invoke) {
    syncSafely()
    invoke.resolve(JSObject(statusSafely().toString()))
  }
  @Command
  fun configurePush(invoke: Invoke) {
    val enabled = invoke.parseArgs(PushOptions::class.java).enabled
    try {
      NativePush.setEnabled(activity, enabled)
    } catch (_: Exception) {
      invoke.resolve(JSObject(statusSafely().toString()))
      return
    }
    if (enabled && Build.VERSION.SDK_INT >= 33 && !NativePush.permitted(activity)) {
      requestPermissionForAlias("notifications", invoke, "pushPermissionResult")
    } else {
      syncSafely(true)
      invoke.resolve(JSObject(statusSafely().toString()))
    }
  }
  @PermissionCallback
  fun pushPermissionResult(invoke: Invoke) {
    syncSafely(true)
    invoke.resolve(JSObject(statusSafely().toString()))
  }
  override fun onActivityResumed(target: Activity) { if (target === activity) { handler.removeCallbacks(poll); handler.post(poll) } }
  override fun onActivityPaused(target: Activity) { if (target === activity) { handler.removeCallbacks(poll); syncSafely() } }
  override fun onActivityDestroyed(target: Activity) { if (target === activity) { handler.removeCallbacks(poll); activity.application.unregisterActivityLifecycleCallbacks(this) } }
  override fun onActivityCreated(target: Activity, state: Bundle?) {}
  override fun onActivityStarted(target: Activity) {}
  override fun onActivityStopped(target: Activity) {}
  override fun onActivitySaveInstanceState(target: Activity, state: Bundle) {}

  private fun syncSafely(force: Boolean = false) {
    try {
      NativePush.sync(activity, force)
    } catch (_: Exception) {
    }
  }

  private fun statusSafely(): JSONObject = try {
    NativePush.status(activity)
  } catch (_: Exception) {
    JSONObject().put("enabled", false).put("permissionGranted", false).put("available", false)
      .put("registered", false).put("message", "Push is unavailable in this build.")
  }
}
