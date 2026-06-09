# 💰 PrestaControl — Gestión de Préstamos

Aplicación privada para administrar un negocio de préstamos personales y comerciales. Funciona en el celular y en la computadora, con sincronización en tiempo real entre dispositivos.

## Qué hace

- 🔐 **Acceso privado** con usuario y contraseña (se bloquea sola al quedar en segundo plano).
- 👥 **Clientes** (personas o comercios) con teléfono, DNI/CUIT, dirección, notas y **documentación adjunta** (fotos de DNI, recibos, PDFs — se comprimen solas).
- 💵 **Préstamos personales o comerciales** con interés manual (%), frecuencia **diaria, semanal o quincenal**, cantidad de cuotas libre y opción de saltar domingos.
- ⏰ **Mora automática**: pasada la hora límite (por defecto 18:00) del día de vencimiento, la cuota suma mora sola. Configurable: % de la cuota o monto fijo, una vez o por día de atraso.
- 🏍 **Cargo de cobrador automático** cuando el atraso supera los días configurados (por defecto 3). El monto lo manejás vos desde Ajustes y también al momento de cobrar.
- 📅 **Calendario de cobros** con colores por estado (pagado / hoy / pendiente / vencido) y total del día.
- 🕐 **Reloj en tiempo real** en el encabezado.
- 📊 **Dashboard**: clientes, préstamos activos, plata prestada, por cobrar, cobros del día, cobrado hoy, vencidos e interés en juego.
- 🟢 **WhatsApp integrado**: recordatorios de deuda y comprobantes de pago con un toque.
- 🤝 Pagos parciales, condonar mora, cancelar préstamos.
- 💾 Copia de seguridad (exportar / importar) y funcionamiento sin conexión (PWA instalable).

## Cómo instalarla en el celular / PC

1. Publicá este repositorio con **GitHub Pages** (Settings → Pages → rama elegida → carpeta `/`).
2. Abrí la URL en el celular y elegí **"Agregar a la pantalla de inicio"** (Safari/Chrome). En la PC, usá el botón de instalar de Chrome o simplemente abrí la URL.
3. La primera vez te pide crear tu usuario y contraseña.

## Sincronización entre celular y PC

La app trae una guía paso a paso integrada en **Ajustes → Sincronización**. Resumen: creás un proyecto gratuito en [Firebase](https://console.firebase.google.com), activás Firestore, pegás la configuración en la app y elegís un **código de negocio** secreto (el mismo en todos tus dispositivos). Desde ese momento, todo lo que cargues en un dispositivo aparece al instante en el otro.

> El código de negocio funciona como contraseña de tus datos en la nube: usá uno largo y difícil de adivinar.
