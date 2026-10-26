// Deuda acordada con cuotas de distinto valor (el caso de los 210.000 + 180.000).
const { chromium } = require('playwright-core');
const http = require('http'); const fs=require('fs'); const path=require('path');
const ROOT=path.join(__dirname,'..');
const server=http.createServer((req,res)=>{let f=path.join(ROOT,req.url==='/'?'index.html':req.url.split('?')[0]);
  if(!fs.existsSync(f)){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':{'.html':'text/html','.json':'application/json','.png':'image/png','.js':'text/javascript'}[path.extname(f)]||'text/plain'});res.end(fs.readFileSync(f));});
// un préstamo DIARIO con saldo: 20 cuotas de 25.000, pagó 4, le quedan 16 (400.000)
const datos=`(()=>{
  S.settings.mora={tipo:'fijo',valor:0,porDia:false};
  S.settings.cobrador={monto:0,dias:3,bordes:false};
  S.settings.diasNoLaborables=[];
  S.clients=[{id:'C1',nombre:'Clienta Que Pasa A Semanal',telefono:'5493511111111'}];
  const t=todayStr(), d=n=>ymd(new Date(pd(t).getTime()+n*86400000)), ts=f=>pd(f).getTime();
  const cs=[];
  for(let i=1;i<=20;i++){const v=d(i-5);
    cs.push({n:i,vence:v,monto:25000,pagos:i<=4?[{t:ts(v),monto:25000,mora:0,cobrador:0}]:[]});}
  S.loans=[{id:'L1',clientId:'C1',tipo:'personal',monto:250000,interes:100,total:500000,
    frecuencia:'diaria',inicio:d(-4),createdAt:ts(d(-4)),status:'activo',cuotas:cs}];
  S.loans.forEach(l=>saveLoan(l));
})()`;
(async()=>{
  await new Promise(r=>server.listen(9055,r));
  const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const errores=[];
  const ctx=await browser.newContext({viewport:{width:430,height:950}});
  const page=await ctx.newPage();
  page.on('pageerror',e=>errores.push('PAGEERROR: '+e.message));
  const msgs=[]; page.on('dialog',async d=>{msgs.push(d.message());await d.accept();});
  await page.goto('http://localhost:9055/');
  await page.fill('#lk-user','lautaro');await page.fill('#lk-pass','clave1234');await page.fill('#lk-pass2','clave1234');
  await page.click('#lk-create');await page.waitForTimeout(600);
  await page.evaluate(datos);await page.waitForTimeout(700);

  // ===== 1) por defecto, las cuotas siguen siendo iguales
  await page.evaluate(()=>formAcuerdo('L1'));await page.waitForTimeout(700);
  await page.fill('#ac-monto','390000');await page.waitForTimeout(300);
  await page.fill('#ac-n','2');await page.waitForTimeout(400);
  await page.click('#ac-freq button[data-v="semanal"]');await page.waitForTimeout(400);
  let v=await page.evaluate(()=>({casilla:$('#ac-libresbox').style.display!=='none',
    tildada:$('#ac-libres').checked, montos:$('#ac-montos').style.display!=='none',
    plan:$('#ac-plan').textContent.replace(/\s+/g,' ').trim()}));
  console.log('1) Con 2 cuotas:',JSON.stringify(v));
  if(!v.casilla)throw new Error('Deberia ofrecer la casilla de montos distintos');
  if(v.tildada||v.montos)throw new Error('Por defecto, cuotas iguales');
  if(!/2 pagos semanales de \$ 195\.000/.test(v.plan))throw new Error('Deberia partir en dos iguales: '+v.plan);
  console.log('   OK Por defecto: 2 de 195.000');

  // ===== 2) tildando la casilla aparecen los montos, prefijados iguales
  await page.check('#ac-libres');await page.waitForTimeout(500);
  v=await page.evaluate(()=>({n:$$('[data-acm]').length,
    valores:$$('[data-acm]').map(i=>i.value),
    fechas:[...$('#ac-montos').querySelectorAll('div[style*="108px"]')].map(d=>d.textContent.trim())}));
  console.log('2) Montos editables:',JSON.stringify(v));
  if(v.n!==2)throw new Error('Deberia haber un casillero por cuota');
  if(v.valores.join()!=='195000,195000')throw new Error('Deberian arrancar iguales: '+v.valores);
  if(!v.fechas[0].startsWith('1.')||!v.fechas[1].startsWith('2.'))throw new Error('Cada uno con su fecha');
  console.log('   OK Un casillero por cuota, con su fecha, arrancando iguales');

  // ===== 3) el caso real: 210.000 y 180.000
  await page.fill('[data-acm="0"]','210000');await page.waitForTimeout(400);
  await page.fill('[data-acm="1"]','180000');await page.waitForTimeout(500);
  v=await page.evaluate(()=>({total:$('#ac-monto').value,
    suma:$('#ac-suma').textContent.replace(/\s+/g,' ').trim(),
    plan:$('#ac-plan').textContent.replace(/\s+/g,' ').trim(),
    dif:$('#ac-dif').textContent.replace(/\s+/g,' ').trim()}));
  console.log('3) 210.000 + 180.000:');
  console.log('    total:',v.total,'| suma:',v.suma);
  console.log('    plan :',v.plan);
  if(v.total!=='390000')throw new Error('El total deberia seguir a la suma: '+v.total);
  if(!/Suma de las 2 cuotas: \$ 390\.000/.test(v.suma))throw new Error('Deberia mostrar la suma');
  if(!/\$ 210\.000/.test(v.plan)||!/\$ 180\.000/.test(v.plan))throw new Error('El plan deberia mostrar los dos montos');
  if(!/Le perdonás \$ 10\.000/.test(v.dif))throw new Error('Deberia decir cuánto le perdona (400.000 − 390.000)');
  console.log('   OK El total sigue a la suma y avisa que le perdona 10.000');
  await page.screenshot({path:'/tmp/shots/v94-acuerdo.png',fullPage:true});

  // ===== 4) se guarda: dos cuotas de distinto valor, sin mora
  await page.click('#ac-save');await page.waitForTimeout(900);
  const g=await page.evaluate(()=>{const l=loan('L1');
    const plan=cuotasAcuerdo(l);
    return {n:plan.length,montos:plan.map(c=>c.monto),fechas:plan.map(c=>c.vence),
      deuda:loanRestante(l),mora:l.cuotas.reduce((a,c)=>a+moraDe(c)+cobradorDe(c),0),
      acuerdo:l.acuerdo,total:l.total};});
  console.log('4) Guardado:',JSON.stringify({n:g.n,montos:g.montos,deuda:g.deuda,mora:g.mora}));
  if(g.n!==2)throw new Error('Deberian quedar 2 cuotas del acuerdo');
  if(g.montos.join()!=='210000,180000')throw new Error('Con sus montos: '+g.montos);
  if(g.deuda!==390000)throw new Error('Deberia deber 390.000: '+g.deuda);
  if(g.mora!==0)throw new Error('Un acuerdo no lleva mora');
  if(g.acuerdo.montos.join()!=='210000,180000')throw new Error('Deberia recordar los montos');
  if(g.fechas[0]===g.fechas[1])throw new Error('Cada una con su fecha');
  const dias=Math.round((new Date(g.fechas[1])-new Date(g.fechas[0]))/86400000);
  if(dias!==7)throw new Error('Deberian ser semanales: '+dias+' días');
  if(g.total!==100000+390000)throw new Error('El total pasa a ser lo cobrado + lo acordado: '+g.total);
  console.log('   OK 210.000 y 180.000, a 7 días, sin mora');

  // ===== 5) la ficha lo muestra desglosado
  await page.evaluate(()=>go('prestamos','L1'));await page.waitForTimeout(700);
  const ficha=(await page.textContent('#view')).replace(/\s+/g,' ');
  console.log('5) Ficha:',(ficha.match(/Deuda acordada.{0,130}/)||[''])[0]);
  if(!/2 pagos semanales de \$ 210\.000 \+ \$ 180\.000/.test(ficha))
    throw new Error('Deberia desglosar los dos montos');
  if(!/Acuerdo 1\/2/.test(ficha)||!/Acuerdo 2\/2/.test(ficha))throw new Error('Deberian numerarse');
  console.log('   OK La ficha muestra los dos montos');

  // ===== 6) se cobra como cualquier cuota, por su monto
  await page.evaluate(()=>{const l=loan('L1');formCobro('L1',cuotasAcuerdo(l)[0].n);});
  await page.waitForTimeout(700);
  const cob=await page.evaluate(()=>({recibido:$('#co-recibido').value,
    h3:$('#modal h3').textContent}));
  console.log('6) Al cobrar la primera:',JSON.stringify(cob));
  if(cob.recibido!=='210000')throw new Error('Deberia pedir 210.000: '+cob.recibido);
  await page.click('#co-save');await page.waitForTimeout(1000);
  const tras=await page.evaluate(()=>({deuda:loanRestante(loan('L1')),
    pagadas:cuotasAcuerdo(loan('L1')).filter(c=>cRestante(c)<=0).length}));
  console.log('   tras cobrarla:',JSON.stringify(tras));
  if(tras.deuda!==180000||tras.pagadas!==1)throw new Error('Deberia quedar debiendo 180.000');
  console.log('   OK Se cobra por su monto y queda debiendo la otra');

  // ===== 7) editar el acuerdo respeta los montos guardados y no pierde lo cobrado
  await page.evaluate(()=>formAcuerdo('L1'));await page.waitForTimeout(700);
  const ed=await page.evaluate(()=>({tildada:$('#ac-libres').checked,
    valores:$$('[data-acm]').map(i=>i.value)}));
  console.log('7) Al reabrirlo:',JSON.stringify(ed));
  if(!ed.tildada)throw new Error('Deberia recordar que eran distintos');
  if(ed.valores.join()!=='210000,180000')throw new Error('Con los montos guardados: '+ed.valores);
  // lo cambia a 3 cuotas iguales
  await page.uncheck('#ac-libres');await page.waitForTimeout(300);
  await page.fill('#ac-monto','180000');await page.fill('#ac-n','3');await page.waitForTimeout(500);
  await page.click('#ac-save');await page.waitForTimeout(900);
  const re=await page.evaluate(()=>{const l=loan('L1');
    return {montos:cuotasAcuerdo(l).map(c=>c.monto),cobrado:loanTotalCobrado(l),deuda:loanRestante(l)};});
  console.log('   tras rehacerlo en 3 iguales:',JSON.stringify(re));
  if(re.montos.length!==3||re.montos[0]!==60000)throw new Error('Deberian ser 3 de 60.000: '+re.montos);
  if(re.cobrado!==100000+210000)throw new Error('No se puede perder lo cobrado: '+re.cobrado);
  console.log('   OK Se puede rehacer sin perder la plata cobrada');

  // ===== 8) con una sola cuota no se ofrece la opción
  await page.evaluate(()=>formAcuerdo('L1'));await page.waitForTimeout(700);
  await page.fill('#ac-n','1');await page.waitForTimeout(500);
  if(await page.evaluate(()=>$('#ac-libresbox').style.display!=='none'))
    throw new Error('Con una sola cuota no tiene sentido');
  await page.evaluate(()=>closeModal());await page.waitForTimeout(300);
  console.log('8) OK Con una sola cuota no aparece');

  if(errores.length){console.error('ERRORES JS:');errores.forEach(e=>console.error('  '+e));
    throw new Error(errores.length+' error(es) de JS');}
  console.log('\nTODO OK: ACUERDO CON CUOTAS DE DISTINTO VALOR');
  await browser.close();server.close();process.exit(0);
})().catch(e=>{console.error('FALLO:',e.message);process.exit(1);});
