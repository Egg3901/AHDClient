package net.lakesidegames.briefing

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.webkit.CookieManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.concurrent.Executors

object NativePush {
  private const val ORIGIN = "https://ahousedividedgame.com"
  private const val CHANNEL = "ahd-inbox"
  private const val NOTIFICATION_ID = 21002
  private val lock = Any()
  private val worker = Executors.newSingleThreadExecutor()
  private var busy = false
  private var tokenPending = false
  private var nextAttempt = 0L
  private var statusMessage = "Turn on alerts for new inbox activity."

  private fun file(context: Context) = File(context.noBackupFilesDir, "native-push.json")
  private fun read(context: Context): JSONObject = try { JSONObject(file(context).readText()) } catch (_: Exception) { JSONObject() }
  private fun save(context: Context, state: JSONObject) {
    val destination = file(context)
    val temporary = File(destination.parentFile, "native-push.tmp")
    temporary.writeText(state.toString())
    if (!temporary.renameTo(destination)) throw IllegalStateException("Could not save push preferences")
  }
  private fun digest(value: String) = MessageDigest.getInstance("SHA-256").digest(value.toByteArray()).joinToString("") { "%02x".format(it) }
  private fun session(): String = (CookieManager.getInstance().getCookie("$ORIGIN/api/push/device") ?: "")
    .split(';').map { it.trim() }.filter {
      val name = it.substringBefore('=')
      name == "auth-token" || Regex("auth-token-[A-Za-z0-9-]+").matches(name) ||
        Regex("(__Secure-)?(authjs|next-auth)\\.session-token(\\.[0-9]+)?").matches(name)
    }.sorted().joinToString("; ")
  fun permitted(context: Context) = NotificationManagerCompat.from(context).areNotificationsEnabled()
  private fun available(context: Context) = try { FirebaseApp.initializeApp(context) != null } catch (_: Exception) { false }

  fun status(context: Context): JSONObject = synchronized(lock) {
    val state = read(context)
    val header = session()
    JSONObject().put("enabled", state.optBoolean("enabled")).put("permissionGranted", permitted(context))
      .put("available", available(context)).put("registered", header.isNotEmpty() && permitted(context) &&
        state.optBoolean("enabled") && state.optString("registeredSession") == digest(header))
      .put("message", statusMessage)
  }
  fun setEnabled(context: Context, enabled: Boolean) = synchronized(lock) {
    val state = read(context)
    state.put("enabled", enabled)
    if (!state.has("installation")) {
      val bytes = ByteArray(32); SecureRandom().nextBytes(bytes)
      state.put("installation", bytes.joinToString("") { "%02x".format(it) })
    }
    if (!enabled) {
      state.remove("registeredSession")
      NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID)
    }
    save(context, state)
    if (!enabled && FirebaseApp.getApps(context).isNotEmpty()) {
      FirebaseMessaging.getInstance().isAutoInitEnabled = false
    }
    nextAttempt = 0
  }
  fun tokenChanged(context: Context, token: String) {
    synchronized(lock) {
      val state = read(context); state.put("token", token); state.remove("registeredSession")
      save(context, state); nextAttempt = 0
    }
    sync(context, true)
  }
  fun sync(context: Context, force: Boolean = false) {
    val app = context.applicationContext
    synchronized(lock) {
      val state = read(app)
      val header = session()
      val fingerprint = if (header.isEmpty()) "" else digest(header)
      if (state.optString("observedSession", state.optString("registeredSession")) != fingerprint) {
        state.put("observedSession", fingerprint); nextAttempt = 0
        state.remove("registeredSession"); state.put("needsRevoke", state.optBoolean("mayBeRegistered")); save(app, state)
        NotificationManagerCompat.from(app).cancel(NOTIFICATION_ID)
      }
      val enabled = state.optBoolean("enabled") && permitted(app)
      if (!enabled || header.isEmpty()) {
        statusMessage = if (!state.optBoolean("enabled")) "Push alerts are off." else if (!permitted(app))
          "Allow notifications in Android Settings, then return here." else "Sign in to multiplayer to receive alerts."
        NotificationManagerCompat.from(app).cancel(NOTIFICATION_ID)
      } else if (!available(app)) { statusMessage = "Push is unavailable in this build."; return }
      if (enabled && header.isNotEmpty() && state.optString("token").isEmpty() && !tokenPending) {
        tokenPending = true
        FirebaseMessaging.getInstance().isAutoInitEnabled = true
        FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
          synchronized(lock) { tokenPending = false }
          if (task.isSuccessful) tokenChanged(app, task.result)
          else synchronized(lock) { statusMessage = "Could not contact Google Play services. Try again when online." }
        }
        return
      }
      if (busy || (!force && System.currentTimeMillis() < nextAttempt)) return
      val register = enabled && header.isNotEmpty() && state.optString("token").isNotEmpty() && !state.optBoolean("needsRevoke")
      if (!state.has("installation") || (!register && !state.optBoolean("mayBeRegistered"))) return
      val body = JSONObject().put("installation", state.getString("installation"))
      if (register) body.put("provider", "fcm").put("token", state.getString("token")).put("environment", "production")
      // Persist revocation intent before networking, including registration whose response may be lost.
      if (register) state.put("mayBeRegistered", true)
      save(app, state)
      busy = true
      nextAttempt = System.currentTimeMillis() + 60_000
      if (register) statusMessage = "Connecting push alerts..."
      val permittedAtSend = permitted(app)
      worker.execute {
        val code = send(if (register) "POST" else "DELETE", body, if (register) header else "")
        synchronized(lock) {
          busy = false
          val latest = read(app)
          val stillCurrent = session() == header && latest.optBoolean("enabled") == state.optBoolean("enabled") &&
            latest.optString("token") == state.optString("token") && permitted(app) == permittedAtSend
          if (!stillCurrent) {
            nextAttempt = 0
          } else if (code == 200) {
            if (register) {
              latest.put("registeredSession", fingerprint)
              nextAttempt = System.currentTimeMillis() + 12 * 60 * 60_000
              statusMessage = "Push alerts are on. Inbox mutes and snoozes apply."
            } else {
              latest.remove("registeredSession"); latest.put("mayBeRegistered", false); latest.put("needsRevoke", false)
              nextAttempt = 0
            }
            save(app, latest)
          } else if (register) {
            latest.remove("registeredSession"); save(app, latest)
            statusMessage = when (code) {
              401, 403 -> "Sign in to multiplayer to receive alerts."
              503 -> "Push delivery is not available yet. We will retry automatically."
              else -> "Could not connect. We will retry when online."
            }
          }
        }
      }
    }
  }
  private fun send(method: String, body: JSONObject, header: String): Int = try {
    val connection = URL("$ORIGIN/api/push/device").openConnection() as HttpURLConnection
    try {
      connection.requestMethod = method; connection.instanceFollowRedirects = false
      connection.connectTimeout = 6000; connection.readTimeout = 6000; connection.doOutput = true
      connection.setRequestProperty("Content-Type", "application/json")
      if (header.isNotEmpty()) connection.setRequestProperty("Cookie", header)
      connection.outputStream.use { it.write(body.toString().toByteArray()) }
      connection.responseCode
    } finally { connection.disconnect() }
  } catch (_: Exception) { 0 }

  fun show(context: Context, message: RemoteMessage) {
    synchronized(lock) {
      val state = read(context)
      val header = session()
      if (!state.optBoolean("enabled") || !permitted(context) || header.isEmpty() ||
        state.optString("registeredSession") != digest(header) || message.data["path"] != "/notifications") return
      val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      if (Build.VERSION.SDK_INT >= 26) manager.createNotificationChannel(NotificationChannel(CHANNEL, "Inbox activity", NotificationManager.IMPORTANCE_DEFAULT))
      val intent = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return
      intent.data = Uri.parse("ahdclient://inbox")
      intent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      val pending = PendingIntent.getActivity(context, NOTIFICATION_ID, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
      val icon = context.resources.getIdentifier("ic_stat_ahd", "drawable", context.packageName)
      val notification = NotificationCompat.Builder(context, CHANNEL).setSmallIcon(icon)
        .setContentTitle("A House Divided").setContentText("You have new activity. Open your inbox to catch up.")
        .setContentIntent(pending).setAutoCancel(true).setOnlyAlertOnce(true)
        .setVisibility(NotificationCompat.VISIBILITY_PRIVATE).build()
      try { manager.notify(NOTIFICATION_ID, notification) } catch (_: SecurityException) { }
    }
  }
}
class PushService : FirebaseMessagingService() {
  override fun onNewToken(token: String) { NativePush.tokenChanged(this, token) }
  override fun onMessageReceived(message: RemoteMessage) { NativePush.show(this, message) }
}
