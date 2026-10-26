(function () {
  'use strict';

  const POLL_INTERVAL_MS = 60 * 1000; // 60 segundos
  const IDLE_RESET_MS = 2 * 60 * 1000; // 2 minutos sin tocar vuelve cada columna a su lugar
  const PAGE_RELOAD_MS = 6 * 60 * 60 * 1000; // 6 horas para liberar memoria en WebKit

  let appConfig = {
    tz: 'America/Argentina/Cordoba',
    city: 'Córdoba Capital',
    people: [
      { id: 'person1', name: 'Emi', initial: 'E', color: '#4f8cff' },
      { id: 'person2', name: 'Natali', initial: 'N', color: '#ff6fa8' }
    ],
    meal_cutoffs: {
      lunchFrom: '11:00',
      snackFrom: '16:00',
      dinnerFrom: '19:30'
    },
    night_mode: {
      start: '23:00',
      end: '06:00'
    }
  };

  let idleTimer = null;
  let userTouching = false;
  let lastActiveMealSlot = null;

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getWeatherSvg(iconName) {
    switch (iconName) {
      case 'clear-day':
        return `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="24" cy="24" r="10" fill="#FBBF24"/>
          <g stroke="#FBBF24" stroke-width="3" stroke-linecap="round">
            <line x1="24" y1="5" x2="24" y2="9"/><line x1="24" y1="39" x2="24" y2="43"/>
            <line x1="5" y1="24" x2="9" y2="24"/><line x1="39" y1="24" x2="43" y2="24"/>
            <line x1="10.6" y1="10.6" x2="13.4" y2="13.4"/><line x1="34.6" y1="34.6" x2="37.4" y2="37.4"/>
            <line x1="37.4" y1="10.6" x2="34.6" y2="13.4"/><line x1="13.4" y1="34.6" x2="10.6" y2="37.4"/>
          </g>
        </svg>`;
      case 'clear-night':
        return `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M31.5 34C23.5 34 17 27.5 17 19.5C17 14.8 19.2 10.6 22.7 8C14.8 8.9 8.7 15.6 8.7 23.8C8.7 32.6 15.8 39.7 24.6 39.7C31.1 39.7 36.7 35.8 39.1 30.2C36.9 32.6 34.3 34 31.5 34Z" fill="#93C5FD"/>
        </svg>`;
      case 'partly-cloudy-day':
        return `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="19" cy="18" r="8" fill="#FBBF24"/>
          <path d="M17 36H34C38.4 36 42 32.6 42 28.4C42 24.5 39.1 21.3 35.3 20.9C34.1 15.8 29.5 12 24 12C17.6 12 12.4 17.2 12.4 23.6C12.4 24.1 12.4 24.6 12.5 25.1C9.4 25.8 7 28.5 7 31.8C7 34.1 11.5 36 17 36Z" fill="#CBD5E1"/>
        </svg>`;
      case 'partly-cloudy-night':
        return `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="18" cy="17" r="7" fill="#93C5FD"/>
          <path d="M16 36H34C38.4 36 42 32.6 42 28.4C42 24.5 39.1 21.3 35.3 20.9C34.1 15.8 29.5 12 24 12C17.6 12 12.4 17.2 12.4 23.6C9.3 24.3 7 27 7 30.3C7 33.4 11 36 16 36Z" fill="#94A3B8"/>
        </svg>`;
      case 'rain':
      case 'drizzle':
      case 'heavy-rain':
        return `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M15 31H34C38.4 31 42 27.6 42 23.4C42 19.5 39.1 16.3 35.3 15.9C34.1 10.8 29.5 7 24 7C17.6 7 12.4 12.2 12.4 18.6C9.3 19.3 7 22 7 25.3C7 28.4 10.5 31 15 31Z" fill="#94A3B8"/>
          <g stroke="#38BDF8" stroke-width="3" stroke-linecap="round">
            <line x1="17" y1="35" x2="14" y2="42"/>
            <line x1="25" y1="35" x2="22" y2="42"/>
            <line x1="33" y1="35" x2="30" y2="42"/>
          </g>
        </svg>`;
      case 'storm':
        return `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M15 30H34C38.4 30 42 26.6 42 22.4C42 18.5 39.1 15.3 35.3 14.9C34.1 9.8 29.5 6 24 6C17.6 6 12.4 11.2 12.4 17.6C9.3 18.3 7 21 7 24.3C7 27.4 10.5 30 15 30Z" fill="#64748B"/>
          <polygon points="25,27 18,36 24,36 21,44 31,34 25,34" fill="#FBBF24"/>
        </svg>`;
      default:
        return `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M15 35H34C38.4 35 42 31.6 42 27.4C42 23.5 39.1 20.3 35.3 19.9C34.1 14.8 29.5 11 24 11C17.6 11 12.4 16.2 12.4 22.6C9.3 23.3 7 26 7 29.3C7 32.4 10.5 35 15 35Z" fill="#94A3B8"/>
        </svg>`;
    }
  }

  function isTimeInRange(hhmm, start, end) {
    if (!start || !end) return false;
    if (start <= end) {
      return hhmm >= start && hhmm < end;
    }
    // Cruza medianoche (ej. 23:00 a 06:00)
    return hhmm >= start || hhmm < end;
  }

  function updateClockAndModes() {
    const now = new Date();
    const timeStr = new Intl.DateTimeFormat('es-AR', {
      timeZone: appConfig.tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(now);

    const dateStr = new Intl.DateTimeFormat('es-AR', {
      timeZone: appConfig.tz,
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    }).format(now);

    const clockTimeEl = document.getElementById('clock-time');
    const clockDateEl = document.getElementById('clock-date');
    if (clockTimeEl) clockTimeEl.textContent = timeStr;
    if (clockDateEl) clockDateEl.textContent = dateStr;

    // Evaluar Modo Noche (23:00 a 06:00)
    const nightActive = isTimeInRange(
      timeStr,
      appConfig.night_mode?.start || '23:00',
      appConfig.night_mode?.end || '06:00'
    );
    document.body.classList.toggle('night-mode', nightActive);
  }

  function renderPeopleLegend(people) {
    const container = document.getElementById('people-legend');
    if (!container || !Array.isArray(people)) return;
    container.innerHTML = people
      .map(
        (p) => `
        <span class="legend-item">
          <span class="legend-dot" style="background-color:${escapeHtml(p.color)}"></span>
          <span>${escapeHtml(p.name)}</span>
        </span>
      `
      )
      .join('');
  }

  function renderEventCard(ev, showDayPrefix) {
    const owners = Array.isArray(ev.owners) ? ev.owners : [];
    const barsHtml = owners
      .map(
        (o) =>
          `<span class="cal-color-segment" style="background-color:${escapeHtml(o.color)}"></span>`
      )
      .join('');

    const pillsHtml = owners
      .map(
        (o) =>
          `<span class="cal-owner-pill" style="background-color:${escapeHtml(o.color)}">${escapeHtml(
            o.name
          )}</span>`
      )
      .join('');

    const countdownSuffix =
      showDayPrefix && typeof ev.days_until === 'number' && ev.days_until > 1
        ? ` · en ${ev.days_until} días`
        : '';

    let timeText = '';
    if (ev.all_day) {
      timeText =
        showDayPrefix && ev.day_label
          ? `${ev.day_label} · Todo el día${countdownSuffix}`
          : 'Todo el día';
    } else {
      const range = ev.end_time ? `${ev.start_time} – ${ev.end_time}` : ev.start_time;
      timeText =
        showDayPrefix && ev.day_label ? `${ev.day_label} · ${range}${countdownSuffix}` : range;
    }

    return `
      <article class="cal-event-card">
        <div class="cal-color-bars">${barsHtml}</div>
        <div class="cal-event-body">
          <div class="cal-event-top">
            <span class="cal-event-time ${ev.all_day ? 'is-allday' : ''}">${escapeHtml(timeText)}</span>
            <div class="cal-owners-pills">${pillsHtml}</div>
          </div>
          <div class="cal-event-title">${escapeHtml(ev.title)}</div>
          ${ev.location ? `<div class="cal-event-sub">📍 ${escapeHtml(ev.location)}</div>` : ''}
        </div>
      </article>
    `;
  }

  function renderCalendarColumn(data) {
    const col = document.getElementById('col-calendar');
    const badge = document.getElementById('calendar-badge');
    if (!col) return;

    if (Array.isArray(data.people)) {
      renderPeopleLegend(data.people);
    }

    if (badge) {
      if (data.demo_mode) {
        badge.textContent = 'Modo ejemplo';
        badge.classList.add('badge-demo');
      } else {
        const names = (data.people || []).map((p) => p.name).join(' & ');
        badge.textContent = names || 'Conectado';
        badge.classList.remove('badge-demo');
      }
    }

    const parts = [];

    if (data.demo_mode) {
      parts.push(`
        <div class="cal-demo-notice">
          Mostrando agenda de ejemplo. Cargá los links ICS de <strong>Emi</strong> y <strong>Natali</strong> en <code>.env</code> o en Portainer para ver sus eventos reales.
        </div>
      `);
    }

    // HOY
    const todayList = Array.isArray(data.today) ? data.today : [];
    parts.push(`
      <div class="cal-section">
        <div class="cal-section-header">Hoy · ${escapeHtml(data.today_label || '')}</div>
        ${
          todayList.length > 0
            ? todayList.map((ev) => renderEventCard(ev, false)).join('')
            : `<div class="empty-state">Sin más eventos por hoy</div>`
        }
      </div>
    `);

    // MAÑANA
    const tomorrowList = Array.isArray(data.tomorrow) ? data.tomorrow : [];
    parts.push(`
      <div class="cal-section">
        <div class="cal-section-header">Mañana · ${escapeHtml(data.tomorrow_label || '')}</div>
        ${
          tomorrowList.length > 0
            ? tomorrowList.map((ev) => renderEventCard(ev, false)).join('')
            : `<div class="empty-state">Sin eventos agendados mañana</div>`
        }
      </div>
    `);

    // PRÓXIMOS DÍAS
    const upcomingList = Array.isArray(data.upcoming) ? data.upcoming : [];
    parts.push(`
      <div class="cal-section">
        <div class="cal-section-header">Próximos días</div>
        ${
          upcomingList.length > 0
            ? upcomingList.map((ev) => renderEventCard(ev, true)).join('')
            : `<div class="empty-state">No hay más eventos esta semana</div>`
        }
      </div>
    `);

    // PRÓXIMO FERIADO DE ARGENTINA
    if (data.next_holiday) {
      const h = data.next_holiday;
      const countdownLabel =
        h.days_until === 0
          ? 'Hoy'
          : h.days_until === 1
            ? 'Mañana'
            : `Faltan ${h.days_until} días`;
      parts.push(`
        <div class="cal-holiday-card">
          <div class="cal-holiday-top">
            <span class="cal-holiday-label">🇦🇷 Próximo feriado · ${escapeHtml(h.date_label)}</span>
            <span class="cal-holiday-countdown">${escapeHtml(countdownLabel)}</span>
          </div>
          <div class="cal-holiday-name">${escapeHtml(h.name)}</div>
        </div>
      `);
    }

    col.innerHTML = parts.join('');
  }

  function renderWeatherColumn(data) {
    const col = document.getElementById('col-weather');
    const badge = document.getElementById('weather-badge');
    const headerTemp = document.getElementById('header-weather-temp');
    const headerCity = document.getElementById('header-weather-city');
    const headerIcon = document.getElementById('header-weather-icon');

    if (!col || !data || !data.now) return;

    const now = data.now;
    if (headerTemp) headerTemp.textContent = `${now.temp}°`;
    if (headerCity) headerCity.textContent = data.city || 'Córdoba';
    if (headerIcon) headerIcon.innerHTML = getWeatherSvg(now.icon);
    if (badge) {
      badge.textContent =
        now.temp_max !== null && now.temp_min !== null
          ? `Máx ${now.temp_max}° · Mín ${now.temp_min}°`
          : now.label;
    }

    const nextHours = Array.isArray(data.next_hours) ? data.next_hours.slice(0, 8) : [];
    const days = Array.isArray(data.days) ? data.days : [];

    const hourlyHtml = nextHours
      .map(
        (h) => `
        <div class="hour-chip">
          <span class="hour-chip-time">${escapeHtml(h.time)}</span>
          <span class="hour-chip-icon">${getWeatherSvg(h.icon)}</span>
          <span class="hour-chip-temp">${h.temp}°</span>
          ${
            h.rain_prob >= 15
              ? `<span class="hour-chip-rain">💧 ${h.rain_prob}%</span>`
              : `<span class="hour-chip-rain">&nbsp;</span>`
          }
        </div>
      `
      )
      .join('');

    const dailyHtml = days
      .map(
        (d) => `
        <div class="daily-row">
          <span class="daily-day">${escapeHtml(d.day_label)}</span>
          <span class="daily-icon">${getWeatherSvg(d.icon)}</span>
          <span class="daily-desc">${escapeHtml(d.label)}${
            d.rain_prob >= 20 ? ` · 💧 ${d.rain_prob}%` : ''
          }</span>
          <span class="daily-temps">${d.temp_max}° <span class="daily-min">${d.temp_min}°</span></span>
        </div>
      `
      )
      .join('');

    const tips = Array.isArray(data.tips) ? data.tips : [];
    const tipsHtml =
      tips.length > 0
        ? `<div class="weather-tips-list">
            ${tips
              .map(
                (t) => `
              <div class="weather-tip-banner tip-${escapeHtml(t.type || 'info')}">
                <span class="weather-tip-icon">${t.icon || 'ℹ️'}</span>
                <span class="weather-tip-text">${escapeHtml(t.text)}</span>
              </div>
            `
              )
              .join('')}
          </div>`
        : '';

    col.innerHTML = `
      <div class="weather-hero">
        <div class="weather-hero-main">
          <div class="weather-temp-block">
            <div class="weather-temp-big">${now.temp}°C</div>
            <div class="weather-condition-label">${escapeHtml(now.label)}</div>
          </div>
          <div class="weather-hero-icon">${getWeatherSvg(now.icon)}</div>
        </div>
        <div class="weather-stats-grid">
          <div class="weather-stat-item">
            <span class="weather-stat-label">Sensación térmica</span>
            <span class="weather-stat-val">${now.feels_like}°C</span>
          </div>
          <div class="weather-stat-item">
            <span class="weather-stat-label">Humedad</span>
            <span class="weather-stat-val">${now.humidity}%</span>
          </div>
          <div class="weather-stat-item">
            <span class="weather-stat-label">Viento</span>
            <span class="weather-stat-val">${now.wind_kmh} km/h</span>
          </div>
          <div class="weather-stat-item">
            <span class="weather-stat-label">Prob. lluvia hoy</span>
            <span class="weather-stat-val">${now.rain_prob_today}%</span>
          </div>
        </div>
      </div>

      ${tipsHtml}

      <div class="weather-subblock">
        <div class="weather-sub-title">Próximas horas</div>
        <div class="hourly-strip">${hourlyHtml}</div>
      </div>

      <div class="weather-subblock">
        <div class="weather-sub-title">Próximos días</div>
        <div class="daily-list">${dailyHtml}</div>
      </div>
    `;
  }

  function renderSimpleMealCard({ slotId, icon, label, text, isActive }) {
    return `
      <article id="meal-slot-${slotId}" class="meal-card ${isActive ? 'is-active' : ''}">
        <div class="meal-header">
          <span class="meal-slot-label">${icon} ${escapeHtml(label)}</span>
          ${isActive ? `<span class="meal-now-pill">Ahora</span>` : ''}
        </div>
        <div class="meal-simple-text">${escapeHtml(text)}</div>
      </article>
    `;
  }

  function renderMainMealCard({ slotId, icon, label, meal, isActive }) {
    const title = meal?.title || meal?.raw || 'Según planilla';

    return `
      <article id="meal-slot-${slotId}" class="meal-card ${isActive ? 'is-active' : ''}">
        <div class="meal-header">
          <span class="meal-slot-label">${icon} ${escapeHtml(label)}</span>
          ${isActive ? `<span class="meal-now-pill">Ahora</span>` : ''}
        </div>
        <div class="meal-dish-title">${escapeHtml(title)}</div>
      </article>
    `;
  }

  function scrollMealsToActive(slotId, smooth = true) {
    const col = document.getElementById('col-meals');
    const card = document.getElementById(`meal-slot-${slotId}`);
    if (!col || !card) return;

    const topOffset = Math.max(0, card.offsetTop - col.offsetTop - 10);
    try {
      col.scrollTo({
        top: topOffset,
        behavior: smooth ? 'smooth' : 'auto'
      });
    } catch {
      col.scrollTop = topOffset;
    }
  }

  function renderMealsColumn(data) {
    const col = document.getElementById('col-meals');
    const badge = document.getElementById('meals-badge');
    if (!col || !data) return;

    if (badge) {
      badge.textContent = data.day_label
        ? `${data.day_label} · ${data.plan_title || 'NutriPlan'}`
        : data.plan_title || 'NutriPlan';
    }

    const activeSlot = data.active_slot || 'breakfast';

    const html = [
      renderSimpleMealCard({
        slotId: 'breakfast',
        icon: '☀️',
        label: 'Mañana · Desayuno',
        text: data.breakfast?.text || 'Infusión + tostadas con gluten + Casancrem Light',
        isActive: activeSlot === 'breakfast'
      }),
      renderMainMealCard({
        slotId: 'lunch',
        icon: '🌞',
        label: 'Mediodía · Almuerzo',
        meal: data.lunch,
        isActive: activeSlot === 'lunch'
      }),
      renderSimpleMealCard({
        slotId: 'snack',
        icon: '🧉',
        label: 'Tarde · Merienda',
        text: data.snack?.text || 'Infusión + tostadas con gluten + Casancrem Light',
        isActive: activeSlot === 'snack'
      }),
      renderMainMealCard({
        slotId: 'dinner',
        icon: '🌙',
        label: 'Noche · Cena',
        meal: data.dinner,
        isActive: activeSlot === 'dinner'
      }),
      data.tomorrow
        ? `
        <div class="meal-tomorrow-box">
          <div class="meal-tomorrow-header">🥩 Mañana (${escapeHtml(
            data.tomorrow.day_label || 'Mañana'
          )}) · Para descongelar / prever</div>
          <div class="meal-tomorrow-row">
            <span class="meal-tomorrow-tag">🌞 Almuerzo:</span>
            <span class="meal-tomorrow-val">${escapeHtml(
              data.tomorrow.lunch?.title || 'Según planilla'
            )}</span>
          </div>
          <div class="meal-tomorrow-row">
            <span class="meal-tomorrow-tag">🌙 Cena:</span>
            <span class="meal-tomorrow-val">${escapeHtml(
              data.tomorrow.dinner?.title || 'Según planilla'
            )}</span>
          </div>
        </div>
      `
        : ''
    ].join('');

    col.innerHTML = html;

    if (!userTouching && lastActiveMealSlot !== activeSlot) {
      lastActiveMealSlot = activeSlot;
      setTimeout(() => scrollMealsToActive(activeSlot, false), 60);
    }
  }

  function updateSyncStatus({ ok, stale }) {
    const badge = document.getElementById('sync-badge');
    const text = document.getElementById('sync-text');
    if (!badge || !text) return;

    const nowTime = new Intl.DateTimeFormat('es-AR', {
      timeZone: appConfig.tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(new Date());

    badge.classList.remove('is-stale', 'is-error');
    if (!ok) {
      badge.classList.add('is-error');
      text.textContent = `Reintentando (${nowTime})`;
    } else if (stale) {
      badge.classList.add('is-stale');
      text.textContent = `Caché local · ${nowTime}`;
    } else {
      text.textContent = `Actualizado ${nowTime}`;
    }
  }

  async function fetchJson(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  async function refreshAll() {
    let anyError = false;
    let anyStale = false;

    const [calRes, weatherRes, mealsRes] = await Promise.allSettled([
      fetchJson('/api/calendar'),
      fetchJson('/api/weather'),
      fetchJson('/api/meals')
    ]);

    if (calRes.status === 'fulfilled') {
      renderCalendarColumn(calRes.value);
      if (calRes.value.stale) anyStale = true;
    } else {
      anyError = true;
    }

    if (weatherRes.status === 'fulfilled') {
      renderWeatherColumn(weatherRes.value);
      if (weatherRes.value.stale) anyStale = true;
    } else {
      anyError = true;
    }

    if (mealsRes.status === 'fulfilled') {
      renderMealsColumn(mealsRes.value);
      if (mealsRes.value.stale) anyStale = true;
    } else {
      anyError = true;
      const colMeals = document.getElementById('col-meals');
      if (colMeals && colMeals.querySelector('.empty-state')) {
        colMeals.innerHTML = `<div class="empty-state">No se pudo conectar con NutriPlan (${escapeHtml(
          mealsRes.reason?.message || 'sin conexión'
        )})</div>`;
      }
    }

    updateSyncStatus({ ok: !anyError, stale: anyStale });
  }

  function resetColumnsScrollToDefault() {
    userTouching = false;
    const calCol = document.getElementById('col-calendar');
    const weatherCol = document.getElementById('col-weather');
    if (calCol) {
      try {
        calCol.scrollTo({ top: 0, behavior: 'smooth' });
      } catch {
        calCol.scrollTop = 0;
      }
    }
    if (weatherCol) {
      try {
        weatherCol.scrollTo({ top: 0, behavior: 'smooth' });
      } catch {
        weatherCol.scrollTop = 0;
      }
    }
    if (lastActiveMealSlot) {
      scrollMealsToActive(lastActiveMealSlot, true);
    }
  }

  function setupTouchIdleReset() {
    const onUserActivity = () => {
      userTouching = true;
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(resetColumnsScrollToDefault, IDLE_RESET_MS);
    };

    window.addEventListener('touchstart', onUserActivity, { passive: true });
    window.addEventListener('touchmove', onUserActivity, { passive: true });
    window.addEventListener('wheel', onUserActivity, { passive: true });
  }

  function setupPixelShift() {
    let step = 0;
    const shifts = [
      [0, 0],
      [1, 1],
      [0, 2],
      [-1, 1],
      [-1, 0],
      [0, -1]
    ];
    setInterval(() => {
      step = (step + 1) % shifts.length;
      const [dx, dy] = shifts[step];
      const dash = document.getElementById('dashboard');
      if (dash) {
        dash.style.transform = `translate(${dx}px, ${dy}px)`;
      }
    }, 10 * 60 * 1000);
  }

  async function init() {
    try {
      const cfg = await fetchJson('/api/config');
      if (cfg) appConfig = { ...appConfig, ...cfg };
      renderPeopleLegend(appConfig.people);
    } catch {
      renderPeopleLegend(appConfig.people);
    }

    updateClockAndModes();
    setInterval(updateClockAndModes, 1000);

    setupTouchIdleReset();
    setupPixelShift();

    await refreshAll();
    setInterval(refreshAll, POLL_INTERVAL_MS);

    // Recarga preventiva cada 6 horas para mantener la RAM limpia en la tablet
    setTimeout(() => {
      window.location.reload();
    }, PAGE_RELOAD_MS);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
