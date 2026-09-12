package net.lakesidegames.ahdclient

import android.util.Log

/**
 * Failure boundary for optional native companions such as widgets.
 *
 * Android can deliver widget callbacks before the main activity has started,
 * and some device WebView or JobScheduler implementations throw linkage and
 * state errors rather than ordinary Exceptions. Those features must never
 * take down the launcher. Catastrophic VM and thread termination errors still
 * propagate so this helper cannot conceal an unrecoverable process failure.
 */
object CompanionSafety {
  private const val TAG = "AHDClient"

  fun run(operation: String, block: () -> Unit): Boolean {
    return try {
      block()
      true
    } catch (error: Throwable) {
      rethrowFatal(error)
      Log.w(TAG, "optional companion failed: $operation (${error.javaClass.simpleName})")
      false
    }
  }

  fun <T> get(operation: String, fallback: T, block: () -> T): T {
    return try {
      block()
    } catch (error: Throwable) {
      rethrowFatal(error)
      Log.w(TAG, "optional companion failed: $operation (${error.javaClass.simpleName})")
      fallback
    }
  }

  private fun rethrowFatal(error: Throwable) {
    if (error is ThreadDeath || error is VirtualMachineError) throw error
  }
}
