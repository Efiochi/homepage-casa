const config = require('../config');
const { getOrFetch } = require('../cache');

const WEATHER_TTL_MS = 15 * 60 * 1000; // 15 minutos

const DAY_LABELS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function describeWmoCode(code, isDay = 1) {
  const c = Number(code ?? 0);
  if (c === 0) {
    return {
      label: isDay ? 'Despejado' : 'Noche despejada',
      icon: isDay ? 'clear-day' : 'clear-night'
    };
  }
  if (c === 1) {
    return {
      label: isDay ? 'Mayormente despejado' : 'Pocas nubes',
      icon: isDay ? 'partly-cloudy-day' : 'partly-cloudy-night'
    };
  }
  if (c === 2) {
    return {
      label: 'Parcialmente nublado',
      icon: isDay ? 'partly-cloudy-day' : 'partly-cloudy-night'
    };
  }
  if (c === 3) {
    return { label: 'Nublado', icon: 'cloudy' };
  }
  if (c === 45 || c === 48) {
    return { label: 'Niebla / neblina', icon: 'fog' };
  }
  if ([51, 53, 55, 56, 57].includes(c)) {
    return { label: 'Llovizna', icon: 'drizzle' };
  }
  if ([61, 63, 80, 81].includes(c)) {
    return { label: 'Lluvia', icon: 'rain' };
  }
  if ([65, 66, 67, 82].includes(c)) {
    return { label: 'Lluvia intensa', icon: 'heavy-rain' };
  }
  if ([71, 73, 75, 77, 85, 86].includes(c)) {
    return { label: 'Nieve / aguanieve', icon: 'snow' };
  }
  if ([95, 96, 99].includes(c)) {
    return { label: 'Tormenta eléctrica', icon: 'storm' };
  }
  return { label: 'Variable', icon: 'cloudy' };
}

function getLocalNowParts() {
  const now = new Date(
    new Date().toLocaleString('en-US', { timeZone: config.tz })
  );
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  return {
    dateStr: `${yyyy}-${mm}-${dd}`,
    hourIsoPrefix: `${yyyy}-${mm}-${dd}T${hh}:00`
  };
}

async function fetchWeatherFromOpenMeteo() {
  const { lat, lon, city } = config.weather;
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: [
      'temperature_2m',
      'apparent_temperature',
      'relative_humidity_2m',
      'wind_speed_10m',
      'precipitation',
      'weather_code',
      'is_day'
    ].join(','),
    hourly: [
      'temperature_2m',
      'precipitation_probability',
      'weather_code',
      'is_day'
    ].join(','),
    daily: [
      'weather_code',
      'temperature_2m_max',
      'temperature_2m_min',
      'precipitation_probability_max',
      'sunrise',
      'sunset'
    ].join(','),
    timezone: config.tz,
    forecast_days: '6'
  });

  const url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10000)
  });

  if (!res.ok) {
    throw new Error(`Open-Meteo HTTP ${res.status}`);
  }

  const raw = await res.json();
  const current = raw.current || {};
  const daily = raw.daily || {};
  const hourly = raw.hourly || {};

  const currentDesc = describeWmoCode(current.weather_code, current.is_day ?? 1);
  const { hourIsoPrefix, dateStr } = getLocalNowParts();

  // Encontrar índice de la hora actual en hourly.time
  const hourlyTimes = Array.isArray(hourly.time) ? hourly.time : [];
  let startIdx = hourlyTimes.findIndex((t) => t >= hourIsoPrefix);
  if (startIdx < 0) startIdx = 0;

  const nextHours = [];
  for (let i = startIdx + 1; i <= startIdx + 8 && i < hourlyTimes.length; i++) {
    const tStr = hourlyTimes[i] || '';
    const hourLabel = tStr.includes('T') ? tStr.split('T')[1].slice(0, 5) : tStr;
    const isDayHour = hourly.is_day ? hourly.is_day[i] : 1;
    const desc = describeWmoCode(hourly.weather_code?.[i], isDayHour);
    nextHours.push({
      time: hourLabel,
      temp: Math.round(Number(hourly.temperature_2m?.[i] ?? 0)),
      rain_prob: Number(hourly.precipitation_probability?.[i] ?? 0),
      weather_code: Number(hourly.weather_code?.[i] ?? 0),
      label: desc.label,
      icon: desc.icon
    });
  }

  const dailyTimes = Array.isArray(daily.time) ? daily.time : [];
  const days = [];
  for (let i = 0; i < dailyTimes.length && days.length < 5; i++) {
    const dStr = dailyTimes[i];
    const [y, m, d] = dStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    const isToday = dStr === dateStr;
    const desc = describeWmoCode(daily.weather_code?.[i], 1);
    days.push({
      date: dStr,
      day_label: isToday ? 'Hoy' : DAY_LABELS_SHORT[dt.getDay()],
      temp_max: Math.round(Number(daily.temperature_2m_max?.[i] ?? 0)),
      temp_min: Math.round(Number(daily.temperature_2m_min?.[i] ?? 0)),
      rain_prob: Number(daily.precipitation_probability_max?.[i] ?? 0),
      weather_code: Number(daily.weather_code?.[i] ?? 0),
      label: desc.label,
      icon: desc.icon,
      sunrise: daily.sunrise?.[i] ? daily.sunrise[i].split('T')[1] : '',
      sunset: daily.sunset?.[i] ? daily.sunset[i].split('T')[1] : ''
    });
  }

  const todaySummary = days[0] || {};
  const tomorrowSummary = days[1] || null;

  const nowObj = {
    temp: Math.round(Number(current.temperature_2m ?? 0)),
    feels_like: Math.round(Number(current.apparent_temperature ?? current.temperature_2m ?? 0)),
    humidity: Math.round(Number(current.relative_humidity_2m ?? 0)),
    wind_kmh: Math.round(Number(current.wind_speed_10m ?? 0)),
    precipitation_mm: Number(current.precipitation ?? 0),
    weather_code: Number(current.weather_code ?? 0),
    is_day: Boolean(current.is_day ?? 1),
    label: currentDesc.label,
    icon: currentDesc.icon,
    temp_max: todaySummary.temp_max ?? null,
    temp_min: todaySummary.temp_min ?? null,
    rain_prob_today: todaySummary.rain_prob ?? 0,
    sunrise: todaySummary.sunrise || '',
    sunset: todaySummary.sunset || ''
  };

  const tips = [];
  const rainyHour = nextHours.find(
    (h) => h.rain_prob >= 45 || ['rain', 'heavy-rain', 'storm', 'drizzle'].includes(h.icon)
  );

  if (nowObj.precipitation_mm > 0 || ['rain', 'heavy-rain', 'storm', 'drizzle'].includes(nowObj.icon)) {
    tips.push({
      type: 'warning',
      icon: '🌧️',
      text: 'Lloviendo ahora · Llevá paraguas y entrá la ropa'
    });
  } else if (rainyHour) {
    tips.push({
      type: 'warning',
      icon: '☂️',
      text: `Probabilidad de lluvia a las ${rainyHour.time} (${rainyHour.rain_prob}%) · Guardá la ropa`
    });
  } else if (nowObj.rain_prob_today < 25 && nowObj.humidity <= 65) {
    tips.push({
      type: 'good',
      icon: '🧺',
      text: 'Tiempo seco · Buen momento para lavar y tender ropa'
    });
  } else {
    tips.push({
      type: 'good',
      icon: '🌤️',
      text: 'Sin lluvias previstas en las próximas horas'
    });
  }

  if (tomorrowSummary && todaySummary.temp_max !== undefined) {
    const diffMax = tomorrowSummary.temp_max - todaySummary.temp_max;
    if (diffMax <= -5) {
      tips.push({
        type: 'info',
        icon: '🧥',
        text: `Mañana refresca (${Math.abs(diffMax)}° menos · Máx ${tomorrowSummary.temp_max}° / Mín ${tomorrowSummary.temp_min}°)`
      });
    } else if (diffMax >= 5) {
      tips.push({
        type: 'info',
        icon: '🌡️',
        text: `Mañana sube fuerte la temperatura (Máx ${tomorrowSummary.temp_max}°C)`
      });
    } else if (tomorrowSummary.rain_prob >= 55) {
      tips.push({
        type: 'warning',
        icon: '🌦️',
        text: `Mañana hay ${tomorrowSummary.rain_prob}% de probabilidad de lluvia`
      });
    }
  }

  if (tips.length < 2 && nowObj.temp_max !== null && nowObj.temp_max >= 32) {
    tips.push({
      type: 'warning',
      icon: '☀️',
      text: `Día caluroso hoy (Máx ${nowObj.temp_max}°C) · Hidratate bien`
    });
  }

  return {
    city,
    now: nowObj,
    tips: tips.slice(0, 2),
    next_hours: nextHours,
    days
  };
}

async function getWeather() {
  return getOrFetch('weather', WEATHER_TTL_MS, fetchWeatherFromOpenMeteo);
}

module.exports = { getWeather };
