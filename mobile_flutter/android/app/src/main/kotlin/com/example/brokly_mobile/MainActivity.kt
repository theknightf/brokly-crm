package com.example.brokly_mobile

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    companion object {
        private const val CHANNEL_NAME = "com.brokly.crm/notifications"
        private const val NOTIF_CHANNEL_ID = "brokly_crm_high_alerts"
        private const val NOTIF_CHANNEL_TITLE = "Brokly CRM Real-Time Alerts"
        private const val EXTRA_LEAD_ID = "deep_link_lead_id"
        private const val EXTRA_NOTIF_ID = "deep_link_notification_id"
    }

    private var methodChannel: MethodChannel? = null
    private var pendingLeadId: String? = null
    private var pendingNotifId: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        createNotificationChannel()
        extractDeepLinkFromIntent(intent, notifyFlutter = false)
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        createNotificationChannel()

        val channel = MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL_NAME)
        methodChannel = channel

        channel.setMethodCallHandler { call, result ->
            when (call.method) {
                "showNotification" -> {
                    val id = call.argument<Int>("id") ?: (System.currentTimeMillis() % 100000).toInt()
                    val title = call.argument<String>("title") ?: "Brokly CRM"
                    val body = call.argument<String>("body") ?: ""
                    val leadId = call.argument<String>("leadId") ?: ""
                    val notifId = call.argument<String>("notificationId") ?: ""
                    showSystemNotification(id, title, body, leadId, notifId)
                    result.success(true)
                }
                "getInitialPayload" -> {
                    val payload = if (!pendingLeadId.isNullOrEmpty() || !pendingNotifId.isNullOrEmpty()) {
                        mapOf(
                            "leadId" to (pendingLeadId ?: ""),
                            "notificationId" to (pendingNotifId ?: "")
                        )
                    } else {
                        null
                    }
                    pendingLeadId = null
                    pendingNotifId = null
                    result.success(payload)
                }
                else -> result.notImplemented()
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        extractDeepLinkFromIntent(intent, notifyFlutter = true)
    }

    private fun extractDeepLinkFromIntent(intent: Intent?, notifyFlutter: Boolean) {
        if (intent == null) return
        val leadId = intent.getStringExtra(EXTRA_LEAD_ID)
        val notifId = intent.getStringExtra(EXTRA_NOTIF_ID)
        if (!leadId.isNullOrEmpty() || !notifId.isNullOrEmpty()) {
            intent.removeExtra(EXTRA_LEAD_ID)
            intent.removeExtra(EXTRA_NOTIF_ID)
            if (notifyFlutter && methodChannel != null) {
                methodChannel?.invokeMethod(
                    "onNotificationTapped",
                    mapOf(
                        "leadId" to (leadId ?: ""),
                        "notificationId" to (notifId ?: "")
                    )
                )
            } else {
                pendingLeadId = leadId
                pendingNotifId = notifId
            }
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            val existing = manager.getNotificationChannel(NOTIF_CHANNEL_ID)
            if (existing == null) {
                val channel = NotificationChannel(
                    NOTIF_CHANNEL_ID,
                    NOTIF_CHANNEL_TITLE,
                    NotificationManager.IMPORTANCE_HIGH
                ).apply {
                    description = "Notifications for newly assigned leads and follow-up reminders"
                    enableVibration(true)
                    enableLights(true)
                }
                manager.createNotificationChannel(channel)
            }
        }
    }

    @Suppress("DEPRECATION")
    private fun showSystemNotification(
        id: Int,
        title: String,
        body: String,
        leadId: String,
        notifId: String
    ) {
        try {
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            createNotificationChannel()

            val tapIntent = Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
                putExtra(EXTRA_LEAD_ID, leadId)
                putExtra(EXTRA_NOTIF_ID, notifId)
            }

            val pendingFlags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            } else {
                PendingIntent.FLAG_UPDATE_CURRENT
            }

            val pendingIntent = PendingIntent.getActivity(this, id, tapIntent, pendingFlags)

            val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                Notification.Builder(this, NOTIF_CHANNEL_ID)
            } else {
                Notification.Builder(this)
                    .setPriority(Notification.PRIORITY_HIGH)
                    .setDefaults(Notification.DEFAULT_ALL)
            }

            val notification = builder
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(Notification.BigTextStyle().bigText(body))
                .setAutoCancel(true)
                .setContentIntent(pendingIntent)
                .build()

            manager.notify(id, notification)
        } catch (_: Exception) {
            // Ignore notification errors on unsupported devices
        }
    }
}
