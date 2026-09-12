package net.lakesidegames.ahdclient

import android.os.Bundle
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.ViewGroup
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebView
import android.webkit.WebViewRenderProcessClient
import android.widget.TextView
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  private companion object {
    const val TAG = "AHDClient"
  }

  private var gameView: WebView? = null
  private val widgetHandler = Handler(Looper.getMainLooper())
  private var widgetNavigation: Runnable? = null

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    CompanionSafety.run("widget deep link") { openWidgetPage() }
  }

  override fun onResume() {
    super.onResume()
    CompanionSafety.run("widget deep link") { openWidgetPage() }
    refreshWidgetsSafely()
  }

  override fun onPause() {
    refreshWidgetsSafely()
    super.onPause()
  }

  private fun refreshWidgetsSafely() {
    // Widgets are an optional companion. A missing provider or a device-level
    // JobScheduler failure must not prevent the main WebView from launching.
    CompanionSafety.run("widget render") {
      BriefingWidgets.render(this)
    }
    CompanionSafety.run("widget schedule") {
      BriefingWidgets.schedule(this)
    }
  }

  private fun openWidgetPage() {
    val uri = intent?.data ?: return
    if (uri.scheme != "ahdclient") return
    val path = CompanionSafety.get("widget deep link lookup", null as String?) {
      when (uri.host) {
        "inbox" -> "/notifications"
        "briefing" -> BriefingWidgets.page(this, uri.path?.removePrefix("/") ?: "")
        else -> null
      }
    } ?: return
    widgetNavigation?.let { widgetHandler.removeCallbacks(it) }
    // Wait for Tauri's initial local page so it cannot overwrite a cold-start
    // widget navigation. The retry is bounded and only loads our fixed origin.
    var remaining = 100
    val navigate = object : Runnable {
      override fun run() {
        CompanionSafety.run("widget deep link navigation") {
          val view = gameView
          if (view != null && !view.url.isNullOrBlank() && view.url != "about:blank") {
            intent.data = null
            view.loadUrl(BriefingWidgets.ORIGIN + path)
            widgetNavigation = null
          } else if (--remaining > 0) widgetHandler.postDelayed(this, 100)
        }
      }
    }
    widgetNavigation = navigate
    widgetHandler.post(navigate)
  }

  override fun onDestroy() {
    CompanionSafety.run("widget navigation cleanup") {
      widgetNavigation?.let { widgetHandler.removeCallbacks(it) }
    }
    super.onDestroy()
  }
  override fun onCreate(savedInstanceState: Bundle?) {
    // Edge-to-edge is cosmetic. Some old vendor builds throw while applying
    // it, and that must not turn a launcher startup into an app crash.
    CompanionSafety.run("edge-to-edge setup") { enableEdgeToEdge() }
    super.onCreate(savedInstanceState)
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    gameView = webView
    installRendererFailureHandler(webView)
    CompanionSafety.run("mobile WebView setup") {
      openWidgetPage()
      // Appended, never replaced: the site keys ad slots, consent prompts and
      // the cookie banner off this marker while sign-in providers still see a
      // normal Android WebView.
      webView.settings.userAgentString =
        webView.settings.userAgentString + " AHDClient-Mobile/" + BuildConfig.VERSION_NAME
      // Keep the page out from under the system bars and the keyboard. Both the
      // launcher and the site draw their own headers, so nothing should sit
      // behind the status bar.
      ViewCompat.setOnApplyWindowInsetsListener(webView) { view, insets ->
        val bars = insets.getInsets(
          WindowInsetsCompat.Type.systemBars() or
            WindowInsetsCompat.Type.displayCutout() or
            WindowInsetsCompat.Type.ime()
        )
        view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
        WindowInsetsCompat.CONSUMED
      }
    }
  }

  private fun installRendererFailureHandler(webView: WebView) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return
    CompanionSafety.run("WebView renderer diagnostics") {
      webView.setWebViewRenderProcessClient(object : WebViewRenderProcessClient() {
        override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
          return CompanionSafety.get("WebView renderer failure", true) {
            Log.e(TAG, "WebView renderer stopped; crashed=${detail.didCrash()}")
            gameView = null
            widgetNavigation?.let { widgetHandler.removeCallbacks(it) }
            val parent = view.parent as? ViewGroup
            if (parent == null) {
              CompanionSafety.run("renderer cleanup") { view.destroy() }
            } else {
              val index = parent.indexOfChild(view).coerceAtLeast(0)
              val layoutParams = view.layoutParams
              CompanionSafety.run("renderer fallback") {
                parent.removeView(view)
                view.destroy()
                val fallback = TextView(this@MainActivity).apply {
                  text = "The game view stopped. Close and reopen AHDClient."
                  textSize = 16f
                  setTextColor(0xFFFFFFFF.toInt())
                  setBackgroundColor(0xFF14141C.toInt())
                  gravity = android.view.Gravity.CENTER
                  setPadding(32, 32, 32, 32)
                }
                parent.addView(fallback, index, layoutParams)
              }
            }
            true
          }
        }
      })
    }
  }
}
