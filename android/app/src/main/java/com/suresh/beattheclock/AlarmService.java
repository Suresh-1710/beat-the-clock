package com.suresh.beattheclock;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.PowerManager;
import android.os.SystemClock;
import androidx.core.app.NotificationCompat;

public class AlarmService extends Service {
    private MediaPlayer mediaPlayer;
    private PowerManager.WakeLock wakeLock;
    private android.os.Vibrator vibrator;
    private android.media.session.MediaSession mediaSession;
    private final Handler volumeHandler = new Handler();
    private boolean isRinging = false;

    private final Runnable volumeEnforcer = new Runnable() {
        @Override
        public void run() {
            if (isRinging) {
                forceMaxVolume();
                volumeHandler.postDelayed(this, 150); // Enforce max volume every 150ms
            }
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        
        // Wake Lock
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (pm != null) {
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "BeatTheClock:AlarmServiceLock");
            wakeLock.acquire(10 * 60 * 1000); // 10 minutes max wake lock
        }

        // Initialize Vibrator
        vibrator = (android.os.Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String alarmId = intent != null ? intent.getStringExtra("alarmId") : "";
        String alarmTime = intent != null ? intent.getStringExtra("alarmTime") : "";
        boolean vibrate = intent != null && intent.getBooleanExtra("vibrate", false);
        isRinging = true;

        // 0.5 Register MediaSession to intercept hardware volume keys globally
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            try {
                mediaSession = new android.media.session.MediaSession(this, "BeatTheClockSession");
                mediaSession.setActive(true);
                
                AudioManager audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
                int maxVol = audioManager != null ? audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC) : 15;
                
                android.media.VolumeProvider volumeProvider = new android.media.VolumeProvider(
                    android.media.VolumeProvider.VOLUME_CONTROL_ABSOLUTE, 
                    maxVol, 
                    maxVol
                ) {
                    @Override
                    public void onSetVolumeTo(int volume) {
                        // Do nothing to silently swallow background volume slider modifications
                    }

                    @Override
                    public void onAdjustVolume(int direction) {
                        // Do nothing to silently swallow background hardware volume key presses
                    }
                };
                mediaSession.setPlaybackToRemote(volumeProvider);
            } catch (Exception e) {
                android.util.Log.e("AlarmService", "Failed to start MediaSession: " + e.getMessage());
            }
        }

        // 1. Create Notification Channel
        createNotificationChannel();

        // 2. Format alarm time beautifully in 12h format (e.g. "08:30 AM")
        String formattedTime = "";
        if (alarmTime != null && !alarmTime.isEmpty()) {
            try {
                java.text.SimpleDateFormat sdf24 = new java.text.SimpleDateFormat("HH:mm", java.util.Locale.getDefault());
                java.text.SimpleDateFormat sdf12 = new java.text.SimpleDateFormat("hh:mm a", java.util.Locale.getDefault());
                java.util.Date date = sdf24.parse(alarmTime);
                if (date != null) {
                    formattedTime = sdf12.format(date);
                }
            } catch (Exception e) {
                formattedTime = alarmTime;
            }
        }
        if (formattedTime.isEmpty()) {
            try {
                java.text.SimpleDateFormat sdf12 = new java.text.SimpleDateFormat("hh:mm a", java.util.Locale.getDefault());
                formattedTime = sdf12.format(new java.util.Date());
            } catch (Exception e) {
                formattedTime = "Alarm Active!";
            }
        }

        // 3. Build Intent and Notification
        Intent launchIntent = new Intent(this, MainActivity.class);
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        launchIntent.putExtra("alarmId", alarmId);
        launchIntent.putExtra("alarmTime", alarmTime);
        launchIntent.putExtra("vibrate", vibrate);
        
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this, 
            999, 
            launchIntent, 
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Notification notification = new NotificationCompat.Builder(this, "BEAT_THE_CLOCK_ALARM_CHANNEL_V2")
            .setContentTitle(formattedTime) // Alarm time (e.g. "08:30 AM")
            .setContentText("Solve the game to dismiss!")
            .setSubText("Beat the Clock") // Shows in the top-right
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentIntent(pendingIntent)
            .addAction(android.R.drawable.ic_media_play, "🎮 Solve Challenge", pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setFullScreenIntent(pendingIntent, true) // Handles lockscreen automatic wake
            .build();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(1001, notification, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(1001, notification, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(1001, notification);
        }

        // 3.5 Force ringing status true in MainActivity for key dispatch blocker
        MainActivity.setRingingState(true);

        // 4. Play Alarm Sound
        playAlarmSound();

        // 5. Start Volume Enforcer Loop
        volumeHandler.post(volumeEnforcer);

        // 5.5 Start native Vibration if enabled
        if (vibrate && vibrator != null && vibrator.hasVibrator()) {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    vibrator.vibrate(android.os.VibrationEffect.createWaveform(new long[]{0, 500, 500}, 0));
                } else {
                    vibrator.vibrate(new long[]{0, 500, 500}, 0);
                }
            } catch (Exception e) {}
        }

        // 6. Force overlay launch ONLY if screen is locked or off (avoids stealing focus from active apps)
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            android.app.KeyguardManager km = (android.app.KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
            boolean isScreenOff = (pm != null && !pm.isInteractive());
            boolean isKeyguardLocked = (km != null && km.isKeyguardLocked());
            
            if (isScreenOff || isKeyguardLocked) {
                // Force screen on using WakeLock
                if (pm != null) {
                    PowerManager.WakeLock screenLock = pm.newWakeLock(
                        PowerManager.SCREEN_BRIGHT_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP | PowerManager.ON_AFTER_RELEASE,
                        "BeatTheClock:AlarmScreenWakeLock"
                    );
                    screenLock.acquire(10000); // Hold for 10 seconds to display activity
                }
                startActivity(launchIntent);
            }
        } catch (Exception e) {
            // Fallback: start activity anyway if checks fail
            startActivity(launchIntent);
        }

        return START_STICKY; // Sticky: tell OS to recreate service if killed
    }

    private void playAlarmSound() {
        if (mediaPlayer != null) return;
        try {
            Uri alert = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            if (alert == null) {
                alert = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            }
            mediaPlayer = new MediaPlayer();
            mediaPlayer.setDataSource(this, alert);
            mediaPlayer.setAudioStreamType(AudioManager.STREAM_MUSIC);
            mediaPlayer.setLooping(true);
            mediaPlayer.prepare();
            mediaPlayer.start();
        } catch (Exception e) {
            // Fallback sound
            try {
                mediaPlayer = MediaPlayer.create(this, RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION));
                mediaPlayer.setLooping(true);
                mediaPlayer.start();
            } catch (Exception ex) {}
        }
    }

    private void forceMaxVolume() {
        try {
            AudioManager audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
            if (audioManager != null) {
                int maxVolume = audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
                audioManager.setStreamVolume(AudioManager.STREAM_MUSIC, maxVolume, 0);
            }
        } catch (Exception e) {}
    }

    @Override
    public void onDestroy() {
        isRinging = false;
        volumeHandler.removeCallbacks(volumeEnforcer);
        
        if (vibrator != null) {
            try {
                vibrator.cancel();
            } catch (Exception e) {}
        }

        // Release MediaSession
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP && mediaSession != null) {
            try {
                mediaSession.setActive(false);
                mediaSession.release();
            } catch (Exception e) {}
            mediaSession = null;
        }

        if (mediaPlayer != null) {
            try {
                mediaPlayer.stop();
                mediaPlayer.release();
            } catch (Exception e) {}
            mediaPlayer = null;
        }
        
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
        
        // Clear ringing status in MainActivity
        MainActivity.setRingingState(false);

        stopForeground(true);
        super.onDestroy();
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        if (isRinging) {
            // Send broadcast to AlarmReceiver to restart service safely on swipe-close
            Intent restartIntent = new Intent(getApplicationContext(), AlarmReceiver.class);
            restartIntent.putExtra("alarmId", "restart");
            restartIntent.addFlags(Intent.FLAG_INCLUDE_STOPPED_PACKAGES); // Bypasses stopped-app constraints
            
            PendingIntent pendingIntent = PendingIntent.getBroadcast(
                getApplicationContext(), 
                9999, 
                restartIntent, 
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
            
            AlarmManager alarmService = (AlarmManager) getApplicationContext().getSystemService(Context.ALARM_SERVICE);
            if (alarmService != null) {
                try {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                        AlarmManager.AlarmClockInfo info = new AlarmManager.AlarmClockInfo(
                            System.currentTimeMillis() + 500,
                            pendingIntent
                        );
                        alarmService.setAlarmClock(info, pendingIntent);
                    } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                        alarmService.setExactAndAllowWhileIdle(
                            AlarmManager.RTC_WAKEUP, 
                            System.currentTimeMillis() + 500, 
                            pendingIntent
                        );
                    } else {
                        alarmService.set(
                            AlarmManager.RTC_WAKEUP, 
                            System.currentTimeMillis() + 500, 
                            pendingIntent
                        );
                    }
                } catch (Exception e) {
                    // Fallback to basic elapsed alarm wakeup if alarm clock registry fails
                    try {
                        alarmService.set(
                            AlarmManager.ELAPSED_REALTIME_WAKEUP, 
                            SystemClock.elapsedRealtime() + 500, 
                            pendingIntent
                        );
                    } catch (Exception ex) {}
                }
            }
        }
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel serviceChannel = new NotificationChannel(
                "BEAT_THE_CLOCK_ALARM_CHANNEL_V2",
                "Alarm Notifications",
                NotificationManager.IMPORTANCE_HIGH
            );
            serviceChannel.setDescription("Beat the Clock Alarm sound service");
            serviceChannel.setSound(null, null); // Sound played by MediaPlayer instead
            serviceChannel.setBypassDnd(true);
            serviceChannel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                serviceChannel.setAllowBubbles(true);
            }
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(serviceChannel);
            }
        }
    }
}
