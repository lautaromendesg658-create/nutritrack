// El balance del mes no puede contar dos veces el saldo que se refinancia al renovar.
// Lo encontró una revisión adversarial: "cobraste" sumaba el refinanciado como plata que
// entró y al mismo tiempo "prestaste" se lo restaba al desembolso, así que el neto del mes
// salía inflado exactamente en ese monto.
const { chromium } = require('playwright-core');
const http = require('http'); const fs=require('fs'); const path=require('path');
const ROOT=path.join(__dirname,'..');
const server=http.createServer((req,res)=>{let f=path.join(ROOT,req.url==='/'?'index.html':req.url.split('?')[0]);
  if(!fs.existsSync(f)){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':{'.html':'text/html','.json':'application/json','.png':'image/png','.js':'text/javascript'}[path.extname(f)]||'text/plain'});res.end(fs.readFileSync(f));});
// Préstamo viejo de 100.000 a devolver 200.000, con 100.000 ya cobrados este mes y
// 100.000 de saldo. Se renueva por 300.000 saldándolo.
const datos=`(()=>{
  S.settings.mora={tipo:'fijo',valor:0,porDia:false};
  S.settings.cobrador={monto:0,dias:3,bordes:false};
  S.settings.descuento={activo:false,pct:10,hora:14};
  S.clients=[{id:'C1',nombre:'Clienta Que Renueva'}];
  const hoy=new Date(), y=hoy.getFullYear(), m=hoy.getMonth();
  const dia=n=>ymd(new Date(y,m,n));
  const ts=n=>new Date(y,m,n,12,0,0).getTime();
  S.loans=[{id:'VIEJO',clientId:'C1',tipo:'personal',monto:100000,interes:100,total:200000,
    frecuencia:'semanal',inicio:dia(1),createdAt:ts(1),status:'activo',cuotas:[
      {n:1,vence:dia(2),monto:100000,pagos:[{t:ts(2),monto:100000,mora:0,cobrador:0}]},
      {n:2,vence:dia(28),monto:100000,pagos:[]}]}];
  S.loans.forEach(l=>saveLoan(l));
})()`;
(async()=>{
  await new Promise(r=>server.listen(9057,r));
  const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const errores=[];
  const ctx=await browser.newContext({viewport:{width:430,height:950}});
  const page=await ctx.newPage();
  page.on('pageerror',e=>errores.push('PAGEERROR: '+e.message));
  page.on('dialog',async d=>{await d.accept();});
  await page.goto('http://localhost:9057/');
  await page.fill('#lk-user','lautaro');await page.fill('#lk-pass','clave1234');await page.fill('#lk-pass2','clave1234');
  await page.click('#lk-create');await page.waitForTimeout(600);
  await page.evaluate(datos);await page.waitForTimeout(700);

  // ===== 1) antes de renovar, el balance es simple
  const hoy=new Date();
  let b=await page.evaluate(([y,m])=>balanceMes(y,m),[hoy.getFullYear(),hoy.getMonth()]);
  console.log('1) Antes de renovar:',JSON.stringify({prestado:b.prestado,cobrado:b.cobrado,neto:b.neto}));
  if(b.prestado!==100000||b.cobrado!==100000||b.neto!==0)
    throw new Error('Prestaste 100.000 y cobraste 100.000: neto 0');
  console.log('   OK Salieron 100.000 y entraron 100.000');

  // ===== 2) renovamos por 300.000 saldando el viejo (100.000 de saldo refinanciado)
  await page.evaluate(()=>formRenovar('VIEJO'));await page.waitForTimeout(700);
  await page.fill('#rv-monto','300000');await page.fill('#rv-int','100');await page.fill('#rv-n','10');
  await page.waitForTimeout(400);
  await page.click('#rv-save');await page.waitForTimeout(1000);
  const nuevo=await page.evaluate(()=>{const n=S.loans.find(l=>l.renovadoDe==='VIEJO');
    return {monto:n.monto,refin:n.refinanciado};});
  console.log('2) Préstamo nuevo:',JSON.stringify(nuevo));
  if(nuevo.refin!==100000)throw new Error('Deberia refinanciar el saldo de 100.000');

  // ===== 3) la caja del mes tiene que cerrar
  b=await page.evaluate(([y,m])=>balanceMes(y,m),[hoy.getFullYear(),hoy.getMonth()]);
  console.log('3) Tras renovar:',JSON.stringify({prestado:b.prestado,refin:b.refin,cobrado:b.cobrado,neto:b.neto}));
  // De la mano salieron: 100.000 del viejo + 200.000 en mano del nuevo = 300.000
  // Entró de verdad: 100.000 de la cuota cobrada  →  neto real = −200.000
  if(b.neto!==-200000)throw new Error('El neto del mes deberia ser −200.000, dio '+b.neto);
  if(b.cobrado!==200000)throw new Error('Cobrado = 100.000 reales + 100.000 saldados por la renovación');
  if(b.prestado!==400000)throw new Error('Prestado = 100.000 del viejo + 300.000 del nuevo, sin descontar nada');
  if(b.refin!==100000)throw new Error('Y aparte se informa cuánto de eso fue refinanciado');
  // la cuenta de caja, hecha a mano, tiene que dar lo mismo
  const enMano=(b.prestado-b.refin), cobrosReales=(b.cobrado-b.refin);
  if(cobrosReales-enMano!==b.neto)throw new Error('La caja no cierra: '+cobrosReales+' − '+enMano+' ≠ '+b.neto);
  console.log('   OK Entraron',cobrosReales,'de verdad y salieron',enMano,'de la mano: neto',b.neto);

  // ===== 4) en pantalla se explica de dónde sale
  await page.evaluate(()=>go('calendario'));await page.waitForTimeout(800);
  const txt=(await page.textContent('#view')).replace(/\s+/g,' ');
  console.log('4) En el calendario:',(txt.match(/De lo prestado.{0,90}/)||[''])[0]);
  if(!/De lo prestado, \$ 100\.000 fue saldo refinanciado/.test(txt))
    throw new Error('Deberia aclarar cuánto fue refinanciado');
  if(!/de la mano salieron \$ 300\.000/.test(txt))throw new Error('Y cuánto salió de verdad');
  console.log('   OK El balance aclara qué parte no salió de la mano');

  if(errores.length){console.error('ERRORES JS:');errores.forEach(e=>console.error('  '+e));
    throw new Error(errores.length+' error(es) de JS');}
  console.log('\nTODO OK: EL BALANCE DEL MES NO CUENTA DOS VECES EL REFINANCIADO');
  await browser.close();server.close();process.exit(0);
})().catch(e=>{console.error('FALLO:',e.message);process.exit(1);});
