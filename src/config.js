require('dotenv').config();

function parseUrlList(raw) {
  if (!raw || typeof raw !== 'string') return [];
  return raw
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean)
    .map((u) => u.replace(/^webcal:\/\//i, 'https://'));
}

const config = {
  port: Number(process.env.PORT || 3090),
  tz: process.env.TZ || 'America/Argentina/Cordoba',

  weather: {
    lat: Number(process.env.WEATHER_LAT || -31.4187),
    lon: Number(process.env.WEATHER_LON || -64.1954),
    city: process.env.WEATHER_CITY || 'Córdoba Capital'
  },

  people: [
    {
      id: 'person1',
      name: process.env.PERSON_1_NAME || 'Emi',
      initial: (process.env.PERSON_1_NAME || 'Emi').trim().charAt(0).toUpperCase(),
      color: process.env.PERSON_1_COLOR || '#4f8cff',
      icsUrls: parseUrlList(process.env.PERSON_1_ICS_URLS || process.env.CAL_1_ICS_URL || '')
    },
    {
      id: 'person2',
      name: process.env.PERSON_2_NAME || 'Natali',
      initial: (process.env.PERSON_2_NAME || 'Natali').trim().charAt(0).toUpperCase(),
      color: process.env.PERSON_2_COLOR || '#ff6fa8',
      icsUrls: parseUrlList(process.env.PERSON_2_ICS_URLS || process.env.CAL_2_ICS_URL || '')
    }
  ],

  nutriplanUrl: (process.env.NUTRIPLAN_URL || 'http://192.168.100.89:3080').replace(/\/+$/, ''),

  mealCutoffs: {
    lunchFrom: process.env.MEAL_LUNCH_FROM || '11:00',
    snackFrom: process.env.MEAL_SNACK_FROM || '16:00',
    dinnerFrom: process.env.MEAL_DINNER_FROM || '19:30'
  },

  nightMode: {
    start: process.env.NIGHT_START || '23:00',
    end: process.env.NIGHT_END || '06:00'
  }
};

module.exports = config;
