const config = require('../config');
const { getOrFetch } = require('../cache');

const MEALS_TTL_MS = 10 * 60 * 1000; // 10 minutos

const DAY_KEYS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const DAY_LABELS = {
  lunes: 'Lunes',
  martes: 'Martes',
  miercoles: 'Miércoles',
  jueves: 'Jueves',
  viernes: 'Viernes',
  sabado: 'Sábado',
  domingo: 'Domingo'
};

function getNowInTz() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: config.tz }));
}

function getActiveMealSlot(now = getNowInTz()) {
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const hhmm = `${hh}:${mm}`;

  const { lunchFrom, snackFrom, dinnerFrom } = config.mealCutoffs;
  if (hhmm >= dinnerFrom) return 'dinner';
  if (hhmm >= snackFrom) return 'snack';
  if (hhmm >= lunchFrom) return 'lunch';
  return 'breakfast';
}

function splitBreakfastAndSnack(rawText) {
  const fallback =
    'Infusión (Té, Mate o Café) + 10 tostadas con gluten por día + Casancrem Light.';
  const text = String(rawText || '').trim() || fallback;

  const splitMatch = text.match(/desayuno\s*:\s*([^/|\n]+)[/|\n]+\s*merienda\s*:\s*(.+)/i);
  if (splitMatch) {
    return {
      breakfastText: splitMatch[1].trim(),
      snackText: splitMatch[2].trim()
    };
  }
  return {
    breakfastText: text,
    snackText: text
  };
}

function formatMealTitle(slotData) {
  return {
    title: slotData?.title || slotData?.raw || 'Según planilla',
    raw: slotData?.raw || ''
  };
}

function transformBootstrapToToday(bootstrapData, now) {
  const plans = Array.isArray(bootstrapData.plans) ? bootstrapData.plans : [];
  const activePlan = plans.find((p) => p.is_active) || plans[0];
  if (!activePlan) {
    throw new Error('NutriPlan no tiene planes activos cargados.');
  }

  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}-${mm}-${dd}`;
  const dayKey = DAY_KEYS[now.getDay()];
  const tomorrowKey = DAY_KEYS[(now.getDay() + 1) % 7];

  const dayData = (activePlan.days && activePlan.days[dayKey]) || {};
  const tomorrowData = (activePlan.days && activePlan.days[tomorrowKey]) || {};
  const { breakfastText, snackText } = splitBreakfastAndSnack(activePlan.breakfast_snack_text);

  return {
    date: dateStr,
    day_key: dayKey,
    day_label: DAY_LABELS[dayKey] || dayKey,
    plan_id: activePlan.id,
    plan_title: activePlan.title,
    week_date: activePlan.week_date,
    source_endpoint: '/api/bootstrap',
    breakfast: {
      title: 'Desayuno',
      text: breakfastText
    },
    lunch: formatMealTitle({
      title: dayData.lunch_title || dayData.lunch_raw || 'Según planilla',
      raw: dayData.lunch_raw || ''
    }),
    snack: {
      title: 'Merienda',
      text: snackText
    },
    dinner: formatMealTitle({
      title: dayData.dinner_title || dayData.dinner_raw || 'Según planilla',
      raw: dayData.dinner_raw || ''
    }),
    tomorrow: {
      day_key: tomorrowKey,
      day_label: DAY_LABELS[tomorrowKey] || tomorrowKey,
      lunch: formatMealTitle({
        title: tomorrowData.lunch_title || tomorrowData.lunch_raw || 'Según planilla',
        raw: tomorrowData.lunch_raw || ''
      }),
      dinner: formatMealTitle({
        title: tomorrowData.dinner_title || tomorrowData.dinner_raw || 'Según planilla',
        raw: tomorrowData.dinner_raw || ''
      })
    }
  };
}

async function fetchMealsFromNutriPlan() {
  const baseUrl = config.nutriplanUrl;
  const now = getNowInTz();

  // 1) Intentar primero el nuevo endpoint liviano /api/today
  try {
    const resToday = await fetch(`${baseUrl}/api/today`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000)
    });

    if (resToday.ok) {
      const data = await resToday.json();
      return {
        ...data,
        source_endpoint: '/api/today',
        lunch: formatMealTitle(data.lunch),
        dinner: formatMealTitle(data.dinner),
        tomorrow: data.tomorrow
          ? {
              day_key: data.tomorrow.day_key,
              day_label: data.tomorrow.day_label,
              lunch: formatMealTitle(data.tomorrow.lunch),
              dinner: formatMealTitle(data.tomorrow.dinner)
            }
          : null
      };
    }

    if (resToday.status !== 404) {
      throw new Error(`NutriPlan /api/today HTTP ${resToday.status}`);
    }
  } catch (err) {
    if (err.message && err.message.startsWith('NutriPlan /api/today HTTP')) {
      throw err;
    }
  }

  // 2) Fallback transparente a /api/bootstrap
  const resBoot = await fetch(`${baseUrl}/api/bootstrap`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10000)
  });

  if (!resBoot.ok) {
    throw new Error(`NutriPlan HTTP ${resBoot.status}`);
  }

  const bootData = await resBoot.json();
  return transformBootstrapToToday(bootData, now);
}

async function getMeals() {
  const data = await getOrFetch('meals', MEALS_TTL_MS, fetchMealsFromNutriPlan);
  return {
    ...data,
    active_slot: getActiveMealSlot(),
    cutoffs: config.mealCutoffs
  };
}

module.exports = { getMeals };
