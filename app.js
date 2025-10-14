const opts = {
  username: 'ESP8266_1',
  password: '_ESP_Ke_1',
};
const client = mqtt.connect('wss://807376f4e26840f3b7d8ae047c2dea9e.s1.eu.hivemq.cloud:8884/mqtt', opts);

const statusMqtt   = document.getElementById("statusMqtt"); 
const statusESP    = document.getElementById('statusESP');
const airDiv       = document.getElementById("airLevel");
const pressureDiv  = document.getElementById("pressureDiv");
const infoAir      = document.getElementById("infoAir");
const statusSprayer= document.getElementById('statusSprayer');
const statusBlower = document.getElementById('statusBlower');

let espTimeout = null;
let sprayerBtn = null;
let sprayerAuto = false;
let sprayerSynced = false;

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

window.addEventListener('DOMContentLoaded', () => {
  sprayerBtn = document.getElementById('Sprayer_Toggle');

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

  console.log("[SYNC] Meminta status terkini...");

  client.publish("device/device1/request/sync", "sync");

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
  console.log(`[MQTT] Received ${topic}: ${payload.toString()}`);
});

client.on("error", (err) => {
  console.error("MQTT Error:", err);
  statusMqtt.textContent = 'Web - MQTT Disconnected';
  statusMqtt.classList.remove('connected');
  statusMqtt.classList.add('disconnected');
});

client.on('message', function (topic, payload) {
  const msg = payload.toString();
  console.log('ðŸ“© Pesan diterima:', topic, msg);

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

document.getElementById('Blower_On').addEventListener('click', () => sendRelay('ON'));
document.getElementById('Blower_Off').addEventListener('click', () => sendRelay('OFF'));

