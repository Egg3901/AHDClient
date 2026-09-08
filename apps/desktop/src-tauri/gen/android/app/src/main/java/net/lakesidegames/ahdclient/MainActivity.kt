package net.lakesidegames.ahdclient

import android.os.Bundle
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  private var gameView: WebView? = null
  private val widgetHandler = Handler(Looper.getMainLooper())
  private var widgetNavigation: Runnable? = null

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    openWidgetPage()
  }

  override fun onResume() {
    super.onResume()
    openWidgetPage()
    BriefingWidgets.render(this)
    BriefingWidgets.schedule(this)
  }

  override fun onPause() {
    BriefingWidgets.render(this)
    BriefingWidgets.schedule(this)
    super.onPause()
  }

  private fun openWidgetPage() {
    val uri = intent?.data ?: return
    if (uri.scheme != "ahdclient") return
    val path = when (uri.host) {
      "inbox" -> "/notifications"
      "briefing" -> BriefingWidgets.page(this, uri.path?.removePrefix("/") ?: "") ?: return
      else -> return
    }
    widgetNavigation?.let { widgetHandler.removeCallbacks(it) }
    // Wait for Tauri's initial local page so it cannot overwrite a cold-start
    // widget navigation. The retry is bounded and only loads our fixed origin.
    var remaining = 100
    val navigate = object : Runnable {
      override fun run() {
        val view = gameView
        if (view != null && !view.url.isNullOrBlank() && view.url != "about:blank") {
          intent.data = null
          view.loadUrl(BriefingWidgets.ORIGIN + path)
          widgetNavigation = null
        } else if (--remaining > 0) widgetHandler.postDelayed(this, 100)
      }
    }
    widgetNavigation = navigate
    widgetHandler.post(navigate)
  }

  override fun onDestroy() {
    widgetNavigation?.let { widgetHandler.removeCallbacks(it) }
    super.onDestroy()
  }
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    gameView = webView
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
