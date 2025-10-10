// app.js (versi perbaikan)
// Pastikan file ini menggantikan file app.js lama Anda

const opts = {
  username: 'ESP8266_1',
  password: '_ESP_Ke_1',
};
const client = mqtt.connect('wss://807376f4e26840f3b7d8ae047c2dea9e.s1.eu.hivemq.cloud:8884/mqtt', opts);

const statusMqtt   = document.getElementById("statusMqtt"); 
const statusESP    = document.getElementById('statusESP');
const airDiv       = document.getElementById("airLevel");
const infoAir      = document.getElementById("infoAir");
const statusSprayer= document.getElementById('statusSprayer');
const statusBlower = document.getElementById('statusBlower');
// const preesurePSI  = document.getElementById('preesure_PSI');

let espTimeout = null;

client.on("connect", () => {
  console.log("MQTT connected");
  statusMqtt.textContent = 'MQTT: Connected';
  statusMqtt.classList.remove('disconnected');
  statusMqtt.classList.add('connected');

  // subscribe topik yang diperlukan
  client.subscribe("device/device1/sensor/distance");
  client.subscribe("device/device1/state/relay1");
  client.subscribe("device/device1/esp/status");
  client.subscribe("device/device1/sprayer/status");
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
    statusSprayer.textContent = 'Sprayer OFF';
    statusSprayer.classList.remove('connected');
    statusSprayer.classList.add('disconnected');
  }
});

client.on("error", (err) => {
  console.error("MQTT Error:", err);
  statusMqtt.textContent = 'Web - MQTT Disconnected';
  statusMqtt.classList.remove('connected');
  statusMqtt.classList.add('disconnected');
});

client.on('message', function (topic, payload) {
  const msg = payload.toString();
  console.log('📩 Pesan diterima:', topic, msg);

  // distance sensor
  if (topic === 'device/device1/sensor/distance') {
    const distance = parseFloat(msg);
    if (!isNaN(distance)) {
      updateAirLevel(distance);
    } else {
      console.warn('Nilai distance bukan angka:', msg);
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
  
    // === Sprayer status & timer ===
    if (topic === 'device/device1/sprayer/status') {
      try {
        const data = JSON.parse(payload.toString());
        const sprayer = data.sprayer || 'OFF';
        const elapsed = data.elapsed || 0;
  
        const isOn = sprayer === 'ON';
        const statusEl = document.getElementById('statusSprayer');
        const timerEl = document.getElementById('sprayerTimer');
  
        // Ubah status tampilan
        if (statusEl) {
          statusEl.textContent = `Sprayer ${isOn ? 'ON' : 'OFF'}`;
          statusEl.classList.toggle('connected', isOn);
          statusEl.classList.toggle('disconnected', !isOn);
        }
  
        // Format waktu: jam:menit:detik
        const h = Math.floor(elapsed / 3600);
        const m = Math.floor((elapsed % 3600) / 60);
        const s = elapsed % 60;
  
        // Buat string dengan leading zero (contoh 00:03:07)
        const timeString =
          `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  
        if (timerEl) {
          timerEl.textContent = `Timer: ${timeString}`;
        }
  
        console.log(`Sprayer ${sprayer} | ${timeString}`);
      } catch (e) {
        console.error('Gagal parse sprayer/status:', e, payload.toString());
      }
    }

});

const sprayerBtn = document.getElementById('Sprayer_Toggle');

let sprayerAuto = false; // status auto mode

sprayerBtn.addEventListener('click', function () {
  sprayerAuto = !sprayerAuto; // toggle state
  const state = sprayerAuto ? 'ON' : 'OFF';

  // kirim ke ESP
  client.publish('device/device1/sprayer/auto', state);

  // ubah tampilan tombol
  if (sprayerAuto) {
    sprayerBtn.textContent = 'AUTO MODE';
    sprayerBtn.classList.remove('off');
    sprayerBtn.classList.add('on');
  } else {
    sprayerBtn.textContent = 'OFF';
    sprayerBtn.classList.remove('on');
    sprayerBtn.classList.add('off');

    // reset tampilan UI saat dimatikan
    const statusEl = document.getElementById('statusSprayer');
    const timerEl = document.getElementById('sprayerTimer');
    if (statusEl) {
      statusEl.textContent = 'Sprayer OFF';
      statusEl.classList.remove('connected');
      statusEl.classList.add('disconnected');
    }
    if (timerEl) timerEl.textContent = 'Timer: -';
  }
});


function setEspConnected(isConnected) {
  if (isConnected) {
    statusESP.textContent = 'ESP Connected';
    statusESP.classList.remove('disconnected');
    statusESP.classList.add('connected');

    // reset timeout heartbeat tiap kali ada 'connected' update
    clearTimeout(espTimeout);
    espTimeout = setTimeout(() => {
      statusESP.textContent = 'ESP Disconnected';
      statusESP.classList.remove('connected');
      statusESP.classList.add('disconnected');
    }, 10000); // 10 detik tanpa heartbeat -> anggap disconnect
  } else {
    statusESP.textContent = 'ESP Disconnected';
    statusESP.classList.remove('connected');
    statusESP.classList.add('disconnected');
  }
}

function updateAirLevel(distanceCm) {
  const maxHeightCm = 100; // sesuaikan tinggi fisik tangki
  const clamped = Math.max(0, Math.min(maxHeightCm, distanceCm));
  const filledPercent = Math.max(0, Math.min(100, (1 - clamped / maxHeightCm) * 100));

  // ubah tinggi elemen .water
  if (airDiv) airDiv.style.height = filledPercent + "%";

  // kalkulasi informasi teks
  const waterHeightCm = (filledPercent / 100) * maxHeightCm;
  const tinggiMeter = (waterHeightCm / 100).toFixed(2);

  // estimasi volume: asumsi tangki silinder, radius default (meter). Ubah sesuai tangki Anda.
  const tankRadiusM = 0.25; // <--- sesuaikan jika perlu
  const heightFilledM = waterHeightCm / 100;
  //const volume = (Math.PI * Math.pow(tankRadiusM, 2) * heightFilledM).toFixed(3);  +++ m<br>Volume (estim.): ${volume} m³`;

  infoAir.innerHTML = `Max Capacity : ... <br> S_Distance : ${distanceCm.toFixed(1)} cm<br>Filled : ${filledPercent.toFixed(1)}%<br> Height : ${tinggiMeter} `;
}

function sendRelay(cmd) {
  client.publish('device/device1/control/relay1/set', cmd);
}

document.getElementById('Blower_On').addEventListener('click', () => sendRelay('ON'));
document.getElementById('Blower_Off').addEventListener('click', () => sendRelay('OFF'));
