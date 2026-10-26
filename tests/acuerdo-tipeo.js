// Escribir los montos de un acuerdo tecla por tecla, como en el celular.
// Antes, cada tecla redibujaba los casilleros: el que estabas usando desaparecía, se perdía
// el foco y se cerraba el teclado. Este test tipea con pausa entre teclas y verifica que
// el casillero NUNCA pierda el foco y que el número quede entero.
const { chromium } = require('playwright-core');
const http = require('http'); const fs=require('fs'); const path=require('path');
const ROOT=path.join(__dirname,'..');
const server=http.createServer((req,res)=>{let f=path.join(ROOT,req.url==='/'?'index.html':req.url.split('?')[0]);
  if(!fs.existsSync(f)){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':{'.html':'text/html','.json':'application/json','.png':'image/png','.js':'text/javascript'}[path.extname(f)]||'text/plain'});res.end(fs.readFileSync(f));});
const datos=`(()=>{
  S.settings.mora={tipo:'fijo',valor:0,porDia:false};
  S.settings.cobrador={monto:0,dias:3,bordes:false};
  S.clients=[{id:'C1',nombre:'Clienta Que Pasa A Semanal'}];
  const t=todayStr(), d=n=>ymd(new Date(pd(t).getTime()+n*86400000)), ts=f=>pd(f).getTime();
  const cs=[];
  for(let i=1;i<=20;i++){const v=d(i-5);
    cs.push({n:i,vence:v,monto:25000,pagos:i<=4?[{t:ts(v),monto:25000,mora:0,cobrador:0}]:[]});}
  S.loans=[{id:'L1',clientId:'C1',tipo:'personal',monto:250000,interes:100,total:500000,
    frecuencia:'diaria',inicio:d(-4),createdAt:ts(d(-4)),status:'activo',cuotas:cs}];
  S.loans.forEach(l=>saveLoan(l));
})()`;
(async()=>{
  await new Promise(r=>server.listen(9059,r));
  const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const errores=[];
  // celular, con pantalla táctil, como el iPhone del dueño
  const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:2});
  const page=await ctx.newPage();
  page.on('pageerror',e=>errores.push('PAGEERROR: '+e.message));
  page.on('dialog',async d=>{await d.accept();});
  await page.goto('http://localhost:9059/');
  await page.fill('#lk-user','lautaro');await page.fill('#lk-pass','clave1234');await page.fill('#lk-pass2','clave1234');
  await page.click('#lk-create');await page.waitForTimeout(600);
  await page.evaluate(datos);await page.waitForTimeout(700);

  // armamos el acuerdo: 390.000 en 2 semanales, montos a mano
  await page.evaluate(()=>formAcuerdo('L1'));await page.waitForTimeout(700);
  await page.tap('#ac-monto');await page.keyboard.type('390000',{delay:40});
  await page.fill('#ac-n','2');await page.waitForTimeout(300);
  await page.tap('#ac-freq button[data-v="semanal"]');await page.waitForTimeout(300);
  await page.tap('#ac-libres');await page.waitForTimeout(400);

  // marca el casillero para detectar si lo destruyen y crean otro
  const marcar=i=>page.evaluate(i=>{const el=document.querySelector(`[data-acm="${i}"]`);el.__mio=true;},i);
  const estado=i=>page.evaluate(i=>{const el=document.querySelector(`[data-acm="${i}"]`);
    return {mismo:!!(el&&el.__mio),foco:document.activeElement===el,valor:el&&el.value,
      modal:!!document.querySelector('#modal .sheet')};},i);

  // ===== 1) tecla por tecla en la primera cuota
  await marcar(0);
  await page.tap('[data-acm="0"]');
  await page.evaluate(()=>{const e=document.querySelector('[data-acm="0"]');e.select();});
  const pasos=[];
  for(const ch of '210000'){
    await page.keyboard.type(ch);await page.waitForTimeout(60);
    pasos.push(await estado(0));
  }
  console.log('1) Tipeando 210000 en la primera cuota:');
  pasos.forEach((p,i)=>console.log(`   tecla ${i+1}: valor="${p.valor}" foco=${p.foco} mismo casillero=${p.mismo} modal abierto=${p.modal}`));
  if(pasos.some(p=>!p.mismo))throw new Error('El casillero se redibujó mientras escribía');
  if(pasos.some(p=>!p.foco))throw new Error('Perdió el foco mientras escribía');
  if(pasos.some(p=>!p.modal))throw new Error('Se cerró la ventana');
  if(pasos[pasos.length-1].valor!=='210000')throw new Error('Deberia quedar 210000');
  console.log('   OK Nunca perdió el foco y quedó 210000');

  // ===== 2) la segunda cuota, escribiendo con puntos de miles
  await marcar(1);
  await page.tap('[data-acm="1"]');
  await page.evaluate(()=>{const e=document.querySelector('[data-acm="1"]');e.select();});
  await page.keyboard.type('180.000',{delay:60});
  const e2=await estado(1);
  console.log('2) Tipeando 180.000 (con punto):',JSON.stringify(e2));
  if(!e2.mismo||!e2.foco||!e2.modal)throw new Error('Tampoco acá deberia perder el foco');

  // ===== 3) el total y el plan acompañan mientras escribe
  const r=await page.evaluate(()=>({total:$('#ac-monto').value,
    suma:$('#ac-suma').textContent.replace(/\s+/g,' ').trim(),
    plan:$('#ac-plan').textContent.replace(/\s+/g,' ').trim()}));
  console.log('3) Total:',r.total,'|',r.suma);
  console.log('   Plan :',r.plan);
  if(r.total!=='390000')throw new Error('El total deberia ser 390.000: '+r.total);
  if(!/\$ 210\.000/.test(r.plan)||!/\$ 180\.000/.test(r.plan))throw new Error('El plan deberia mostrar los dos montos');
  console.log('   OK El total y el plan se actualizan solos sin molestar al casillero');

  // ===== 4) borrar con la tecla de borrar tampoco lo saca
  await page.keyboard.press('Backspace');await page.waitForTimeout(80);
  await page.keyboard.press('Backspace');await page.waitForTimeout(80);
  const e4=await estado(1);
  console.log('4) Tras borrar dos dígitos:',JSON.stringify(e4));
  if(!e4.foco||!e4.mismo)throw new Error('Borrar no deberia sacarlo del casillero');
  await page.keyboard.type('00',{delay:60});

  // ===== 5) se guarda bien
  await page.tap('#ac-save');await page.waitForTimeout(900);
  const g=await page.evaluate(()=>cuotasAcuerdo(loan('L1')).map(c=>c.monto));
  console.log('5) Guardado:',JSON.stringify(g));
  if(g.join()!=='210000,180000')throw new Error('Deberia guardar 210.000 y 180.000: '+g);
  console.log('   OK Quedó guardado 210.000 + 180.000');

  // ===== 6) cambiar el total arriba sí reparte de nuevo (eso es a propósito)
  await page.evaluate(()=>formAcuerdo('L1'));await page.waitForTimeout(700);
  await page.fill('#ac-monto','400000');await page.waitForTimeout(500);
  const rep=await page.evaluate(()=>$$('[data-acm]').map(i=>i.value));
  console.log('6) Al cambiar el total arriba a 400.000:',JSON.stringify(rep));
  if(rep.join()!=='200000,200000')throw new Error('Cambiar el total deberia volver a repartir parejo');
  await page.evaluate(()=>closeModal());
  console.log('   OK Cambiar el total de arriba vuelve a repartir en partes iguales');

  if(errores.length){console.error('ERRORES JS:');errores.forEach(e=>console.error('  '+e));
    throw new Error(errores.length+' error(es) de JS');}
  console.log('\nTODO OK: SE PUEDEN ESCRIBIR LOS MONTOS SIN QUE SE PIERDA EL CASILLERO');
  await browser.close();server.close();process.exit(0);
})().catch(e=>{console.error('FALLO:',e.message);process.exit(1);});
