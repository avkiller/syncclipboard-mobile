package expo.modules.clipboardoverlay

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.PixelFormat
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.Base64
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.ByteArrayOutputStream

class ClipboardOverlayModule : Module() {

    companion object {
        private const val RETRY_DELAY_MS = 10L  // Short interval like AutoJs6 to minimize focus steal time
        private const val DEFAULT_MAX_RETRIES = 5
    }

    private var debugMode = false
    private var maxRetries = DEFAULT_MAX_RETRIES

    override fun definition() = ModuleDefinition {
        Name("ClipboardOverlayModule")

        Function("setDebugMode") { enabled: Boolean ->
            debugMode = enabled
            true
        }

        Function("setMaxRetries") { retries: Int ->
            maxRetries = retries.coerceIn(1, 50)
            true
        }

        Function("hasOverlayPermission") {
            val context = appContext.reactContext ?: return@Function false
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                Settings.canDrawOverlays(context)
            } else {
                true
            }
        }

        Function("requestOverlayPermission") {
            val context = appContext.reactContext ?: return@Function false
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val intent = Intent(
                    Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:${context.packageName}")
                ).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(intent)
            }
            true
        }

        AsyncFunction("getStringViaOverlay") { promise: Promise ->
            withOverlayClipboard("getStringViaOverlay", promise) { context, clip ->
                if (clip != null && clip.itemCount > 0) {
                    val text = clip.getItemAt(0).coerceToText(context)?.toString() ?: ""
                    promise.resolve(text)
                } else {
                    promise.resolve("")
                }
            }
        }

        AsyncFunction("hasStringViaOverlay") { promise: Promise ->
            withOverlayClipboard("hasStringViaOverlay", promise) { _, clip ->
                if (clip != null && clip.itemCount > 0) {
                    val desc = clip.description
                    val hasText = desc.hasMimeType("text/*") ||
                        clip.getItemAt(0).text != null
                    promise.resolve(hasText)
                } else {
                    promise.resolve(false)
                }
            }
        }

        AsyncFunction("hasImageViaOverlay") { promise: Promise ->
            withOverlayClipboard("hasImageViaOverlay", promise) { _, clip ->
                if (clip != null && clip.itemCount > 0) {
                    val desc = clip.description
                    val hasImage = desc.hasMimeType("image/*")
                    promise.resolve(hasImage)
                } else {
                    promise.resolve(false)
                }
            }
        }

        AsyncFunction("getImageViaOverlay") { promise: Promise ->
            withOverlayClipboard("getImageViaOverlay", promise) { context, clip ->
                if (clip == null || clip.itemCount == 0) {
                    promise.resolve(null)
                    return@withOverlayClipboard
                }

                val item = clip.getItemAt(0)
                val uri = item.uri
                if (uri == null) {
                    promise.resolve(null)
                    return@withOverlayClipboard
                }

                try {
                    val mimeType = context.contentResolver.getType(uri)
                    if (mimeType == null || !mimeType.startsWith("image/")) {
                        promise.resolve(null)
                        return@withOverlayClipboard
                    }

                    val inputStream = context.contentResolver.openInputStream(uri)
                    if (inputStream == null) {
                        promise.resolve(null)
                        return@withOverlayClipboard
                    }

                    val bitmap = BitmapFactory.decodeStream(inputStream)
                    inputStream.close()

                    if (bitmap == null) {
                        promise.resolve(null)
                        return@withOverlayClipboard
                    }

                    val width = bitmap.width
                    val height = bitmap.height
                    val baos = ByteArrayOutputStream()
                    bitmap.compress(Bitmap.CompressFormat.PNG, 100, baos)
                    val base64Data = Base64.encodeToString(baos.toByteArray(), Base64.NO_WRAP)
                    bitmap.recycle()

                    val result = mapOf(
                        "data" to base64Data,
                        "size" to mapOf(
                            "width" to width,
                            "height" to height
                        )
                    )
                    promise.resolve(result)
                } catch (e: Exception) {
                    promise.resolve(null)
                }
            }
        }
    }

    /**
     * Reads the primary clip with fast retry logic.
     * Uses short intervals (10ms like AutoJs6) to minimize time the window has focus.
     */
    private fun readClipWithRetry(
        context: Context,
        handler: Handler,
        attempt: Int,
        callback: (ClipData?) -> Unit
    ) {
        val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        val clip = cm.primaryClip
        if (clip != null || attempt >= maxRetries) {
            callback(clip)
        } else {
            handler.postDelayed({
                readClipWithRetry(context, handler, attempt + 1, callback)
            }, RETRY_DELAY_MS)
        }
    }

    /**
     * Creates a 1px transparent overlay window, reads the clipboard, then immediately closes.
     *
     * Following AutoJs6's pattern:
     * 1. Create window WITH FLAG_NOT_FOCUSABLE (won't steal focus from foreground app)
     * 2. After window attached, temporarily REMOVE FLAG_NOT_FOCUSABLE via updateViewLayout
     *    (like AutoJs6's requestWindowFocus — only flag manipulation + requestLayout, NO view.requestFocus)
     * 3. Read clipboard with retry
     * 4. Immediately close window (focus returns to foreground app)
     */
    private fun withOverlayClipboard(
        tag: String,
        promise: Promise,
        action: (Context, ClipData?) -> Unit
    ) {
        val context = appContext.reactContext
        if (context == null) {
            promise.reject("ERR_NO_CONTEXT", "React context is null", null)
            return
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(context)) {
            promise.reject("ERR_NO_PERMISSION", "Overlay permission not granted", null)
            return
        }

        val handler = Handler(Looper.getMainLooper())
        handler.post {
            var overlayView: View? = null
            var windowManager: WindowManager? = null
            try {
                windowManager = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
                overlayView = View(context).apply {
                    isFocusable = true
                    isFocusableInTouchMode = true
                }

                val layoutType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                } else {
                    @Suppress("DEPRECATION")
                    WindowManager.LayoutParams.TYPE_PHONE
                }

                // Debug mode: large visible red overlay; Normal mode: 1px transparent
                val overlaySize = if (debugMode) 200 else 1

                if (debugMode) {
                    overlayView.setBackgroundColor(0xFFFF0000.toInt())
                }

                // Step 1: Create window with FLAG_NOT_FOCUSABLE — won't steal focus
                val params = WindowManager.LayoutParams(
                    overlaySize, overlaySize,
                    layoutType,
                    WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                        WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
                    PixelFormat.TRANSLUCENT
                ).apply {
                    alpha = if (debugMode) 0.7f else 0f
                    gravity = Gravity.START or Gravity.TOP
                    x = 0
                    y = 0
                }

                windowManager.addView(overlayView, params)

                val wm = windowManager
                val view = overlayView

                // Step 2: After window is attached, remove FLAG_NOT_FOCUSABLE
                // Like AutoJs6's requestWindowFocus(): only flag manipulation + requestLayout
                // Do NOT call view.requestFocus() — that steals input focus and interrupts foreground
                view.post {
                    params.flags = params.flags and WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE.inv()
                    wm.updateViewLayout(view, params)
                    view.requestLayout()

                    // Step 3: Read clipboard with retry, then close immediately
                    readClipWithRetry(context, handler, 0) { clip ->
                        try {
                            action(context, clip)
                        } catch (e: Exception) {
                            promise.reject("ERR_OVERLAY_$tag", e.message ?: "Unknown error", e)
                        } finally {
                            // Step 4: Close window immediately — focus returns to foreground app
                            try {
                                wm.removeView(view)
                            } catch (_: Exception) {}
                        }
                    }
                }
            } catch (e: Exception) {
                try {
                    if (overlayView != null && windowManager != null) {
                        windowManager.removeView(overlayView)
                    }
                } catch (_: Exception) {}
                promise.reject("ERR_OVERLAY_$tag", e.message ?: "Unknown error", e)
            }
        }
    }
}
