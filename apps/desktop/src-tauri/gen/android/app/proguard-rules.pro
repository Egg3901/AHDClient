# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile
# wry's generated WebView glue is called from Rust over JNI, so R8 cannot see
# the callers. wry's own keep list (proguard-wry.pro) omits RustWebView
# methods such as getCookies, and minified release builds crashed on launch
# with NoSuchMethodError on every device (ticket 1387). Keep every member of
# the JNI-facing classes.
-keep class net.lakesidegames.ahdclient.RustWebView { *; }
-keep class net.lakesidegames.ahdclient.RustWebViewClient { *; }
-keep class net.lakesidegames.ahdclient.RustWebChromeClient { *; }
-keep class net.lakesidegames.ahdclient.Ipc { *; }
-keep class net.lakesidegames.ahdclient.WryActivity { *; }
-keep class net.lakesidegames.ahdclient.TauriActivity { *; }
-keep class net.lakesidegames.ahdclient.Logger { *; }
-keep class net.lakesidegames.ahdclient.PermissionHelper { *; }
-keep class net.lakesidegames.ahdclient.MainActivity { *; }
