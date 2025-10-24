const USER = [
  { username: "admin", password: "12345" },
  { username: "arya", password: "arya_keun" },
  { username: "AYASH", password: "ayash54123" }
];

const opts = {
  username: 'ESP8266_1',
  password: '_ESP_Ke_1',
};
const client = mqtt.connect('wss://807376f4e26840f3b7d8ae047c2dea9e.s1.eu.hivemq.cloud:8884/mqtt', opts);

let statusMqtt, statusESP, airDiv, pressureDiv, infoAir, statusSprayer, statusBlower;
let espTimeout = null;
let sprayerBtn = null;
let sprayerAuto = false;
let sprayerSynced = false;
let activeUsers = new Set();

window.addEventListener('DOMContentLoaded', () => {
  statusMqtt   = document.getElementById("statusMqtt"); 
  statusESP    = document.getElementById('statusESP');
  airDiv       = document.getElementById("airLevel");
  pressureDiv  = document.getElementById("pressureDiv");
  infoAir      = document.getElementById("infoAir");
  statusSprayer= document.getElementById('statusSprayer');
  statusBlower = document.getElementById('statusBlower');
  sprayerBtn = document.getElementById('Sprayer_Toggle');


  const loginScreen = document.getElementById("loginScreen");
  const mainUI = document.getElementById("mainUI");
  const loginBtn = document.getElementById("loginBtn");
  const loginError = document.getElementById("loginError");
  const logoutBtn = document.getElementById("logoutBtn");

  const isLogged = localStorage.getItem("loggedIn") === "true";
  const username = localStorage.getItem("username");

  if (!loginScreen || !mainUI) {
    console.error("❌ Elemen loginScreen atau mainUI tidak ditemukan!");
    return;
  }  

  if (isLogged) {
    // ✅ Pastikan tampilkan UI utama setelah refresh
    console.log("[LOGIN CHECK] User sudah login, langsung ke UI utama.");
  
    loginScreen.classList.add("hidden");
    loginScreen.style.display = "none";
  
    mainUI.classList.remove("hidden");
    mainUI.classList.add("show");
    
    // tampilkan nama user di pojok atau di UI
    const usernameDisplay = document.getElementById("usernameDisplay");
    if (usernameDisplay) usernameDisplay.textContent = username;
    
  } else {
    // ✅ Tampilkan layar login saat belum login
    console.log("[LOGIN CHECK] Belum login, tampilkan form login.");
    
    loginScreen.classList.remove("hidden");
    loginScreen.style.display = "flex";
  
    mainUI.classList.add("hidden");
    mainUI.classList.remove("show");
  }  

  loginBtn.addEventListener("click", () => {
    const user = document.getElementById("loginUser").value.trim();
    const pass = document.getElementById("loginPass").value.trim();

    const foundUser = USER.find(u => u.username === user && u.password === pass);

    if (foundUser) {
      localStorage.setItem("loggedIn", "true");
      localStorage.setItem("username", foundUser.username);
      document.getElementById("usernameDisplay").textContent = foundUser.username;

      loginScreen.classList.add("hidden");
      setTimeout(() => {
        loginScreen.style.display = "none";
        mainUI.classList.remove("hidden");
        mainUI.classList.add("show");
      }, 600);
      console.log(`[LOGIN] ${foundUser.username} berhasil login`);
    } else {
      loginError.textContent = "User atau password salah!";
      loginError.classList.add("show");
      setTimeout(() => {
        loginError.classList.remove("show");
        loginError.textContent = "";
      }, 3000);
    }
  });

  logoutBtn.addEventListener("click", () => {
    localStorage.removeItem("loggedIn");
    localStorage.removeItem("username");
    location.reload();
  });

  if (sprayerBtn) {
    sprayerBtn.disabled = true;
    sprayerBtn.addEventListener('click', function () {
      if (!sprayerSynced) {
        console.warn('[UI] Tombol belum sinkron dengan ESP, abaikan klik.');
        return;
      }

      const currentlyAuto = sprayerBtn.classList.contains('on');
      const nextState = currentlyAuto ? 'OFF' : 'ON';
      console.log("[UI] Toggle sprayer mode -> kirim:", nextState);

      if (!client || !client.connected) {
        console.warn('[UI] MQTT tidak terhubung — perintah tidak dikirim');
        return;
      }

      client.publish('device/device1/sprayer/auto', nextState);
    });
  }
  
  const blowerOnBtn = document.getElementById('Blower_On');
  const blowerOffBtn = document.getElementById('Blower_Off');
  if (blowerOnBtn) blowerOnBtn.addEventListener('click', () => sendRelay('ON'));
  if (blowerOffBtn) blowerOffBtn.addEventListener('click', () => sendRelay('OFF'));
});

function updateSprayerButtonUI(isAuto) {
  if (!sprayerBtn) sprayerBtn = document.getElementById('Sprayer_Toggle');
  if (!sprayerBtn) return;

  sprayerAuto = isAuto;

  if (isAuto) {
    sprayerBtn.textContent = 'AUTO MODE';
    sprayerBtn.classList.remove('off');
    sprayerBtn.classList.add('on');
  } else {
    sprayerBtn.textContent = 'OFF';
    sprayerBtn.classList.remove('on');
    sprayerBtn.classList.add('off');
  }

  console.log(`[UI] Sprayer button updated → ${isAuto ? 'AUTO MODE' : 'OFF'}`);
}

client.on("connect", () => {
  console.log("MQTT connected");
  statusMqtt.textContent = 'MQTT: Connected';
  statusMqtt.classList.remove('disconnected');
  statusMqtt.classList.add('connected');

  client.subscribe("device/device1/sensor/distance");
  client.subscribe("device/device1/state/relay1");
  client.subscribe("device/device1/esp/status");
  client.subscribe("device/device1/sprayer/status");
  client.subscribe("device/device1/sensor/pressure");
  client.subscribe("system/user/active");
  console.log("[SYNC] Meminta status terkini...");

  client.publish("device/device1/request/sync", "sync");
  
  const isLogged = localStorage.getItem("loggedIn") === "true";
  const username = localStorage.getItem("username");
  if (isLogged && username) {
    setTimeout(() => {
      client.publish("system/user/active", JSON.stringify({
        action: "login",
        user: username,
        time: new Date().toISOString()
      }));
      console.log(`[SYNC] Broadcast ulang: ${username} aktif`);
    }, 1000);
  }
  sprayerSynced = false;
  if (sprayerBtn) sprayerBtn.disabled = true;
  client.publish("device/device1/request/sync", "sync");
  setTimeout(() => {
    if (!sprayerSynced) {
      console.warn('[SYNC] No sprayer/status received, enabling control (fallback).');
      sprayerSynced = true;
      if (sprayerBtn) sprayerBtn.disabled = false;
    }
  }, 5000);
});

client.on('close', () => {
  console.log('Koneksi terputus');
  statusMqtt.textContent = 'Web - MQTT Disconnected';
  statusMqtt.classList.remove('connected');
  statusMqtt.classList.add('disconnected');

  statusESP.textContent = 'ESP Disconnected';
  statusESP.classList.remove('connected');
  statusESP.classList.add('disconnected');

  if (statusSprayer) {
    statusSprayer.textContent = 'Sprayer Disconnected';
    statusSprayer.classList.remove('connected');
    statusSprayer.classList.add('disconnected');
  } 
});

client.on("error", (err) => console.error("MQTT Error:", err));

client.on('message', function (topic, payload) {
  const msg = payload.toString();
  console.log('📩 Pesan diterima:', topic, msg);

  if (topic === 'device/device1/sensor/distance') {
    const distance = parseFloat(msg);
    if (!isNaN(distance)) {
      updateAirLevel(distance);
    } else {
      console.warn('Nilai distance bukan angka:', msg);
    }
    return;
  }

  if (topic === 'device/device1/sensor/pressure') {
    try {
      const pressureValue = parseFloat(msg);

      if (!isNaN(pressureValue)) {
        updatePressure(pressureValue);
      } else {
        console.warn('Nilai pressure bukan angka:', msg);
      }
    } catch (e) {
      console.error('Gagal membaca data pressure:', e);
    }
    return;
  }


  if (topic === 'device/device1/state/relay1') {
    const state = msg;
    if (statusBlower) {
      statusBlower.innerText = state === 'ON' ? 'Blower ON' : 'Blower OFF';
      if (state === 'ON') {
        statusBlower.classList.add('connected');
        statusBlower.classList.remove('disconnected');
      } else {
        statusBlower.classList.add('disconnected');
        statusBlower.classList.remove('connected');
      }
    }
    return;
  }

  if (topic === 'device/device1/esp/status') {
    let data = null;
    try {
      data = JSON.parse(msg);
    } catch (e) {

      console.warn('Payload ESP/status bukan JSON, menangani sebagai string:', msg);
      if (msg.toLowerCase().includes('connected')) {
        setEspConnected(true);
      } else if (msg.toLowerCase().includes('disconnected')) {
        setEspConnected(false);
      }
      return;
    }
  }
  
  if (topic === 'device/device1/sprayer/status') {
    try {
      const data = JSON.parse(payload.toString());
      const sprayer = (data.sprayer || '').toString();
      const elapsed = data.elapsed || 0;

      if (sprayer === 'AUTO_ON') {
        sprayerAuto = true;
        updateSprayerButtonUI(true);       
        sprayerSynced = true;            
        if (sprayerBtn) sprayerBtn.disabled = false;
        console.log('[SYNC] Received AUTO_ON from ESP');
      } else if (sprayer === 'AUTO_OFF') {
        sprayerAuto = false;
        updateSprayerButtonUI(false);     
        sprayerSynced = true;
        if (sprayerBtn) sprayerBtn.disabled = false;
        if (statusSprayer) {
          statusSprayer.textContent = 'Sprayer OFF';
          statusSprayer.classList.add('disconnected');
          statusSprayer.classList.remove('connected');
        }
        console.log('[SYNC] Received AUTO_OFF from ESP');
      } else if (sprayer === 'ON' || sprayer === 'OFF') {
          if (statusSprayer) {
            statusSprayer.textContent = `Sprayer ${sprayer}`;
            statusSprayer.classList.toggle('connected', sprayer === 'ON');
            statusSprayer.classList.toggle('disconnected', sprayer !== 'ON');
          }
        console.log('[STATUS] Siklus sprayer:', sprayer, 'elapsed:', elapsed);
      } else {
        console.warn('[MQTT] Unknown sprayer/status payload:', sprayer);
      }

      const timerEl = document.getElementById('sprayerTimer');
      if (timerEl) {
        const h = Math.floor(elapsed / 3600);
        const m = Math.floor((elapsed % 3600) / 60);
        const s = elapsed % 60;
        timerEl.textContent = `Timer: ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      }
    } catch (e) {
      console.error('Gagal parse sprayer/status:', e, payload.toString());
    }
    return;
  }
  if (topic === "system/user/active") {
    try {
      const data = JSON.parse(msg);
      const { action, user, users } = data;
  
      if (action === "login") {
        // Tambahkan user baru
        activeUsers.add(user);
        console.log(`[USER] ${user} login`);
  
        // Kirim daftar user kita ke user baru
        const myUsername = localStorage.getItem("username");
        if (myUsername && user !== myUsername) {
          setTimeout(() => {
            client.publish("system/user/active", JSON.stringify({
              action: "refresh",
              users: Array.from(activeUsers)
            }));
            console.log(`[SYNC] Kirim daftar aktif ke ${user}`);
          }, 500 + Math.random() * 1000); // acak delay biar gak tabrakan
        }
  
      } else if (action === "logout") {
        // Hapus user keluar
        activeUsers.delete(user);
        console.log(`[USER] ${user} logout`);
  
      } else if (action === "refresh" && Array.isArray(users)) {
        // Sinkronisasi daftar user dari device lain
        users.forEach(u => activeUsers.add(u));
        console.log("[SYNC] Dapat update daftar aktif:", users);
      }
  
      updateActiveUserList();
    } catch (err) {
      console.error("❌ Gagal parsing pesan system/user/active:", err);
    }
    return;
  }
  
});
function setEspConnected(isConnected) {
  if (isConnected) {
    statusESP.textContent = 'ESP Connected';
    statusESP.classList.remove('disconnected');
    statusESP.classList.add('connected');

    clearTimeout(espTimeout);
    espTimeout = setTimeout(() => {
      statusESP.textContent = 'ESP Disconnected';
      statusESP.classList.remove('connected');
      statusESP.classList.add('disconnected');
    }, 10000);
  } else {
    statusESP.textContent = 'ESP Disconnected';
    statusESP.classList.remove('connected');
    statusESP.classList.add('disconnected');
  }
}

function updateAirLevel(distanceCm) {
  const maxHeightCm = 100;
  const clamped = Math.max(0, Math.min(maxHeightCm, distanceCm));
  const filledPercent = Math.max(0, Math.min(100, (1 - clamped / maxHeightCm) * 100));

  if (airDiv) airDiv.style.height = filledPercent + "%";

  const waterHeightCm = (filledPercent / 100) * maxHeightCm;
  const tinggiMeter = (waterHeightCm).toFixed(1);

  const tankRadiusM = 0.25; // <---------
  const heightFilledM = waterHeightCm / 100;
  //const volume = (Math.PI * Math.pow(tankRadiusM, 2) * heightFilledM).toFixed(3);  +++ m<br>Volume (estim.): ${volume} mÂ³`;

  infoAir.innerHTML = `Max Capacity : ... <br> S_Distance : ${distanceCm.toFixed(1)} cm<br>Filled : ${filledPercent.toFixed(1)}%<br> Height : ${tinggiMeter} cm`;
}

function updatePressure(valuePSI) {
  const el = document.getElementById('pressure_PSI');
  el.textContent = valuePSI.toFixed(2) + ' PSI';

  const minPSI = 0;
  const maxPSI = 100;

  const clamped = Math.max(minPSI, Math.min(maxPSI, valuePSI));
  const filledPercent = (clamped/maxPSI) * 100;
  
  if (pressureDiv) {
    pressureDiv.style.height = filledPercent + "%";

    if (valuePSI < 35) {
      pressureDiv.style.backgroundColor = 'green';
    } else if (valuePSI < 70) {
      pressureDiv.style.backgroundColor = 'orange';
    } else {
      pressureDiv.style.backgroundColor = 'red';
    }
  }
}

function sendRelay(cmd) {
  client.publish('device/device1/control/relay1/set', cmd);
}

function updateActiveUserList() {
  const listEl = document.getElementById("userList");
  if (!listEl) return;

  listEl.innerHTML = "";

  if (activeUsers.size === 0) {
    const li = document.createElement("li");
    li.textContent = "Tidak ada user aktif";
    listEl.appendChild(li);
    return;
  }

  activeUsers.forEach(user => {
    const li = document.createElement("li");
    li.textContent = user;
    listEl.appendChild(li);
  });
}
window.addEventListener("beforeunload", () => {
  const username = localStorage.getItem("username");
  if (username) {
    client.publish("system/user/active", JSON.stringify({
      action: "logout",
      user: username,
      time: new Date().toISOString()
    }));
  }
});
setInterval(() => {
  if (client.connected && activeUsers.size > 0) {
    client.publish("system/user/active", JSON.stringify({
      action: "refresh",
      users: Array.from(activeUsers)
    }));
  }
}, 10000); // setiap 10 detik broadcast ulang daftar aktif
