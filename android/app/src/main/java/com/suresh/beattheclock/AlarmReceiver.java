package com.suresh.beattheclock;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.PowerManager;

public class AlarmReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String alarmId = intent.getStringExtra("alarmId");
        String alarmTime = intent.getStringExtra("alarmTime");
        boolean vibrate = intent.getBooleanExtra("vibrate", false);

        // Wake screen using WakeLock
        try {
            PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                PowerManager.WakeLock screenLock = pm.newWakeLock(
                    PowerManager.SCREEN_BRIGHT_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP | PowerManager.ON_AFTER_RELEASE,
                    "BeatTheClock:ReceiverWakeLock"
                );
                screenLock.acquire(10000); // 10 seconds screen wake
            }
        } catch (Exception e) {}

        // Launch MainActivity directly
        Intent launchIntent = new Intent(context, MainActivity.class);
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        launchIntent.putExtra("alarmId", alarmId);
        launchIntent.putExtra("alarmTime", alarmTime);
        launchIntent.putExtra("vibrate", vibrate);

        try {
            context.startActivity(launchIntent);
        } catch (Exception e) {
            android.util.Log.e("AlarmReceiver", "Failed to start MainActivity directly, falling back to Service: " + e.getMessage());
            
            // Fallback: start foreground service directly
            Intent serviceIntent = new Intent(context, AlarmService.class);
            serviceIntent.putExtra("alarmId", alarmId);
            serviceIntent.putExtra("alarmTime", alarmTime);
            serviceIntent.putExtra("vibrate", vibrate);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent);
            } else {
                context.startService(serviceIntent);
            }
        }
    }
}
