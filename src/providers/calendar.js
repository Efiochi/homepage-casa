const ical = require('node-ical');
const config = require('../config');
const { getOrFetch } = require('../cache');

const CALENDAR_TTL_MS = 10 * 60 * 1000; // 10 minutos
const WINDOW_DAYS = 14;

const DAY_NAMES_FULL = [
  'domingo',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado'
];
const MONTH_NAMES_SHORT = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic'
];

// Feriados nacionales de Argentina (2026–2027) en memoria (cero impacto de red/CPU)
const ARGENTINA_HOLIDAYS = [
  { date: '2026-01-01', name: 'Año Nuevo' },
  { date: '2026-02-16', name: 'Carnaval' },
  { date: '2026-02-17', name: 'Carnaval' },
  { date: '2026-03-24', name: 'Día de la Memoria por la Verdad y la Justicia' },
  { date: '2026-04-02', name: 'Día del Veterano y de los Caídos en Malvinas' },
  { date: '2026-04-03', name: 'Viernes Santo' },
  { date: '2026-05-01', name: 'Día del Trabajador' },
  { date: '2026-05-25', name: 'Día de la Revolución de Mayo' },
  { date: '2026-06-15', name: 'Paso a la Inmortalidad del Gral. Güemes' },
  { date: '2026-06-20', name: 'Paso a la Inmortalidad del Gral. Belgrano' },
  { date: '2026-07-09', name: 'Día de la Independencia' },
  { date: '2026-08-17', name: 'Paso a la Inmortalidad del Gral. San Martín' },
  { date: '2026-10-12', name: 'Día del Respeto a la Diversidad Cultural' },
  { date: '2026-11-20', name: 'Día de la Soberanía Nacional' },
  { date: '2026-12-08', name: 'Inmaculada Concepción de María' },
  { date: '2026-12-25', name: 'Navidad' },
  { date: '2027-01-01', name: 'Año Nuevo' },
  { date: '2027-02-08', name: 'Carnaval' },
  { date: '2027-02-09', name: 'Carnaval' },
  { date: '2027-03-24', name: 'Día de la Memoria por la Verdad y la Justicia' },
  { date: '2027-03-26', name: 'Viernes Santo' },
  { date: '2027-04-02', name: 'Día del Veterano y de los Caídos en Malvinas' },
  { date: '2027-05-01', name: 'Día del Trabajador' },
  { date: '2027-05-25', name: 'Día de la Revolución de Mayo' },
  { date: '2027-06-17', name: 'Paso a la Inmortalidad del Gral. Güemes' },
  { date: '2027-06-20', name: 'Paso a la Inmortalidad del Gral. Belgrano' },
  { date: '2027-07-09', name: 'Día de la Independencia' },
  { date: '2027-08-16', name: 'Paso a la Inmortalidad del Gral. San Martín' },
  { date: '2027-10-12', name: 'Día del Respeto a la Diversidad Cultural' },
  { date: '2027-11-22', name: 'Día de la Soberanía Nacional' },
  { date: '2027-12-08', name: 'Inmaculada Concepción de María' },
  { date: '2027-12-25', name: 'Navidad' }
];

function diffDaysBetweenKeys(fromKey, toKey) {
  const [fy, fm, fd] = fromKey.split('-').map(Number);
  const [ty, tm, td] = toKey.split('-').map(Number);
  const utcFrom = Date.UTC(fy, fm - 1, fd);
  const utcTo = Date.UTC(ty, tm - 1, td);
  return Math.round((utcTo - utcFrom) / (1000 * 60 * 60 * 24));
}

function getNextArgentinaHoliday(todayKey) {
  const next = ARGENTINA_HOLIDAYS.find((h) => h.date >= todayKey);
  if (!next) return null;
  const daysUntil = diffDaysBetweenKeys(todayKey, next.date);
  return {
    date: next.date,
    date_label: formatDayHeader(next.date),
    name: next.name,
    days_until: daysUntil
  };
}

function toDateKeyInTz(date, tz = config.tz) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const d = parts.find((p) => p.type === 'day')?.value;
  return `${y}-${m}-${d}`;
}

function toTimeHHMMInTz(date, tz = config.tz) {
  const parts = new Intl.DateTimeFormat('es-AR', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(date);
  const h = parts.find((p) => p.type === 'hour')?.value || '00';
  const m = parts.find((p) => p.type === 'minute')?.value || '00';
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
}

function formatDayHeader(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const dayName = DAY_NAMES_FULL[dt.getDay()];
  const monthName = MONTH_NAMES_SHORT[m - 1];
  return `${dayName} ${d} ${monthName}`;
}

function isAllDayEvent(ev, startDate, endDate) {
  if (ev.datetype === 'date' || ev.start?.dateOnly) return true;
  if (!startDate || !endDate) return false;
  const diffHours = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60);
  const startHHMM = toTimeHHMMInTz(startDate);
  return diffHours >= 23.9 && startHHMM === '00:00';
}

function normalizeDateOnlyKey(dateObj) {
  // Para eventos de día completo (VALUE=DATE), tomamos el año/mes/día UTC del objeto Date de node-ical
  const y = dateObj.getUTCFullYear();
  const m = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function expandCalendarEvents(parsed, person, rangeStart, rangeEnd, now) {
  const results = [];

  for (const key of Object.keys(parsed)) {
    const ev = parsed[key];
    if (!ev || ev.type !== 'VEVENT') continue;
    if (String(ev.status || '').toUpperCase() === 'CANCELLED') continue;
    if (!ev.start) continue;

    const baseSummary = (ev.summary || 'Sin título').trim();
    const baseLocation = (ev.location || '').trim();
    const durationMs =
      ev.end && ev.start
        ? Math.max(0, new Date(ev.end).getTime() - new Date(ev.start).getTime())
        : 60 * 60 * 1000;

    if (ev.rrule && typeof ev.rrule.between === 'function') {
      let dates = [];
      try {
        dates = ev.rrule.between(rangeStart, rangeEnd, true);
      } catch {
        dates = [];
      }

      for (const occ of dates) {
        const occIsoDate = occ.toISOString().slice(0, 10);
        // Verificar exdate
        if (ev.exdate) {
          const isExcluded = Object.keys(ev.exdate).some((exKey) =>
            exKey.startsWith(occIsoDate)
          );
          if (isExcluded) continue;
        }

        // Verificar si esta instancia tiene override en recurrences
        let actualEv = ev;
        let occStart = new Date(occ);
        if (ev.recurrences) {
          const overrideKey = Object.keys(ev.recurrences).find((rk) =>
            rk.startsWith(occIsoDate)
          );
          if (overrideKey && ev.recurrences[overrideKey]) {
            actualEv = ev.recurrences[overrideKey];
            if (String(actualEv.status || '').toUpperCase() === 'CANCELLED') continue;
            if (actualEv.start) occStart = new Date(actualEv.start);
          }
        }

        const occEnd = new Date(occStart.getTime() + durationMs);
        if (occEnd < now) continue;

        const allDay = isAllDayEvent(actualEv, occStart, occEnd);
        const dateKey = allDay ? normalizeDateOnlyKey(occStart) : toDateKeyInTz(occStart);

        results.push({
          uid: `${ev.uid || key}-${dateKey}`,
          title: (actualEv.summary || baseSummary).trim(),
          location: (actualEv.location || baseLocation).trim(),
          date_key: dateKey,
          start_iso: occStart.toISOString(),
          end_iso: occEnd.toISOString(),
          start_time: allDay ? null : toTimeHHMMInTz(occStart),
          end_time: allDay ? null : toTimeHHMMInTz(occEnd),
          all_day: allDay,
          owners: [
            {
              id: person.id,
              name: person.name,
              initial: person.initial,
              color: person.color
            }
          ]
        });
      }
    } else {
      const startDate = new Date(ev.start);
      const endDate = ev.end ? new Date(ev.end) : new Date(startDate.getTime() + durationMs);

      if (endDate < rangeStart || startDate > rangeEnd) continue;

      const allDay = isAllDayEvent(ev, startDate, endDate);
      const dateKey = allDay ? normalizeDateOnlyKey(startDate) : toDateKeyInTz(startDate);

      // Si es un evento con hora que ya terminó hoy, no lo mostramos
      if (!allDay && endDate < now) continue;

      results.push({
        uid: `${ev.uid || key}-${dateKey}`,
        title: baseSummary,
        location: baseLocation,
        date_key: dateKey,
        start_iso: startDate.toISOString(),
        end_iso: endDate.toISOString(),
        start_time: allDay ? null : toTimeHHMMInTz(startDate),
        end_time: allDay ? null : toTimeHHMMInTz(endDate),
        all_day: allDay,
        owners: [
          {
            id: person.id,
            name: person.name,
            initial: person.initial,
            color: person.color
          }
        ]
      });
    }
  }

  return results;
}

function deduplicateAndMergeEvents(events) {
  const map = new Map();

  for (const ev of events) {
    const normTitle = ev.title.toLowerCase().replace(/\s+/g, ' ').trim();
    const timeSig = ev.all_day ? 'ALLDAY' : ev.start_time;
    const mergeKey = `${ev.date_key}|${timeSig}|${normTitle}`;

    if (!map.has(mergeKey)) {
      map.set(mergeKey, { ...ev, owners: [...ev.owners] });
    } else {
      const existing = map.get(mergeKey);
      for (const owner of ev.owners) {
        if (!existing.owners.some((o) => o.id === owner.id)) {
          existing.owners.push(owner);
        }
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.date_key !== b.date_key) return a.date_key.localeCompare(b.date_key);
    if (a.all_day !== b.all_day) return a.all_day ? -1 : 1;
    return (a.start_time || '').localeCompare(b.start_time || '');
  });
}

function buildDemoEvents(todayKey, tomorrowKey, nextDaysKeys) {
  const [p1, p2] = config.people;
  return [
    {
      uid: 'demo-1',
      title: 'Control Dr. Zampetti (pesaje)',
      location: 'Consultorio',
      date_key: todayKey,
      start_time: '09:30',
      end_time: '10:15',
      all_day: false,
      owners: [{ id: p1.id, name: p1.name, initial: p1.initial, color: p1.color }]
    },
    {
      uid: 'demo-2',
      title: 'Turno odontólogo',
      location: 'Nueva Córdoba',
      date_key: todayKey,
      start_time: '16:00',
      end_time: '17:00',
      all_day: false,
      owners: [{ id: p2.id, name: p2.name, initial: p2.initial, color: p2.color }]
    },
    {
      uid: 'demo-3',
      title: 'Compras verdulería y carnicería',
      location: '',
      date_key: todayKey,
      start_time: '19:30',
      end_time: '20:30',
      all_day: false,
      owners: [
        { id: p1.id, name: p1.name, initial: p1.initial, color: p1.color },
        { id: p2.id, name: p2.name, initial: p2.initial, color: p2.color }
      ]
    },
    {
      uid: 'demo-4',
      title: 'Reunión equipo IT',
      location: '',
      date_key: tomorrowKey,
      start_time: '10:00',
      end_time: '11:00',
      all_day: false,
      owners: [{ id: p1.id, name: p1.name, initial: p1.initial, color: p1.color }]
    },
    {
      uid: 'demo-5',
      title: 'Clase de entrenamiento',
      location: '',
      date_key: tomorrowKey,
      start_time: '18:30',
      end_time: '19:30',
      all_day: false,
      owners: [{ id: p2.id, name: p2.name, initial: p2.initial, color: p2.color }]
    },
    {
      uid: 'demo-6',
      title: 'Cena con amigos',
      location: 'Güemes',
      date_key: nextDaysKeys[1] || tomorrowKey,
      start_time: '21:30',
      end_time: '23:30',
      all_day: false,
      owners: [
        { id: p1.id, name: p1.name, initial: p1.initial, color: p1.color },
        { id: p2.id, name: p2.name, initial: p2.initial, color: p2.color }
      ]
    },
    {
      uid: 'demo-7',
      title: 'Cumpleaños familiar',
      location: '',
      date_key: nextDaysKeys[3] || tomorrowKey,
      start_time: null,
      end_time: null,
      all_day: true,
      owners: [
        { id: p1.id, name: p1.name, initial: p1.initial, color: p1.color },
        { id: p2.id, name: p2.name, initial: p2.initial, color: p2.color }
      ]
    }
  ];
}

async function fetchSingleIcs(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'HomePageCasa/1.0 (+local-dashboard)'
    },
    signal: AbortSignal.timeout(12000)
  });
  if (!res.ok) {
    throw new Error(`ICS HTTP ${res.status}`);
  }
  const text = await res.text();
  return ical.sync.parseICS(text);
}

async function fetchAllCalendars() {
  const now = new Date();
  const todayKey = toDateKeyInTz(now);

  const [ty, tm, td] = todayKey.split('-').map(Number);
  const rangeStart = new Date(ty, tm - 1, td, 0, 0, 0);
  const rangeEnd = new Date(rangeStart.getTime() + WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const tomorrowDate = new Date(rangeStart.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowKey = toDateKeyInTz(tomorrowDate);

  const nextDaysKeys = [];
  for (let i = 2; i <= 7; i++) {
    const dt = new Date(rangeStart.getTime() + i * 24 * 60 * 60 * 1000);
    nextDaysKeys.push(toDateKeyInTz(dt));
  }

  const totalConfiguredUrls = config.people.reduce(
    (acc, p) => acc + p.icsUrls.length,
    0
  );

  let allEvents = [];
  const warnings = [];
  let demoMode = false;

  if (totalConfiguredUrls === 0) {
    demoMode = true;
    allEvents = buildDemoEvents(todayKey, tomorrowKey, nextDaysKeys);
  } else {
    for (const person of config.people) {
      for (const url of person.icsUrls) {
        try {
          const parsed = await fetchSingleIcs(url);
          const expanded = expandCalendarEvents(parsed, person, rangeStart, rangeEnd, now);
          allEvents.push(...expanded);
        } catch (err) {
          warnings.push(`${person.name}: ${err.message}`);
        }
      }
    }
  }

  const merged = deduplicateAndMergeEvents(allEvents).filter(
    (ev) => ev.date_key >= todayKey
  );

  const todayEvents = merged.filter((ev) => ev.date_key === todayKey);
  const tomorrowEvents = merged.filter((ev) => ev.date_key === tomorrowKey);
  const upcomingEvents = merged
    .filter((ev) => ev.date_key > tomorrowKey)
    .map((ev) => ({
      ...ev,
      day_label: formatDayHeader(ev.date_key),
      days_until: diffDaysBetweenKeys(todayKey, ev.date_key)
    }));

  const nextHoliday = getNextArgentinaHoliday(todayKey);

  return {
    people: config.people.map((p) => ({
      id: p.id,
      name: p.name,
      initial: p.initial,
      color: p.color,
      configured_feeds: p.icsUrls.length
    })),
    demo_mode: demoMode,
    warnings,
    today_date: todayKey,
    today_label: formatDayHeader(todayKey),
    tomorrow_date: tomorrowKey,
    tomorrow_label: formatDayHeader(tomorrowKey),
    next_holiday: nextHoliday,
    today: todayEvents,
    tomorrow: tomorrowEvents,
    upcoming: upcomingEvents
  };
}

async function getCalendar() {
  return getOrFetch('calendar', CALENDAR_TTL_MS, fetchAllCalendars);
}

module.exports = { getCalendar };
