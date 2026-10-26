const path = require('node:path');
const express = require('express');
const config = require('./config');
const { getWeather } = require('./providers/weather');
const { getCalendar } = require('./providers/calendar');
const { getMeals } = require('./providers/meals');

const app = express();

app.disable('x-powered-by');
app.use(express.json());
app.use(
  express.static(path.join(__dirname, '..', 'public'), {
    etag: true,
    maxAge: 0
  })
);

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'homepage-casa',
    timestamp: new Date().toISOString(),
    tz: config.tz
  });
});

app.get('/api/config', (_req, res) => {
  res.json({
    tz: config.tz,
    city: config.weather.city,
    people: config.people.map((p) => ({
      id: p.id,
      name: p.name,
      initial: p.initial,
      color: p.color,
      has_calendar: p.icsUrls.length > 0
    })),
    meal_cutoffs: config.mealCutoffs,
    night_mode: config.nightMode
  });
});

app.get('/api/weather', async (_req, res) => {
  try {
    const data = await getWeather();
    res.json(data);
  } catch (err) {
    res.status(502).json({
      error: 'No se pudo obtener el clima de Córdoba Capital.',
      detail: err.message
    });
  }
});

app.get('/api/calendar', async (_req, res) => {
  try {
    const data = await getCalendar();
    res.json(data);
  } catch (err) {
    res.status(502).json({
      error: 'No se pudieron cargar los calendarios.',
      detail: err.message
    });
  }
});

app.get('/api/meals', async (_req, res) => {
  try {
    const data = await getMeals();
    res.json(data);
  } catch (err) {
    res.status(502).json({
      error: 'No se pudo conectar con Seguimiento Dietario (NutriPlan).',
      detail: err.message
    });
  }
});

app.listen(config.port, '0.0.0.0', () => {
  console.log(
    `[HomePageCasa] Dashboard corriendo en http://0.0.0.0:${config.port} (TZ: ${config.tz})`
  );
});
