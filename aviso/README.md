# Aviso diario por Telegram

Todos los días a la mañana (entre las 8:47 y las 9:47, hora de Argentina) te llega por Telegram la lista de cobros de hoy y
los vencidos de **tus** clientes: los préstamos activos sin socio, igual que el filtro "Míos".

- Lo corre GitHub Actions (`.github/workflows/aviso-telegram.yml`), gratis.
- Lee los datos de Firebase y toma las cuentas (saldo, mora, cobrador) de la app publicada,
  así da lo mismo que la pantalla.
- El repositorio es público: el script nunca escribe nombres ni montos en los registros.

## Claves que necesita (GitHub → Settings → Secrets and variables → Actions)

| Nombre | De dónde sale |
|---|---|
| `TELEGRAM_TOKEN` | @BotFather, al crear el bot |
| `TELEGRAM_CHAT_ID` | @userinfobot te dice tu número |
| `FIREBASE_API_KEY` | la configuración de Firebase de la app (`apiKey`) |
| `FIREBASE_PROJECT_ID` | la misma configuración (`projectId`) |
| `NEGOCIO_CODIGO` | el código de negocio de la app |

## Probarlo a mano

GitHub → Actions → "Aviso diario por Telegram" → Run workflow.

## Ojo

- GitHub solo corre tareas programadas desde la rama `main`.
- GitHub demora o descarta tareas programadas en hora pico, así que hay tres intentos
  (8:47, 9:17 y 9:47). El primero que corre manda el aviso; los otros no mandan nada.
- En repositorios públicos, si pasan 60 días sin cambios GitHub pausa la tarea y manda un
  mail; se reactiva con un clic.
- Si algo falla, te llega igual un mensaje avisando que no se pudo armar.
