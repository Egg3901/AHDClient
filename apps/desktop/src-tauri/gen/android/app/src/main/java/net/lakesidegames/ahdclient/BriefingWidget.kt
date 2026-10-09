package net.lakesidegames.ahdclient

import android.app.PendingIntent
import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.webkit.CookieManager
import android.widget.RemoteViews
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.text.DecimalFormat
import java.util.concurrent.Executors
import java.util.concurrent.Future

/** Native home-screen stats. No WebView, renderer IPC or stored session copy. */
open class BriefingWidget : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    CompanionSafety.run("widget receiver render") { BriefingWidgets.render(context) }
    CompanionSafety.run("widget receiver schedule") { BriefingWidgets.schedule(context) }
  }

  override fun onReceive(context: Context, intent: Intent) {
    CompanionSafety.run("widget receiver base dispatch") { super.onReceive(context, intent) }
    CompanionSafety.run("widget receiver action") {
      when (intent.action) {
        BriefingWidgets.NEXT, BriefingWidgets.PREVIOUS -> {
          val id = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, -1)
          if (BriefingWidgets.ids(context).contains(id)) {
            val current = BriefingWidgets.section(context, id)
            val delta = if (intent.action == BriefingWidgets.NEXT) 1 else BriefingWidgets.sections.size - 1
            context.getSharedPreferences("briefing-widget-prefs", Context.MODE_PRIVATE).edit()
              .putInt("section-$id", (current + delta) % BriefingWidgets.sections.size).apply()
            BriefingWidgets.render(context)
          }
        }
        BriefingWidgets.REFRESH -> BriefingWidgets.schedule(context)
      }
    }
  }

  override fun onDeleted(context: Context, ids: IntArray) {
    CompanionSafety.run("widget receiver delete") {
      val prefs = context.getSharedPreferences("briefing-widget-prefs", Context.MODE_PRIVATE).edit()
      ids.forEach { prefs.remove("section-$it") }
      prefs.apply()
    }
  }

  override fun onDisabled(context: Context) {
    CompanionSafety.run("widget receiver disable") {
      if (BriefingWidgets.ids(context).isEmpty()) {
        context.getSystemService(JobScheduler::class.java).cancel(BriefingWidgets.JOB_ID)
        BriefingWidgets.clear(context)
      }
    }
  }
}

class ProfileWidget : BriefingWidget()
class ElectionWidget : BriefingWidget()
class CorporationWidget : BriefingWidget()
class StocksWidget : BriefingWidget()

object BriefingWidgets {
  const val JOB_ID = 21001
  const val NEXT = "net.lakesidegames.ahdclient.widget.NEXT"
  const val PREVIOUS = "net.lakesidegames.ahdclient.widget.PREVIOUS"
  const val REFRESH = "net.lakesidegames.ahdclient.widget.REFRESH"
  const val ORIGIN = "https://ahousedividedgame.com"
  val sections = listOf("profile", "election", "corporation", "stocks")
  private val labels = listOf("Profile", "Election", "Corporation", "Stocks")
  private val providers = listOf(ProfileWidget::class.java, ElectionWidget::class.java, CorporationWidget::class.java, StocksWidget::class.java)
  private val lock = Any()

  fun ids(context: Context): List<Int> = CompanionSafety.get("widget lookup", emptyList()) {
    providers.flatMap {
      AppWidgetManager.getInstance(context).getAppWidgetIds(ComponentName(context, it)).toList()
    }
  }

  fun section(context: Context, id: Int): Int = CompanionSafety.get("widget section lookup", 0) {
    val provider = AppWidgetManager.getInstance(context).getAppWidgetInfo(id)?.provider?.className
    val default = providers.indexOfFirst { it.name == provider }.coerceAtLeast(0)
    context.getSharedPreferences("briefing-widget-prefs", Context.MODE_PRIVATE)
      .getInt("section-$id", default).coerceIn(sections.indices)
  }

  fun schedule(context: Context) {
    CompanionSafety.run("widget schedule") {
      if (ids(context).isEmpty()) return@run
      val scheduler = context.getSystemService(JobScheduler::class.java)
      if (scheduler.getPendingJob(JOB_ID) != null) return@run
      scheduler.schedule(JobInfo.Builder(JOB_ID, ComponentName(context, BriefingRefreshJob::class.java))
        .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setMinimumLatency(0).build())
    }
  }

  private fun cacheFile(context: Context) = File(context.noBackupFilesDir, "multiplayer-briefing.json")
  fun clear(context: Context) = synchronized(lock) { cacheFile(context).delete(); Unit }
  private fun read(context: Context): JSONObject? = CompanionSafety.get("widget cache read", null) {
    synchronized(lock) {
      val data = JSONObject(cacheFile(context).readText())
      val cookie = session()
      if (cookie.isNotEmpty() && data.optString("identity") == fingerprint(cookie)) data else null
    }
  }

  private fun session(): String = (CookieManager.getInstance().getCookie("$ORIGIN/api/client-status") ?: "")
    .split(';').map { it.trim() }.filter {
      val name = it.substringBefore('=')
      name == "auth-token" || name.matches(Regex("auth-token-[a-zA-Z0-9-]+")) ||
        name.matches(Regex("(__Secure-)?(authjs|next-auth)\\.session-token(\\.[0-9]+)?"))
    }.sorted().joinToString("; ")

  private fun fingerprint(session: String) = MessageDigest.getInstance("SHA-256")
    .digest(session.toByteArray()).joinToString("") { "%02x".format(it) }

  fun refresh(context: Context) {
    CompanionSafety.run("widget refresh") { refreshUnsafe(context) }
  }

  private fun refreshUnsafe(context: Context) {
    var connection: HttpURLConnection? = null
    try {
      val cookie = session()
      val identity = fingerprint(cookie)
      if (cookie.isEmpty()) { clear(context); return }
      if (read(context)?.optString("identity") != identity) clear(context)
      // widgets=1 adds the turn clock and inbox counts.
      val activeConnection = URL("$ORIGIN/api/client-status?layout=full&widgets=1").openConnection() as? HttpURLConnection
        ?: return
      connection = activeConnection
      activeConnection.connectTimeout = 6000
      activeConnection.readTimeout = 6000
      activeConnection.instanceFollowRedirects = false
      activeConnection.useCaches = false
      activeConnection.setRequestProperty("Cookie", cookie)
      activeConnection.setRequestProperty("X-AHD-Client-Version", BuildConfig.VERSION_NAME)
      activeConnection.setRequestProperty("Cache-Control", "no-cache")
      val status = activeConnection.responseCode
      if (cookie != session()) { clear(context); return }
      if (status == 401 || status == 403) { clear(context); return }
      if (status != 200) return
      val body = activeConnection.inputStream.use { input ->
        val output = java.io.ByteArrayOutputStream()
        val buffer = ByteArray(4096)
        while (true) {
          val size = input.read(buffer)
          if (size < 0) break
          output.write(buffer, 0, size)
          if (output.size() > 131072) return
        }
        output.toString("UTF-8")
      }
      if (cookie != session()) { clear(context); return }
      val raw = JSONObject(body)
      val safe = sanitize(raw).put("updatedAt", System.currentTimeMillis()).put("identity", identity)
      synchronized(lock) {
        val file = cacheFile(context)
        val temporary = File(file.path + ".tmp")
        temporary.writeText(safe.toString())
        if (!temporary.renameTo(file)) temporary.delete()
      }
    } finally {
      connection?.let { active ->
        CompanionSafety.run("widget connection cleanup") { active.disconnect() }
      }
      CompanionSafety.run("widget refresh render") { render(context) }
    }
  }

  fun sanitize(raw: JSONObject): JSONObject {
    if (raw.optString("status") == "no-character") return JSONObject().put("status", "no-character")
    require(raw.has("name") && raw.get("name") is String)
    val safe = JSONObject().put("status", "ready")
    for (key in listOf("name", "avatarUrl", "actions", "actionCap", "funds", "personalHomeLiquid", "homeCurrency", "politicalInfluence", "favorability", "isImperial")) {
      if (raw.has(key) && (key != "avatarUrl" || safeImageUrl(raw.optString(key)) != null)) safe.put(key, raw.get(key))
    }
    for ((key, fields) in mapOf(
      "electionStats" to listOf("electionId", "electionType", "state", "myVotePct", "marginPct", "seatsProjected", "totalSeats", "isMultiSeat", "endTurn"),
      "corpNav" to listOf("sequentialId", "name", "logoUrl", "tickerSymbol", "sharePrice", "priceChange1h", "liquidCapital", "liquidCurrencyCode", "marketingStrength"),
      "turn" to listOf("current", "date", "nextAt", "active"),
      "inbox" to listOf("unread", "mail")
    )) {
      val source = raw.optJSONObject(key) ?: continue
      val child = JSONObject()
      fields.forEach {
        if (source.has(it) && (it != "logoUrl" || safeImageUrl(source.optString(it)) != null)) child.put(it, source.get(it))
      }
      safe.put(key, child)
    }
    // Recent values for the trend lines, newest last.
    for ((key, field) in listOf("electionStats" to "pct", "corpNav" to "sharePrice")) {
      val history = raw.optJSONObject(key)?.optJSONArray("history") ?: continue
      val values = org.json.JSONArray()
      for (index in maxOf(0, history.length() - 12) until history.length()) {
        val value = history.optJSONObject(index)?.optDouble(field, Double.NaN) ?: Double.NaN
        if (value.isFinite()) values.put(value)
      }
      safe.optJSONObject(key)?.put("trend", values)
    }
    raw.optJSONArray("turnBriefing")?.let { source ->
      val changes = org.json.JSONArray()
      for (index in 0 until minOf(source.length(), 5)) {
        val item = source.optJSONObject(index) ?: continue
        val value = item.optDouble("value", Double.NaN)
        val delta = item.optDouble("delta", Double.NaN)
        if (!value.isFinite() || !delta.isFinite()) continue
        changes.put(JSONObject().put("category", item.optString("category").take(20))
          .put("label", item.optString("label").take(80)).put("value", value).put("delta", delta)
          .put("unit", item.optString("unit").take(16)))
      }
      safe.put("turnBriefing", changes)
    }
    raw.optJSONArray("marketWatch")?.let { source ->
      val watched = org.json.JSONArray()
      for (index in 0 until minOf(source.length(), 5)) {
        val item = source.optJSONObject(index) ?: continue
        if (item.optLong("sequentialId", -1) <= 0 || item.optDouble("ownedShares", 0.0) <= 0) continue
        val child = JSONObject()
        for (key in listOf("sequentialId", "name", "logoUrl", "tickerSymbol", "sharePrice", "liquidCurrencyCode", "ownedShares")) {
          if (item.has(key) && (key != "logoUrl" || safeImageUrl(item.optString(key)) != null)) child.put(key, item.get(key))
        }
        watched.put(child)
      }
      safe.put("marketWatch", watched)
    }
    return safe
  }

  private fun safeImageUrl(value: String): String? = CompanionSafety.get("widget image validation", null) {
    val uri = Uri.parse(value)
    val host = uri.host?.lowercase().orEmpty()
    value.takeIf { it.length <= 2048 && uri.scheme == "https" &&
      (host == "ahousedividedgame.com" || host.endsWith(".ahousedividedgame.com") ||
        host == "cdn.discordapp.com" || host.endsWith(".public.blob.vercel-storage.com")) }
  }

  fun page(context: Context, section: String): String? {
    val data = read(context)
    return when (section) {
      "profile" -> "/profile"
      "election" -> data?.optJSONObject("electionStats")?.optString("electionId")
        ?.takeIf { it.matches(Regex("[0-9a-fA-F]{24}")) }?.let { "/elections/$it" } ?: "/elections"
      "corporation" -> data?.optJSONObject("corpNav")?.optLong("sequentialId", -1)
        ?.takeIf { it > 0 }?.let { "/corporation/$it" } ?: "/corporation"
      "stocks" -> data?.optJSONArray("marketWatch")?.optJSONObject(0)?.optLong("sequentialId", -1)
        ?.takeIf { it > 0 }?.let { "/corporation/$it" } ?: "/stockmarket/global"
      "inbox" -> "/notifications"
      else -> null
    }
  }

  /** A bounded path on the game site, or null for anything that could leave it. */
  fun gamePath(value: String?): String? = value?.takeIf { path ->
    path.length <= 300 && path.startsWith("/") && !path.startsWith("//") &&
      path.none { it == '\\' || it.isWhitespace() || it.isISOControl() }
  }

  private fun signed(value: Double, suffix: String = ""): String {
    val text = number(value, suffix)
    return if (value > 0) "+$text" else text
  }

  /** "+12.3% over 6 turns" from the first and last trend values. */
  private fun trend(source: JSONObject?, percent: Boolean): String? {
    val values = source?.optJSONArray("trend") ?: return null
    if (values.length() < 2) return null
    val first = values.optDouble(0)
    val last = values.optDouble(values.length() - 1)
    val change = if (percent) last - first else if (first != 0.0) (last - first) / first * 100 else return null
    if (!change.isFinite()) return null
    return "Trend  ${signed(change, if (percent) " pp" else "%")} over ${values.length()} turns"
  }

  private fun nextTurn(context: Context, data: JSONObject?): String? {
    val turn = data?.optJSONObject("turn") ?: return null
    val current = turn.optDouble("current", Double.NaN)
    val parts = mutableListOf<String>()
    if (current.isFinite()) parts.add("Turn ${current.toLong()}")
    if (!turn.optBoolean("active", true)) parts.add("turns paused")
    else turn.optString("nextAt").takeIf { it.isNotBlank() && it != "null" }?.let { at ->
      val parsed = listOf("yyyy-MM-dd'T'HH:mm:ss.SSSXXX", "yyyy-MM-dd'T'HH:mm:ssXXX").firstNotNullOfOrNull { pattern ->
        CompanionSafety.get("widget turn time", null as java.util.Date?) {
          java.text.SimpleDateFormat(pattern, java.util.Locale.US).parse(at)
        }
      }
      if (parsed != null) {
        parts.add(if (parsed.time <= System.currentTimeMillis()) "next turn running"
          else "next turn at ${android.text.format.DateFormat.getTimeFormat(context).format(parsed)}")
      }
    }
    return parts.takeIf { it.isNotEmpty() }?.joinToString(" \u00b7 ")
  }

  private fun inboxLine(data: JSONObject?): String? {
    val inbox = data?.optJSONObject("inbox") ?: return null
    val unread = inbox.optDouble("unread", 0.0)
    val mail = inbox.optDouble("mail", 0.0)
    if (unread <= 0 && mail <= 0) return "Inbox  all read"
    return "Inbox  " + listOfNotNull(
      if (unread > 0) "${number(inbox, "unread")} unread" else null,
      if (mail > 0) "${number(inbox, "mail")} mail" else null
    ).joinToString(", ")
  }

  private fun number(data: JSONObject?, key: String, suffix: String = ""): String =
    number(data?.optDouble(key, Double.NaN) ?: Double.NaN, suffix)

  private fun number(value: Double, suffix: String = ""): String {
    if (!value.isFinite()) return "Unavailable"
    val formatted = when {
      kotlin.math.abs(value) >= 1_000_000_000 -> DecimalFormat("0.#").format(value / 1_000_000_000) + "B"
      kotlin.math.abs(value) >= 1_000_000 -> DecimalFormat("0.#").format(value / 1_000_000) + "M"
      kotlin.math.abs(value) >= 10_000 -> DecimalFormat("0.#").format(value / 1000) + "K"
      else -> DecimalFormat("#,##0.#").format(value)
    }
    return formatted + suffix
  }

  fun render(context: Context) {
    CompanionSafety.run("widget render") { renderUnsafe(context) }
  }

  private fun renderUnsafe(context: Context) {
    val manager = AppWidgetManager.getInstance(context)
    val data = read(context)
    val age = System.currentTimeMillis() - (data?.optLong("updatedAt") ?: 0)
    val ready = data?.optString("status") == "ready" && age < 86_400_000
    for (id in ids(context)) {
      val selected = section(context, id)
      val views = RemoteViews(context.packageName, R.layout.briefing_widget)
      val currency = data?.optString("homeCurrency", "")?.takeUnless { it == "null" }.orEmpty()
      var title = labels[selected]
      val content = if (!ready) {
        if (data?.optString("status") == "no-character") "Choose a character in the app."
        else if (data != null) "Saved stats expired. Open the app to refresh."
        else "Sign in to Multiplayer in AHDClient."
      } else when (selected) {
        0 -> {
          title = data!!.optString("name").take(100)
          val money = if (currency.isEmpty()) "" else " $currency"
          val cash = "Cash  " + number(data, "personalHomeLiquid", money)
          val lines = if (data.optBoolean("isImperial")) mutableListOf(cash) else mutableListOf(
            "Actions  " + number(data, "actions") + (data.optDouble("actionCap", Double.NaN).takeIf { it.isFinite() }
              ?.let { " / " + number(data, "actionCap") } ?: ""),
            "Campaign funds  " + number(data, "funds", money),
            cash,
            "Favorability  " + number(data, "favorability", "%"),
            "Influence  " + number(data, "politicalInfluence")
          )
          inboxLine(data)?.let { lines.add(it) }
          lines.joinToString("\n")
        }
        1 -> data!!.optJSONObject("electionStats")?.let { election ->
          election.optString("electionType").takeIf { it.isNotBlank() && it != "null" }?.let { type ->
            title = listOf(type, election.optString("state").takeIf { it.isNotBlank() && it != "null" })
              .filterNotNull().joinToString(" \u00b7 ").take(100)
          }
          val lines = mutableListOf("Vote share  ${number(election, "myVotePct", "%")}",
            "Margin  ${number(election, "marginPct", " pp")}")
          if (election.optBoolean("isMultiSeat")) lines.add("Projected seats  ${number(election, "seatsProjected")}" +
            (election.optDouble("totalSeats", Double.NaN).takeIf { it.isFinite() }?.let { " / " + number(election, "totalSeats") } ?: ""))
          trend(election, true)?.let { lines.add(it) }
          val end = election.optDouble("endTurn", Double.NaN)
          val now = data.optJSONObject("turn")?.optDouble("current", Double.NaN) ?: Double.NaN
          if (end.isFinite() && now.isFinite() && end > now) {
            val left = (end - now).toLong()
            lines.add("Polls close  " + if (left == 1L) "next turn" else "in $left turns")
          }
          lines.joinToString("\n")
        } ?: "No election tally available yet."
        2 -> data!!.optJSONObject("corpNav")?.let { corp ->
          title = corp.optString("name").take(100)
          val ccy = corp.optString("liquidCurrencyCode", "").takeUnless { it == "null" }.orEmpty()
          val suffix = if (ccy.isEmpty()) "" else " $ccy"
          val change = corp.optDouble("priceChange1h", Double.NaN)
          listOfNotNull("Share price  ${number(corp, "sharePrice", suffix)}" +
            (if (change.isFinite()) "  (${signed(change, "%")})" else ""),
            "Capital  ${number(corp, "liquidCapital", suffix)}",
            "Marketing  ${number(corp, "marketingStrength")}",
            trend(corp, false)).joinToString("\n")
        } ?: "Your character does not lead a corporation."
        else -> data!!.optJSONArray("marketWatch")?.takeIf { it.length() > 0 }?.let { holdings ->
          title = if (holdings.length() > 1) "Your holdings" else holdings.optJSONObject(0)?.let { corp ->
            corp.optString("tickerSymbol").takeIf { it.isNotBlank() && it != "null" }?.let { "\$$it" }
              ?: corp.optString("name").take(100)
          } ?: "Stocks"
          (0 until minOf(holdings.length(), 5)).mapNotNull { holdings.optJSONObject(it) }.joinToString("\n") { corp ->
            val ccy = corp.optString("liquidCurrencyCode", "").takeUnless { it == "null" }.orEmpty()
            val name = corp.optString("tickerSymbol").takeIf { it.isNotBlank() && it != "null" }?.let { "\$$it" }
              ?: corp.optString("name").take(24)
            "$name  ${number(corp, "sharePrice", if (ccy.isEmpty()) "" else " $ccy")} \u00b7 ${number(corp, "ownedShares")} shares"
          }
        } ?: "Buy shares to populate your private market watch."
      }
      views.setTextViewText(R.id.briefing_title, title)
      views.setTextViewText(R.id.briefing_content, content)
      views.setTextViewText(R.id.briefing_updated, if (ready) {
        val mins = (age / 60000).coerceAtLeast(0)
        listOfNotNull(nextTurn(context, data), if (mins < 1) "updated just now" else "updated ${mins}m ago")
          .joinToString(" \u00b7 ").replaceFirstChar { it.uppercase() }
      } else "Multiplayer")
      views.setTextViewText(R.id.briefing_section, "${labels[selected]} \u00b7 ${selected + 1} of ${sections.size}")
      val open = Intent(context, MainActivity::class.java).setAction(Intent.ACTION_VIEW)
        .setData(Uri.parse("ahdclient://briefing/${sections[selected]}"))
      views.setOnClickPendingIntent(R.id.briefing_content_area, PendingIntent.getActivity(context, id, open,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
      for ((view, action) in listOf(R.id.briefing_next to NEXT, R.id.briefing_previous to PREVIOUS, R.id.briefing_refresh to REFRESH)) {
        val provider = manager.getAppWidgetInfo(id)?.provider ?: continue
        val intent = Intent(action).setComponent(provider).putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id)
          .setData(Uri.parse("ahdclient://widget/$id/${action.substringAfterLast('.')}"))
        views.setOnClickPendingIntent(view, PendingIntent.getBroadcast(context, id, intent,
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
      }
      manager.updateAppWidget(id, views)
    }
  }
}

class BriefingRefreshJob : JobService() {
  private val executor = Executors.newSingleThreadExecutor()
  private var task: Future<*>? = null
  override fun onStartJob(params: JobParameters): Boolean {
    val submitted = CompanionSafety.get("widget job start", null as Future<*>?) {
      executor.submit {
        try {
          BriefingWidgets.refresh(applicationContext)
        } finally {
          CompanionSafety.run("widget job finish") { jobFinished(params, false) }
        }
      }
    }
    task = submitted
    return submitted != null
  }
  override fun onStopJob(params: JobParameters): Boolean {
    CompanionSafety.run("widget job stop") { task?.cancel(true) }
    return false
  }
  override fun onDestroy() {
    CompanionSafety.run("widget executor shutdown") { executor.shutdownNow() }
    super.onDestroy()
  }
}
