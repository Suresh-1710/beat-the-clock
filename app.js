"use strict";

/* ════════════════════════════════════
   LIVE CLOCK
════════════════════════════════════ */
function tickClock() {
  const now  = new Date();
  const hh   = String(now.getHours()).padStart(2,'0');
  const mm   = String(now.getMinutes()).padStart(2,'0');
  const ss   = String(now.getSeconds()).padStart(2,'0');
  document.getElementById('liveClock').textContent = `${hh}:${mm}:${ss}`;
  const days   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  document.getElementById('liveDate').textContent =
    `${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
}
tickClock();
setInterval(tickClock, 1000);

/* ════════════════════════════════════
   RINGTONES — Web Audio API
════════════════════════════════════ */
let alarmAudioCtx = null, alarmLoopTimer = null;
let previewCtx    = null, previewTimer   = null;
let selectedTone  = 'siren';
let selectedGame  = 'snake';
let selectedAMPM  = 'AM';
let selectedFreq  = 'once';

/* Anti-Escape & Screen Lock Helpers */
let wakeLock = null;
let isAlarmRinging = false;

async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      console.log('[Anti-Escape] Screen Wake Lock active');
    }
  } catch (err) {
    console.warn('[Anti-Escape] Wake Lock failed:', err);
  }
}

function releaseWakeLock() {
  if (wakeLock !== null) {
    wakeLock.release().then(() => {
      wakeLock = null;
      console.log('[Anti-Escape] Screen Wake Lock released');
    });
  }
}

function enterFullscreen() {
  const docEl = document.documentElement;
  if (docEl.requestFullscreen) {
    docEl.requestFullscreen().catch(err => console.warn('[Anti-Escape] Fullscreen failed:', err));
  } else if (docEl.webkitRequestFullscreen) {
    docEl.webkitRequestFullscreen().catch(err => console.warn('[Anti-Escape] Webkit Fullscreen failed:', err));
  }
}

function exitFullscreen() {
  if (document.fullscreenElement || document.webkitFullscreenElement) {
    if (document.exitFullscreen) {
      document.exitFullscreen().catch(err => console.warn('[Anti-Escape] Exit Fullscreen failed:', err));
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen().catch(err => console.warn('[Anti-Escape] Webkit Exit Fullscreen failed:', err));
    }
  }
}

/* Audio Autoplay Unlock System */
let audioUnlocked = false;

function unlockAudio() {
  if (audioUnlocked) return;

  // 1. Unlock Web Audio API Context
  const dummyCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (dummyCtx.state === 'suspended') {
    dummyCtx.resume().then(() => {
      dummyCtx.close();
      audioUnlocked = true;
      console.log('[Audio] Web Audio context unlocked');
    }).catch(e => console.warn('[Audio] Web Audio unlock failed:', e));
  } else {
    dummyCtx.close();
    audioUnlocked = true;
    console.log('[Audio] Web Audio context already active');
  }

  // 2. Unlock HTML5 Audio element
  const audioEl = document.getElementById('alarmAudio');
  if (audioEl) {
    audioEl.play().then(() => {
      audioEl.pause();
      audioEl.currentTime = 0;
      console.log('[Audio] HTML5 Audio element unlocked');
    }).catch(err => {
      console.warn('[Audio] HTML5 Audio element unlock blocked:', err);
    });
  }

  // 3. Hide banner and adjust padding
  const banner = document.getElementById('audioUnlockBanner');
  if (banner) {
    banner.classList.add('hide');
  }
  document.body.classList.remove('has-banner');

  // Clean up gesture listeners
  document.removeEventListener('click', unlockAudio);
  document.removeEventListener('touchstart', unlockAudio);
}

// Listen for first interaction gestures to unlock audio
document.addEventListener('click', unlockAudio);
document.addEventListener('touchstart', unlockAudio);

/* ════════════════════════════════════
   INDEXEDDB FOR CUSTOM RINGTONES
════════════════════════════════════ */
const DB_NAME = 'BeatTheClockDB';
const STORE_NAME = 'audioStore';
const TONE_KEY = 'custom_ringtone';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = event => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = event => resolve(event.target.result);
    request.onerror = event => reject(event.target.error);
  });
}

async function saveCustomAudio(file) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const data = {
      name: file.name,
      type: file.type,
      blob: file
    };
    const request = store.put(data, TONE_KEY);
    request.onsuccess = () => resolve();
    request.onerror = event => reject(event.target.error);
  });
}

async function getCustomAudio() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(TONE_KEY);
    request.onsuccess = event => resolve(event.target.result);
    request.onerror = event => reject(event.target.error);
  });
}

async function handleCustomToneUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (!file.type.startsWith('audio/')) {
    alert('Please select a valid audio file (e.g. mp3, wav, ogg)');
    return;
  }

  try {
    await saveCustomAudio(file);
    console.log('[Custom Tone] Saved song:', file.name);
    showCustomToneButton(file.name);
  } catch (err) {
    console.error('[Custom Tone] Failed to save custom audio:', err);
    alert('Failed to save the song file. Please try again.');
  }
}

function showCustomToneButton(fileName) {
  const customOpt = document.getElementById('modalCustomRingtoneOpt');
  if (customOpt) {
    customOpt.textContent = `🎼 Custom: ${fileName}`;
    customOpt.style.display = 'block';
  }
  // Automatically select the custom song when uploaded successfully
  selectCustomOption('ringtoneSelectWrapper', 'custom', `🎼 Custom: ${fileName}`);
}

async function loadCustomTone() {
  try {
    const data = await getCustomAudio();
    if (data && data.name) {
      showCustomToneButton(data.name);
      console.log('[Custom Tone] Loaded saved song:', data.name);
    }
  } catch (err) {
    console.warn('[Custom Tone] No saved song found in IndexedDB:', err);
  }
}

/* ════════════════════════════════════
   ADD ALARM MODAL LOGIC (CUSTOM SELECT)
════════════════════════════════════ */
let modalSelectedTone = 'siren';
let modalSelectedGame = 'snake';
let modalSelectedRepeat = 'once';

function toggleCustomSelect(wrapperId) {
  // Close any other custom dropdowns
  document.querySelectorAll('.custom-select-wrapper').forEach(w => {
    if (w.id !== wrapperId) {
      w.classList.remove('open');
    }
  });

  const wrapper = document.getElementById(wrapperId);
  if (wrapper) {
    wrapper.classList.toggle('open');
  }
}

function selectCustomOption(wrapperId, value, labelText) {
  const wrapper = document.getElementById(wrapperId);
  if (!wrapper) return;

  if (wrapperId === 'ringtoneSelectWrapper' && value === 'add_song') {
    document.getElementById('customToneInput').click();
    wrapper.classList.remove('open');
    return;
  }

  // Update selected highlight class
  wrapper.querySelectorAll('.custom-option').forEach(opt => {
    opt.classList.toggle('selected', opt.dataset.value === value);
  });

  // Save selection value to local module state
  if (wrapperId === 'ringtoneSelectWrapper') {
    modalSelectedTone = value;
    document.getElementById('ringtoneSelectedVal').innerHTML = labelText;
  } else if (wrapperId === 'gameSelectWrapper') {
    modalSelectedGame = value;
    document.getElementById('gameSelectedVal').innerHTML = labelText;
  } else if (wrapperId === 'repeatSelectWrapper') {
    modalSelectedRepeat = value;
    document.getElementById('repeatSelectedVal').innerHTML = labelText;
  }

  wrapper.classList.remove('open');
  updateModalTimeNotice();
}

// Global click handler to close dropdowns if clicked outside
window.addEventListener('click', (e) => {
  if (!e.target.closest('.custom-select-wrapper')) {
    document.querySelectorAll('.custom-select-wrapper').forEach(w => w.classList.remove('open'));
  }
});

function openAddAlarmModal() {
  resetModalTimePicker();
  
  // Clear modal inputs
  document.getElementById('modalLabel').value = '';
  document.getElementById('modalVibrate').checked = true;
  document.getElementById('modalDeleteAfterRing').checked = false;
  
  // Default values
  modalSelectedTone = 'siren';
  modalSelectedGame = 'snake';
  modalSelectedRepeat = 'once';

  const customOpt = document.getElementById('modalCustomRingtoneOpt');
  if (customOpt && customOpt.style.display !== 'none') {
    modalSelectedTone = 'custom';
  }

  // Sync custom dropdown selections to default display
  const toneLabel = modalSelectedTone === 'custom' ? customOpt.textContent : '🚨 Siren';
  selectCustomOption('ringtoneSelectWrapper', modalSelectedTone, toneLabel);
  selectCustomOption('gameSelectWrapper', 'snake', '🐍 Snake Game');
  selectCustomOption('repeatSelectWrapper', 'once', '🎯 Once');

  const modal = document.getElementById('addAlarmModal');
  if (modal) {
    modal.classList.add('active');
  }
  updateModalTimeNotice();
}

function closeAddAlarmModal() {
  const modal = document.getElementById('addAlarmModal');
  if (modal) {
    modal.classList.remove('active');
  }
}

function toggleSwitch(id) {
  const cb = document.getElementById(id);
  if (cb) {
    cb.checked = !cb.checked;
    cb.dispatchEvent(new Event('change'));
  }
  updateModalTimeNotice();
}

function handleVibrateToggle(cb) {
  if (cb.checked && navigator.vibrate) {
    navigator.vibrate(150);
  }
}

function getSelectedWheelValue(viewportId) {
  const viewport = document.getElementById(viewportId);
  if (!viewport) return null;
  const activeItem = viewport.querySelector('.picker-item.active');
  return activeItem ? activeItem.dataset.value : null;
}

let scrollTimers = {};

function handleWheelScroll(viewportId) {
  const viewport = document.getElementById(viewportId);
  if (!viewport) return;

  clearTimeout(scrollTimers[viewportId]);
  scrollTimers[viewportId] = setTimeout(() => {
    updateActiveWheelItem(viewport);
  }, 80);
}

function updateActiveWheelItem(viewport) {
  const itemHeight = 30; // height of picker-item in pixels
  const scrollTop = viewport.scrollTop;
  const index = Math.round(scrollTop / itemHeight);
  const items = viewport.querySelectorAll('.picker-item');

  items.forEach((item, idx) => {
    if (idx === index) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  updateModalTimeNotice();
}

function setWheelPickerTime(hour, minute, ampm) {
  const hourViewport = document.getElementById('pickerHour');
  const minViewport = document.getElementById('pickerMinute');
  const ampmViewport = document.getElementById('pickerAMPM');
  const itemHeight = 30;

  if (hourViewport) {
    const index = parseInt(hour, 10) - 1;
    // Account for 2 spacers at the beginning of the viewport scroll
    hourViewport.scrollTop = index * itemHeight;
    updateActiveWheelItem(hourViewport);
  }

  if (minViewport) {
    const index = parseInt(minute, 10);
    minViewport.scrollTop = index * itemHeight;
    updateActiveWheelItem(minViewport);
  }

  if (ampmViewport) {
    const index = ampm === 'PM' ? 1 : 0;
    ampmViewport.scrollTop = index * itemHeight;
    updateActiveWheelItem(ampmViewport);
  }
}

function updateModalTimeNotice() {
  const hStr = getSelectedWheelValue('pickerHour');
  const mStr = getSelectedWheelValue('pickerMinute');
  const ampmVal = getSelectedWheelValue('pickerAMPM');
  const noticeEl = document.getElementById('modalAlarmDelayNotice');
  if (!noticeEl || !hStr || !mStr || !ampmVal) return;

  const hVal = parseInt(hStr, 10);
  const mVal = parseInt(mStr, 10);
  if (isNaN(hVal) || isNaN(mVal)) return;

  let targetHour = hVal;
  if (ampmVal === 'PM' && targetHour < 12) targetHour += 12;
  if (ampmVal === 'AM' && targetHour === 12) targetHour = 0;

  const now = new Date();
  const target = new Date(now);
  target.setHours(targetHour, mVal, 0, 0);

  if (target <= now) {
    target.setDate(target.getDate() + 1);
  }

  const diffMs = target - now;
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMins = Math.ceil((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  let timeString = '';
  if (diffHours > 0) {
    timeString += `${diffHours} hour${diffHours > 1 ? 's' : ''} `;
  }
  timeString += `${diffMins} minute${diffMins > 1 ? 's' : ''}`;

  noticeEl.textContent = `Alarm in ${timeString}`;
}

function saveNewAlarmFromModal() {
  const hStr = getSelectedWheelValue('pickerHour');
  const mStr = getSelectedWheelValue('pickerMinute');
  const ampmVal = getSelectedWheelValue('pickerAMPM');

  if (!hStr || !mStr || !ampmVal) {
    alert('Please select a valid time.');
    return;
  }

  const hVal = parseInt(hStr, 10);
  const mVal = parseInt(mStr, 10);
  const toneVal = modalSelectedTone;
  const gameVal = modalSelectedGame;
  const repeatVal = modalSelectedRepeat;
  const vibrateVal = document.getElementById('modalVibrate').checked;
  const deleteAfterRingVal = document.getElementById('modalDeleteAfterRing').checked;
  const labelVal = document.getElementById('modalLabel').value.trim() || 'Alarm';

  if (isNaN(hVal) || isNaN(mVal)) {
    alert('Please select a valid time.');
    return;
  }

  // Convert to 24-hour format string for checking logic
  let targetHour = hVal;
  if (ampmVal === 'PM' && targetHour < 12) targetHour += 12;
  if (ampmVal === 'AM' && targetHour === 12) targetHour = 0;
  const time24h = `${String(targetHour).padStart(2, '0')}:${String(mVal).padStart(2, '0')}`;

  const id = Date.now().toString();
  const timeStr = `${String(hVal).padStart(2, '0')}:${String(mVal).padStart(2, '0')} ${ampmVal}`;

  const newAlarmObj = {
    id: id,
    time: time24h,
    hour: hVal,
    minute: mVal,
    ampm: ampmVal,
    tone: toneVal,
    game: gameVal,
    freq: repeatVal,
    enabled: true,
    label: labelVal,
    vibrate: vibrateVal,
    deleteAfterRing: deleteAfterRingVal,
    timeStr: timeStr,
    ringing: false
  };

  alarms.push(newAlarmObj);
  saveAlarms();
  renderAlarms();
  startAlarmChecks();
  scheduleLocalNotification(newAlarmObj);
  closeAddAlarmModal();
}

function initTimePickers() {
  const hourViewport = document.getElementById('pickerHour');
  const minViewport = document.getElementById('pickerMinute');
  if (!hourViewport || !minViewport) return;

  // Render Hours 1-12
  let hHtml = '<div class="picker-spacer"></div><div class="picker-spacer"></div>';
  for (let h = 1; h <= 12; h++) {
    hHtml += `<div class="picker-item" data-value="${h}">${String(h).padStart(2, '0')}</div>`;
  }
  hHtml += '<div class="picker-spacer"></div><div class="picker-spacer"></div>';
  hourViewport.innerHTML = hHtml;

  // Render Minutes 00-59
  let mHtml = '<div class="picker-spacer"></div><div class="picker-spacer"></div>';
  for (let m = 0; m < 60; m++) {
    mHtml += `<div class="picker-item" data-value="${String(m).padStart(2, '0')}">${String(m).padStart(2, '0')}</div>`;
  }
  mHtml += '<div class="picker-spacer"></div><div class="picker-spacer"></div>';
  minViewport.innerHTML = mHtml;

  resetModalTimePicker();
}

function resetModalTimePicker() {
  const now = new Date();
  let currentHour = now.getHours();
  let currentMin = now.getMinutes() + 1; // Default to 1 minute from now
  if (currentMin >= 60) {
    currentMin = 0;
    currentHour++;
  }

  let currentAMPM = currentHour >= 12 ? 'PM' : 'AM';
  currentHour = currentHour % 12;
  if (currentHour === 0) currentHour = 12;

  // Set the scroll position for wheel pickers
  setTimeout(() => {
    setWheelPickerTime(currentHour, currentMin, currentAMPM);
  }, 100);
}

const TONES = {
  /* 🚨 Siren — sweeping square wave */
  siren(ctx, t0, vol) {
    function layer(type, f1, f2, dur, g) {
      const o = ctx.createOscillator(), gn = ctx.createGain();
      o.connect(gn); gn.connect(ctx.destination);
      o.type = type;
      o.frequency.setValueAtTime(f1, t0);
      o.frequency.linearRampToValueAtTime(f2, t0 + dur/2);
      o.frequency.linearRampToValueAtTime(f1, t0 + dur);
      gn.gain.setValueAtTime(g * vol, t0);
      gn.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      o.start(t0); o.stop(t0 + dur);
    }
    layer('square',  1200, 700,  0.9, 0.50);
    layer('sawtooth', 600, 300,  0.9, 0.30);
    layer('square',  2200, 2200, 0.08,0.25);
    layer('square',  2200, 2200, 0.08,0.25); // doubles at t0+0.45
    const o2 = ctx.createOscillator(), g2 = ctx.createGain();
    o2.connect(g2); g2.connect(ctx.destination);
    o2.type = 'square'; o2.frequency.value = 2200;
    g2.gain.setValueAtTime(0.25*vol, t0+0.45);
    g2.gain.exponentialRampToValueAtTime(0.001, t0+0.53);
    o2.start(t0+0.45); o2.stop(t0+0.53);
    return 1000;
  },

  /* 📟 Digital — rapid beep burst */
  digital(ctx, t0, vol) {
    const beeps = [0, 0.18, 0.36, 0.72, 0.90];
    beeps.forEach(offset => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = 'square'; o.frequency.value = 1760;
      g.gain.setValueAtTime(0.45 * vol, t0 + offset);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + offset + 0.12);
      o.start(t0 + offset); o.stop(t0 + offset + 0.13);
    });
    // low undertone
    const o2 = ctx.createOscillator(), g2 = ctx.createGain();
    o2.connect(g2); g2.connect(ctx.destination);
    o2.type = 'sawtooth'; o2.frequency.value = 220;
    g2.gain.setValueAtTime(0.20 * vol, t0);
    g2.gain.exponentialRampToValueAtTime(0.001, t0 + 1.1);
    o2.start(t0); o2.stop(t0 + 1.1);
    return 1400;
  },

  /* 🔔 Classic Bell — tonal ring with harmonics */
  classic(ctx, t0, vol) {
    function bell(freq, dur, g) {
      const o = ctx.createOscillator(), gn = ctx.createGain();
      o.connect(gn); gn.connect(ctx.destination);
      o.type = 'sine'; o.frequency.value = freq;
      gn.gain.setValueAtTime(g * vol, t0);
      gn.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      o.start(t0); o.stop(t0 + dur);
    }
    // Ding at 0, 0.5, 1.0
    [0, 0.5, 1.0].forEach(off => {
      bell(1318 + off*0, 0.45, 0.50);
      bell(2637, 0.3, 0.20);
      bell(3951, 0.2, 0.12);
    });
    // Re-ding
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'sine'; o.frequency.value = 1318;
    g.gain.setValueAtTime(0.50*vol, t0+0.5);
    g.gain.exponentialRampToValueAtTime(0.001, t0+0.95);
    o.start(t0+0.5); o.stop(t0+0.96);
    return 1400;
  },

  /* 📢 Loud Buzzer — aggressive industrial */
  buzzer(ctx, t0, vol) {
    function buz(type, f, start, end, g) {
      const o = ctx.createOscillator(), gn = ctx.createGain();
      o.connect(gn); gn.connect(ctx.destination);
      o.type = type; o.frequency.value = f;
      gn.gain.setValueAtTime(g * vol, t0 + start);
      gn.gain.setValueAtTime(g * vol, t0 + end - 0.01);
      gn.gain.exponentialRampToValueAtTime(0.001, t0 + end);
      o.start(t0 + start); o.stop(t0 + end);
    }
    buz('sawtooth', 120, 0,    0.25, 0.55);
    buz('square',   440, 0,    0.25, 0.50);
    buz('sawtooth', 120, 0.35, 0.60, 0.55);
    buz('square',   440, 0.35, 0.60, 0.50);
    buz('sawtooth', 120, 0.70, 0.95, 0.55);
    buz('square',   550, 0.70, 0.95, 0.45);
    // noise-like overdrive via many simultaneous detuned saws
    [80,90,100,110,130].forEach((f,i) => {
      buz('sawtooth', f, i*0.01, 0.95, 0.10);
    });
    return 1100;
  }
};

function playTone(name, ctx, vol) {
  const fn = TONES[name] || TONES.siren;
  return fn(ctx, ctx.currentTime, vol);
}

/* Vibration loop helpers */
let vibrationInterval = null;

function startVibration() {
  if (navigator.vibrate) {
    vibrationInterval = setInterval(() => {
      navigator.vibrate(500);
    }, 1000);
    navigator.vibrate(500);
  }
}

function stopVibration() {
  if (vibrationInterval) {
    clearInterval(vibrationInterval);
    vibrationInterval = null;
  }
  if (navigator.vibrate) {
    navigator.vibrate(0);
  }
}

let customToneObjectUrl = null;

async function startAlarm(toneName) {
  stopAlarm();
  isAlarmRinging = true;
  
  const audioEl = document.getElementById('alarmAudio');
  if (audioEl) {
    audioEl.volume = 1.0; // Enforce maximum volume
    audioEl.currentTime = 0;
    
    if (toneName === 'custom') {
      try {
        const data = await getCustomAudio();
        if (data && data.blob) {
          if (customToneObjectUrl) {
            URL.revokeObjectURL(customToneObjectUrl);
          }
          customToneObjectUrl = URL.createObjectURL(data.blob);
          audioEl.src = customToneObjectUrl;
          audioEl.loop = true;
        } else {
          audioEl.src = 'https://assets.mixkit.co/active_storage/sfx/911/911-84.wav';
        }
      } catch (err) {
        console.error('[Alarm] Failed to load custom audio Blob:', err);
        audioEl.src = 'https://assets.mixkit.co/active_storage/sfx/911/911-84.wav';
      }
    } else {
      audioEl.src = 'https://assets.mixkit.co/active_storage/sfx/911/911-84.wav';
    }

    audioEl.play().catch(err => {
      console.warn("Autoplay policy blocked initial playback. Will play on first user interaction.", err);
    });
  }

  if (toneName !== 'custom') {
    alarmAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    // Enforce audio state
    alarmAudioCtx.onstatechange = () => {
      if (alarmAudioCtx && alarmAudioCtx.state === 'suspended' && isAlarmRinging) {
        alarmAudioCtx.resume().catch(e => console.warn('Enforcing resume:', e));
      }
    };

    function loop() {
      if (!alarmAudioCtx) return;
      const delay = playTone(toneName, alarmAudioCtx, 1.0);
      alarmLoopTimer = setTimeout(loop, delay);
    }
    loop();
  }
}

function stopAlarm() {
  if (window.Capacitor && window.Capacitor.isPluginAvailable('AlarmPlugin')) {
    window.Capacitor.Plugins.AlarmPlugin.stopRinging();
  }

  isAlarmRinging = false;
  releaseWakeLock();
  exitFullscreen();

  clearTimeout(alarmLoopTimer); alarmLoopTimer = null;
  if (alarmAudioCtx) { try { alarmAudioCtx.close(); } catch(e){} alarmAudioCtx = null; }
  
  const audioEl = document.getElementById('alarmAudio');
  if (audioEl) {
    audioEl.pause();
    audioEl.src = '';
  }

  if (customToneObjectUrl) {
    URL.revokeObjectURL(customToneObjectUrl);
    customToneObjectUrl = null;
  }

  // Stop vibration
  stopVibration();

  // Handle post-ringing lifecycle: auto-delete or once-off disabling
  if (currentAlarmObj) {
    if (currentAlarmObj.deleteAfterRing) {
      alarms = alarms.filter(a => a.id !== currentAlarmObj.id);
    } else if (currentAlarmObj.freq === 'once') {
      const alarmToDisable = alarms.find(a => a.id === currentAlarmObj.id);
      if (alarmToDisable) {
        alarmToDisable.enabled = false;
      }
    }
    saveAlarms();
    renderAlarms();
    currentAlarmObj = null;
  }
}

let previewAudioEl = null;

async function previewTone(name, e) {
  e.stopPropagation();
  clearTimeout(previewTimer);
  
  if (previewAudioEl) {
    try { previewAudioEl.pause(); } catch(ex){}
    previewAudioEl = null;
  }
  if (previewCtx) { 
    try { previewCtx.close(); } catch(ex){} 
    previewCtx = null; 
  }

  if (name === 'custom') {
    try {
      const data = await getCustomAudio();
      if (!data || !data.blob) {
        alert('Please add a song first using the "+ Add Song" button!');
        return;
      }
      const audioUrl = URL.createObjectURL(data.blob);
      previewAudioEl = new Audio(audioUrl);
      previewAudioEl.volume = 0.6;
      previewAudioEl.play().catch(err => console.warn('[Preview] Failed to play custom audio:', err));
      
      previewTimer = setTimeout(() => {
        if (previewAudioEl) {
          try { previewAudioEl.pause(); } catch(ex){}
          previewAudioEl = null;
        }
        URL.revokeObjectURL(audioUrl);
      }, 2000);
    } catch (err) {
      console.error('[Preview] Failed to load custom audio:', err);
    }
  } else {
    previewCtx = new (window.AudioContext || window.webkitAudioContext)();
    playTone(name, previewCtx, 0.6);
    previewTimer = setTimeout(() => {
      if (previewCtx) { try { previewCtx.close(); } catch(ex){} previewCtx = null; }
    }, 2000);
  }
}


function selectTone(btn) {
  document.querySelectorAll('.ringtone-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  selectedTone = btn.dataset.tone;
}

/* ════════════════════════════════════
   ALARM STORE — multiple alarms
════════════════════════════════════ */
let alarms = [];      // [{id, time, tone, enabled, ringing}]
let alarmCheckInterval  = null;
let countdownInterval   = null;

function saveAlarms() {
  localStorage.setItem('alarms', JSON.stringify(alarms));
}

function loadAlarms() {
  const saved = localStorage.getItem('alarms');
  if (saved) {
    try {
      alarms = JSON.parse(saved);
      alarms.forEach(a => { a.ringing = false; });
    } catch (e) {
      alarms = [];
    }
  } else {
    alarms = [];
  }
  renderAlarms();
  if (alarms.length > 0) {
    startAlarmChecks();
  }
}



function deleteAlarm(id) {
  const idStr = String(id);
  alarms = alarms.filter(a => String(a.id) !== idStr);
  saveAlarms();
  renderAlarms();
  cancelLocalNotification(idStr); // Cancel notification
  if (alarms.length === 0) stopAlarmChecks();
}

function toggleAlarm(id, checked) {
  const idStr = String(id);
  const a = alarms.find(a => String(a.id) === idStr);
  if (a) { 
    a.enabled = checked; 
    saveAlarms();
    renderAlarms(); 
    if (checked) {
      scheduleLocalNotification(a); // Reschedule notification
    } else {
      cancelLocalNotification(idStr); // Cancel notification
    }
  }
}

function clearAllAlarms() {
  if (!alarms.length) return;
  if (!confirm('clear all alarms?')) return;
  alarms = [];
  saveAlarms();
  renderAlarms();
  stopAlarmChecks();
  cancelAllLocalNotifications(); // Cancel all notifications
  setGlobalStatus('idle', 'no alarms active');
}

function renderAlarms() {
  const list = document.getElementById('alarmList');
  const emptyContainer = document.getElementById('emptyAlarmsContainer');
  const fabBtn = document.getElementById('fabAddAlarmBtn');

  // Toggle FAB vs Center Add container dynamically
  if (!alarms.length) {
    if (emptyContainer) emptyContainer.style.display = 'flex';
    if (fabBtn) fabBtn.style.display = 'none';
    if (list) {
      list.innerHTML = '<div class="empty-alarms">no alarms active — tap above to add one ➕</div>';
    }
    return;
  } else {
    if (emptyContainer) emptyContainer.style.display = 'none';
    if (fabBtn) fabBtn.style.display = 'block';
  }

  if (!list) return;

  list.innerHTML = alarms.map(a => {
    let toneLabel = { siren:'🚨 Siren', digital:'📟 Digital', classic:'🔔 Classic Bell', buzzer:'📢 Loud Buzzer' }[a.tone];
    if (a.tone === 'custom') {
      toneLabel = '🎼 Custom Song';
    } else if (!toneLabel) {
      toneLabel = a.tone || '🚨 Siren';
    }
    
    const gameLabel = a.game === 'sudoku' ? '🔢 Sudoku' : (a.game === 'memory' ? '🧠 Memory Match' : (a.game === 'math' ? '🧮 Math Puzzle' : '🐍 Snake'));
    const freqLabel = a.freq === 'daily' ? '🔁 Daily' : '🎯 Once';
    const cdText = a.enabled ? getCountdownText(a.time) : 'disabled';
    
    const parts = a.time.split(':');
    let h24 = parseInt(parts[0], 10);
    const m = parts[1];
    const ampm = h24 >= 12 ? 'PM' : 'AM';
    let h12 = h24 % 12;
    if (h12 === 0) h12 = 12;
    const displayTime = `${String(h12).padStart(2, '0')}:${m} ${ampm}`;
    const alarmLabel = a.label || 'Alarm';
    
    return `<div class="alarm-item ${a.enabled ? 'enabled' : ''} ${a.ringing ? 'ringing-item' : ''}" id="item-${a.id}">
      <div class="alarm-time-lbl" style="font-size: 18px; min-width: 95px;">${displayTime}</div>
      <div class="alarm-meta">
        <span class="alarm-title-lbl" style="font-weight: 700; color: var(--text); font-size: 13px; display: block; margin-bottom: 2px;">${alarmLabel}</span>
        <span class="alarm-ringtone-lbl">${toneLabel} · ${gameLabel} · ${freqLabel}</span>
        <span class="alarm-countdown-lbl">${cdText}</span>
      </div>
      <label class="alarm-toggle" title="enable/disable">
        <input type="checkbox" ${a.enabled ? 'checked' : ''} onchange="toggleAlarm(${a.id}, this.checked)" />
        <span class="toggle-track"></span>
        <span class="toggle-thumb"></span>
      </label>
      <button class="alarm-del-btn" onclick="deleteAlarm(${a.id})" title="delete">✕</button>
    </div>`;
  }).join('');
}

function getCountdownText(timeStr) {
  const now    = new Date();
  const parts  = timeStr.split(':');
  const target = new Date(now);
  target.setHours(+parts[0], +parts[1], 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  const diff = Math.round((target - now) / 1000);
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  if (diff < 60) return `rings in ${s}s`;
  if (h === 0)   return `rings in ${m}m ${s}s`;
  return `rings in ${h}h ${m}m`;
}

function startAlarmChecks() {
  if (alarmCheckInterval) return;
  alarmCheckInterval = setInterval(checkAllAlarms, 5000);
  countdownInterval  = setInterval(() => renderAlarms(), 1000);
  checkAllAlarms();
  updateGlobalStatus();
}
function stopAlarmChecks() {
  clearInterval(alarmCheckInterval); alarmCheckInterval = null;
  clearInterval(countdownInterval);  countdownInterval  = null;
}

function checkAllAlarms() {
  if (!alarms.length) return;
  const now = new Date();
  const hh  = String(now.getHours()).padStart(2,'0');
  const mm  = String(now.getMinutes()).padStart(2,'0');
  const cur = `${hh}:${mm}`;
  const todayStr = now.toDateString();
  for (const a of alarms) {
    if (a.enabled && !a.ringing && a.time === cur && a.lastTriggeredDate !== todayStr) {
      a.lastTriggeredDate = todayStr;
      a.ringing = true;
      triggerAlarm(a);
      break;
    }
  }
  updateGlobalStatus();
}

function updateGlobalStatus() {
  const active = alarms.filter(a => a.enabled);
  if (!active.length) { setGlobalStatus('idle', 'no alarms active'); return; }
  const next = active.slice().sort((a,b) => {
    return getSecsUntil(a.time) - getSecsUntil(b.time);
  })[0];
  
  const parts = next.time.split(':');
  let h24 = parseInt(parts[0], 10);
  const m = parts[1];
  const ampm = h24 >= 12 ? 'PM' : 'AM';
  let h12 = h24 % 12;
  if (h12 === 0) h12 = 12;
  const nextTime12 = `${String(h12).padStart(2, '0')}:${m} ${ampm}`;
  
  setGlobalStatus('active', `next alarm: ${nextTime12}`);
}
function getSecsUntil(timeStr) {
  const now = new Date(), p = timeStr.split(':');
  const t = new Date(now); t.setHours(+p[0],+p[1],0,0);
  if (t <= now) t.setDate(t.getDate()+1);
  return (t - now) / 1000;
}

function setGlobalStatus(state, msg) {
  const pill = document.getElementById('statusPill');
  const dot  = document.getElementById('statusDot');
  pill.className = ''; dot.className = 'dot';
  if (state === 'active')  { pill.className = 'active';  dot.className = 'dot pulse'; }
  if (state === 'ringing') { pill.className = 'ringing'; dot.className = 'dot pulse'; }
  document.getElementById('statusText').textContent = msg;
}

function triggerAlarm(alarmObj) {
  if (window.Capacitor && window.Capacitor.isPluginAvailable('AlarmPlugin')) {
    window.Capacitor.Plugins.AlarmPlugin.startRinging();
  }

  renderAlarms();
  setGlobalStatus('ringing', `alarm! ${alarmObj.time}`);
  startAlarm(alarmObj.tone);
  showOverlay(alarmObj);

  if (alarmObj.vibrate) {
    startVibration();
  }

  // Activate Wake Lock and Fullscreen immediately if possible
  requestWakeLock();
  enterFullscreen();

  // Backup: Force activation on first tap/click when alarm goes off
  const activateOnInteraction = () => {
    if (isAlarmRinging) {
      requestWakeLock();
      enterFullscreen();
    }
    document.removeEventListener('click', activateOnInteraction);
    document.removeEventListener('touchstart', activateOnInteraction);
  };
  document.addEventListener('click', activateOnInteraction, { once: true });
  document.addEventListener('touchstart', activateOnInteraction, { once: true });

  const activeGame = alarmObj.game || 'snake';
  
  // Hide all game containers first
  document.getElementById('gameCanvas').style.display = 'none';
  document.getElementById('sudokuContainer').style.display = 'none';
  document.getElementById('memoryContainer').style.display = 'none';
  document.getElementById('mathContainer').style.display = 'none';
  
  document.querySelector('.score-strip').style.display = 'none';
  document.querySelector('.progress-wrap').style.display = 'none';
  document.querySelector('.dpad-grid').style.display = 'none';
  document.querySelector('#overlay .hint').style.display = 'none';

  if (activeGame === 'sudoku') {
    document.getElementById('overlayTitle').textContent = `⏰ wake up! it's ${alarmObj.time}`;
    document.getElementById('sudokuContainer').style.display = 'flex';
    initSudoku();
  } else if (activeGame === 'memory') {
    document.getElementById('overlayTitle').textContent = `⏰ wake up! it's ${alarmObj.time}`;
    document.getElementById('memoryContainer').style.display = 'flex';
    initMemoryMatch();
  } else if (activeGame === 'math') {
    document.getElementById('overlayTitle').textContent = `⏰ wake up! it's ${alarmObj.time}`;
    document.getElementById('mathContainer').style.display = 'flex';
    initMathPuzzle();
  } else {
    document.getElementById('overlayTitle').textContent = `⏰ wake up! it's ${alarmObj.time}`;
    document.getElementById('gameCanvas').style.display = 'block';
    document.querySelector('.score-strip').style.display = 'flex';
    document.querySelector('.progress-wrap').style.display = 'block';
    document.querySelector('.dpad-grid').style.display = 'grid';
    document.querySelector('#overlay .hint').style.display = 'block';
    resetGame(); startGame();
  }
}

/* ════════════════════════════════════
   OVERLAY
 ════════════════════════════════════ */
let currentAlarmObj = null;

function showOverlay(alarmObj) {
  currentAlarmObj = alarmObj;
  document.getElementById('overlay').classList.add('show');
  document.body.style.overflow = 'hidden';
}
function hideOverlay() {
  document.getElementById('overlay').classList.remove('show');
  document.body.style.overflow = '';
  stopGame();
  stopMathTimer();
}
function showWin() {
  stopAlarm();
  hideOverlay();
  const isSudoku = currentAlarmObj && currentAlarmObj.game === 'sudoku';
  const isMemory = currentAlarmObj && currentAlarmObj.game === 'memory';
  const isMath = currentAlarmObj && currentAlarmObj.game === 'math';
  if (currentAlarmObj) {
    currentAlarmObj.ringing = false;
    if (currentAlarmObj.frequency === 'once') {
      currentAlarmObj.enabled = false; // disable after dismiss
    }
    saveAlarms();
    renderAlarms();
    currentAlarmObj = null;
  }
  updateGlobalStatus();
  if (isSudoku) {
    document.getElementById('winStat').textContent = `Sudoku puzzle solved!`;
  } else if (isMemory) {
    document.getElementById('winStat').textContent = `Memory matched all pairs!`;
  } else if (isMath) {
    document.getElementById('winStat').textContent = `Math puzzles completed!`;
  } else {
    document.getElementById('winStat').textContent = `score: ${score} · best: ${bestScore}`;
  }
  document.getElementById('winScreen').classList.add('show');
  setTimeout(() => document.getElementById('winScreen').classList.remove('show'), 4000);
}

/* ════════════════════════════════════
   SNAKE GAME  — slower speed
════════════════════════════════════ */
const TILE = 18, COLS = 20, ROWS = 20, WIN = 5;
const SPEED_INIT = 190;   // slower start (was 130)
const SPEED_MIN  = 120;   // slower ceiling (was 70)

const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');
canvas.width  = COLS * TILE;
canvas.height = ROWS * TILE;

let snake, dir, nextDir, food, bonus;
let score, bestScore = 0, lives, livesMax, gameLoop, gameRunning, totalEaten;
let bonusTimer = null, bonusActive = false, particles = [];

function resetGame() {
  snake = [{x:10,y:10},{x:9,y:10},{x:8,y:10}];
  dir = nextDir = {x:1,y:0};
  score = 0; lives = 1; livesMax = 1; totalEaten = 0;
  bonusActive = false; particles = [];
  if (bonusTimer) { clearTimeout(bonusTimer); bonusTimer = null; }
  placeFood(); updateHUD();
  document.getElementById('gameMessage').textContent = '';
  document.getElementById('gameMessage').className   = '';
  draw();
}
function startGame() {
  if (gameLoop) clearInterval(gameLoop);
  gameRunning = true;
  gameLoop = setInterval(tick, Math.max(SPEED_MIN, SPEED_INIT - totalEaten * 4));
  scheduleBonusDrop();
}
function stopGame() {
  gameRunning = false;
  clearInterval(gameLoop); gameLoop = null;
  clearTimeout(bonusTimer); bonusTimer = null;
}

function placeFood() {
  let p; do { p = {x:rnd(COLS),y:rnd(ROWS)}; } while (occupied(p));
  food = p;
}
function placeBonus() {
  let p, t=0;
  do { p={x:rnd(COLS),y:rnd(ROWS)}; t++; } while (occupied(p) && t<50);
  bonus = p; bonusActive = true;
  bonusTimer = setTimeout(()=>{ bonusActive=false; draw(); }, 5000);
}
function scheduleBonusDrop() {
  bonusTimer = setTimeout(()=>{
    if (gameRunning && !bonusActive) placeBonus();
    scheduleBonusDrop();
  }, 8000 + Math.random()*6000);
}
function occupied(p) {
  return snake.some(s=>s.x===p.x&&s.y===p.y)||(food&&food.x===p.x&&food.y===p.y);
}
function rnd(n) { return Math.floor(Math.random()*n); }

function tick() {
  dir = nextDir;
  const head = {x:snake[0].x+dir.x, y:snake[0].y+dir.y};
  if (head.x<0||head.x>=COLS||head.y<0||head.y>=ROWS||snake.some(s=>s.x===head.x&&s.y===head.y)) {
    onDeath(); return;
  }
  snake.unshift(head);
  let ate = false;
  if (head.x===food.x&&head.y===food.y) {
    score++; totalEaten++; ate=true;
    spawnParticles(head.x*TILE+TILE/2, head.y*TILE+TILE/2,'#ff4f5e');
    if (score >= WIN) { onWin(); return; }
    placeFood();
    clearInterval(gameLoop);
    gameLoop = setInterval(tick, Math.max(SPEED_MIN, SPEED_INIT - totalEaten*4));
  }
  if (bonusActive&&head.x===bonus.x&&head.y===bonus.y) {
    score+=2; ate=true; bonusActive=false;
    spawnParticles(head.x*TILE+TILE/2,head.y*TILE+TILE/2,'#ffd700');
    clearTimeout(bonusTimer);
    if (score >= WIN) { onWin(); return; }
  }
  if (!ate) snake.pop();
  updateHUD(); draw();
}

function onDeath() {
  lives--; updateHUD();
  const msg = document.getElementById('gameMessage');
  if (lives<=0) {
    stopGame(); msg.textContent='no lives left! restarting...'; msg.className='danger';
    setTimeout(()=>{ resetGame(); startGame(); }, 1200);
  } else {
    msg.textContent=`💥 oops! ${lives} ${lives===1?'life':'lives'} left`; msg.className='danger';
    snake=[{x:10,y:10},{x:9,y:10},{x:8,y:10}]; dir=nextDir={x:1,y:0}; placeFood();
    setTimeout(()=>{ if(gameRunning){msg.textContent='';msg.className='';} },1000);
  }
}
function onWin() {
  stopAlarm();
  if (score>bestScore) bestScore=score;
  stopGame(); draw();
  const msg=document.getElementById('gameMessage');
  msg.textContent='🎉 you won!'; msg.className='win';
  setTimeout(showWin,1200);
}
function updateHUD() {
  document.getElementById('scoreVal').textContent = score;
  if (score>bestScore) bestScore=score;
  document.getElementById('bestVal').textContent  = bestScore;
  document.getElementById('livesVal').textContent = '♥'.repeat(lives)+'♡'.repeat(Math.max(0,livesMax-lives));
  const pct=Math.min(score/WIN*100,100);
  document.getElementById('progressFill').style.width=pct+'%';
  document.getElementById('progressLabel').textContent=`score: ${score} / ${WIN}`;
  document.getElementById('progressPct').textContent=Math.round(pct)+'%';
}

/* ── Particles ── */
function spawnParticles(cx,cy,color) {
  for(let i=0;i<8;i++){
    const a=(Math.PI*2/8)*i;
    particles.push({x:cx,y:cy,vx:Math.cos(a)*(1.5+Math.random()*2),vy:Math.sin(a)*(1.5+Math.random()*2),alpha:1,color,r:3});
  }
}
function updateParticles() {
  particles=particles.filter(p=>p.alpha>0.05);
  particles.forEach(p=>{p.x+=p.vx;p.y+=p.vy;p.vy+=0.1;p.alpha-=0.06;p.r*=0.92;});
}

/* ── Draw ── */
function draw() {
  const W=canvas.width, H=canvas.height;
  ctx.fillStyle='#090a0f'; ctx.fillRect(0,0,W,H);
  ctx.strokeStyle='#131420'; ctx.lineWidth=0.5;
  for(let c=0;c<=COLS;c++){ctx.beginPath();ctx.moveTo(c*TILE,0);ctx.lineTo(c*TILE,H);ctx.stroke();}
  for(let r=0;r<=ROWS;r++){ctx.beginPath();ctx.moveTo(0,r*TILE);ctx.lineTo(W,r*TILE);ctx.stroke();}

  const fx=food.x*TILE+TILE/2, fy=food.y*TILE+TILE/2;
  ctx.fillStyle='#ff4f5e'; ctx.beginPath(); ctx.arc(fx,fy,TILE/2-2,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='rgba(255,255,255,0.3)'; ctx.beginPath(); ctx.arc(fx-2,fy-2,2.5,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle='#7c6cfc'; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.moveTo(fx+1,fy-TILE/2+2); ctx.lineTo(fx+4,fy-TILE/2-2); ctx.stroke();

  if (bonusActive&&bonus) {
    const bx=bonus.x*TILE+TILE/2, by=bonus.y*TILE+TILE/2;
    ctx.fillStyle='#ffd700'; ctx.beginPath(); ctx.arc(bx,by,TILE/2-1,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#fff'; ctx.font=`bold ${TILE-4}px monospace`;
    ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('★',bx,by+1);
  }

  snake.forEach((seg,i)=>{
    const ratio=1-(i/snake.length)*0.55;
    ctx.fillStyle=i===0?`rgba(0,229,160,${ratio})`:`rgba(124,108,252,${ratio*0.85})`;
    const pad=i===0?1:2;
    roundRect(ctx,seg.x*TILE+pad,seg.y*TILE+pad,TILE-pad*2,TILE-pad*2,4); ctx.fill();
  });

  const h=snake[0],hx=h.x*TILE+TILE/2,hy=h.y*TILE+TILE/2,eo=3;
  let ex1,ey1,ex2,ey2;
  if(dir.x!==0){ex1=hx+dir.x*2;ey1=hy-eo;ex2=hx+dir.x*2;ey2=hy+eo;}
  else{ex1=hx-eo;ey1=hy+dir.y*2;ex2=hx+eo;ey2=hy+dir.y*2;}
  ctx.fillStyle='#0b0c10';
  [[ex1,ey1],[ex2,ey2]].forEach(([x,y])=>{ctx.beginPath();ctx.arc(x,y,2,0,Math.PI*2);ctx.fill();});

  updateParticles();
  particles.forEach(p=>{
    ctx.globalAlpha=p.alpha; ctx.fillStyle=p.color;
    ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill();
  });
  ctx.globalAlpha=1;
}

function roundRect(ctx,x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.arcTo(x+w,y,x+w,y+r,r);
  ctx.lineTo(x+w,y+h-r); ctx.arcTo(x+w,y+h,x+w-r,y+h,r);
  ctx.lineTo(x+r,y+h); ctx.arcTo(x,y+h,x,y+h-r,r);
  ctx.lineTo(x,y+r); ctx.arcTo(x,y,x+r,y,r);
  ctx.closePath();
}

/* ── Controls ── */
document.addEventListener('keydown',e=>{
  if(!gameRunning)return;
  const map={ArrowUp:{x:0,y:-1},ArrowDown:{x:0,y:1},ArrowLeft:{x:-1,y:0},ArrowRight:{x:1,y:0},
             w:{x:0,y:-1},s:{x:0,y:1},a:{x:-1,y:0},d:{x:1,y:0}};
  const nd=map[e.key];
  if(nd&&!(nd.x===-dir.x&&nd.y===-dir.y)){
    nextDir=nd;
    if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) e.preventDefault();
  }
});
function dpad(key){
  if(!gameRunning)return;
  const m={UP:{x:0,y:-1},DOWN:{x:0,y:1},LEFT:{x:-1,y:0},RIGHT:{x:1,y:0}};
  const nd=m[key];
  if(nd&&!(nd.x===-dir.x&&nd.y===-dir.y)) nextDir=nd;
}

let tx=null,ty=null;
canvas.addEventListener('touchstart',e=>{tx=e.touches[0].clientX;ty=e.touches[0].clientY;},{passive:true});
canvas.addEventListener('touchend',e=>{
  if(tx===null)return;
  const dx=e.changedTouches[0].clientX-tx,dy=e.changedTouches[0].clientY-ty;
  Math.abs(dx)>Math.abs(dy)?dpad(dx>0?'RIGHT':'LEFT'):dpad(dy>0?'DOWN':'UP');
  tx=ty=null;
},{passive:true});

/* ════════════════════════════════════
   SUDOKU GAME
════════════════════════════════════ */
let sudokuSolution = [];
let sudokuPuzzle = [];
let sudokuInitial = [];
let selectedSudokuCell = null;

function initSudoku() {
  const basePattern = [
    [1, 2, 3, 4, 5, 6, 7, 8, 9],
    [4, 5, 6, 7, 8, 9, 1, 2, 3],
    [7, 8, 9, 1, 2, 3, 4, 5, 6],
    [2, 3, 4, 5, 6, 7, 8, 9, 1],
    [5, 6, 7, 8, 9, 1, 2, 3, 4],
    [8, 9, 1, 2, 3, 4, 5, 6, 7],
    [3, 4, 5, 6, 7, 8, 9, 1, 2],
    [6, 7, 8, 9, 1, 2, 3, 4, 5],
    [9, 1, 2, 3, 4, 5, 6, 7, 8]
  ];

  const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  for (let i = 8; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [digits[i], digits[j]] = [digits[j], digits[i]];
  }
  let board = basePattern.map(row => row.map(val => digits[val - 1]));

  const rowBlocks = [0, 1, 2];
  shuffleArray(rowBlocks);
  let blockShuffledBoard = [];
  rowBlocks.forEach(b => {
    blockShuffledBoard.push(board[b * 3 + 0]);
    blockShuffledBoard.push(board[b * 3 + 1]);
    blockShuffledBoard.push(board[b * 3 + 2]);
  });
  board = blockShuffledBoard;

  for (let b = 0; b < 3; b++) {
    const cols = [0, 1, 2];
    shuffleArray(cols);
    for (let r = 0; r < 9; r++) {
      const c0 = board[r][b * 3 + 0];
      const c1 = board[r][b * 3 + 1];
      const c2 = board[r][b * 3 + 2];
      board[r][b * 3 + 0] = [c0, c1, c2][cols[0]];
      board[r][b * 3 + 1] = [c0, c1, c2][cols[1]];
      board[r][b * 3 + 2] = [c0, c1, c2][cols[2]];
    }
  }

  sudokuSolution = board.map(row => [...row]);
  sudokuPuzzle = board.map(row => [...row]);

  const emptyCount = 51; // leaves exactly 30 clues (81 - 51 = 30)
  let removed = 0;
  while (removed < emptyCount) {
    const r = Math.floor(Math.random() * 9);
    const c = Math.floor(Math.random() * 9);
    if (sudokuPuzzle[r][c] !== 0) {
      sudokuPuzzle[r][c] = 0;
      removed++;
    }
  }

  sudokuInitial = sudokuPuzzle.map(row => [...row]);
  selectedSudokuCell = null;
  renderSudokuBoard();
  document.getElementById('gameMessage').textContent = 'fill in the missing numbers';
  document.getElementById('gameMessage').className = '';
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function renderSudokuBoard() {
  const grid = document.getElementById('sudokuGrid');
  grid.innerHTML = '';
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const val = sudokuPuzzle[r][c];
      const cell = document.createElement('div');
      cell.className = 'sudoku-cell';
      if (val !== 0) {
        cell.textContent = val;
        if (isCellClue(r, c)) {
          cell.classList.add('clue');
        } else {
          cell.classList.add('empty');
        }
      } else {
        cell.textContent = '';
        cell.classList.add('empty');
      }

      if (selectedSudokuCell && selectedSudokuCell.r === r && selectedSudokuCell.c === c) {
        cell.classList.add('selected');
      }

      if (!isCellClue(r, c)) {
        cell.onclick = () => selectSudokuCell(r, c);
      }
      grid.appendChild(cell);
    }
  }
}

function isCellClue(r, c) {
  return sudokuInitial[r][c] !== 0;
}

function selectSudokuCell(r, c) {
  selectedSudokuCell = { r, c };
  renderSudokuBoard();
}

function pressSudokuNum(num) {
  if (!selectedSudokuCell) return;
  const { r, c } = selectedSudokuCell;
  sudokuPuzzle[r][c] = num;
  renderSudokuBoard();
  checkSudokuWin();
}

function checkSudokuWin() {
  let won = true;
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (sudokuPuzzle[r][c] !== sudokuSolution[r][c]) {
        won = false;
        break;
      }
    }
  }
  if (won) {
    stopAlarm();
    const msg = document.getElementById('gameMessage');
    msg.textContent = '🎉 Sudoku Solved!';
    msg.className = 'win';
    selectedSudokuCell = null;
    renderSudokuBoard();
    setTimeout(showWin, 1200);
  }
}

/* ════════════════════════════════════
   MEMORY MATCH GAME
════════════════════════════════════ */
let memoryCards = [];
let memoryFlipped = [];
let memoryMatched = 0;
let memoryLock = false;
const MEMORY_EMOJIS = ['🍎', '🍌', '🍒', '🍇', '🍓', '🍑', '🍍', '🍉'];

function initMemoryMatch() {
  let list = [...MEMORY_EMOJIS, ...MEMORY_EMOJIS];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  memoryCards = list;
  memoryFlipped = [];
  memoryMatched = 0;
  memoryLock = false;
  
  renderMemoryBoard();
  document.getElementById('gameMessage').textContent = 'match all pairs to silence the alarm';
  document.getElementById('gameMessage').className = '';
}

function renderMemoryBoard() {
  const grid = document.getElementById('memoryGrid');
  grid.innerHTML = '';
  memoryCards.forEach((emoji, idx) => {
    const card = document.createElement('div');
    card.className = 'memory-card';
    card.id = `mem-${idx}`;
    
    const inner = document.createElement('div');
    inner.className = 'card-inner';
    
    const back = document.createElement('div');
    back.className = 'card-back';
    back.textContent = '❓';
    
    const front = document.createElement('div');
    front.className = 'card-front';
    front.textContent = emoji;
    
    inner.appendChild(back);
    inner.appendChild(front);
    card.appendChild(inner);
    
    card.onclick = () => flipMemoryCard(idx);
    grid.appendChild(card);
  });
}

function flipMemoryCard(idx) {
  if (memoryLock) return;
  const card = document.getElementById(`mem-${idx}`);
  if (card.classList.contains('flipped') || card.classList.contains('matched')) return;
  
  card.classList.add('flipped');
  memoryFlipped.push(idx);
  
  if (memoryFlipped.length === 2) {
    checkMemoryMatch();
  }
}

function checkMemoryMatch() {
  memoryLock = true;
  const [idx1, idx2] = memoryFlipped;
  const val1 = memoryCards[idx1];
  const val2 = memoryCards[idx2];
  
  if (val1 === val2) {
    setTimeout(() => {
      document.getElementById(`mem-${idx1}`).classList.add('matched');
      document.getElementById(`mem-${idx2}`).classList.add('matched');
      memoryFlipped = [];
      memoryMatched++;
      memoryLock = false;
      
      if (memoryMatched === 8) {
        stopAlarm();
        const msg = document.getElementById('gameMessage');
        msg.textContent = '🎉 All Matched!';
        msg.className = 'win';
        setTimeout(showWin, 1200);
      }
    }, 300);
  } else {
    setTimeout(() => {
      document.getElementById(`mem-${idx1}`).classList.remove('flipped');
      document.getElementById(`mem-${idx2}`).classList.remove('flipped');
      memoryFlipped = [];
      memoryLock = false;
    }, 800);
  }
}

/* ════════════════════════════════════
   MATH PUZZLE GAME
════════════════════════════════════ */
let mathTargetScore = 5;
let mathCurrentScore = 0;
let mathCorrectAnswer = 0;
let mathTimeLeft = 10.0;
let mathTimerInterval = null;

function initMathPuzzle() {
  mathCurrentScore = 0;
  generateMathQuestion();
  startMathTimer();
  updateMathHUD();
}

function generateMathQuestion() {
  const ops = ['+', '-', '*', '/'];
  const op = ops[Math.floor(Math.random() * ops.length)];
  let num1, num2, questionText;
  
  if (op === '+') {
    num1 = 5 + Math.floor(Math.random() * 21);
    num2 = 5 + Math.floor(Math.random() * (35 - num1));
    mathCorrectAnswer = num1 + num2;
    questionText = `${num1} + ${num2}`;
  } else if (op === '-') {
    num1 = 15 + Math.floor(Math.random() * 25);
    num2 = 5 + Math.floor(Math.random() * (num1 - 5));
    mathCorrectAnswer = num1 - num2;
    questionText = `${num1} - ${num2}`;
  } else if (op === '*') {
    num1 = 2 + Math.floor(Math.random() * 8);
    num2 = 2 + Math.floor(Math.random() * (Math.floor(39 / num1) - 1));
    mathCorrectAnswer = num1 * num2;
    questionText = `${num1} × ${num2}`;
  } else {
    num2 = 2 + Math.floor(Math.random() * 8);
    mathCorrectAnswer = 2 + Math.floor(Math.random() * (Math.floor(39 / num2) - 1));
    num1 = num2 * mathCorrectAnswer;
    questionText = `${num1} ÷ ${num2}`;
  }
  
  document.getElementById('mathQuestion').textContent = questionText;
  const input = document.getElementById('mathAnswer');
  input.value = '';
  input.focus();
  
  mathTimeLeft = 10.0;
  updateMathTimerBar();
  
  if (mathTimerInterval) {
    startMathTimer();
  }
}

function startMathTimer() {
  stopMathTimer();
  mathTimerInterval = setInterval(() => {
    mathTimeLeft -= 0.1;
    if (mathTimeLeft <= 0) {
      generateMathQuestion();
    }
    updateMathTimerBar();
  }, 100);
}

function stopMathTimer() {
  if (mathTimerInterval) {
    clearInterval(mathTimerInterval);
    mathTimerInterval = null;
  }
}

function updateMathTimerBar() {
  const pct = Math.max(0, (mathTimeLeft / 10.0) * 100);
  document.getElementById('mathTimerFill').style.width = `${pct}%`;
}

function updateMathHUD() {
  document.getElementById('gameMessage').textContent = `Solved: ${mathCurrentScore} / ${mathTargetScore}`;
  document.getElementById('gameMessage').className = '';
}

function submitMathAnswer() {
  const input = document.getElementById('mathAnswer');
  const userVal = parseInt(input.value, 10);
  if (isNaN(userVal)) return;
  
  if (userVal === mathCorrectAnswer) {
    mathCurrentScore++;
    updateMathHUD();
    if (mathCurrentScore >= mathTargetScore) {
      stopAlarm();
      stopMathTimer();
      const msg = document.getElementById('gameMessage');
      msg.textContent = '🎉 Math Challenge Completed!';
      msg.className = 'win';
      setTimeout(showWin, 1200);
    } else {
      generateMathQuestion();
    }
  } else {
    input.value = '';
    input.focus();
  }
}

resetGame();
initTimePickers();
loadAlarms();

// Prevent easy exit during active ringing alarms
window.addEventListener('beforeunload', (e) => {
  if (currentAlarmObj) {
    e.preventDefault();
    e.returnValue = 'You must solve the challenge to turn off the alarm!';
    return e.returnValue;
  }
});

// Force audio to keep playing and lock screen if user leaves and returns
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && isAlarmRinging) {
    // Re-request wake lock and fullscreen if focus is regained
    requestWakeLock();
    enterFullscreen();

    // Resume AudioContext
    if (alarmAudioCtx && alarmAudioCtx.state === 'suspended') {
      alarmAudioCtx.resume().catch(e => console.warn('[Anti-Escape] Failed to resume AudioContext:', e));
    }

    // Force HTML5 Audio element to play
    const audioEl = document.getElementById('alarmAudio');
    if (audioEl && audioEl.paused) {
      audioEl.play().catch(e => console.warn('[Anti-Escape] Failed to replay HTML5 audio:', e));
    }
  }
});

// Hide download button if running as installed PWA or native app wrapper
function checkAppMode() {
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  const isCapacitor = window.Capacitor !== undefined;
  
  if (isStandalone || isCapacitor) {
    const downloadBtn = document.getElementById('apkDownloadBtn');
    if (downloadBtn) {
      downloadBtn.style.display = 'none';
    }
  }
}

/* ════════════════════════════════════
   CAPACITOR NATIVE PLUGINS (BACKGROUND ALARMS & ANTI-CHEAT)
════════════════════════════════════ */
async function scheduleLocalNotification(alarmObj) {
  // 1. Schedule exact Android OS AlarmManager event
  if (window.Capacitor && window.Capacitor.isPluginAvailable('AlarmPlugin')) {
    const { AlarmPlugin } = window.Capacitor.Plugins;
    AlarmPlugin.setAlarm({ id: alarmObj.id, time: alarmObj.time }).then((res) => {
      console.log('[Capacitor] Scheduled Android AlarmManager for:', alarmObj.timeStr, res);
    }).catch(err => {
      console.error('[Capacitor] Failed to schedule Android AlarmManager:', err);
    });
  }

  // 2. Schedule Local Notification backup (makes noise / sound)
  if (!window.Capacitor || !window.Capacitor.isPluginAvailable('LocalNotifications')) return;
  const { LocalNotifications } = window.Capacitor.Plugins;
  const parts = alarmObj.time.split(':');
  const now = new Date();
  const target = new Date(now);
  target.setHours(parseInt(parts[0], 10), parseInt(parts[1], 10), 0, 0);

  if (target <= now) {
    target.setDate(target.getDate() + 1);
  }

  const notifyId = parseInt(alarmObj.id.slice(-6), 10) || Math.floor(Math.random() * 1000000);

  try {
    await LocalNotifications.schedule({
      notifications: [
        {
          id: notifyId,
          title: alarmObj.label || '⏰ Wake Up!',
          body: `Time is ${alarmObj.timeStr}. Dismiss the challenge game to turn off alarm!`,
          schedule: { at: target },
          vibration: true,
          ongoing: true,
          extra: {
            time: alarmObj.time,
            id: alarmObj.id
          }
        }
      ]
    });
    console.log(`[Capacitor] Scheduled Local Notification for ${alarmObj.timeStr} (ID: ${notifyId})`);
  } catch (err) {
    console.error('[Capacitor] Failed to schedule notification:', err);
  }
}

async function cancelLocalNotification(alarmId) {
  // 1. Cancel exact Android OS AlarmManager event
  if (window.Capacitor && window.Capacitor.isPluginAvailable('AlarmPlugin')) {
    const { AlarmPlugin } = window.Capacitor.Plugins;
    AlarmPlugin.cancelAlarm({ id: alarmId }).then((res) => {
      console.log('[Capacitor] Cancelled Android AlarmManager for ID:', alarmId, res);
    }).catch(err => {
      console.error('[Capacitor] Failed to cancel Android AlarmManager:', err);
    });
  }

  // 2. Cancel Local Notification backup
  if (!window.Capacitor || !window.Capacitor.isPluginAvailable('LocalNotifications')) return;
  const { LocalNotifications } = window.Capacitor.Plugins;
  const notifyId = parseInt(alarmId.slice(-6), 10);

  try {
    await LocalNotifications.cancel({
      notifications: [{ id: notifyId }]
    });
    console.log(`[Capacitor] Cancelled Local Notification for ID: ${notifyId}`);
  } catch (err) {
    console.error('[Capacitor] Failed to cancel notification:', err);
  }
}

async function cancelAllLocalNotifications() {
  // Cancel each scheduled native and local notification
  alarms.forEach(a => {
    cancelLocalNotification(a.id);
  });
}

function initCapacitorPlugins() {
  // Define global receiver for Java AlarmManager triggers to wake webview
  window.triggerAlarmFromJava = function(alarmId) {
    console.log('[Java Trigger] OS Alarm triggered! ID:', alarmId);
    const match = alarms.find(a => String(a.id) === String(alarmId));
    if (match && !isAlarmRinging) {
      match.ringing = true;
      triggerAlarm(match);
    }
  };

  if (window.Capacitor && window.Capacitor.isPluginAvailable('App')) {
    const { App } = window.Capacitor.Plugins;
    
    App.addListener('backButton', (data) => {
      if (isAlarmRinging) {
        console.warn('[Anti-Cheat] Back button pressed but exit blocked during active alarm!');
      } else {
        App.exitApp();
      }
    });
    console.log('[Capacitor] App back button listener registered.');
  }

  if (window.Capacitor && window.Capacitor.isPluginAvailable('LocalNotifications')) {
    const { LocalNotifications } = window.Capacitor.Plugins;
    
    LocalNotifications.requestPermissions().then((res) => {
      console.log('[Capacitor] LocalNotifications permissions response:', res);
    });

    LocalNotifications.addListener('localNotificationActionPerformed', (notification) => {
      console.log('[Capacitor] Notification action clicked:', notification);
      
      const id = notification.notification.id.toString();
      const match = alarms.find(a => String(a.id) === id || a.time === notification.notification.extra?.time);
      if (match && !isAlarmRinging) {
        match.ringing = true;
        triggerAlarm(match);
      }
    });
  }
}

function initApp() {
  checkAppMode();
  loadCustomTone();
  initCapacitorPlugins();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
