import { db } from './db.ts';

export interface WeatherAlert {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  type: 'rain' | 'heavy_rain' | 'dry_spell' | 'heat' | 'spraying' | 'irrigation';
  title_en: string;
  title_kn: string;
  message_en: string;
  message_kn: string;
}

export interface WeatherPayload {
  latitude: number;
  longitude: number;
  location_label: string;
  provider: string;
  api_status: 'live' | 'cached' | 'unavailable';
  last_updated: string;
  error_message?: string;
  current: {
    temperature_c: number;
    humidity_pct: number;
    rain_mm: number;
    wind_kmh: number;
    weather_code: number;
    condition_en: string;
    condition_kn: string;
  } | null;
  daily: Array<{
    date: string;
    temp_min_c: number;
    temp_max_c: number;
    rain_sum_mm: number;
    rain_prob_pct: number;
    wind_max_kmh: number;
    weather_code: number;
    condition_en: string;
    condition_kn: string;
  }>;
  alerts: WeatherAlert[];
  spraying_suitable: boolean;
  spraying_reason_en: string;
  spraying_reason_kn: string;
}

function decodeWmoCode(code: number): { en: string; kn: string } {
  if (code === 0) return { en: 'Clear sky', kn: 'ಸ್ವಚ್ಛ ಆಕಾಶ' };
  if (code <= 3) return { en: 'Partly cloudy', kn: 'ಭಾಗಶಃ ಮೋಡ' };
  if (code <= 48) return { en: 'Fog / Mist', kn: 'ಮಂಜು / ಇಬ್ಬನಿ' };
  if (code <= 57) return { en: 'Light drizzle', kn: 'ತುಂತುರು ಮಳೆ' };
  if (code <= 65) return { en: 'Rain', kn: 'ಮಳೆ' };
  if (code <= 77) return { en: 'Sleet / Hail', kn: 'ಆಲಿಕಲ್ಲು ಮಳೆ' };
  if (code <= 82) return { en: 'Rain showers', kn: 'ಮಳೆ ಹನಿಗಳು' };
  if (code >= 95) return { en: 'Thunderstorm', kn: 'ಗುಡುಗು ಸಹಿತ ಮಳೆ' };
  return { en: 'Variable weather', kn: 'ಬದಲಾಗುವ ಹವಾಮಾನ' };
}

export function buildAgriculturalAlerts(
  current: NonNullable<WeatherPayload['current']>,
  daily: WeatherPayload['daily']
): { alerts: WeatherAlert[]; spraying_suitable: boolean; spraying_reason_en: string; spraying_reason_kn: string } {
  const alerts: WeatherAlert[] = [];
  const next3DaysRain = daily.slice(0, 3).reduce((acc, d) => acc + d.rain_sum_mm, 0);
  const next5DaysRain = daily.slice(0, 5).reduce((acc, d) => acc + d.rain_sum_mm, 0);
  const maxTempNext3 = Math.max(...daily.slice(0, 3).map((d) => d.temp_max_c));
  const todayRainProb = daily[0]?.rain_prob_pct ?? 0;

  if (daily.slice(0, 3).some((d) => d.rain_sum_mm >= 25)) {
    alerts.push({
      id: 'heavy-rain',
      severity: 'critical',
      type: 'heavy_rain',
      title_en: 'Heavy Rainfall Warning — Pause Foliar Sprays',
      title_kn: 'ಭಾರೀ ಮಳೆ ಎಚ್ಚರಿಕೆ — ಎಲೆ ಸಿಂಪಡಣೆ ನಿಲ್ಲಿಸಿ',
      message_en: 'Over 25 mm/day rain forecast in the next 72 hours. Pause foliar sprays and fertilizer top-dressing before rain, clear field drainage channels, and protect harvested produce.',
      message_kn: 'ಮುಂದಿನ 72 ಗಂಟೆಗಳಲ್ಲಿ ದಿನಕ್ಕೆ 25 ಮಿ.ಮೀ ಗಿಂತ ಹೆಚ್ಚು ಮಳೆ ಮುನ್ಸೂಚನೆ ಇದೆ. ಮಳೆಗೆ ಮುನ್ನ ಎಲೆ ಸಿಂಪಡಣೆ ಮತ್ತು ಮೇಲುಗೊಬ್ಬರ ಹಾಕುವುದನ್ನು ನಿಲ್ಲಿಸಿ, ಹೊಲದ ಬಸಿಕಾಲುವೆ ಸ್ವಚ್ಛಗೊಳಿಸಿ.',
    });
  } else if (next3DaysRain >= 8) {
    alerts.push({
      id: 'expected-rain',
      severity: 'info',
      type: 'rain',
      title_en: 'Rain Expected — Pause Foliar Sprays & Skip Irrigation',
      title_kn: 'ಮಳೆ ನಿರೀಕ್ಷೆ — ಸಿಂಪಡಣೆ ಮತ್ತು ನೀರಾವರಿ ನಿಲ್ಲಿಸಿ',
      message_en: `Approx. ${next3DaysRain.toFixed(1)} mm rainfall expected over the next 3 days. Pause foliar sprays before rain to avoid wash-off and skip unnecessary irrigation.`,
      message_kn: `ಮುಂದಿನ 3 ದಿನಗಳಲ್ಲಿ ಸುಮಾರು ${next3DaysRain.toFixed(1)} ಮಿ.ಮೀ ಮಳೆ ನಿರೀಕ್ಷೆಯಿದೆ. ಔಷಧಿ ತೊಳೆದು ಹೋಗದಂತೆ ಮಳೆಗೆ ಮುನ್ನ ಎಲೆ ಸಿಂಪಡಣೆ ನಿಲ್ಲಿಸಿ ಮತ್ತು ಅನಗತ್ಯ ನೀರಾವರಿ ತಡೆಹಿಡಿಯಿರಿ.`,
    });
  }

  if (next5DaysRain < 2 && current.humidity_pct < 55) {
    alerts.push({
      id: 'dry-spell',
      severity: 'warning',
      type: 'dry_spell',
      title_en: 'Dry Spell Advisory — Conserve Root Moisture',
      title_kn: 'ಒಣ ಹವಾಮಾನ ಸೂಚನೆ — ಬೇರಿನ ತೇವಾಂಶ ಉಳಿಸಿ',
      message_en: 'No significant rain expected for the next 5 days. Prioritize moisture conservation mulching or protective irrigation at critical flowering/pod stages.',
      message_kn: 'ಮುಂದಿನ 5 ದಿನಗಳಲ್ಲಿ ಗಮನಾರ್ಹ ಮಳೆ ನಿರೀಕ್ಷೆಯಿಲ್ಲ. ಹೂವು/ಕಾಯಿ ಹಂತದ ಬೆಳೆಗಳಿಗೆ ಮಲ್ಚಿಂಗ್ ಅಥವಾ ರಕ್ಷಣಾತ್ಮಕ ನೀರಾವರಿ ನೀಡಿ.',
    });
  }

  if (maxTempNext3 >= 34) {
    alerts.push({
      id: 'heat-alert',
      severity: 'warning',
      type: 'heat',
      title_en: 'High Heat Advisory — Irrigate & Spray Only in Cool Hours',
      title_kn: 'ಹೆಚ್ಚಿನ ಬಿಸಿಲು ಎಚ್ಚರಿಕೆ — ಬೆಳಿಗ್ಗೆ/ಸಂಜೆ ಮಾತ್ರ ನೀರು-ಸಿಂಪಡಣೆ',
      message_en: `Daytime temperatures may reach ${maxTempNext3.toFixed(1)}°C. Irrigate early morning or late evening to cut evaporation loss and avoid midday foliar spraying.`,
      message_kn: `ಹಗಲು ತಾಪಮಾನ ${maxTempNext3.toFixed(1)}°C ತಲುಪಬಹುದು. ಆವಿಯಾಗುವಿಕೆ ತಪ್ಪಿಸಲು ಬೆಳಿಗ್ಗೆ ಅಥವಾ ಸಂಜೆ ನೀರು ಕೊಡಿ ಹಾಗೂ ಮಧ್ಯಾಹ್ನ ಎಲೆ ಸಿಂಪಡಣೆ ಮಾಡಬೇಡಿ.`,
    });
  }

  const highWind = current.wind_kmh >= 18;
  const rainRisk = current.rain_mm > 0.5 || todayRainProb >= 55;
  const spraying_suitable = !highWind && !rainRisk;
  let spraying_reason_en = 'Calm wind and low immediate rain risk — suitable for morning/evening foliar spraying.';
  let spraying_reason_kn = 'ಗಾಳಿ ಕಡಿಮೆ ಮತ್ತು ಮಳೆ ಸಂಭವ ಕಡಿಮೆ — ಬೆಳಿಗ್ಗೆ/ಸಂಜೆ ಎಲೆ ಸಿಂಪಡಣೆಗೆ ಸೂಕ್ತ.';

  if (!spraying_suitable) {
    const reasonsEn: string[] = [];
    const reasonsKn: string[] = [];
    if (highWind) {
      reasonsEn.push(`wind ${current.wind_kmh.toFixed(0)} km/h causes spray drift`);
      reasonsKn.push(`ಗಾಳಿಯ ವೇಗ ${current.wind_kmh.toFixed(0)} ಕಿ.ಮೀ/ಗಂ ಇರುವುದರಿಂದ ಔಷಧಿ ಹಾರಿಹೋಗುತ್ತದೆ`);
    }
    if (rainRisk) {
      reasonsEn.push(`rain probability ${todayRainProb}% may wash off foliar inputs`);
      reasonsKn.push(`ಮಳೆ ಸಂಭವ ${todayRainProb}% ಇರುವುದರಿಂದ ಸಿಂಪಡಿಸಿದ ಔಷಧಿ ತೊಳೆದು ಹೋಗಬಹುದು`);
    }
    spraying_reason_en = `Pause foliar sprays right now: ${reasonsEn.join(' and ')}.`;
    spraying_reason_kn = `ಈಗ ಎಲೆ ಸಿಂಪಡಣೆ ನಿಲ್ಲಿಸಿ: ${reasonsKn.join(' ಮತ್ತು ')}.`;

    alerts.push({
      id: 'spraying-unsuitable',
      severity: 'warning',
      type: 'spraying',
      title_en: 'Pause Foliar Sprays — Unsuitable Conditions',
      title_kn: 'ಎಲೆ ಸಿಂಪಡಣೆ ನಿಲ್ಲಿಸಿ — ಹವಾಮಾನ ಸೂಕ್ತವಲ್ಲ',
      message_en: spraying_reason_en,
      message_kn: spraying_reason_kn,
    });
  }

  return { alerts, spraying_suitable, spraying_reason_en, spraying_reason_kn };
}

export async function getWeatherForCoordinates(
  latitude: number,
  longitude: number,
  locationLabel: string,
  forceRefresh = false
): Promise<WeatherPayload> {
  const lat = Number(latitude.toFixed(3));
  const lng = Number(longitude.toFixed(3));
  const cacheKey = `${lat},${lng}`;

  const cachedRow = db.prepare('SELECT payload, fetched_at FROM weather_cache WHERE cache_key = ?').get(cacheKey) as
    | { payload: string; fetched_at: string }
    | undefined;

  // Use 30-minute fresh cache unless forced
  if (!forceRefresh && cachedRow) {
    const ageMs = Date.now() - new Date(cachedRow.fetched_at).getTime();
    if (ageMs < 30 * 60 * 1000) {
      const parsed = JSON.parse(cachedRow.payload) as WeatherPayload;
      return { ...parsed, location_label: locationLabel, api_status: 'cached' };
    }
  }

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,rain,wind_speed_10m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,rain_sum,precipitation_probability_max,wind_speed_10m_max&timezone=Asia%2FKolkata&forecast_days=7`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!resp.ok) {
      throw new Error(`Open-Meteo HTTP ${resp.status}`);
    }

    const data = (await resp.json()) as {
      current: {
        temperature_2m: number;
        relative_humidity_2m: number;
        rain: number;
        wind_speed_10m: number;
        weather_code: number;
      };
      daily: {
        time: string[];
        weather_code: number[];
        temperature_2m_max: number[];
        temperature_2m_min: number[];
        rain_sum: number[];
        precipitation_probability_max: number[];
        wind_speed_10m_max: number[];
      };
    };

    const currentCond = decodeWmoCode(data.current.weather_code);
    const current: NonNullable<WeatherPayload['current']> = {
      temperature_c: data.current.temperature_2m,
      humidity_pct: data.current.relative_humidity_2m,
      rain_mm: data.current.rain,
      wind_kmh: data.current.wind_speed_10m,
      weather_code: data.current.weather_code,
      condition_en: currentCond.en,
      condition_kn: currentCond.kn,
    };

    const daily: WeatherPayload['daily'] = data.daily.time.map((dateStr, i) => {
      const c = decodeWmoCode(data.daily.weather_code[i] ?? 0);
      return {
        date: dateStr,
        temp_min_c: data.daily.temperature_2m_min[i] ?? 0,
        temp_max_c: data.daily.temperature_2m_max[i] ?? 0,
        rain_sum_mm: data.daily.rain_sum[i] ?? 0,
        rain_prob_pct: data.daily.precipitation_probability_max[i] ?? 0,
        wind_max_kmh: data.daily.wind_speed_10m_max[i] ?? 0,
        weather_code: data.daily.weather_code[i] ?? 0,
        condition_en: c.en,
        condition_kn: c.kn,
      };
    });

    const agronomy = buildAgriculturalAlerts(current, daily);
    const nowIso = new Date().toISOString();

    const payload: WeatherPayload = {
      latitude: lat,
      longitude: lng,
      location_label: locationLabel,
      provider: 'Open-Meteo Meteorological Forecast (Asia/Kolkata)',
      api_status: 'live',
      last_updated: nowIso,
      current,
      daily,
      alerts: agronomy.alerts,
      spraying_suitable: agronomy.spraying_suitable,
      spraying_reason_en: agronomy.spraying_reason_en,
      spraying_reason_kn: agronomy.spraying_reason_kn,
    };

    db.prepare(
      'INSERT INTO weather_cache (cache_key, payload, fetched_at) VALUES (?, ?, ?) ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at'
    ).run(cacheKey, JSON.stringify(payload), nowIso);

    return payload;
  } catch (err) {
    if (cachedRow) {
      const parsed = JSON.parse(cachedRow.payload) as WeatherPayload;
      return {
        ...parsed,
        location_label: locationLabel,
        api_status: 'cached',
        error_message: err instanceof Error ? err.message : 'Weather API unreachable; showing last cached reading',
      };
    }

    return {
      latitude: lat,
      longitude: lng,
      location_label: locationLabel,
      provider: 'Open-Meteo Meteorological Forecast',
      api_status: 'unavailable',
      last_updated: new Date().toISOString(),
      error_message: err instanceof Error ? err.message : 'Live weather service unavailable',
      current: null,
      daily: [],
      alerts: [],
      spraying_suitable: false,
      spraying_reason_en: 'Live weather unavailable — check local conditions before spraying.',
      spraying_reason_kn: 'ಲೈವ್ ಹವಾಮಾನ ಲಭ್ಯವಿಲ್ಲ — ಸಿಂಪಡಣೆಗೆ ಮುನ್ನ ಸ್ಥಳೀಯ ಹವಾಮಾನ ಪರಿಶೀಲಿಸಿ.',
    };
  }
}
