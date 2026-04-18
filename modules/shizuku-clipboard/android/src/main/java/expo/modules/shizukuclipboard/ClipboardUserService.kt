package expo.modules.shizukuclipboard

import android.content.ClipData
import android.content.ClipDescription
import android.os.IBinder
import java.lang.reflect.Method

/**
 * ClipboardUserService — 运行在 Shizuku 进程（UID 2000/shell）中
 *
 * 在 Shizuku 的进程中，没有隐藏 API 限制，可以自由反射调用 IClipboard 的方法。
 * 通过 ServiceManager 获取 clipboard binder，然后反射调用 getPrimaryClip 等方法。
 */
class ClipboardUserService : IClipboardUserService.Stub() {

    companion object {
        private const val TAG = "ShizukuClipboard.UserService"
        // UserService 以 UID 2000 (shell) 运行，需要使用 shell 的包名
        private const val PACKAGE_NAME = "com.android.shell"

        private var clipboardService: Any? = null

        private fun getClipboardService(): Any? {
            if (clipboardService != null) return clipboardService
            return try {
                // 在 Shizuku 进程中，通过 ServiceManager 获取 clipboard service
                val serviceManager = Class.forName("android.os.ServiceManager")
                val getService = serviceManager.getMethod("getService", String::class.java)
                val binder = getService.invoke(null, "clipboard") as? IBinder
                if (binder == null) {
                    android.util.Log.e(TAG, "ServiceManager returned null for clipboard")
                    return null
                }
                val iClipboardStub = Class.forName("android.content.IClipboard\$Stub")
                val asInterface = iClipboardStub.getMethod("asInterface", IBinder::class.java)
                clipboardService = asInterface.invoke(null, binder)
                android.util.Log.d(TAG, "Got clipboard service: ${clipboardService?.javaClass?.name}")
                clipboardService
            } catch (e: Exception) {
                android.util.Log.e(TAG, "Failed to get clipboard service", e)
                null
            }
        }

        /**
         * 动态查找并调用剪贴板方法
         */
        private fun findAndInvokeMethod(clipboard: Any, methodName: String): Any? {
            val clazz = clipboard.javaClass
            val methods = clazz.methods
                .filter { it.name == methodName }
                .sortedByDescending { it.parameterCount }

            for (method in methods) {
                val params = method.parameterTypes
                val args = buildArgs(params) ?: continue
                // 将第一个 String 参数设为 packageName
                for (i in params.indices) {
                    if (params[i] == String::class.java) {
                        args[i] = PACKAGE_NAME
                        break
                    }
                }
                return try {
                    android.util.Log.d(TAG, "Calling ${method.name}(${params.joinToString { it.simpleName }}) with args=${args.joinToString()}")
                    method.invoke(clipboard, *args)
                } catch (e: Exception) {
                    android.util.Log.e(TAG, "Failed to invoke $methodName with ${params.size} params", e)
                    if (e is java.lang.reflect.InvocationTargetException) {
                        android.util.Log.e(TAG, "  cause: ${e.cause}", e.cause)
                    }
                    null
                }
            }
            android.util.Log.e(TAG, "No suitable method found: $methodName")
            return null
        }

        private fun buildArgs(paramTypes: Array<Class<*>>): Array<Any?>? {
            return try {
                paramTypes.map { type ->
                    when {
                        type == String::class.java -> null
                        type == Int::class.javaPrimitiveType || type == Int::class.java -> 0
                        type == Long::class.javaPrimitiveType || type == Long::class.java -> 0L
                        type == Boolean::class.javaPrimitiveType || type == Boolean::class.java -> false
                        else -> return null
                    }
                }.toTypedArray()
            } catch (e: Exception) {
                null
            }
        }
    }

    override fun getPrimaryClipText(): String {
        return try {
            val clipboard = getClipboardService() ?: return ""
            val clip = findAndInvokeMethod(clipboard, "getPrimaryClip") as? ClipData
            if (clip != null && clip.itemCount > 0) {
                val text = clip.getItemAt(0).text?.toString() ?: ""
                android.util.Log.d(TAG, "getPrimaryClipText: length=${text.length}")
                text
            } else {
                android.util.Log.d(TAG, "getPrimaryClipText: clip is null or empty")
                ""
            }
        } catch (e: Exception) {
            android.util.Log.e(TAG, "getPrimaryClipText failed", e)
            ""
        }
    }

    override fun hasPrimaryClipText(): Boolean {
        return try {
            val clipboard = getClipboardService() ?: return false
            val desc = findAndInvokeMethod(clipboard, "getPrimaryClipDescription") as? ClipDescription
            desc?.hasMimeType("text/*") ?: false
        } catch (e: Exception) {
            android.util.Log.e(TAG, "hasPrimaryClipText failed", e)
            false
        }
    }

    override fun hasPrimaryClipImage(): Boolean {
        return try {
            val clipboard = getClipboardService() ?: return false
            val desc = findAndInvokeMethod(clipboard, "getPrimaryClipDescription") as? ClipDescription
            desc?.let { it.hasMimeType("image/*") || it.hasMimeType("application/octet-stream") } ?: false
        } catch (e: Exception) {
            android.util.Log.e(TAG, "hasPrimaryClipImage failed", e)
            false
        }
    }

    override fun getPrimaryClipImageUri(): String {
        return try {
            val clipboard = getClipboardService() ?: return ""
            val clip = findAndInvokeMethod(clipboard, "getPrimaryClip") as? ClipData
            if (clip != null && clip.itemCount > 0) {
                clip.getItemAt(0).uri?.toString() ?: ""
            } else {
                ""
            }
        } catch (e: Exception) {
            android.util.Log.e(TAG, "getPrimaryClipImageUri failed", e)
            ""
        }
    }

    override fun destroy() {
        android.util.Log.i(TAG, "UserService destroy called")
        clipboardService = null
    }
}
