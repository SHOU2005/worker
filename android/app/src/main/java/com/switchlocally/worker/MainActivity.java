package com.switchlocally.worker;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Defensive: any throw in our custom onCreate code crashes the
        // app on launch with the "this app has a bug" dialog. Wrap each
        // step so a single failure doesn't kill the whole activity.
        // Plugin registration MUST happen before super.onCreate so the
        // bridgeBuilder picks it up before Bridge.create() runs inside
        // super.onCreate.
        try { registerPlugin(NativePermissionsPlugin.class); }
        catch (Throwable t) { Log.e("SwitchMain", "registerPlugin failed", t); }

        super.onCreate(savedInstanceState);

        // Edge-to-edge — let the WebView paint behind the status / nav
        // bars on Android 15+. Must run after super.onCreate (which
        // attaches the window) but is harmless if it fails.
        try { WindowCompat.setDecorFitsSystemWindows(getWindow(), false); }
        catch (Throwable t) { Log.e("SwitchMain", "edge-to-edge failed", t); }

        // If we were launched from an urgent-job FCM PendingIntent, the
        // intent carries an `openUrl` extra pointing at the job route.
        try { handleOpenUrl(getIntent()); }
        catch (Throwable t) { Log.e("SwitchMain", "handleOpenUrl failed", t); }

        // NOTE: do NOT override setWebChromeClient. Capacitor sets its
        // own BridgeWebChromeClient during super.onCreate() — replacing
        // it (even with a subclass constructed post-onCreate) breaks
        // the <input type="file"> file picker AND crashes the app
        // because BridgeWebChromeClient's constructor calls
        // bridge.registerForActivityResult(...) which must run before
        // the Activity reaches the STARTED state.
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        // Re-launch (singleTask) flow — the WebView is alive but on the
        // wrong screen. Navigate it to the job URL too.
        setIntent(intent);
        handleOpenUrl(intent);
    }

    private void handleOpenUrl(Intent intent) {
        if (intent == null) return;
        String openUrl = intent.getStringExtra("openUrl");
        if (openUrl == null || openUrl.isEmpty()) return;
        // Resolve relative paths against the configured server origin so we
        // don't accidentally navigate the WebView off-app.
        Uri uri;
        try {
            if (openUrl.startsWith("http://") || openUrl.startsWith("https://")) {
                uri = Uri.parse(openUrl);
            } else {
                uri = Uri.parse("https://app.switchlocally.com" + (openUrl.startsWith("/") ? openUrl : "/" + openUrl));
            }
        } catch (Throwable t) { return; }
        // Bridge may not be ready on the very first cold start — defer to
        // the next UI frame so getWebView() is non-null.
        final String target = uri.toString();
        getWindow().getDecorView().post(() -> {
            if (this.getBridge() != null && this.getBridge().getWebView() != null) {
                this.getBridge().getWebView().loadUrl(target);
            }
        });
    }
}
