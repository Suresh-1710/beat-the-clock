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
        handleIntent(getIntent());
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
                forceMaxVolume();
                return true; // Consume key event (blocks OS from changing volume)
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
