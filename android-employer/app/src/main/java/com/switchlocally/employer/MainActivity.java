package com.switchlocally.employer;

import android.os.Bundle;
import android.view.Window;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativePermissionsPlugin.class);

        // Enable edge-to-edge so WebView fills the full screen on Android 15+.
        // The CSS --safe-t / --safe-b variables handle avoiding the status/nav bars.
        Window win = getWindow();
        WindowCompat.setDecorFitsSystemWindows(win, false);

        super.onCreate(savedInstanceState);
    }
}
