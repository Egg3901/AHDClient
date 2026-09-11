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
import android.widget.Button
import android.widget.EditText
import android.widget.ImageButton
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
private const val NATIVE_AUTH_ORIGIN = "https://auth.ahousedividedgame.com"
private const val NATIVE_UNIFIED_AUTH_ORIGIN = "https://auth.lakesidegames.net"
private const val NATIVE_ASK_MAX_REDIRECTS = 10

private val nativeAskAllowedHosts = setOf(
  "ask.lakesidegames.net",
  "auth.ahousedividedgame.com",
  "auth.lakesidegames.net",
  "ahousedividedgame.com",
  "www.ahousedividedgame.com"
)

private val nativeAskSessionName = Regex(
  "^(?:ask_session|__Host-ask_session|auth-token(?:-[A-Za-z0-9-]+)?|(?:__Secure-)?(?:authjs|next-auth)\\.session-token(?:\\.[0-9]+)?)$"
)

private class NativeAskAuthRequired : Exception(
  "Ask could not find a linked game account. Link your game account in AHDClient first."
)

private data class NativeAskResult(
  val answer: String,
  val conversationID: String,
  val model: String,
  val citations: List<String>
)

private data class NativeAskTurn(val question: String, var answer: String)

private object NativeAskCookies {
  fun snapshot(): Map<String, String> {
    val manager = CookieManager.getInstance()
    return mapOf(
      "ask.lakesidegames.net" to filtered(manager.getCookie(NATIVE_ASK_ORIGIN)),
      "auth.ahousedividedgame.com" to filtered(manager.getCookie(NATIVE_AUTH_ORIGIN)),
      "auth.lakesidegames.net" to filtered(manager.getCookie(NATIVE_UNIFIED_AUTH_ORIGIN)),
      "ahousedividedgame.com" to filtered(manager.getCookie("$NATIVE_GAME_ORIGIN/api/client/account")),
      "www.ahousedividedgame.com" to filtered(manager.getCookie("https://www.ahousedividedgame.com/api/client/account"))
    )
  }

  private fun filtered(header: String?): String = header.orEmpty().split(';')
    .map { it.trim() }
    .filter { it.substringBefore('=').let(nativeAskSessionName::matches) }
    .distinctBy { it.substringBefore('=') }
    .joinToString("; ")
}

private class NativeAskApi(initialCookies: Map<String, String>) {
  private val cookies = initialCookies.toMutableMap()

  fun connect(): JSONObject {
    try {
      return getJson("/api/me")
    } catch (_: NativeAskAuthRequired) {
      clearAskCookie()
      login()
      return getJson("/api/me")
    }
  }

  fun ask(
    question: String,
    conversationID: String,
    onDelta: (String) -> Unit
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

      var answer = ""
      var returnedConversationID = conversationID
      var model = ""
      val citations = mutableListOf<String>()
      var eventName = "message"
      var eventData = StringBuilder()
      var completed = false

      fun emit() {
        if (eventData.isEmpty()) return
        val value = try { org.json.JSONTokener(eventData.toString()).nextValue() }
          catch (_: Exception) { throw Exception("Ask sent an invalid event.") }
        when (eventName) {
          "meta" -> if (value is JSONObject) returnedConversationID = value.optString("convId", returnedConversationID)
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
            model = value.optString("modelName", value.optString("modelId", value.optString("model", model)))
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
      return NativeAskResult(answer, returnedConversationID, model, citations)
    } finally {
      connection.disconnect()
    }
  }

  private fun login() {
    var current = URL(NATIVE_ASK_LOGIN)
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
        if (code in 200..299 && hasAskCookie()) return
        throw NativeAskAuthRequired()
      } finally {
        connection.disconnect()
      }
    }
    throw NativeAskAuthRequired()
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
    for (header in headerValues) {
      val pair = header.substringBefore(';').trim()
      val name = pair.substringBefore('=')
      if (name.isBlank() || !nativeAskSessionName.matches(name) || !pair.contains('=')) continue
      if (pair.substringAfter('=').isBlank() || header.contains("Max-Age=0", ignoreCase = true) || header.contains("Expires=Thu, 01 Jan 1970", ignoreCase = true)) current.remove(name)
      else current[name] = pair.substringAfter('=')
    }
    cookies[host] = current.values.joinToString("; ")
  }

  private fun clearAskCookie() {
    cookies["ask.lakesidegames.net"] = cookies["ask.lakesidegames.net"].orEmpty().split(';')
      .map { it.trim() }.filter { !it.startsWith("ask_session=") && !it.startsWith("__Host-ask_session=") }
      .filter { it.isNotBlank() }.joinToString("; ")
  }

  private fun hasAskCookie(): Boolean = cookies["ask.lakesidegames.net"].orEmpty().split(';')
    .map { it.trim().substringBefore('=') }.any { it == "ask_session" || it == "__Host-ask_session" }

  private fun readBody(connection: HttpURLConnection): String {
    val stream: InputStream = try { connection.inputStream } catch (_: Exception) { connection.errorStream ?: return "" }
    return stream.bufferedReader(StandardCharsets.UTF_8).use { it.readText() }
  }
}

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
  private val linkButton = Button(context)
  private val statusLabel = TextView(context)
  private val messages = LinearLayout(context)
  private val scroll = ScrollView(context)
  private val draft = EditText(context)
  private val sendButton = Button(context)
  private val turns = mutableListOf<NativeAskTurn>()
  private var conversationID = ""
  private var signedIn = false
  private var sending = false

  init {
    orientation = VERTICAL
    setPadding(20, 16, 20, 18)
    background = rounded(Color.rgb(20, 20, 28), 22f)
    buildHeader()
    buildAccountStatus()
    buildProviderStatus()
    messages.orientation = VERTICAL
    messages.setPadding(0, 12, 0, 24)
    scroll.addView(messages, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT))
    addView(scroll, LayoutParams(LayoutParams.MATCH_PARENT, 0, 1f))
    buildComposer()
    checkSession()
  }

  fun dispose() {
    worker.shutdownNow()
    mainHandler.removeCallbacksAndMessages(null)
  }

  private fun buildHeader() {
    val row = LinearLayout(context).apply { gravity = Gravity.CENTER_VERTICAL }
    val title = TextView(context).apply {
      text = "Lakeside Ask"
      textSize = 21f
      setTextColor(Color.WHITE)
      setTypeface(typeface, Typeface.BOLD)
    }
    val subtitle = TextView(context).apply {
      text = "  Native client panel"
      textSize = 12f
      setTextColor(Color.LTGRAY)
    }
    row.addView(title, LayoutParams(0, LayoutParams.WRAP_CONTENT, 1f))
    row.addView(subtitle)
    val close = ImageButton(context).apply {
      contentDescription = "Close Ask"
      setImageResource(android.R.drawable.ic_menu_close_clear_cancel)
      setColorFilter(Color.WHITE)
      setBackgroundColor(Color.TRANSPARENT)
      setOnClickListener { onClose() }
    }
    row.addView(close, LayoutParams(44, 44))
    addView(row, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT))
  }

  private fun buildAccountStatus() {
    accountLabel.text = "Checking linked game account..."
    accountLabel.textSize = 13f
    accountLabel.setTextColor(Color.LTGRAY)
    accountLabel.setPadding(0, 4, 0, 3)
    addView(accountLabel, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT))
    linkButton.text = "Link game account"
    linkButton.visibility = View.GONE
    linkButton.setOnClickListener { onLinkAccount() }
    addView(linkButton, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT))
  }

  private fun buildProviderStatus() {
    val provider = TextView(context).apply {
      text = "Ask server  |  Live game evidence and sources"
      textSize = 12f
      setTextColor(Color.rgb(168, 220, 205))
      setPadding(12, 10, 12, 10)
      background = rounded(Color.rgb(35, 51, 52), 12f)
    }
    addView(provider, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply { topMargin = 8 })
    statusLabel.textSize = 12f
    statusLabel.setTextColor(Color.LTGRAY)
    statusLabel.visibility = View.GONE
    addView(statusLabel, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply { topMargin = 6 })
  }

  private fun buildComposer() {
    val row = LinearLayout(context).apply { gravity = Gravity.BOTTOM }
    draft.hint = "Ask about the game..."
    draft.setTextColor(Color.WHITE)
    draft.setHintTextColor(Color.GRAY)
    draft.setTextSize(16f)
    draft.minLines = 1
    draft.maxLines = 5
    draft.gravity = Gravity.TOP
    draft.setPadding(14, 12, 14, 12)
    draft.background = rounded(Color.rgb(39, 39, 50), 14f)
    row.addView(draft, LayoutParams(0, LayoutParams.WRAP_CONTENT, 1f))
    sendButton.text = "Send"
    sendButton.isEnabled = false
    sendButton.setOnClickListener { send() }
    row.addView(sendButton, LayoutParams(LayoutParams.WRAP_CONTENT, 52).apply { leftMargin = 8 })
    addView(row, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply { topMargin = 8 })
  }

  private fun checkSession() {
    worker.execute {
      try {
        val profile = api.connect()
        val name = profileName(profile)
        mainHandler.post {
          signedIn = true
          accountLabel.text = "Signed in as ${name.ifBlank { "linked game account" }}"
          accountLabel.setTextColor(Color.rgb(168, 220, 205))
          sendButton.isEnabled = true
        }
      } catch (failure: Exception) {
        mainHandler.post {
          signedIn = false
          accountLabel.text = "Ask server needs your linked game account."
          accountLabel.setTextColor(Color.rgb(255, 190, 150))
          linkButton.visibility = View.VISIBLE
          statusLabel.text = failure.message.orEmpty().ifBlank { "Link your game account, then open Ask again." }
          statusLabel.visibility = View.VISIBLE
        }
      }
    }
  }

  private fun send() {
    val question = draft.text.toString().trim()
    if (!signedIn || sending || question.length !in 5..500) return
    val turn = NativeAskTurn(question, "")
    turns += turn
    val answerView = addTurn(question)
    draft.setText("")
    sending = true
    sendButton.isEnabled = false
    statusLabel.text = "Thinking..."
    statusLabel.visibility = View.VISIBLE
    worker.execute {
      try {
        val result = api.ask(question, conversationID) { delta ->
          mainHandler.post {
            answerView.text = answerView.text.toString() + delta
            scrollToBottom()
          }
        }
        mainHandler.post {
          turn.answer = result.answer
          answerView.text = formatAnswer(result)
          if (result.conversationID.isNotBlank()) conversationID = result.conversationID
          sending = false
          sendButton.isEnabled = true
          statusLabel.visibility = View.GONE
          scrollToBottom()
        }
      } catch (failure: Exception) {
        mainHandler.post {
          answerView.text = failure.message.orEmpty().ifBlank { "Ask could not complete the answer." }
          sending = false
          sendButton.isEnabled = signedIn
          statusLabel.text = "The answer could not be completed."
          statusLabel.visibility = View.VISIBLE
          scrollToBottom()
        }
      }
    }
  }

  private fun addTurn(question: String): TextView {
    val questionView = TextView(context).apply {
      text = question
      textSize = 16f
      setTextColor(Color.WHITE)
      setPadding(14, 12, 14, 12)
      background = rounded(Color.rgb(36, 58, 75), 14f)
    }
    messages.addView(questionView, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply { topMargin = 10 })
    val answerView = TextView(context).apply {
      text = "Thinking..."
      textSize = 16f
      setTextColor(Color.WHITE)
      setPadding(4, 12, 4, 4)
    }
    messages.addView(answerView, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT))
    scrollToBottom()
    return answerView
  }

  private fun formatAnswer(result: NativeAskResult): String {
    val sourceText = if (result.citations.isEmpty()) "" else "\n\nSources: ${result.citations.joinToString(" | ")}"
    val modelText = if (result.model.isBlank()) "" else "\n\n${result.model}"
    return result.answer + modelText + sourceText
  }

  private fun scrollToBottom() { scroll.post { scroll.fullScroll(ScrollView.FOCUS_DOWN) } }

  private fun profileName(profile: JSONObject): String {
    val identity = profile.optJSONObject("identity")
    val profileContext = profile.optJSONObject("context")
    val character = profileContext?.optJSONObject("character")
    return identity?.optString("name").orEmpty().ifBlank { identity?.optString("displayName").orEmpty() }
      .ifBlank { character?.optString("name").orEmpty() }
      .ifBlank { profileContext?.optString("displayName").orEmpty() }
  }

  private fun rounded(color: Int, radius: Float): GradientDrawable = GradientDrawable().apply {
    setColor(color)
    cornerRadius = radius
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
      val host = activity ?: webView?.context?.findActivity() ?: return@post
      if (dialog?.isShowing == true) return@post
      val nativeDialog = Dialog(host)
      nativeDialog.requestWindowFeature(Window.FEATURE_NO_TITLE)
      val panel = NativeAskPanel(host, NativeAskCookies.snapshot(),
        onClose = { nativeDialog.dismiss() },
        onLinkAccount = {
          nativeDialog.dismiss()
          webView?.loadUrl("$NATIVE_GAME_ORIGIN/client/link")
        })
      nativeDialog.setContentView(panel)
      nativeDialog.setCanceledOnTouchOutside(true)
      nativeDialog.setOnDismissListener {
        panel.dispose()
        if (dialog === nativeDialog) dialog = null
      }
      nativeDialog.show()
      nativeDialog.window?.apply {
        setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
        setDimAmount(0.48f)
        addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND)
        setGravity(Gravity.BOTTOM)
        setLayout(WindowManager.LayoutParams.MATCH_PARENT, (host.resources.displayMetrics.heightPixels * 0.9f).toInt())
      }
      dialog = nativeDialog
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
