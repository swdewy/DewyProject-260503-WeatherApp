const STORAGE_KEY = 'youyou-weather-prefs';
const API_KEY_STORAGE_KEY = 'youyou-weather-api-key';

let API_KEY = localStorage.getItem(API_KEY_STORAGE_KEY) || '';

const CITIES = {
  서울: { lat: 37.5665, lon: 126.978 },
  대전: { lat: 36.3504, lon: 127.3845 },
  강릉: { lat: 37.7519, lon: 128.8761 },
  대구: { lat: 35.8722, lon: 128.5918 },
  부산: { lat: 35.1796, lon: 129.0756 },
  광주: { lat: 35.1595, lon: 126.8526 },
  전주: { lat: 35.8242, lon: 127.148 },
  뉴욕: { lat: 40.7128, lon: -74.006 },
  LA: { lat: 34.0522, lon: -118.2437 },
  도쿄: { lat: 35.6762, lon: 139.6503 },
  베이징: { lat: 39.9042, lon: 116.4074 },
};

const CITY_NAMES = Object.keys(CITIES);

const CHAR_ASSETS = {
  origin: 'assets/YouYou_Origin.png',
  rain: 'assets/YouYou_Rain.png',
  snow: 'assets/YouYou_Snow.png',
  cold: 'assets/YouYou_Cold.png',
  hot: 'assets/YouYou_Hot.png',
  finedust: 'assets/YouYou_Finedust.png',
};

const RECENT_LIMIT = 5;

/** PM2.5(µg/m³) 구간 → 좋음/보통/나쁨 (단순 3단) */
function gradeFromPm25(pm25) {
  if (pm25 == null || Number.isNaN(pm25)) {
    return { label: '—', key: 'unknown', pm25Display: null };
  }
  if (pm25 <= 15) return { label: '좋음', key: 'good', pm25Display: pm25 };
  if (pm25 <= 35) return { label: '보통', key: 'moderate', pm25Display: pm25 };
  return { label: '나쁨', key: 'bad', pm25Display: pm25 };
}

/**
 * PM2.5 우선; 없으면 OWM 일대기종 지수 보조 (1=좋음, 2–3=보통, 4–5=나쁨)
 * @param {number|null|undefined} pm25
 * @param {number|null|undefined} owmAqi
 */
function gradeAir(pm25, owmAqi) {
  const fromPm = gradeFromPm25(pm25);
  if (fromPm.key !== 'unknown') return fromPm;

  if (typeof owmAqi === 'number' && !Number.isNaN(owmAqi)) {
    if (owmAqi <= 1) return { label: '좋음', key: 'good', pm25Display: null };
    if (owmAqi <= 3) return { label: '보통', key: 'moderate', pm25Display: null };
    return { label: '나쁨', key: 'bad', pm25Display: null };
  }
  return gradeFromPm25(NaN);
}

/**
 * OpenWeather condition id: 뇌우 200–232, 이슬비 300–321, 비 500–531, 눈 600–622
 * @see https://openweathermap.org/weather-conditions
 */
function precipitationFromWeather(weatherJson) {
  const list = weatherJson?.weather;
  if (!Array.isArray(list)) return null;
  for (const w of list) {
    const id = w?.id;
    if (typeof id !== 'number' || Number.isNaN(id)) continue;
    if (id >= 600 && id <= 622) return 'snow';
    if (id >= 200 && id <= 232) return 'rain';
    if (id >= 300 && id <= 321) return 'rain';
    if (id >= 500 && id <= 531) return 'rain';
  }
  const main = list[0]?.main ?? '';
  if (main === 'Snow') return 'snow';
  if (main === 'Rain' || main === 'Drizzle' || main === 'Thunderstorm') {
    return 'rain';
  }
  return null;
}

function resolveCharacter({ weatherJson, gradeKey, owmAqi }) {
  const badAir = gradeKey === 'bad' || (typeof owmAqi === 'number' && owmAqi >= 4);
  if (badAir) return 'finedust';

  const temp = weatherJson?.main?.temp;
  if (typeof temp === 'number') {
    if (temp < 5) return 'cold';
    if (temp > 28) return 'hot';
  }

  const wet = precipitationFromWeather(weatherJson);
  if (wet === 'snow') return 'snow';
  if (wet === 'rain') return 'rain';
  return 'origin';
}

const MESSAGES_BY_CHAR = {
  finedust: '미세먼지가 높아, 마스크 챙겨줘 😷',
  cold: '꽤 쌀쌀해, 따뜻하게 입어 🧣',
  hot: '오늘은 꽤 더워, 시원하게 지내 🥤',
  rain: '비가 내리네, 우산 챙기는 게 좋아 ☔',
  snow: '눈이 오네, 미끄럼 조심 ⛄',
  origin: '오늘은 따뜻한 하루야 ☀️',
};

/** @typedef {{ lastCity: string|null, recentCities: string[] }} Prefs */

function loadPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { lastCity: null, recentCities: [] };
    const parsed = JSON.parse(raw);
    return {
      lastCity: typeof parsed.lastCity === 'string' ? parsed.lastCity : null,
      recentCities: Array.isArray(parsed.recentCities)
        ? parsed.recentCities.filter((c) => typeof c === 'string')
        : [],
    };
  } catch {
    return { lastCity: null, recentCities: [] };
  }
}

/** @param {Prefs} prefs */
function savePrefs(prefs) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      lastCity: prefs.lastCity,
      recentCities: prefs.recentCities.slice(0, RECENT_LIMIT),
    })
  );
}

/** 스토어가 비었거나 깨졌을 때만 기본 도시로 채움 (새로고침 때마다 recent 순서는 바꾸지 않음) */
function seedPrefsIfNeeded(initialCity) {
  const p = state.prefs;
  if (p.lastCity && CITIES[p.lastCity]) return;
  state.prefs = {
    lastCity: initialCity,
    recentCities: bumpRecent(p.recentCities, initialCity),
  };
  savePrefs(state.prefs);
}

function bumpRecent(prev, city) {
  const next = [city, ...prev.filter((c) => c !== city)];
  return next.slice(0, RECENT_LIMIT);
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('http_' + res.status);
  return res.json();
}

function buildWeatherUrl(lat, lon) {
  const q = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    units: 'metric',
    appid: API_KEY,
  });
  return `https://api.openweathermap.org/data/2.5/weather?${q}`;
}

function buildAirUrl(lat, lon) {
  const q = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    appid: API_KEY,
  });
  return `https://api.openweathermap.org/data/2.5/air_pollution?${q}`;
}

/** @returns {Promise<[object, object]>} */
async function fetchWeatherAndAir(lat, lon) {
  const wUrl = buildWeatherUrl(lat, lon);
  const aUrl = buildAirUrl(lat, lon);
  return Promise.all([fetchJson(wUrl), fetchJson(aUrl)]);
}

// ——— DOM ———

const elCitySelect = document.getElementById('city-select');
const elRecentWrap = document.getElementById('recent-cities');
const elCharacter = document.getElementById('character');
const elCharacterWrap = document.getElementById('character-wrap');
const elApiKeyInput = document.getElementById('api-key-input');
const elApiKeySave = document.getElementById('api-key-save');
const elMessage = document.getElementById('message');
const elLoading = document.getElementById('loading');
const elErrorPanel = document.getElementById('error-panel');
const elErrorText = document.getElementById('error-text');
const elRetryBtn = document.getElementById('retry-btn');
const elStatTemp = document.getElementById('stat-temp');
const elStatFeels = document.getElementById('stat-feels');
const elStatHumidity = document.getElementById('stat-humidity');
const elStatPm25 = document.getElementById('stat-pm25');
const elAirBadge = document.getElementById('air-badge');
const elStats = document.getElementById('stats');

/** @type {{
 *   selectedCity: string,
 *   loading: boolean,
 *   error: string|null,
 *   prefs: Prefs,
 * }} */
const state = {
  selectedCity: CITY_NAMES[0],
  loading: false,
  error: null,
  prefs: loadPrefs(),
};

function fillCitySelect() {
  CITY_NAMES.forEach((name) => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    elCitySelect.appendChild(opt);
  });
}

function syncSelectValue() {
  elCitySelect.value = state.selectedCity;
}

function setCharacterWithFade(charKey) {
  const src = CHAR_ASSETS[charKey] ?? CHAR_ASSETS.origin;
  elCharacter.classList.add('is-faded');
  window.setTimeout(() => {
    elCharacter.src = src;
    elCharacter.alt = `YouYou ${charKey}`;
    elCharacter.classList.remove('is-faded');
  }, 170);
}

function renderAirBadge(label, key) {
  elAirBadge.textContent = label;
  elAirBadge.classList.remove('good', 'moderate', 'bad');
  if (key === 'good' || key === 'moderate' || key === 'bad') {
    elAirBadge.classList.add(key);
  }
}

function renderStatsDash() {
  elStatTemp.textContent = '—';
  elStatFeels.textContent = '';
  elStatHumidity.textContent = '—';
  elStatPm25.textContent = '—';
  elAirBadge.textContent = '—';
  elAirBadge.classList.remove('good', 'moderate', 'bad');
}

function renderFromPayload(weatherJson, airJson) {
  const pm25Raw = airJson?.list?.[0]?.components?.pm2_5;
  const owmAqi = airJson?.list?.[0]?.main?.aqi;
  const grade = gradeAir(
    typeof pm25Raw === 'number' ? pm25Raw : NaN,
    owmAqi
  );

  const charKey = resolveCharacter({
    weatherJson,
    gradeKey: grade.key,
    owmAqi,
  });

  const temp = weatherJson?.main?.temp;
  const feels = weatherJson?.main?.feels_like;
  const hum = weatherJson?.main?.humidity;

  elStatTemp.textContent =
    typeof temp === 'number' ? `${Math.round(temp)}°C` : '—';
  elStatFeels.textContent =
    typeof feels === 'number' ? `체감 ${Math.round(feels)}°C` : '';
  elStatHumidity.textContent =
    typeof hum === 'number' ? `${Math.round(hum)}%` : '—';

  if (grade.pm25Display != null) {
    elStatPm25.textContent = `${grade.pm25Display.toFixed(1)} µg/m³`;
    renderAirBadge(grade.label, grade.key);
  } else if (grade.key !== 'unknown') {
    elStatPm25.textContent = '(지수)';
    renderAirBadge(grade.label, grade.key);
  } else {
    elStatPm25.textContent = '—';
    renderAirBadge('—', 'unknown');
  }

  elMessage.textContent = MESSAGES_BY_CHAR[charKey] ?? MESSAGES_BY_CHAR.origin;
  setCharacterWithFade(charKey);
}

function renderRecentChips() {
  elRecentWrap.replaceChildren();
  const list = state.prefs.recentCities.filter((c) => c !== state.selectedCity);
  list.forEach((city) => {
    if (!CITIES[city]) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip';
    btn.textContent = city;
    btn.addEventListener('click', () => {
      selectCity(city);
    });
    elRecentWrap.appendChild(btn);
  });
}

function setLoading(on) {
  state.loading = on;
  elLoading.hidden = !on;
  elStats.style.opacity = on ? '0.45' : '1';
}

function showError(show, text) {
  state.error = show ? text : null;
  elErrorPanel.hidden = !show;
  if (text) elErrorText.textContent = text;
}

async function refreshWeather() {
  if (!API_KEY) {
    showError(true, '상단에 API 키를 입력하고 저장해주세요.');
    renderStatsDash();
    elMessage.textContent = '먼저 OpenWeather 키를 연결해야 해요.';
    setCharacterWithFade('origin');
    return;
  }

  const coords = CITIES[state.selectedCity];
  if (!coords) return;

  setLoading(true);
  showError(false, '');
  elMessage.textContent = '';

  try {
    const [weatherJson, airJson] = await fetchWeatherAndAir(
      coords.lat,
      coords.lon
    );
    renderFromPayload(weatherJson, airJson);
  } catch {
    showError(true, '날씨 정보를 불러올 수 없어요');
    renderStatsDash();
    elMessage.textContent = '';
    setCharacterWithFade('origin');
  } finally {
    setLoading(false);
  }
}

function persistSelection() {
  state.prefs.lastCity = state.selectedCity;
  state.prefs.recentCities = bumpRecent(
    state.prefs.recentCities,
    state.selectedCity
  );
  savePrefs(state.prefs);
}

function selectCity(name) {
  if (!CITIES[name]) return;
  state.selectedCity = name;
  syncSelectValue();
  persistSelection();
  renderRecentChips();
  refreshWeather();
}

function boot() {
  fillCitySelect();
  const prefs = state.prefs;
  const initial =
    prefs.lastCity && CITIES[prefs.lastCity]
      ? prefs.lastCity
      : CITY_NAMES[0];
  state.selectedCity = initial;
  syncSelectValue();
  seedPrefsIfNeeded(initial);

  renderRecentChips();

  elCitySelect.addEventListener('change', () => {
    selectCity(elCitySelect.value);
  });

  elApiKeyInput.value = API_KEY;
  elApiKeySave.addEventListener('click', () => {
    API_KEY = elApiKeyInput.value.trim();
    localStorage.setItem(API_KEY_STORAGE_KEY, API_KEY);
    
    const originalText = elApiKeySave.textContent;
    elApiKeySave.textContent = '저장됨!';
    setTimeout(() => {
      elApiKeySave.textContent = originalText;
    }, 1500);

    refreshWeather();
  });

  elRetryBtn.addEventListener('click', () => refreshWeather());

  refreshWeather();
}

boot();
