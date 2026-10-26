# 🏠 HomePageCasa · Dashboard para Tablet

Panel web liviano diseñado para correr 24/7 en orientación horizontal (`1280×800`) en la tablet **GPLUS FL8006** (postmarketOS + Epiphany), mostrando:

1. **Agenda combinada de Emi y Natali** (soporta links ICS privados de Google Calendar y/o Outlook personal, con uno o varios calendarios por persona).
2. **Clima de Córdoba Capital** en tiempo real (Open-Meteo, sin API key: estado actual, próximas 8 horas y próximos 5 días).
3. **Comidas del día de Seguimiento Dietario (NutriPlan)**: **Desayuno**, **Almuerzo**, **Merienda** y **Cena** con ingredientes y preparación paso a paso en línea, resaltando automáticamente la comida que toca según la hora.

---

## 🚀 Probar en tu PC

```bash
cd "d:\Claude Projects\HomePageCasa"
npm install
npm start
```

Abrí `http://localhost:3090` en el navegador.

---

## 🔗 Cómo obtener los links ICS (Google Calendar y Outlook)

### Google Calendar
1. Entrá a [calendar.google.com](https://calendar.google.com) desde la compu → ícono ⚙️ **Configuración**.
2. En la columna izquierda, hacé clic en el calendario de la persona.
3. Bajá hasta **Integrar el calendario** y copiá la **"Dirección secreta en formato iCal"** (termina en `.ics`).

### Outlook Personal (Outlook.com / Hotmail / Live)
1. Entrá a [outlook.live.com/calendar](https://outlook.live.com/calendar) → ⚙️ **Configuración** → **Calendario** → **Calendarios compartidos**.
2. En **Publicar un calendario**, elegí el calendario y el permiso **"Puede ver todos los detalles"**.
3. Hacé clic en **Publicar** y copiá el vínculo **ICS**.

Cargá los links en `.env` (o en las variables de entorno del stack de Portainer):
```env
PERSON_1_NAME=Emi
PERSON_1_COLOR=#4f8cff
PERSON_1_ICS_URLS=https://calendar.google.com/calendar/ical/.../basic.ics

PERSON_2_NAME=Natali
PERSON_2_COLOR=#ff6fa8
PERSON_2_ICS_URLS=https://outlook.live.com/owa/calendar/.../reachcalendar.ics
```
*(Si una persona usa más de un calendario, separá los links con una coma `,`).*

---

## 🐳 Despliegue en Portainer (`192.168.100.89:3090`)

Usá el `docker-compose.yml` incluido en el proyecto. Expone el puerto `3090`.

---

## 📱 Apuntar la tablet (`postmarketOS` · `192.168.100.36`)

En la tablet, editá `~/.config/autostart/ha-panel.desktop` para que Epiphany abra el nuevo dashboard:

```ini
[Desktop Entry]
Type=Application
Name=HomePageCasa
Exec=epiphany http://192.168.100.89:3090
X-GNOME-Autostart-enabled=true
```
