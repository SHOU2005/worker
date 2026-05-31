package com.switchlocally.worker

import android.app.Activity
import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.TextView

/**
 * Call-style "Incoming urgent job" screen — surfaces over the lock screen,
 * keeps the ringtone running until the worker slides-to-accept or taps
 * Decline, then hands off to the MainActivity webview.
 *
 * Plain Activity (not AppCompatActivity) so we don't need a Theme.AppCompat
 * ancestor — Capacitor's NoActionBarLaunch theme isn't AppCompat-descended.
 */
class IncomingJobActivity : Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Show over the lock screen + wake the device on launch. Modern
        // (API 27+) and legacy flags both kept so older devices behave.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
            val km = getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
            km.requestDismissKeyguard(this, null)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                or WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                or WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
            )
        }

        setContentView(R.layout.activity_incoming_job)

        val title = intent.getStringExtra("title")   ?: "Urgent job"
        val body  = intent.getStringExtra("body")    ?: ""
        val url   = intent.getStringExtra("url")     ?: "/worker/jobs"

        findViewById<TextView>(R.id.urgent_title).text = title
        findViewById<TextView>(R.id.urgent_body).text  = body

        // Kick off (or reattach to) the ring service. Idempotent in the
        // service — only spins up MediaPlayer once.
        val svc = Intent(this, UrgentRingForegroundService::class.java).apply {
            putExtra("title",     title)
            putExtra("body",      body)
            putExtra("shiftId",   intent.getStringExtra("shiftId") ?: "")
            putExtra("url",       url)
            putExtra("expiresAt", intent.getStringExtra("expiresAt") ?: "")
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(svc) else startService(svc)

        wireSlideToAccept(url)

        findViewById<TextView>(R.id.btn_decline).setOnClickListener {
            stopRing()
            finishAndRemoveTask()
        }
    }

    /**
     * Slide-to-accept rail. Same gesture shape the worker dashboard's
     * "Slide to Arrive" button uses: drag the white thumb past 90% of
     * the track and we fire Accept.
     */
    private fun wireSlideToAccept(url: String) {
        val rail  = findViewById<FrameLayout>(R.id.slide_rail)
        val thumb = findViewById<FrameLayout>(R.id.slide_thumb)
        val hint  = findViewById<TextView>(R.id.slide_hint)

        var trackWidth = 0
        var thumbWidth = 0
        var startTouchX = 0f
        var startThumbX = 0f
        val startMargin = (6 * resources.displayMetrics.density)

        // Measure after layout.
        rail.post {
            trackWidth = rail.width
            thumbWidth = thumb.width
        }

        rail.setOnTouchListener { _, ev ->
            // First touch on the rail might not be on the thumb; only react
            // when the user actually starts dragging within ~thumb diameter
            // of the current thumb position. Lets the user grab a bit sloppily.
            when (ev.action) {
                MotionEvent.ACTION_DOWN -> {
                    val onThumb = ev.x in (thumb.x - 20)..(thumb.x + thumbWidth + 20)
                    if (!onThumb) return@setOnTouchListener false
                    startTouchX = ev.x
                    startThumbX = thumb.x
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    val maxX = (trackWidth - thumbWidth - startMargin).coerceAtLeast(0f)
                    val nextX = (startThumbX + (ev.x - startTouchX)).coerceIn(startMargin, maxX)
                    thumb.x = nextX
                    // Fade hint as the thumb travels.
                    hint.alpha = (1f - (nextX / maxX)).coerceIn(0f, 0.55f)
                    true
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    val maxX = (trackWidth - thumbWidth - startMargin).coerceAtLeast(0f)
                    if (thumb.x >= maxX * 0.9f) {
                        // Past the threshold → accept.
                        stopRing()
                        openWebView(url)
                    } else {
                        // Snap back.
                        thumb.animate().x(startMargin).setDuration(220).start()
                        hint.animate().alpha(0.55f).setDuration(220).start()
                    }
                    true
                }
                else -> false
            }
        }
    }

    override fun onBackPressed() {
        stopRing()
        super.onBackPressed()
    }

    private fun stopRing() {
        stopService(Intent(this, UrgentRingForegroundService::class.java))
    }

    private fun openWebView(url: String) {
        val i = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("openUrl", url)
        }
        startActivity(i)
        finishAndRemoveTask()
    }
}
