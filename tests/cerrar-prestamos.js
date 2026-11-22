// Cerrar préstamos "como están", de a uno o varios, repartiendo la ganancia del TOTAL con cada socio.
const { chromium } = require('playwright-core');
const http=require('http'), fs=require('fs'), path=require('path');
const ROOT=path.join(__dirname,'..');
const server=http.createServer((req,res)=>{let f=path.join(ROOT,req.url==='/'?'index.html':req.url.split('?')[0]);
  if(!fs.existsSync(f)){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript'}[path.extname(f)]||'text/plain'});res.end(fs.readFileSync(f));});
const datos=`(async()=>{
  S.settings.mora={tipo:'fijo',valor:0,porDia:false}; S.settings.cobrador={monto:0,dias:3,bordes:false};
  S.settings.descuento={activo:false,pct:10,hora:14};
  S.settings.socios=[{id:'s1',nombre:'Debora',pct:50},{id:'s2',nombre:'Monica',pct:40}];
  await setCuentaSocio('s1','debora','debo1234');
  S.clients=[{id:'CA',nombre:'Gano Cincuenta',gestorId:'s1'},{id:'CB',nombre:'Perdio Treinta',gestorId:'s1'},
    {id:'CC',nombre:'Mio Con Ganancia'},{id:'CD',nombre:'De Monica Perdida',gestorId:'s2'}];
  const t=todayStr(), d=n=>ymd(new Date(pd(t).getTime()+n*86400000)), ts=f=>pd(f).getTime();
  const pg=(f,m)=>[{t:ts(f),monto:m,mora:0,cobrador:0}];
  const mk=(id,cid,g,pct,monto,cuotas)=>({id,clientId:cid,tipo:'personal',monto,interes:100,
    total:cuotas.reduce((a,c)=>a+c.monto,0),frecuencia:'semanal',inicio:d(-40),createdAt:ts(d(-40)),
    status:'activo',gestorId:g,gestorPct:pct,cuotas});
  S.loans=[
    // A: prestó 100.000, cobró 150.000 → ganó 50.000 (queda 50.000 sin cobrar)
    mk('A','CA','s1',50,100000,[{n:1,vence:d(-28),monto:50000,pagos:pg(d(-28),50000)},{n:2,vence:d(-21),monto:50000,pagos:pg(d(-21),50000)},
      {n:3,vence:d(-14),monto:50000,pagos:pg(d(-14),50000)},{n:4,vence:d(-7),monto:50000,pagos:[]}]),
    // B: prestó 100.000, cobró 70.000 → perdió 30.000
    mk('B','CB','s1',50,100000,[{n:1,vence:d(-28),monto:100000,pagos:pg(d(-28),70000)},{n:2,vence:d(-7),monto:100000,pagos:[]}]),
    // C: mío, prestó 50.000, cobró 80.000 → ganó 30.000
    mk('C','CC',null,undefined,50000,[{n:1,vence:d(-20),monto:80000,pagos:pg(d(-20),80000)},{n:2,vence:d(-5),monto:20000,pagos:[]}]),
    // D: Mónica, prestó 100.000, cobró 60.000 → perdió 40.000
    mk('D','CD','s2',40,100000,[{n:1,vence:d(-20),monto:60000,pagos:pg(d(-20),60000)},{n:2,vence:d(-10),monto:140000,pagos:[]}])];
  S.loans.forEach(l=>saveLoan(l));
})()`;
(async()=>{
  await new Promise(r=>server.listen(9065,r));
  const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const errores=[];
  const page=await (await browser.newContext({viewport:{width:430,height:950}})).newPage();
  page.on('pageerror',e=>errores.push('PAGEERROR: '+e.message));
  const msgs=[]; page.on('dialog',async d=>{msgs.push(d.message());await d.accept();});
  await page.goto('http://localhost:9065/');
  await page.fill('#lk-user','lautaro');await page.fill('#lk-pass','clave1234');await page.fill('#lk-pass2','clave1234');
  await page.click('#lk-create');await page.waitForTimeout(600);
  await page.evaluate(datos);await page.waitForTimeout(700);

  // ===== 1) el plan: con Débora se reparte sobre el TOTAL
  const plan=await page.evaluate(()=>planCierre(['A','B','C']).map(g=>({g:g.gestorId,res:g.resultado,socio:g.socioTotal,
    filas:g.filas.map(f=>({id:f.l.id,neto:f.neto,parte:f.parteSocio}))})));
  console.log('1) Plan de A + B + C:',JSON.stringify(plan));
  const deb=plan.find(g=>g.g==='s1'), mio=plan.find(g=>g.g==='');
  if(deb.res!==20000)throw new Error('Con Débora el total es 50.000 − 30.000 = 20.000: '+deb.res);
  if(deb.socio!==10000)throw new Error('A Débora le toca la mitad del total, 10.000 (no 25.000): '+deb.socio);
  if(deb.filas.find(f=>f.id==='A').parte!==10000||deb.filas.find(f=>f.id==='B').parte!==0)
    throw new Error('Los 10.000 se imputan al préstamo que ganó');
  if(mio.res!==30000||mio.socio!==0)throw new Error('El tuyo va aparte y es todo tuyo');
  console.log('   OK Débora 10.000 (la mitad de 50.000 − 30.000); el tuyo, aparte');

  // ===== 2) por la pantalla: modo selección, elegir A, B y C, ver la cuenta y cerrar
  await page.click('.tabs button[data-v="prestamos"]');await page.waitForTimeout(600);
  await page.click('#cie-modo');await page.waitForTimeout(400);
  for(const id of ['A','B','C']){await page.click(`[data-selcierre="${id}"]`);await page.waitForTimeout(250);}
  const barra=await page.evaluate(()=>$('#cie-ir').textContent.trim());
  console.log('2) Barra:',barra);
  if(!/Cerrar 3 seleccionados/.test(barra))throw new Error('Deberia contar 3');
  await page.click('#cie-ir');await page.waitForTimeout(600);
  const mod=(await page.textContent('#modal')).replace(/\s+/g,' ');
  console.log('   ventana:',mod.slice(0,260));
  if(!/A Debora le toca \$ 10\.000/.test(mod))throw new Error('La ventana deberia decir cuánto le toca a Débora');
  if(!/−\$ 30\.000/.test(mod))throw new Error('Deberia mostrar la pérdida de B');
  if(!/Dejó de pagar/.test(mod))throw new Error('Deberia preguntar cómo registrar el saldo');
  const def=await page.evaluate(()=>$('#cie-motivo button.on').dataset.v);
  if(def!=='nopago')throw new Error('Por defecto: dejó de pagar');
  await page.screenshot({path:'/tmp/shots/v96-cierre.png',fullPage:true});
  await page.click('#cie-ok');await page.waitForTimeout(900);

  // ===== 3) quedaron cerrados, fuera de cobros, y la plata va al circuito de siempre
  const tras=await page.evaluate(()=>({st:['A','B','C'].map(id=>loan(id).status),
    deuda:['A','B','C'].map(id=>loanDeudaTotal(loan(id))),
    pagarSocios:liquidaciones().pendientes.map(x=>({id:x.l.id,m:x.monto})),
    ganado:ganadoCompletados().bruto, vencidos:cobrosVencidos().map(x=>x.l.id),
    nivelA:cumplimiento('CA').nivel, seleccion:cierreSel.size}));
  console.log('3) Tras cerrar:',JSON.stringify(tras));
  if(tras.st.some(s=>s!=='cerrado'))throw new Error('Deberian quedar cerrados');
  if(tras.deuda.some(x=>x!==0))throw new Error('Un cerrado no debe nada más');
  if(tras.vencidos.some(id=>['A','B','C'].includes(id)))throw new Error('No deberian figurar como vencidos');
  if(tras.pagarSocios.length!==1||tras.pagarSocios[0].id!=='A'||tras.pagarSocios[0].m!==10000)
    throw new Error('En Pagar a socios: 10.000 a Débora por A');
  if(tras.ganado!==50000+30000)throw new Error('Dinero ganado: 50.000 de A + 30.000 de C (B no suma): '+tras.ganado);
  if(tras.nivelA!=='malo')throw new Error('Dejó de pagar → Problemático');
  console.log('   OK Cerrados, sin deuda ni vencidos, 10.000 en Pagar a socios, y marcados como Problemáticos');

  // ===== 4) lo que ve Débora
  const repA=await page.evaluate(()=>{const r=loanReparto(loan('A'));return {s:r.socioParteReal,m:r.miParteReal,g:r.gananciaTotal};});
  console.log('4) Reparto de A:',JSON.stringify(repA));
  if(repA.s!==10000||repA.m!==40000)throw new Error('En A: Débora 10.000, vos 40.000');

  // ===== 5) Mónica, a pérdida y perdonado: no cobra, no pone, y el cliente no queda manchado
  await page.evaluate(()=>aplicarCierre(['D'],'perdon'));await page.waitForTimeout(400);
  const d=await page.evaluate(()=>({st:loan('D').status,pend:liquidaciones().pendientes.filter(x=>x.l.id==='D').length,
    reparto:loanReparto(loan('D')).socioParteReal, nivel:cumplimiento('CD').nivel}));
  console.log('5) Mónica a pérdida, perdonado:',JSON.stringify(d));
  if(d.st!=='cerrado'||d.pend!==0||d.reparto!==0)throw new Error('Sin ganancia, Mónica no cobra nada');
  if(d.nivel==='malo')throw new Error('Perdonado no deberia marcarlo Problemático');
  console.log('   OK Pérdida: Mónica ni cobra ni pone; perdonado no le baja la calificación');

  // ===== 6) deshacer: reabre todo el lote; y se bloquea si ya le pagaste al socio
  await page.evaluate(()=>go('prestamos','B'));await page.waitForTimeout(600);
  msgs.length=0;
  await page.click('[data-reabrir]');await page.waitForTimeout(800);
  const re=await page.evaluate(()=>['A','B','C'].map(id=>loan(id).status));
  console.log('6) Tras deshacer desde B:',JSON.stringify(re),'|',(msgs[0]||'').split('\n')[0]);
  if(re.some(s=>s!=='activo'))throw new Error('Se reabren los tres del lote');
  await page.evaluate(()=>{aplicarCierre(['A','B'],'nopago');marcarPagadoSocio('A');});
  msgs.length=0;
  await page.evaluate(()=>deshacerCierre('B'));await page.waitForTimeout(400);
  const bloq=await page.evaluate(()=>loan('B').status);
  if(bloq!=='cerrado'||!msgs.some(m=>/ya le liquidaste/.test(m)))throw new Error('Con el socio ya pagado no se deshace');
  console.log('   OK Reabre el lote entero, y si ya le pagaste al socio no deja');

  // ===== 7) el socio no puede cerrar
  await page.evaluate(()=>{sessionStorage.clear();});await page.reload();await page.waitForTimeout(900);
  await page.fill('#lk-user','debora');await page.fill('#lk-pass','debo1234');await page.click('#lk-go');await page.waitForTimeout(1000);
  await page.click('.tabs button[data-v="prestamos"]');await page.waitForTimeout(500);
  const soc=await page.evaluate(()=>{const antes=loan('C')?1:0;
    return {modo:!!$('#cie-modo'),plan:aplicarCierre(['A']).length};});
  await page.evaluate(()=>go('prestamos','A'));await page.waitForTimeout(400);
  const btn=await page.evaluate(()=>!!$('[data-cerrar]')||!!$('[data-reabrir]'));
  console.log('7) Como Débora:',JSON.stringify({...soc,botones:btn}));
  if(soc.modo||soc.plan||btn)throw new Error('El socio no puede cerrar ni reabrir');
  console.log('   OK Solo el dueño');

  if(errores.length){console.error(errores.join('\n'));throw new Error(errores.length+' error(es) de JS');}
  console.log('\nTODO OK: CERRAR PRÉSTAMOS COMO ESTÁN, CON REPARTO SOBRE EL TOTAL');
  await browser.close();server.close();process.exit(0);
})().catch(e=>{console.error('FALLO:',e.message);process.exit(1);});
