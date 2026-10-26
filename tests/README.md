# Tests

Pruebas de punta a punta: levantan la app en un servidor local, la manejan con un
navegador de verdad (Playwright + Chromium) y verifican los números, no el HTML.

Viven acá adentro, versionadas, porque antes estaban en /tmp y el contenedor se las
llevó puestas.

## Cómo correrlos

    cd tests && npm install        # solo la primera vez
    node correr.js                 # todos
    node nivel-manual.js           # uno solo

Cada archivo es independiente: arma sus propios datos, abre la app, hace clics y
compara montos. Si algo da distinto, falla con el número que esperaba y el que vio.
