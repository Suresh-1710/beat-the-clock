package com.suresh.beattheclock;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioManager;
import android.os.Build;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.JSObject;
import java.util.Calendar;
import android.net.Uri;
import android.provider.Settings;
import android.os.PowerManager;

public class MainActivity extends BridgeActivity {
    private static boolean isAlarmRingingJava = false;

    public static void setRingingState(boolean ringing) {
        isAlarmRingingJava = ringing;
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // Turn screen on and show over lock screen
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED |
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
            );
        }
        
        getWindow().addFlags(
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON |
            WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
        );

        dismissKeyguard();
        checkSystemPermissions();
        handleIntent(getIntent());
    }

    private void checkSystemPermissions() {
        // 1. Request POST_NOTIFICATIONS (Android 13+ / API 33+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                try {
                    requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS}, 102);
                } catch (Exception e) {}
            }
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            // 2. Check Overlay Permission
            if (!Settings.canDrawOverlays(this)) {
                try {
                    Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                        Uri.parse("package:" + getPackageName()));
                    startActivity(intent);
                } catch (Exception e) {
                    try {
                        Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION);
                        startActivity(intent);
                    } catch (Exception ex) {}
                }
            }
            
            // 3. Check Battery Optimization Exemption
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null && !pm.isIgnoringBatteryOptimizations(getPackageName())) {
                try {
                    Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                    intent.setData(Uri.parse("package:" + getPackageName()));
                    startActivity(intent);
                } catch (Exception e) {}
            }
        }

        // 4. Check Full-Screen Intent Permission (Android 14+ / API 34+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            android.app.NotificationManager nm = (android.app.NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null && !nm.canUseFullScreenIntent()) {
                try {
                    Intent intent = new Intent("android.settings.MANAGE_APP_USE_FULL_SCREEN_INTENT");
                    intent.setData(Uri.parse("package:" + getPackageName()));
                    startActivity(intent);
                } catch (Exception e) {
                    try {
                        Intent intent = new Intent("android.settings.MANAGE_APP_USE_FULL_SCREEN_INTENT");
                        startActivity(intent);
                    } catch (Exception ex) {}
                }
            }
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        
        // Re-apply display flags on resume to wake screen reliably when opened from background
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED |
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
            );
        }
        
        getWindow().addFlags(
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON |
            WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
        );
        dismissKeyguard();
    }

    private void dismissKeyguard() {
        try {
            android.app.KeyguardManager km = (android.app.KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
            if (km != null) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    km.requestDismissKeyguard(this, null);
                }
            }
        } catch (Exception e) {}
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent);
    }

    private void handleIntent(Intent intent) {
        if (intent != null && intent.hasExtra("alarmId")) {
            final String alarmId = intent.getStringExtra("alarmId");
            final String alarmTime = intent.getStringExtra("alarmTime");
            final boolean vibrate = intent.getBooleanExtra("vibrate", false);

            // Start background foreground sound service from Activity context to bypass background restrictions
            try {
                Intent serviceIntent = new Intent(this, AlarmService.class);
                serviceIntent.putExtra("alarmId", alarmId);
                serviceIntent.putExtra("alarmTime", alarmTime);
                serviceIntent.putExtra("vibrate", vibrate);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    startForegroundService(serviceIntent);
                } else {
                    startService(serviceIntent);
                }
            } catch (Exception e) {
                android.util.Log.e("MainActivity", "Failed to start service from MainActivity: " + e.getMessage());
            }

            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    getBridge().getWebView().evaluateJavascript(
                        "if (window.triggerAlarmFromJava) { window.triggerAlarmFromJava('" + alarmId + "'); }", 
                        null
                    );
                }
            });
        }
    }

    // Intercept volume buttons at key dispatch level to block all mute attempts
    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        int keyCode = event.getKeyCode();
        if (isAlarmRingingJava) {
            if (keyCode == KeyEvent.KEYCODE_VOLUME_DOWN || 
                keyCode == KeyEvent.KEYCODE_VOLUME_UP || 
                keyCode == KeyEvent.KEYCODE_VOLUME_MUTE) {
                return true; // Consume key event silently (prevents OS from changing volume or showing volume slider)
            }
        }
        return super.dispatchKeyEvent(event);
    }

    public void forceMaxVolume() {
        try {
            AudioManager audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
            if (audioManager != null) {
                int maxVolume = audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
                audioManager.setStreamVolume(AudioManager.STREAM_MUSIC, maxVolume, 0);
            }
        } catch (Exception e) {
            android.util.Log.e("MainActivity", "Failed to force max volume: " + e.getMessage());
        }
    }
}
