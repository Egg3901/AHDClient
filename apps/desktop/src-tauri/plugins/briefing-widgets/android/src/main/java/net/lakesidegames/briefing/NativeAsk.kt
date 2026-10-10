package net.lakesidegames.briefing

import android.app.Activity
import android.app.Dialog
import android.content.Context
import android.content.ContextWrapper
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.GradientDrawable
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.view.Window
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.WebView
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import org.json.JSONArray
import org.json.JSONObject
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

private const val NATIVE_ASK_ORIGIN = "https://ask.lakesidegames.net"
private const val NATIVE_ASK_LOGIN = "$NATIVE_ASK_ORIGIN/auth/login?next=%2F"
private const val NATIVE_GAME_ORIGIN = "https://ahousedividedgame.com"
private const val NATIVE_SANDBOX_ORIGIN = "https://sandbox.ahousedividedgame.com"
private const val NATIVE_AUTH_ORIGIN = "https://auth.ahousedividedgame.com"
private const val NATIVE_UNIFIED_AUTH_ORIGIN = "https://auth.lakesidegames.net"
private const val NATIVE_AHD_LOGIN = "$NATIVE_AUTH_ORIGIN/auth/ahd?return=https%3A%2F%2Fask.lakesidegames.net%2Fauth%2Fnative%2Fcallback"
private const val NATIVE_ASK_MAX_REDIRECTS = 10

private val nativeAskAllowedHosts = setOf(
  "ask.lakesidegames.net",
  "auth.ahousedividedgame.com",
  "auth.lakesidegames.net",
  "ahousedividedgame.com",
  "www.ahousedividedgame.com",
  "sandbox.ahousedividedgame.com"
)

private val nativeAskSessionName = Regex(
  "^(?:ask_session|__Host-ask_session|__Host-ask_login|auth-token(?:-[A-Za-z0-9-]+)?|(?:__Secure-)?(?:authjs|next-auth)\\.session-token(?:\\.[0-9]+)?)$"
)

private val nativeAskUnifiedCookieName = Regex("^__Host-lakeside_(?:login|session)$")

/**
 * The issuer's single sign-on cookies. Kept for auth.lakesidegames.net only,
 * so Ask's sign-in redirects reuse the game login instead of asking again.
 * iOS needed the same thing (2.3.16).
 */
private val nativeIssuerSsoCookieName = Regex("^KEYCLOAK_(?:IDENTITY|SESSION)(?:_LEGACY)?$")

private class NativeAskAuthRequired : Exception(
  "Ask could not find a linked game account. Link your game account in AHDClient first."
)

private data class NativeAskResult(
  val answer: String,
  val conversationID: String,
  val model: String,
  val citations: List<String>,
  val usedMcp: Boolean,
  val liveSources: List<String>
)

private data class NativeAskTurn(val question: String, var answer: String)

private object NativeAskCookies {
  fun snapshot(): Map<String, String> {
    val manager = CookieManager.getInstance()
    val ask = filtered(manager.getCookie(NATIVE_ASK_ORIGIN), includeUnified = true)
    val auth = filtered(manager.getCookie(NATIVE_AUTH_ORIGIN))
    val unifiedAuth = filtered(manager.getCookie(NATIVE_UNIFIED_AUTH_ORIGIN), includeUnified = true)
    val issuerSso = manager.getCookie("$NATIVE_UNIFIED_AUTH_ORIGIN/realms/accounts/").orEmpty().split(';')
      .map { it.trim() }.filter { nativeIssuerSsoCookieName.matches(it.substringBefore('=')) && it.contains('=') }
      .joinToString("; ")
    val game = filtered(manager.getCookie("$NATIVE_GAME_ORIGIN/api/client/account"))
    val sandbox = filtered(manager.getCookie("$NATIVE_SANDBOX_ORIGIN/api/client/account"))
    val wwwGame = filtered(manager.getCookie("https://www.ahousedividedgame.com/api/client/account"))
    return mapOf(
      // The unified session is host-only on auth.lakesidegames.net. Ask is
      // the only other host that receives it, so migrated accounts are
      // recognized without leaking the cookie to the legacy game broker.
      "ask.lakesidegames.net" to merge(ask, unifiedAuth, includeUnified = true),
      // A host-only game cookie is not returned for the auth subdomain. The
      // broker is an explicitly trusted first-party host, so give it the same
      // auth-token cookies the game WebView already holds.
      "auth.ahousedividedgame.com" to merge(auth, game, sandbox, wwwGame),
      "auth.lakesidegames.net" to listOf(unifiedAuth, issuerSso).filter { it.isNotBlank() }.joinToString("; "),
      "ahousedividedgame.com" to game,
      "www.ahousedividedgame.com" to wwwGame
    )
  }

  private fun filtered(header: String?, includeUnified: Boolean = false): String = header.orEmpty().split(';')
    .map { it.trim() }
    .filter {
      val name = it.substringBefore('=')
      name.let(nativeAskSessionName::matches) || (includeUnified && name.let(nativeAskUnifiedCookieName::matches))
    }
    .distinctBy { it.substringBefore('=') }
    .joinToString("; ")

  private fun merge(vararg headers: String, includeUnified: Boolean = false): String {
    val merged = linkedMapOf<String, String>()
    headers.forEach { header ->
      header.split(';').map { it.trim() }.forEach { pair ->
        val name = pair.substringBefore('=')
        val allowed = nativeAskSessionName.matches(name)
          || (includeUnified && name == "__Host-lakeside_session")
        if (pair.contains('=') && allowed) merged.putIfAbsent(name, pair)
      }
    }
    return merged.values.joinToString("; ")
  }
}

private class NativeAskApi(initialCookies: Map<String, String>) {
  private val cookies = initialCookies.toMutableMap()

  fun connect(): JSONObject {
    try {
      return getJson("/api/me")
    } catch (_: NativeAskAuthRequired) {
      clearAskCookie()
      login(preferGameHandoff = true)
      return try {
        getJson("/api/me")
      } catch (_: NativeAskAuthRequired) {
        clearAskCookie()
        login(preferGameHandoff = false)
        getJson("/api/me")
      }
    }
  }

  fun ask(
    question: String,
    conversationID: String,
    onDelta: (String) -> Unit,
    onStatus: (String) -> Unit = {}
  ): NativeAskResult {
    val body = JSONObject()
      .put("question", question)
      .put("convId", conversationID)
      .put("game", "ahd")
      .put("useMcp", true)
      .put("length", "standard")
      .put("style", "standard")
      .put("effort", "auto")
      .put("visualizations", false)
      .put("mode", "auto")
      .put("tz", TimeZone.getDefault().id)
      .put("attachments", JSONArray())

    val connection = open(URL("$NATIVE_ASK_ORIGIN/api/ask"), "POST", "text/event-stream")
    try {
      connection.doOutput = true
      connection.setRequestProperty("Content-Type", "application/json")
      connection.outputStream.use { it.write(body.toString().toByteArray(StandardCharsets.UTF_8)) }
      if (connection.responseCode != HttpURLConnection.HTTP_OK) {
        val message = readBody(connection).take(4096)
        throw Exception(if (message.isBlank()) "Ask could not start the answer." else message)
      }
      if (!connection.contentType.orEmpty().contains("text/event-stream", ignoreCase = true)) {
        val payload = try { JSONObject(readBody(connection)) } catch (_: Exception) {
          throw Exception("Ask returned invalid data.")
        }
        return resultFromJson(payload, conversationID)
      }

      var answer = ""
      var returnedConversationID = conversationID
      var model = ""
      val citations = mutableListOf<String>()
      var usedMcp = false
      val liveSources = mutableListOf<String>()
      var eventName = "message"
      var eventData = StringBuilder()
      var completed = false

      fun emit() {
        if (eventData.isEmpty()) return
        val value = try { org.json.JSONTokener(eventData.toString()).nextValue() }
          catch (_: Exception) { throw Exception("Ask sent an invalid event.") }
        when (eventName) {
          "meta" -> if (value is JSONObject) returnedConversationID = value.optString("convId", returnedConversationID)
          "status", "action" -> if (value is JSONObject) {
            value.optString("label").takeIf { it.isNotBlank() }?.let(onStatus)
          }
          "delta" -> {
            val delta = when (value) {
              is String -> value
              is JSONObject -> value.optString("delta")
              else -> ""
            }
            answer += delta
            if (delta.isNotEmpty()) onDelta(delta)
          }
          "done" -> if (value is JSONObject) {
            returnedConversationID = value.optString("convId", returnedConversationID)
            answer = value.optString("answer", answer)
            model = modelLabel(value, model)
            usedMcp = value.optBoolean("usedMcp", false)
            value.optJSONArray("liveSources")?.let { list ->
              for (index in 0 until list.length()) {
                val source = list.optString(index)
                if (source.isNotBlank()) liveSources += source
              }
            }
            value.optJSONArray("citations")?.let { list ->
              for (index in 0 until list.length()) {
                val item = list.optJSONObject(index) ?: continue
                val label = item.optString("label", item.optString("path"))
                if (label.isNotBlank()) citations += label
              }
            }
            completed = true
          }
          "error" -> {
            val message = when (value) {
              is JSONObject -> value.optString("message", value.optString("error"))
              is String -> value
              else -> "Ask could not complete the answer."
            }
            throw Exception(message.ifBlank { "Ask could not complete the answer." })
          }
        }
        eventData = StringBuilder()
        eventName = "message"
      }

      connection.inputStream.bufferedReader(StandardCharsets.UTF_8).use { reader ->
        while (true) {
          val line = reader.readLine() ?: break
          when {
            line.isEmpty() -> emit()
            line.startsWith("event:") -> eventName = line.substring(6).trim()
            line.startsWith("data:") -> {
              if (eventData.isNotEmpty()) eventData.append('\n')
              eventData.append(line.substring(5).trim())
            }
          }
        }
        emit()
      }
      if (!completed || answer.trim().isEmpty()) throw Exception("Ask returned an empty answer.")
      return NativeAskResult(answer, returnedConversationID, model, citations, usedMcp, liveSources.distinct())
    } finally {
      connection.disconnect()
    }
  }

  private fun resultFromJson(value: JSONObject, fallbackConversationID: String): NativeAskResult {
    val answer = value.optString("answer")
    if (answer.trim().isEmpty()) throw Exception("Ask returned an empty answer.")
    val citations = mutableListOf<String>()
    value.optJSONArray("citations")?.let { list ->
      for (index in 0 until list.length()) {
        val item = list.optJSONObject(index) ?: continue
        val label = item.optString("label", item.optString("path"))
        if (label.isNotBlank()) citations += label
      }
    }
    val liveSources = mutableListOf<String>()
    value.optJSONArray("liveSources")?.let { list ->
      for (index in 0 until list.length()) {
        val source = list.optString(index)
        if (source.isNotBlank()) liveSources += source
      }
    }
    return NativeAskResult(
      answer = answer,
      conversationID = value.optString("convId", fallbackConversationID),
      model = modelLabel(value, ""),
      citations = citations,
      usedMcp = value.optBoolean("usedMcp", false),
      liveSources = liveSources.distinct(),
    )
  }

  private fun login(preferGameHandoff: Boolean) {
    if (preferGameHandoff && runCatching { tryLogin(URL(NATIVE_AHD_LOGIN)) }.getOrDefault(false)) return
    if (runCatching { tryLogin(URL(NATIVE_ASK_LOGIN)) }.getOrDefault(false)) return
    throw NativeAskAuthRequired()
  }

  private fun tryLogin(start: URL): Boolean {
    var current = start
    repeat(NATIVE_ASK_MAX_REDIRECTS) {
      requireAllowed(current)
      val connection = open(current, "GET", "text/html")
      try {
        val code = connection.responseCode
        captureCookies(current.host, connection)
        if (code in 300..399) {
          val location = connection.getHeaderField("Location") ?: throw NativeAskAuthRequired()
          current = URL(current, location)
          return@repeat
        }
        if (code in 200..299) return hasAskCookie()
        return false
      } finally {
        connection.disconnect()
      }
    }
    return false
  }

  private fun getJson(path: String): JSONObject {
    val connection = open(URL("$NATIVE_ASK_ORIGIN$path"), "GET", "application/json")
    try {
      val body = readBody(connection)
      if (connection.responseCode == HttpURLConnection.HTTP_UNAUTHORIZED) throw NativeAskAuthRequired()
      if (connection.responseCode !in 200..299) {
        val message = try { JSONObject(body).optString("error") } catch (_: Exception) { "" }
        throw Exception(message.ifBlank { "Ask returned HTTP ${connection.responseCode}." })
      }
      return try { JSONObject(body) } catch (_: Exception) { throw Exception("Ask returned invalid data.") }
    } finally {
      captureCookies(connection.url.host, connection)
      connection.disconnect()
    }
  }

  private fun open(url: URL, method: String, accept: String): HttpURLConnection {
    requireAllowed(url)
    val connection = url.openConnection() as HttpURLConnection
    connection.requestMethod = method
    connection.instanceFollowRedirects = false
    connection.connectTimeout = 15_000
    connection.readTimeout = if (method == "POST") 900_000 else 30_000
    connection.useCaches = false
    connection.setRequestProperty("Accept", accept)
    connection.setRequestProperty("Origin", NATIVE_ASK_ORIGIN)
    connection.setRequestProperty("Referer", "$NATIVE_ASK_ORIGIN/")
    cookies[url.host]?.takeIf { it.isNotBlank() }?.let { connection.setRequestProperty("Cookie", it) }
    return connection
  }

  private fun requireAllowed(url: URL) {
    check(url.protocol == "https" && url.port.let { it == -1 || it == 443 } && nativeAskAllowedHosts.contains(url.host.lowercase(Locale.US))) {
      throw NativeAskAuthRequired()
    }
  }

  private fun captureCookies(host: String, connection: HttpURLConnection) {
    val headerValues = connection.headerFields.entries
      .filter { it.key?.equals("Set-Cookie", ignoreCase = true) == true }
      .flatMap { it.value ?: emptyList() }
    if (headerValues.isEmpty()) return
    val current = cookies[host].orEmpty().split(';').map { it.trim() }
      .filter { it.contains('=') }.associateBy { it.substringBefore('=') }.toMutableMap()
    // Every cookie a trusted host sets during the sign-in hand-off is kept for
    // that host: the issuer's redirects need their own flow cookies, not only
    // the final sessions. Stored as name=value. Storing the bare value lost
    // every session the hand-off created, so Ask asked to link again forever
    // after a successful link (ticket 1467).
    for (header in headerValues) {
      val pair = header.substringBefore(';').trim()
      val name = pair.substringBefore('=').trim()
      if (name.isBlank() || !pair.contains('=')) continue
      if (pair.substringAfter('=').isBlank() || header.contains("Max-Age=0", ignoreCase = true) || header.contains("Expires=Thu, 01 Jan 1970", ignoreCase = true)) current.remove(name)
      else current[name] = pair
    }
    cookies[host] = current.values.joinToString("; ")
  }

  private fun clearAskCookie() {
    cookies["ask.lakesidegames.net"] = cookies["ask.lakesidegames.net"].orEmpty().split(';')
      .map { it.trim() }.filter {
        val name = it.substringBefore('=')
        name != "ask_session" && name != "__Host-ask_session" && name != "__Host-ask_login" &&
          name != "__Host-lakeside_login" && name != "__Host-lakeside_session"
      }
      .filter { it.isNotBlank() }.joinToString("; ")
  }

  private fun hasAskCookie(): Boolean = cookies["ask.lakesidegames.net"].orEmpty().split(';')
    .map { it.trim().substringBefore('=') }.any {
      it == "ask_session" || it == "__Host-ask_session" || it == "__Host-lakeside_session"
    }

  private fun readBody(connection: HttpURLConnection): String {
    val stream: InputStream = try { connection.inputStream } catch (_: Exception) { connection.errorStream ?: return "" }
    return stream.bufferedReader(StandardCharsets.UTF_8).use { it.readText() }
  }
}

/** "Model · Service" so every answer names who wrote it. */
private fun modelLabel(value: JSONObject, fallback: String): String {
  val model = value.optString("modelName", value.optString("modelId", value.optString("model", fallback)))
  val provider = value.optString("providerName")
  return if (provider.isNotBlank() && provider != model && model.isNotBlank()) "$model · $provider" else model
}

/**
 * App Store 5.1.2(i) and Play's AI disclosure: name the outside AI services
 * and get permission before an Ask server question reaches them. Same key and
 * signature as the iOS sheet and the webview panel, so a provider added on
 * the server asks again.
 */
private object NativeAskConsent {
  private const val PREFS = "ahdclient.ask"
  private const val KEY = "ahdclient.ask.aiConsent"
  const val PRIVACY_URL = "https://ask.lakesidegames.net/privacy"

  /** Used only when the Ask server predates the aiProviders field. */
  val fallback = listOf(
    "Meta" to "Muse Spark models. On Meta's contributor tier, Meta may use the question and answer to train its models",
    "Ollama" to "Ollama Cloud hosted models",
    "DeepSeek" to "DeepSeek models, operated from China",
    "Command Code" to "MiniMax models",
    "OpenRouter" to "relays to the vendor of the chosen model",
    "Google" to "Gemini models",
  )

  fun recipients(profile: JSONObject): List<Pair<String, String>> {
    val list = profile.optJSONArray("aiProviders") ?: return fallback
    val out = mutableListOf<Pair<String, String>>()
    for (index in 0 until list.length()) {
      val item = list.optJSONObject(index) ?: continue
      val name = item.optString("name").trim()
      if (name.isNotEmpty()) out += name to item.optString("detail")
    }
    return out.ifEmpty { fallback }
  }

  fun signature(recipients: List<Pair<String, String>>): String =
    recipients.map { "${it.first}|${it.second}" }.sorted().joinToString("\n")

  fun granted(context: Context, recipients: List<Pair<String, String>>): Boolean =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null) == signature(recipients)

  fun grant(context: Context, recipients: List<Pair<String, String>>) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, signature(recipients)).apply()
  }

  fun withdraw(context: Context) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(KEY).apply()
  }
}

/** The Ask sheet's palette: the launcher's dark surfaces and its red accent. */
private object AskStyle {
  val background = Color.rgb(20, 20, 28)
  val surface = Color.rgb(30, 30, 42)
  val raised = Color.rgb(38, 38, 52)
  val border = Color.rgb(48, 48, 64)
  val text = Color.rgb(236, 236, 241)
  val muted = Color.rgb(154, 154, 171)
  val faint = Color.rgb(112, 112, 128)
  val accent = Color.rgb(200, 32, 47)
  val accentPressed = Color.rgb(168, 24, 38)
  val warning = Color.rgb(240, 180, 120)
}

/** Starter questions for an empty chat. Tapping one fills the box. */
private val NATIVE_ASK_STARTERS = listOf(
  "What did I miss while I was away?",
  "How do actions and action points work?",
  "What happens during a game turn, and in what order?",
)

private class NativeAskPanel(
  context: Context,
  initialCookies: Map<String, String>,
  private val onClose: () -> Unit,
  private val onLinkAccount: () -> Unit
) : LinearLayout(context) {
  private val mainHandler = Handler(Looper.getMainLooper())
  private val worker: ExecutorService = Executors.newSingleThreadExecutor()
  private val api = NativeAskApi(initialCookies)
  private val accountLabel = TextView(context)
  private val providersButton = TextView(context)
  private val linkCard = LinearLayout(context)
  private val linkError = TextView(context)
  private val consentPanel = LinearLayout(context)
  private val consentScroll = ScrollView(context)
  private val messages = LinearLayout(context)
  private val scroll = ScrollView(context)
  private val emptyState = LinearLayout(context)
  private val statusLabel = TextView(context)
  private val composer = LinearLayout(context)
  private val draft = EditText(context)
  private val sendButton = TextView(context)
  private var recipients: List<Pair<String, String>> = emptyList()
  private var consented = false
  private val turns = mutableListOf<NativeAskTurn>()
  private var conversationID = ""
  private var signedIn = false
  private var sending = false

  private fun dp(value: Int): Int = (value * resources.displayMetrics.density + 0.5f).toInt()

  init {
    orientation = VERTICAL
    setPadding(dp(18), dp(10), dp(18), dp(14))
    background = GradientDrawable().apply {
      setColor(AskStyle.background)
      val radius = dp(20).toFloat()
      cornerRadii = floatArrayOf(radius, radius, radius, radius, 0f, 0f, 0f, 0f)
    }
    buildHandle()
    buildHeader()
    buildLinkCard()
    consentPanel.orientation = VERTICAL
    consentScroll.addView(consentPanel, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT))
    consentScroll.visibility = View.GONE
    addView(consentScroll, LayoutParams(LayoutParams.MATCH_PARENT, 0, 1f).apply { topMargin = dp(12) })
    messages.orientation = VERTICAL
    messages.setPadding(0, dp(4), 0, dp(16))
    buildEmptyState()
    messages.addView(emptyState)
    scroll.addView(messages, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT))
    scroll.isVerticalScrollBarEnabled = false
    addView(scroll, LayoutParams(LayoutParams.MATCH_PARENT, 0, 1f).apply { topMargin = dp(8) })
    statusLabel.textSize = 12f
    statusLabel.setTextColor(AskStyle.muted)
    statusLabel.visibility = View.GONE
    addView(statusLabel, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply { bottomMargin = dp(6) })
    buildComposer()
    showChecking()
    checkSession()
  }

  fun dispose() {
    worker.shutdownNow()
    mainHandler.removeCallbacksAndMessages(null)
  }

  private fun rounded(color: Int, radius: Int, stroke: Int? = null): GradientDrawable = GradientDrawable().apply {
    setColor(color)
    cornerRadius = dp(radius).toFloat()
    if (stroke != null) setStroke(dp(1), stroke)
  }

  private fun text(value: String, size: Float, color: Int, bold: Boolean = false) = TextView(context).apply {
    text = value
    textSize = size
    setTextColor(color)
    if (bold) setTypeface(Typeface.DEFAULT, Typeface.BOLD)
    setLineSpacing(0f, 1.2f)
  }

  private fun primaryButton(label: String, onTap: () -> Unit) = TextView(context).apply {
    text = label
    textSize = 15f
    gravity = Gravity.CENTER
    setTextColor(Color.WHITE)
    setTypeface(Typeface.DEFAULT, Typeface.BOLD)
    minHeight = dp(48)
    setPadding(dp(18), dp(12), dp(18), dp(12))
    background = rounded(AskStyle.accent, 12)
    isClickable = true
    isFocusable = true
    setOnClickListener { onTap() }
  }

  private fun secondaryButton(label: String, onTap: () -> Unit) = TextView(context).apply {
    text = label
    textSize = 15f
    gravity = Gravity.CENTER
    setTextColor(AskStyle.text)
    minHeight = dp(48)
    setPadding(dp(18), dp(12), dp(18), dp(12))
    background = rounded(AskStyle.surface, 12, AskStyle.border)
    isClickable = true
    isFocusable = true
    setOnClickListener { onTap() }
  }

  private fun buildHandle() {
    val handle = View(context).apply { background = rounded(AskStyle.border, 3) }
    addView(handle, LayoutParams(dp(40), dp(5)).apply { gravity = Gravity.CENTER_HORIZONTAL; bottomMargin = dp(10) })
  }

  private fun buildHeader() {
    val row = LinearLayout(context).apply { gravity = Gravity.CENTER_VERTICAL }
    val titles = LinearLayout(context).apply { orientation = VERTICAL }
    titles.addView(text("Ask", 22f, AskStyle.text, bold = true))
    accountLabel.textSize = 13f
    accountLabel.setTextColor(AskStyle.muted)
    titles.addView(accountLabel)
    row.addView(titles, LayoutParams(0, LayoutParams.WRAP_CONTENT, 1f))
    providersButton.apply {
      text = "AI providers"
      textSize = 13f
      setTextColor(AskStyle.muted)
      setPadding(dp(10), dp(8), dp(10), dp(8))
      visibility = View.GONE
      isClickable = true
      setOnClickListener { NativeSafety.run("Ask providers") { showConsent(review = true) } }
    }
    row.addView(providersButton)
    val close = TextView(context).apply {
      text = "✕"
      textSize = 16f
      gravity = Gravity.CENTER
      setTextColor(AskStyle.text)
      contentDescription = "Close Ask"
      background = rounded(AskStyle.surface, 20)
      isClickable = true
      setOnClickListener { onClose() }
    }
    row.addView(close, LayoutParams(dp(40), dp(40)).apply { leftMargin = dp(6) })
    addView(row, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT))
  }

  private fun buildLinkCard() {
    linkCard.orientation = VERTICAL
    linkCard.setPadding(dp(16), dp(16), dp(16), dp(16))
    linkCard.background = rounded(AskStyle.surface, 14, AskStyle.border)
    linkCard.addView(text("Link your game account", 17f, AskStyle.text, bold = true))
    linkCard.addView(text(
      "Ask answers from your own game: your character, party, offices and companies. Link the account you play with to start.",
      14f, AskStyle.muted).apply { setPadding(0, dp(6), 0, dp(14)) })
    linkCard.addView(primaryButton("Link game account") { onLinkAccount() },
      LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT))
    linkError.textSize = 12f
    linkError.setTextColor(AskStyle.warning)
    linkError.setPadding(0, dp(10), 0, 0)
    linkError.visibility = View.GONE
    linkCard.addView(linkError)
    linkCard.visibility = View.GONE
    addView(linkCard, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply { topMargin = dp(16) })
  }

  private fun buildEmptyState() {
    emptyState.orientation = VERTICAL
    emptyState.setPadding(0, dp(12), 0, 0)
    emptyState.addView(text("Ask anything about A House Divided", 16f, AskStyle.text, bold = true))
    emptyState.addView(text("Rules, your character, elections, markets. Answers can use live game data.",
      14f, AskStyle.muted).apply { setPadding(0, dp(4), 0, dp(14)) })
    for (starter in NATIVE_ASK_STARTERS) {
      val chip = text(starter, 14f, AskStyle.text).apply {
        setPadding(dp(14), dp(12), dp(14), dp(12))
        background = rounded(AskStyle.surface, 12, AskStyle.border)
        isClickable = true
        setOnClickListener {
          NativeSafety.run("Ask starter") {
            draft.setText(starter)
            draft.setSelection(starter.length)
            draft.requestFocus()
          }
        }
      }
      emptyState.addView(chip, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply { bottomMargin = dp(8) })
    }
  }

  private fun buildComposer() {
    composer.gravity = Gravity.BOTTOM
    composer.setPadding(dp(6), dp(6), dp(6), dp(6))
    composer.background = rounded(AskStyle.surface, 16, AskStyle.border)
    draft.hint = "Ask about the game"
    draft.setTextColor(AskStyle.text)
    draft.setHintTextColor(AskStyle.faint)
    draft.textSize = 16f
    draft.minLines = 1
    draft.maxLines = 5
    draft.gravity = Gravity.CENTER_VERTICAL
    draft.setPadding(dp(10), dp(10), dp(10), dp(10))
    draft.background = null
    draft.addTextChangedListener(object : android.text.TextWatcher {
      override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
      override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
      override fun afterTextChanged(s: android.text.Editable?) { NativeSafety.run("Ask draft") { refreshSend() } }
    })
    composer.addView(draft, LayoutParams(0, LayoutParams.WRAP_CONTENT, 1f))
    sendButton.apply {
      text = "Send"
      textSize = 15f
      gravity = Gravity.CENTER
      setTypeface(Typeface.DEFAULT, Typeface.BOLD)
      setPadding(dp(16), 0, dp(16), 0)
      isClickable = true
      setOnClickListener { NativeSafety.run("Ask send") { send() } }
    }
    composer.addView(sendButton, LayoutParams(LayoutParams.WRAP_CONTENT, dp(44)).apply { leftMargin = dp(6) })
    addView(composer, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT))
    refreshSend()
  }

  /** Send is live only when a question of a valid length can actually go out. */
  private fun refreshSend() {
    val length = draft.text?.toString()?.trim()?.length ?: 0
    val ready = signedIn && consented && !sending && length in 5..500
    sendButton.isEnabled = ready
    sendButton.setTextColor(if (ready) Color.WHITE else AskStyle.faint)
    sendButton.background = rounded(if (ready) AskStyle.accent else AskStyle.raised, 12)
  }

  private fun showChecking() {
    accountLabel.text = "Checking your game account..."
    linkCard.visibility = View.GONE
    composer.visibility = View.VISIBLE
    draft.isEnabled = false
  }

  /** The consent screen. Nothing is sent to the Ask server until Allow. */
  private fun showConsent(review: Boolean) {
    consentPanel.removeAllViews()
    consentPanel.addView(text("Ask uses outside AI services", 18f, AskStyle.text, bold = true))
    consentPanel.addView(text(
      "Ask answers with AI models run by other companies. When you send a question, it goes to one of the " +
        "services below. They receive the text you type, earlier messages in the same chat, and, if you " +
        "ask about your own character, your own game records. Your username, email and account IDs are not sent.",
      14f, AskStyle.muted).apply { setPadding(0, dp(8), 0, dp(12)) })
    val list = LinearLayout(context).apply {
      orientation = VERTICAL
      setPadding(dp(14), dp(6), dp(14), dp(6))
      background = rounded(AskStyle.surface, 14, AskStyle.border)
    }
    for ((name, detail) in recipients) {
      list.addView(text(name, 15f, AskStyle.text, bold = true).apply { setPadding(0, dp(8), 0, 0) })
      if (detail.isNotBlank()) list.addView(text(detail, 13f, AskStyle.muted).apply { setPadding(0, dp(2), 0, dp(8)) })
    }
    consentPanel.addView(list)
    consentPanel.addView(text(
      "Each service has its own terms and data handling. Every answer names the model and service that wrote it. " +
        "Privacy notice: ${NativeAskConsent.PRIVACY_URL}",
      12f, AskStyle.faint).apply { setPadding(0, dp(12), 0, dp(16)) })
    val full = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT)
    if (review) {
      consentPanel.addView(primaryButton("Keep using Ask") { NativeSafety.run("Ask consent keep") { hideConsent() } }, full)
      consentPanel.addView(secondaryButton("Withdraw permission") {
        NativeSafety.run("Ask consent withdraw") {
          NativeAskConsent.withdraw(context)
          consented = false
          showConsent(review = false)
        }
      }, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply { topMargin = dp(8) })
    } else {
      consentPanel.addView(primaryButton("Allow and continue") {
        NativeSafety.run("Ask consent allow") {
          NativeAskConsent.grant(context, recipients)
          consented = true
          hideConsent()
        }
      }, full)
      consentPanel.addView(text("Ask sends nothing until you allow it.", 12f, AskStyle.faint).apply {
        gravity = Gravity.CENTER
        setPadding(0, dp(10), 0, 0)
      }, full)
    }
    consentScroll.visibility = View.VISIBLE
    scroll.visibility = View.GONE
    composer.visibility = View.GONE
    statusLabel.visibility = View.GONE
    providersButton.visibility = View.GONE
    refreshSend()
  }

  private fun hideConsent() {
    consentScroll.visibility = View.GONE
    scroll.visibility = View.VISIBLE
    composer.visibility = View.VISIBLE
    providersButton.visibility = if (consented) View.VISIBLE else View.GONE
    draft.isEnabled = signedIn && consented
    refreshSend()
  }

  private fun checkSession() {
    submit("Ask session") {
      try {
        val profile = api.connect()
        val name = profileName(profile)
        val listed = NativeAskConsent.recipients(profile)
        mainHandler.post {
          NativeSafety.run("Ask session success UI") {
            signedIn = true
            recipients = listed
            consented = NativeAskConsent.granted(context, listed)
            accountLabel.text = if (name.isBlank()) "Signed in" else "Signed in as $name"
            linkCard.visibility = View.GONE
            if (consented) hideConsent() else showConsent(review = false)
          }
        }
      } catch (failure: Exception) {
        mainHandler.post {
          NativeSafety.run("Ask session failure UI") {
            signedIn = false
            accountLabel.text = "Not linked yet"
            linkCard.visibility = View.VISIBLE
            scroll.visibility = View.GONE
            composer.visibility = View.GONE
            // A link problem is shown plainly; the account explanation is already on the card.
            val reason = failure.message.orEmpty()
            linkError.text = if (failure is NativeAskAuthRequired || reason.isBlank()) "" else reason
            linkError.visibility = if (linkError.text.isNullOrBlank()) View.GONE else View.VISIBLE
            refreshSend()
          }
        }
      }
    }
  }

  private fun send() {
    val question = draft.text.toString().trim()
    if (!signedIn || !consented || sending || question.length !in 5..500) return
    val turn = NativeAskTurn(question, "")
    turns += turn
    emptyState.visibility = View.GONE
    val answer = addTurn(question)
    draft.setText("")
    sending = true
    refreshSend()
    statusLabel.text = "Thinking..."
    statusLabel.visibility = View.VISIBLE
    val submitted = submit("Ask answer") {
      try {
        val result = api.ask(
          question = question,
          conversationID = conversationID,
          onDelta = { delta ->
            mainHandler.post {
              NativeSafety.run("Ask answer delta UI") {
                val current = if (answer.body.tag == "pending") "" else answer.body.text.toString()
                answer.body.tag = null
                answer.body.setTextColor(AskStyle.text)
                answer.body.text = current + delta
                scrollToBottom()
              }
            }
          },
          onStatus = { label ->
            mainHandler.post {
              NativeSafety.run("Ask answer status UI") {
                statusLabel.text = label
                statusLabel.visibility = View.VISIBLE
              }
            }
          },
        )
        mainHandler.post {
          NativeSafety.run("Ask answer success UI") {
            turn.answer = result.answer
            answer.body.tag = null
            answer.body.setTextColor(AskStyle.text)
            answer.body.text = result.answer
            answer.footer.text = answerFooter(result)
            answer.footer.visibility = if (answer.footer.text.isNullOrBlank()) View.GONE else View.VISIBLE
            if (result.conversationID.isNotBlank()) conversationID = result.conversationID
            sending = false
            statusLabel.visibility = View.GONE
            refreshSend()
            scrollToBottom()
          }
        }
      } catch (failure: Exception) {
        mainHandler.post {
          NativeSafety.run("Ask answer failure UI") {
            answer.body.tag = null
            answer.body.setTextColor(AskStyle.warning)
            answer.body.text = failure.message.orEmpty().ifBlank { "Ask could not finish this answer. Try again." }
            sending = false
            statusLabel.visibility = View.GONE
            refreshSend()
            scrollToBottom()
          }
        }
      }
    }
    if (!submitted) {
      sending = false
      statusLabel.text = "Ask is unavailable right now."
      statusLabel.visibility = View.VISIBLE
      refreshSend()
    }
  }

  private fun submit(operation: String, task: () -> Unit): Boolean {
    return NativeSafety.run("$operation scheduling") {
      worker.execute {
        NativeSafety.run("$operation task") { task() }
      }
    }
  }

  private class AnswerViews(val body: TextView, val footer: TextView)

  private fun addTurn(question: String): AnswerViews {
    val questionView = text(question, 15f, AskStyle.text).apply {
      setPadding(dp(14), dp(10), dp(14), dp(10))
      background = rounded(AskStyle.raised, 14)
    }
    messages.addView(questionView, LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply {
      gravity = Gravity.END
      topMargin = dp(14)
      leftMargin = dp(40)
    })
    val body = text("Thinking...", 16f, AskStyle.muted).apply {
      tag = "pending"
      setTextIsSelectable(true)
      setPadding(dp(2), dp(12), dp(2), 0)
    }
    messages.addView(body, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT))
    val footer = text("", 12f, AskStyle.faint).apply {
      setPadding(dp(2), dp(8), dp(2), 0)
      visibility = View.GONE
    }
    messages.addView(footer, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT))
    scrollToBottom()
    return AnswerViews(body, footer)
  }

  /** Who wrote the answer, the live data it used and its sources, quietly under it. */
  private fun answerFooter(result: NativeAskResult): String {
    val lines = mutableListOf<String>()
    if (result.model.isNotBlank()) lines += result.model
    if (result.usedMcp) {
      val sources = result.liveSources.joinToString(", ")
      lines += if (sources.isBlank()) "Used live game data" else "Used live game data: $sources"
    }
    if (result.citations.isNotEmpty()) lines += "Sources: ${result.citations.joinToString(", ")}"
    return lines.joinToString("\n")
  }

  private fun scrollToBottom() {
    NativeSafety.run("Ask scroll scheduling") {
      scroll.post { NativeSafety.run("Ask scroll") { scroll.fullScroll(ScrollView.FOCUS_DOWN) } }
    }
  }

  private fun profileName(profile: JSONObject): String {
    val identity = profile.optJSONObject("identity")
    val profileContext = profile.optJSONObject("context")
    val character = profileContext?.optJSONObject("character")
    return identity?.optString("name").orEmpty().ifBlank { identity?.optString("displayName").orEmpty() }
      .ifBlank { character?.optString("name").orEmpty() }
      .ifBlank { profileContext?.optString("displayName").orEmpty() }
  }
}

object NativeAskController {
  private val mainHandler = Handler(Looper.getMainLooper())
  private var activity: Activity? = null
  private var webView: WebView? = null
  private var dialog: Dialog? = null

  fun attach(activity: Activity, webView: WebView) {
    this.activity = activity
    this.webView = webView
  }

  fun present() {
    mainHandler.post {
      NativeSafety.run("native Ask presentation") {
        val host = activity ?: webView?.context?.findActivity() ?: return@run
        if (dialog?.isShowing == true) return@run
        val nativeDialog = Dialog(host)
        nativeDialog.requestWindowFeature(Window.FEATURE_NO_TITLE)
        val panel = NativeAskPanel(host, NativeAskCookies.snapshot(),
          onClose = { NativeSafety.run("Ask close") { nativeDialog.dismiss() } },
          onLinkAccount = {
            NativeSafety.run("Ask account link") {
              nativeDialog.dismiss()
              webView?.loadUrl("$NATIVE_GAME_ORIGIN/client/link")
            }
          })
        nativeDialog.setContentView(panel)
        nativeDialog.setCanceledOnTouchOutside(true)
        nativeDialog.setOnDismissListener {
          NativeSafety.run("Ask panel dispose") {
            panel.dispose()
            if (dialog === nativeDialog) dialog = null
          }
        }
        nativeDialog.show()
        nativeDialog.window?.apply {
          setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
          setDimAmount(0.48f)
          addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND)
          setGravity(Gravity.BOTTOM)
          setLayout(WindowManager.LayoutParams.MATCH_PARENT, (host.resources.displayMetrics.heightPixels * 0.9f).toInt())
          // The composer rides above the keyboard instead of under it.
          setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
        }
        dialog = nativeDialog
      }
    }
  }
}

private fun Context.findActivity(): Activity? {
  var current: Context = this
  while (current is ContextWrapper) {
    if (current is Activity) return current
    current = current.baseContext
  }
  return current as? Activity
}
