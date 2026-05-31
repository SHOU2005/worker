package com.switchlocally.worker

import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat

/**
 * Phone-call-style foreground service for urgent job pushes.
 *
 *  - Holds a partial wake lock so the phone keeps ringing for ~45 s even
 *    if doze fires.
 *  - Plays res/raw/urgent_ring.wav on loop via MediaPlayer.
 *  - Posts a setFullScreenIntent notification that points at
 *    IncomingJobActivity — that activity surfaces above the lock screen.
 *  - Auto-stops on a max-ring timeout, or when IncomingJobActivity
 *    broadcasts ACTION_STOP_RING (worker tapped Accept / Decline).
 */
class UrgentRingForegroundService : Service() {

    private var player: MediaPlayer? = null
    private var wake:   PowerManager.WakeLock? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val title     = intent?.getStringExtra("title")   ?: "Urgent job"
        val body      = intent?.getStringExtra("body")    ?: ""
        val shiftId   = intent?.getStringExtra("shiftId") ?: ""
        val url       = intent?.getStringExtra("url")     ?: "/"
        val expiresAt = intent?.getStringExtra("expiresAt")?.toLongOrNull() ?: 0L

        // Idempotent: the activity also starts this service so a manual adb
        // launch rings too. In the real FCM flow the service is already
        // running by the time the activity launches — re-creating
        // MediaPlayer there would briefly stop the ringtone, so skip it
        // when the player is already alive.
        startForeground(NOTIF_ID, buildFullScreenNotification(title, body, shiftId, url))
        if (wake == null)   acquireWake()
        if (player == null) startRingtone()
        scheduleAutoStop(expiresAt)
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        super.onDestroy()
        try { player?.stop(); player?.release() } catch (_: Throwable) {}
        player = null
        try { if (wake?.isHeld == true) wake?.release() } catch (_: Throwable) {}
        wake = null
    }

    // ── helpers ─────────────────────────────────────────────────────────

    private fun buildFullScreenNotification(title: String, body: String, shiftId: String, url: String): android.app.Notification {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            UrgentRingService.ensureChannel(nm, UrgentRingService.CHANNEL_URGENT, "Urgent jobs", NotificationManager.IMPORTANCE_HIGH, withRing = true)
        }

        // Open the app's MainActivity directly at the job URL — the web
        // dashboard already has its own "flashing urgent job" UI, so a
        // separate native Accept/Decline screen would be redundant
        // (and was bypassable anyway). The full-screen intent still wakes
        // the device and surfaces over the lock screen; tapping it (or
        // accepting the system call-style notification) lands the worker
        // straight in the WebView at /worker/jobs/<shiftId>.
        val openApp = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("openUrl", url)
            putExtra("shiftId", shiftId)
        }
        val openAppPi = PendingIntent.getActivity(
            this, 0, openApp,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        return NotificationCompat.Builder(this, UrgentRingService.CHANNEL_URGENT)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setOngoing(true)
            .setAutoCancel(true)
            // Same call-style wake-up hook Truecaller / WhatsApp use. With
            // USE_FULL_SCREEN_INTENT granted, Android wakes the device and
            // surfaces this notification over the lock screen.
            .setFullScreenIntent(openAppPi, true)
            .setContentIntent(openAppPi)
            .build()
    }

    private fun acquireWake() {
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        wake = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "switch:urgent_ring").apply {
            setReferenceCounted(false)
            acquire(MAX_RING_MS)
        }
    }

    private fun startRingtone() {
        try {
            player = MediaPlayer().apply {
                setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                )
                val afd = resources.openRawResourceFd(R.raw.urgent_ring)
                setDataSource(afd.fileDescriptor, afd.startOffset, afd.length)
                afd.close()
                isLooping = true
                prepare()
                start()
            }
        } catch (_: Throwable) { /* fall back to channel sound */ }
    }

    private fun scheduleAutoStop(expiresAtUnix: Long) {
        val nowS  = System.currentTimeMillis() / 1000
        val delta = if (expiresAtUnix > nowS) (expiresAtUnix - nowS) * 1000 else MAX_RING_MS
        val stopAfter = minOf(delta, MAX_RING_MS)
        android.os.Handler(mainLooper).postDelayed({ stopSelf() }, stopAfter)
    }

    companion object {
        private const val NOTIF_ID  = 9001
        private const val MAX_RING_MS = 45_000L // never ring longer than 45s
    }
}
