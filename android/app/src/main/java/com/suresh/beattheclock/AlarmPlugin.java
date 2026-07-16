package com.suresh.beattheclock;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioManager;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Calendar;

@CapacitorPlugin(name = "AlarmPlugin")
public class AlarmPlugin extends Plugin {
    @PluginMethod
    public void setAlarm(PluginCall call) {
        String id = call.getString("id");
        String time = call.getString("time");
        Boolean vibrate = call.getBoolean("vibrate", false);
        if (id == null || time == null) {
            call.reject("Missing id or time parameters");
            return;
        }

        try {
            String[] parts = time.split(":");
            int hour = Integer.parseInt(parts[0]);
            int minute = Integer.parseInt(parts[1]);

            Context context = getContext();
            AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);

            Intent intent = new Intent(context, AlarmReceiver.class);
            intent.putExtra("alarmId", id);
            intent.putExtra("alarmTime", time);
            intent.putExtra("vibrate", vibrate != null ? vibrate : false);
            intent.addFlags(Intent.FLAG_INCLUDE_STOPPED_PACKAGES); // Forces delivery even if app is closed/force-stopped!

            int requestCode = Integer.parseInt(id.substring(Math.max(0, id.length() - 6)));

            PendingIntent pendingIntent = PendingIntent.getBroadcast(
                context, 
                requestCode, 
                intent, 
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );

            Calendar calendar = Calendar.getInstance();
            calendar.setTimeInMillis(System.currentTimeMillis());
            calendar.set(Calendar.HOUR_OF_DAY, hour);
            calendar.set(Calendar.MINUTE, minute);
            calendar.set(Calendar.SECOND, 0);
            calendar.set(Calendar.MILLISECOND, 0);

            if (calendar.getTimeInMillis() <= System.currentTimeMillis()) {
                calendar.add(Calendar.DAY_OF_YEAR, 1);
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                AlarmManager.AlarmClockInfo info = new AlarmManager.AlarmClockInfo(
                    calendar.getTimeInMillis(), 
                    pendingIntent
                );
                alarmManager.setAlarmClock(info, pendingIntent);
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                alarmManager.setExactAndAllowWhileIdle(
                    AlarmManager.RTC_WAKEUP, 
                    calendar.getTimeInMillis(), 
                    pendingIntent
                );
            } else {
                alarmManager.setExact(
                    AlarmManager.RTC_WAKEUP, 
                    calendar.getTimeInMillis(), 
                    pendingIntent
                );
            }

            JSObject ret = new JSObject();
            ret.put("status", "success");
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Error scheduling alarm: " + e.getMessage());
        }
    }

    @PluginMethod
    public void cancelAlarm(PluginCall call) {
        String id = call.getString("id");
        if (id == null) {
            call.reject("Missing id parameter");
            return;
        }

        try {
            Context context = getContext();
            AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);

            Intent intent = new Intent(context, AlarmReceiver.class);
            int requestCode = Integer.parseInt(id.substring(Math.max(0, id.length() - 6)));

            PendingIntent pendingIntent = PendingIntent.getBroadcast(
                context, 
                requestCode, 
                intent, 
                PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE
            );

            if (pendingIntent != null) {
                alarmManager.cancel(pendingIntent);
                pendingIntent.cancel();
            }

            JSObject ret = new JSObject();
            ret.put("status", "success");
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Error cancelling alarm: " + e.getMessage());
        }
    }

    @PluginMethod
    public void startRinging(PluginCall call) {
        MainActivity.setRingingState(true);
        
        // Start native Foreground AlarmService
        try {
            Context context = getContext();
            Intent serviceIntent = new Intent(context, AlarmService.class);
            serviceIntent.putExtra("alarmId", "manual");
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent);
            } else {
                context.startService(serviceIntent);
            }
        } catch (Exception e) {
            android.util.Log.e("AlarmPlugin", "Failed to start AlarmService: " + e.getMessage());
        }
        
        JSObject ret = new JSObject();
        ret.put("status", "success");
        call.resolve(ret);
    }

    @PluginMethod
    public void stopRinging(PluginCall call) {
        MainActivity.setRingingState(false);
        
        // Stop native Foreground AlarmService
        try {
            Context context = getContext();
            Intent serviceIntent = new Intent(context, AlarmService.class);
            context.stopService(serviceIntent);
        } catch (Exception e) {
            android.util.Log.e("AlarmPlugin", "Failed to stop AlarmService: " + e.getMessage());
        }

        JSObject ret = new JSObject();
        ret.put("status", "success");
        call.resolve(ret);
    }
}
