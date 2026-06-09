package expo.modules.foregroundservice

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import expo.modules.nativeutil.NativeLogger
import androidx.core.app.NotificationCompat

class SyncForegroundService : Service() {

    companion object {
        private const val TAG = "SyncForegroundService"
        private const val APP_PACKAGE = "com.jericx.syncclipboardmobile"
        const val CHANNEL_ID = "syncclipboard_foreground"
        const val NOTIFY_ID = 0x2020
        const val ACTION_START = "START"
        const val ACTION_STOP = "STOP"
        const val ACTION_TEMP_STOP = "TEMP_STOP"
        const val ACTION_UPDATE = "UPDATE"
        const val EXTRA_CONTENT = "content"
        const val RESTART_NOTIFY_ID = 0x2021
        private const val RESTART_CHANNEL_ID = "syncclipboard_restart"
        private const val PREFS_NAME = "sync_fg_prefs"
        private const val KEY_KILLED_BY_USER = "killed_by_user"

        var isRunning = false
            private set

        internal var stoppedByUser = false

        /**
         * 内存标志：当前进程已进入"用户主动退出"处理流程。
         * 用于 onStartCommand 与 onTaskRemoved 回调顺序不确定时的互相感知，
         * 防止 START_STICKY 重建后 onTaskRemoved 被重复触发导致循环 killProcess。
         * 进程重建时自动重置为 false；正常启动服务时显式清除。
         */
        private var handledKilledByUser = false
    }

    private var notificationManager: NotificationManager? = null

    private fun getAppString(name: String): String {
        val resId = resources.getIdentifier(name, "string", APP_PACKAGE)
        return if (resId != 0) getString(resId) else name
    }

    override fun onCreate() {
        super.onCreate()
        NativeLogger.d(TAG, "Service onCreate")
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        NativeLogger.d(TAG, "onStartCommand action=${intent?.action} flags=$flags startId=$startId")
        when (intent?.action) {
            ACTION_START, null -> {
                NativeLogger.d(TAG, "Starting foreground, intent action=${intent?.action}")

                // 系统 START_STICKY 重启时：
                //   - intent 为 null：系统直接重启
                //   - intent.action == ACTION_START 但 jsInitiatedService == false：
                //     系统重投了上次的 ACTION_START intent，JS 并未实际运行
                // 以上两种情况：JS 不存在，不启动前台服务，仅发重启引导通知
                if (intent == null || !ForegroundServiceModule.isJsRuntimeAlive()) {
                    // 检查是否因用户从多任务界面退出而触发的进程重建
                    // 若是，则安静停止，不弹出重启引导通知
                    // 同时检查 SharedPreferences（跨进程）和内存标志（同进程不同回调顺序）
                    val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                    val killedByUser = prefs.getBoolean(KEY_KILLED_BY_USER, false) || handledKilledByUser
                    if (killedByUser) {
                        NativeLogger.d(TAG, "Process was restarted after user swiped from recents, stopping quietly")
                        handledKilledByUser = true  // 确保 onTaskRemoved 若后触发也能感知
                        prefs.edit().putBoolean(KEY_KILLED_BY_USER, false).apply()
                        stoppedByUser = true
                        stopSelf()
                        return START_NOT_STICKY
                    }
                    NativeLogger.w(TAG, "Service restarted by system (intent=${intent?.action}, jsAlive=${ForegroundServiceModule.isJsRuntimeAlive()}), JS not running, showing restart notification")
                    showRestartNotification()
                    stoppedByUser = true  // 防止 onDestroy 再次发重启通知
                    stopSelf()
                    return START_NOT_STICKY
                }

                val notification = createNotification(getAppString("fg_notification_running"))
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                    startForeground(NOTIFY_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
                } else {
                    startForeground(NOTIFY_ID, notification)
                }
                NativeLogger.d(TAG, "startForeground called successfully")
                handledKilledByUser = false  // 正常启动，清除退出标志以备下次
                isRunning = true
            }
            ACTION_STOP -> {
                NativeLogger.d(TAG, "Stopping foreground service (permanent)")
                stoppedByUser = true
                if (!isRunning) {
                    val notification = createNotification(getAppString("fg_notification_stopping"))
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                        startForeground(NOTIFY_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
                    } else {
                        startForeground(NOTIFY_ID, notification)
                    }
                }
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
                isRunning = false
                ForegroundServiceModule.sendStopEvent()
            }
            ACTION_TEMP_STOP -> {
                NativeLogger.d(TAG, "Stopping foreground service (temporary)")
                stoppedByUser = true
                if (!isRunning) {
                    val notification = createNotification(getAppString("fg_notification_stopping"))
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                        startForeground(NOTIFY_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
                    } else {
                        startForeground(NOTIFY_ID, notification)
                    }
                }
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
                isRunning = false
                ForegroundServiceModule.sendTempStopEvent()
            }
            ACTION_UPDATE -> {
                val content = intent.getStringExtra(EXTRA_CONTENT) ?: getAppString("fg_notification_running")
                updateNotification(content)
            }
            else -> {
                val notification = createNotification(getAppString("fg_notification_running"))
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                    startForeground(NOTIFY_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
                } else {
                    startForeground(NOTIFY_ID, notification)
                }
                isRunning = true
            }
        }
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    /**
     * Android 14+ 回调：dataSync 类型前台服务 6小时/24小时配额耗尽时由系统调用。
     * 若不在此回调中及时停止，系统会强制 ANR 终止进程（不经过 onDestroy 优雅路径）。
     * 处理同用户临时停止：通知 JS 侧重新调度，下次 App 进入前台时重启服务。
     */
    @androidx.annotation.RequiresApi(Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
    override fun onTimeout(startId: Int) {
        NativeLogger.w(TAG, "dataSync foreground service timed out (6h/24h quota exhausted), stopping gracefully")
        stoppedByUser = true
        showRestartNotification(contentText = getAppString("fg_timeout_content"))
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
        isRunning = false
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        super.onTaskRemoved(rootIntent)
        val rootClassName = rootIntent?.component?.className.orEmpty()
        val fromMainActivity = rootClassName.endsWith(".MainActivity")

        if (!fromMainActivity) {
            NativeLogger.d(TAG, "onTaskRemoved ignored: root=$rootClassName")
            return
        }

        NativeLogger.d(TAG, "onTaskRemoved: user swiped app from recents, killing process")
        // 持久化标记，供进程重建后的 onStartCommand 判断，避免弹出"服务需要恢复"通知
        // 必须使用 commit()（同步写入），确保在 killProcess 之前写入完成
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

        // 若标志已置位，说明这是 START_STICKY 重建后的二次 onTaskRemoved，安静停止即可
        if (prefs.getBoolean(KEY_KILLED_BY_USER, false) || handledKilledByUser) {
            NativeLogger.d(TAG, "onTaskRemoved: spurious restart after user kill, stopping quietly")
            prefs.edit().putBoolean(KEY_KILLED_BY_USER, false).commit()
            stoppedByUser = true
            isRunning = false
            stopSelf()
            return
        }

        prefs.edit().putBoolean(KEY_KILLED_BY_USER, true).commit()
        stoppedByUser = true
        isRunning = false
        // 直接结束进程，停止所有后台任务（含 JS 侧 keepAlive 任务如 remoteClipboardMonitor）
        // 否则进程在前台服务停止后仍短暂存活，导致后台任务持续运行，出现严格交替的 bug
        android.os.Process.killProcess(android.os.Process.myPid())
    }

    override fun onDestroy() {
        NativeLogger.d(TAG, "onDestroy called, stoppedByUser=$stoppedByUser, isRunning=$isRunning")
        val wasRunning = isRunning
        isRunning = false
        // 非用户主动停止且之前确实在运行 → 可能被系统杀死，发通知引导重启
        if (!stoppedByUser && wasRunning) {
            NativeLogger.w(TAG, "Service destroyed unexpectedly, showing restart notification")
            showRestartNotification()
        }
        stoppedByUser = false
        super.onDestroy()
    }

    private fun createNotificationChannel() {
        notificationManager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                getAppString("fg_channel_name"),
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = getAppString("fg_channel_desc")
                setShowBadge(false)
            }
            notificationManager?.createNotificationChannel(channel)
        }
    }

    private fun createNotification(content: String): Notification {
        // PendingIntent to open the app when notification is tapped
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
        val pendingLaunchIntent = PendingIntent.getActivity(
            this, 0, launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // Temp stop action
        val tempStopIntent = Intent(this, SyncForegroundService::class.java).apply {
            action = ACTION_TEMP_STOP
        }
        val tempStopPendingIntent = PendingIntent.getService(
            this, 2, tempStopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // Stop action
        val stopIntent = Intent(this, SyncForegroundService::class.java).apply {
            action = ACTION_STOP
        }
        val stopPendingIntent = PendingIntent.getService(
            this, 1, stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val iconResId = applicationContext.resources.getIdentifier(
            "ic_notification", "drawable", packageName
        ).takeIf { it != 0 }
            ?: applicationContext.resources.getIdentifier(
                "ic_launcher_foreground", "mipmap", packageName
            ).takeIf { it != 0 }
            ?: android.R.drawable.ic_menu_info_details

        NativeLogger.d(TAG, "Notification icon resId=$iconResId")

        // 内容以 \n 分割为标题和正文
        val lines = content.split("\n", limit = 2)
        val title = lines[0]
        val body = if (lines.size > 1) lines[1] else ""

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(body)
            .setSmallIcon(iconResId)
            .setContentIntent(pendingLaunchIntent)
            .setOngoing(true)
            .setSilent(true)
            .addAction(0, getAppString("fg_action_temp_stop"), tempStopPendingIntent)
            .addAction(0, getAppString("fg_action_stop"), stopPendingIntent)
            .setStyle(NotificationCompat.BigTextStyle()
                .setBigContentTitle(title)
                .bigText(body)
            )
            .build()
    }

    private fun updateNotification(content: String) {
        val notification = createNotification(content)
        notificationManager?.notify(NOTIFY_ID, notification)
    }

    private fun showRestartNotification(contentText: String = getAppString("fg_restart_content")) {
        val nm = getSystemService(NOTIFICATION_SERVICE) as? NotificationManager ?: return

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                RESTART_CHANNEL_ID,
                getAppString("fg_restart_channel_name"),
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = getAppString("fg_restart_channel_desc")
            }
            nm.createNotificationChannel(channel)
        }

        val restartIntent = Intent().apply {
            setClassName(packageName, "com.jericx.syncclipboardmobile.servicerestart.ServiceRestartActivity")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        }
        val pendingIntent = PendingIntent.getActivity(
            this, 0, restartIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val iconResId = applicationContext.resources.getIdentifier(
            "ic_notification", "drawable", packageName
        ).takeIf { it != 0 }
            ?: applicationContext.resources.getIdentifier(
                "ic_launcher_foreground", "mipmap", packageName
            ).takeIf { it != 0 }
            ?: android.R.drawable.ic_menu_info_details

        val notification = NotificationCompat.Builder(this, RESTART_CHANNEL_ID)
            .setContentTitle(getAppString("fg_restart_title"))
            .setContentText(contentText)
            .setSmallIcon(iconResId)
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .build()

        nm.notify(RESTART_NOTIFY_ID, notification)
    }
}
