package net.lakesidegames.ahdclient

import android.os.Bundle
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
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
