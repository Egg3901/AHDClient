package net.lakesidegames.briefing

import android.util.Log

/** Failure boundary for optional push and Ask integrations. */
internal object NativeSafety {
  private const val TAG = "AHDClient.Native"

  fun run(operation: String, block: () -> Unit): Boolean {
    return try {
      block()
      true
    } catch (error: Throwable) {
      rethrowFatal(error)
      Log.w(TAG, "optional native feature failed: $operation (${error.javaClass.simpleName})")
      false
    }
  }

  fun <T> get(operation: String, fallback: T, block: () -> T): T {
    return try {
      block()
    } catch (error: Throwable) {
      rethrowFatal(error)
      Log.w(TAG, "optional native feature failed: $operation (${error.javaClass.simpleName})")
      fallback
    }
  }

  private fun rethrowFatal(error: Throwable) {
    if (error is ThreadDeath || error is VirtualMachineError) throw error
  }
}
