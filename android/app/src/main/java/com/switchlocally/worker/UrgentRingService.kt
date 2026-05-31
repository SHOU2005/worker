package com.switchlocally.worker

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * Native FCM receiver. Two flows:
 *
 *  - `data.type == "URGENT_JOB"` → start UrgentRingForegroundService, which
 *    grabs a wake lock, plays res/raw/urgent_ring.wav in a loop, and posts
 *    a high-priority heads-up notification.
 *    On Android 14+ the foreground-service notification ALSO attaches a
 *    setFullScreenIntent IF the worker has granted USE_FULL_SCREEN_INTENT
 *    (Settings → Apps → Switch Players → Notifications → Full-screen
 *    notifications). Without that grant we drop the setFullScreenIntent
 *    and rely on the heads-up + loud ring instead, because Android
 *    downgrades an FSI notification without permission to a silent
 *    60-second floating window — strictly worse than our ringtone path.
 *    See UrgentRingForegroundService.canUseFullScreenIntent().
 *
 *  - Any other push falls through to a normal heads-up notification on the
 *    `switch-default` channel — same behaviour the JS service worker
 *    handled before, just running natively so it works when the webview
 *    is asleep.
 *
 * Server payload contract (so Switch keeps one shape for all clients):
 *   data: {
 *     type:       "URGENT_JOB",            // or "BOOKING_UPDATE" etc.
 *     shiftId:    "...",                    // job id (Required for ringing)
 *     title:      "Cleaner · Sector 14",
 *     body:       "₹400 · 4 hrs · 1.2 km",
 *     url:        "/worker/jobs/<id>",
 *     expiresAt:  "1715752800"              // unix-seconds, stop ringing then
 *   }
 *
 * IMPORTANT: send these as FCM `data` keys, NOT `notification`. The SDK
 * only delivers payloads to this service when the `notification` block
 * is empty.
 */
class UrgentRingService : FirebaseMessagingService() {

    override fun onMessageReceived(msg: RemoteMessage) {
        val data  = msg.data
        val type  = data["type"] ?: ""
        val title = data["title"] ?: msg.notification?.title ?: "Switch"
        val body  = data["body"]  ?: msg.notification?.body  ?: ""

        if (type == "URGENT_JOB") {
            startRing(data, title, body)
        } else {
            postRegularHeadsUp(title, body, data)
        }
    }

    /** New device token — bubble back to the JS layer so it can be persisted. */
    override fun onNewToken(token: String) {
        // The Capacitor PushNotifications plugin (or our own bridge) catches
        // the next foreground load and re-registers the new token with the
        // /api/worker/fcm-register endpoint. No native HTTP here — keeps
        // the auth cookie story simple.
    }

    private fun startRing(data: Map<String, String>, title: String, body: String) {
        val svc = Intent(this, UrgentRingForegroundService::class.java).apply {
            putExtra("title",   title)
            putExtra("body",    body)
            putExtra("shiftId", data["shiftId"] ?: "")
            putExtra("url",     data["url"] ?: "/")
            putExtra("expiresAt", data["expiresAt"] ?: "")
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(svc) else startService(svc)
    }

    private fun postRegularHeadsUp(title: String, body: String, data: Map<String, String>) {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ensureChannel(nm, CHANNEL_DEFAULT, "Switch", NotificationManager.IMPORTANCE_DEFAULT, withRing = false)

        val openIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            data?.get("url")?.let { putExtra("openUrl", it) }
        }
        val tap = PendingIntent.getActivity(this, 0, openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

        val n = NotificationCompat.Builder(this, CHANNEL_DEFAULT)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setContentIntent(tap)
            .build()
        nm.notify(System.currentTimeMillis().toInt(), n)
    }

    companion object {
        const val CHANNEL_DEFAULT = "switch-default"
        const val CHANNEL_URGENT  = "switch-urgent"

        /** Idempotent — safe to call on every push. */
        fun ensureChannel(
            nm: NotificationManager,
            id: String,
            name: String,
            importance: Int,
            withRing: Boolean,
        ) {
            if (nm.getNotificationChannel(id) != null) return
            val ch = NotificationChannel(id, name, importance).apply {
                if (withRing) {
                    val sound: Uri = Uri.parse("android.resource://com.switchlocally.worker/raw/urgent_ring")
                    val attrs = AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                    setSound(sound, attrs)
                    enableVibration(true)
                    vibrationPattern = longArrayOf(0, 400, 200, 400, 200, 400, 200, 400)
                    lockscreenVisibility = NotificationCompat.VISIBILITY_PUBLIC
                    setBypassDnd(true) // honoured only if the user grants Do Not Disturb access
                } else {
                    setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION), null)
                }
            }
            nm.createNotificationChannel(ch)
        }
    }
}
