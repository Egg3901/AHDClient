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
    BriefingWidgets.render(context)
    BriefingWidgets.schedule(context)
  }

  override fun onReceive(context: Context, intent: Intent) {
    super.onReceive(context, intent)
    when (intent.action) {
      BriefingWidgets.NEXT, BriefingWidgets.PREVIOUS -> {
        val id = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, -1)
        if (!BriefingWidgets.ids(context).contains(id)) return
        val current = BriefingWidgets.section(context, id)
        val delta = if (intent.action == BriefingWidgets.NEXT) 1 else 2
        context.getSharedPreferences("briefing-widget-prefs", Context.MODE_PRIVATE).edit()
          .putInt("section-$id", (current + delta) % 3).apply()
        BriefingWidgets.render(context)
      }
      BriefingWidgets.REFRESH -> BriefingWidgets.schedule(context)
    }
  }

  override fun onDeleted(context: Context, ids: IntArray) {
    val prefs = context.getSharedPreferences("briefing-widget-prefs", Context.MODE_PRIVATE).edit()
    ids.forEach { prefs.remove("section-$it") }
    prefs.apply()
  }

  override fun onDisabled(context: Context) {
    if (BriefingWidgets.ids(context).isEmpty()) {
      context.getSystemService(JobScheduler::class.java).cancel(BriefingWidgets.JOB_ID)
      BriefingWidgets.clear(context)
    }
  }
}

class ProfileWidget : BriefingWidget()
class ElectionWidget : BriefingWidget()
class CorporationWidget : BriefingWidget()

object BriefingWidgets {
  const val JOB_ID = 21001
  const val NEXT = "net.lakesidegames.ahdclient.widget.NEXT"
  const val PREVIOUS = "net.lakesidegames.ahdclient.widget.PREVIOUS"
  const val REFRESH = "net.lakesidegames.ahdclient.widget.REFRESH"
  const val ORIGIN = "https://ahousedividedgame.com"
  val sections = listOf("profile", "election", "corporation")
  private val providers = listOf(ProfileWidget::class.java, ElectionWidget::class.java, CorporationWidget::class.java)
  private val lock = Any()

  fun ids(context: Context): List<Int> = providers.flatMap {
    AppWidgetManager.getInstance(context).getAppWidgetIds(ComponentName(context, it)).toList()
  }

  fun section(context: Context, id: Int): Int {
    val provider = AppWidgetManager.getInstance(context).getAppWidgetInfo(id)?.provider?.className
    val default = providers.indexOfFirst { it.name == provider }.coerceAtLeast(0)
    return context.getSharedPreferences("briefing-widget-prefs", Context.MODE_PRIVATE)
      .getInt("section-$id", default).coerceIn(0, 2)
  }

  fun schedule(context: Context) {
    if (ids(context).isEmpty()) return
    val scheduler = context.getSystemService(JobScheduler::class.java)
    if (scheduler.getPendingJob(JOB_ID) != null) return
    scheduler.schedule(JobInfo.Builder(JOB_ID, ComponentName(context, BriefingRefreshJob::class.java))
      .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setMinimumLatency(0).build())
  }

  private fun cacheFile(context: Context) = File(context.noBackupFilesDir, "multiplayer-briefing.json")
  fun clear(context: Context) = synchronized(lock) { cacheFile(context).delete(); Unit }
  private fun read(context: Context): JSONObject? = synchronized(lock) {
    try {
      val data = JSONObject(cacheFile(context).readText())
      val cookie = session()
      if (cookie.isNotEmpty() && data.optString("identity") == fingerprint(cookie)) data else null
    } catch (_: Exception) { null }
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
    val cookie = session()
    val identity = fingerprint(cookie)
    if (cookie.isEmpty()) { clear(context); render(context); return }
    if (read(context)?.optString("identity") != identity) { clear(context); render(context) }
    val connection = URL("$ORIGIN/api/client-status?layout=full").openConnection() as HttpURLConnection
    try {
      connection.connectTimeout = 6000
      connection.readTimeout = 6000
      connection.instanceFollowRedirects = false
      connection.useCaches = false
      connection.setRequestProperty("Cookie", cookie)
      connection.setRequestProperty("X-AHD-Client-Version", BuildConfig.VERSION_NAME)
      connection.setRequestProperty("Cache-Control", "no-cache")
      val status = connection.responseCode
      if (cookie != session()) { clear(context); return }
      if (status == 401 || status == 403) { clear(context); return }
      if (status != 200) return
      val body = connection.inputStream.use { input ->
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
    } catch (_: Exception) {
      // Keep the last snapshot with its original timestamp. No credentials or
      // response content may enter a log, intent, preference or backup.
    } finally {
      connection.disconnect()
      render(context)
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
      "electionStats" to listOf("electionId", "myVotePct", "marginPct", "seatsProjected", "totalSeats", "isMultiSeat"),
      "corpNav" to listOf("sequentialId", "name", "logoUrl", "tickerSymbol", "sharePrice", "priceChange1h", "liquidCapital", "liquidCurrencyCode", "marketingStrength")
    )) {
      val source = raw.optJSONObject(key) ?: continue
      val child = JSONObject()
      fields.forEach {
        if (source.has(it) && (it != "logoUrl" || safeImageUrl(source.optString(it)) != null)) child.put(it, source.get(it))
      }
      safe.put(key, child)
    }
    return safe
  }

  private fun safeImageUrl(value: String): String? = try {
    value.takeIf { it.length <= 2048 && Uri.parse(it).scheme == "https" }
  } catch (_: Exception) { null }

  fun page(context: Context, section: String): String? {
    val data = read(context)
    return when (section) {
      "profile" -> "/profile"
      "election" -> data?.optJSONObject("electionStats")?.optString("electionId")
        ?.takeIf { it.matches(Regex("[0-9a-fA-F]{24}")) }?.let { "/elections/$it" } ?: "/elections"
      "corporation" -> data?.optJSONObject("corpNav")?.optLong("sequentialId", -1)
        ?.takeIf { it > 0 }?.let { "/corporation/$it" } ?: "/corporation"
      else -> null
    }
  }

  private fun number(data: JSONObject?, key: String, suffix: String = ""): String {
    val value = data?.optDouble(key, Double.NaN) ?: Double.NaN
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
    val manager = AppWidgetManager.getInstance(context)
    val data = read(context)
    val age = System.currentTimeMillis() - (data?.optLong("updatedAt") ?: 0)
    val ready = data?.optString("status") == "ready" && age < 86_400_000
    for (id in ids(context)) {
      val selected = section(context, id)
      val views = RemoteViews(context.packageName, R.layout.briefing_widget)
      val currency = data?.optString("homeCurrency", "")?.takeUnless { it == "null" }.orEmpty()
      var title = listOf("Profile", "Election", "Corporation")[selected]
      val content = if (!ready) {
        if (data?.optString("status") == "no-character") "Choose a character in the app."
        else if (data != null) "Saved stats expired. Open the app to refresh."
        else "Sign in to Multiplayer in AHDClient."
      } else when (selected) {
        0 -> {
          title = data!!.optString("name").take(100)
          val cash = "Cash  " + number(data, "personalHomeLiquid", if (currency.isEmpty()) "" else " $currency")
          if (data.optBoolean("isImperial")) cash else listOf(
            "Actions  " + number(data, "actions"),
            "Campaign funds  " + number(data, "funds", if (currency.isEmpty()) "" else " $currency"),
            cash,
            "Favorability  " + number(data, "favorability", "%")
          ).joinToString("\n")
        }
        1 -> data!!.optJSONObject("electionStats")?.let { election ->
          "Vote share  ${number(election, "myVotePct", "%")}\nMargin  ${number(election, "marginPct", " pp")}" +
            if (election.optBoolean("isMultiSeat")) "\nProjected seats  ${number(election, "seatsProjected")}" else ""
        } ?: "No election tally available yet."
        else -> data!!.optJSONObject("corpNav")?.let { corp ->
          title = corp.optString("name").take(100)
          val ccy = corp.optString("liquidCurrencyCode", "").takeUnless { it == "null" }.orEmpty()
          val suffix = if (ccy.isEmpty()) "" else " $ccy"
          "Share price  ${number(corp, "sharePrice", suffix)}\nChange  ${number(corp, "priceChange1h", "%")}\nCapital  ${number(corp, "liquidCapital", suffix)}"
        } ?: "Your character does not lead a corporation."
      }
      views.setTextViewText(R.id.briefing_title, title)
      views.setTextViewText(R.id.briefing_content, content)
      views.setTextViewText(R.id.briefing_updated, if (ready) {
        val mins = (age / 60000).coerceAtLeast(0)
        if (mins < 1) "Updated just now" else "Updated ${mins}m ago"
      } else "Multiplayer")
      views.setTextViewText(R.id.briefing_section, "${selected + 1} / 3")
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
    task = executor.submit {
      BriefingWidgets.refresh(applicationContext)
      jobFinished(params, false)
    }
    return true
  }
  override fun onStopJob(params: JobParameters): Boolean {
    task?.cancel(true)
    return false
  }
  override fun onDestroy() { executor.shutdownNow(); super.onDestroy() }
}
