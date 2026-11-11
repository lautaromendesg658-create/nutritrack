// El aviso de Telegram: que traiga SOLO los clientes del dueño, y que cada monto
// (saldo + mora + cobrador) dé exactamente lo mismo que la app a la misma hora.
const { chromium } = require('playwright-core');
const http=require('http'), fs=require('fs'), path=require('path'), os=require('os');
const { execFileSync }=require('child_process');
const ROOT=path.join(__dirname,'..');
const AHORA='2026-11-11T09:00:00-03:00';           // miércoles 11/11, 9 de la mañana
const TZ='America/Argentina/Buenos_Aires';

const settings={nombreDueno:'Lautaro',horaLimite:18,diasNoLaborables:[0,6],
  mora:{tipo:'pct',valor:10,porDia:true},cobrador:{monto:15000,dias:3,bordes:true},
  socios:[{id:'s1',nombre:'Debora',pct:50}],purgados:['PURG'],descuento:{activo:true,pct:10,hora:14}};
const p=(f,m)=>({t:new Date(f+'T12:00:00-03:00').getTime(),monto:m,mora:0,cobrador:0});
const clients=[
  {id:'C1',nombre:'Ana <Lopez>'},{id:'C2',nombre:'De Debora',gestorId:'s1'},
  {id:'C3',nombre:'Carlos Diaz'},{id:'C4',nombre:'Ya Pagó'},{id:'C5',nombre:'Borrado',deleted:true},
  {id:'C6',nombre:'Con Acuerdo'}];
const loans=[
  // MÍO, diario: una pagada, una vencida ayer, una HOY, una mañana
  {id:'MIO1',clientId:'C1',status:'activo',frecuencia:'diaria',monto:20000,total:40000,cuotas:[
    {n:1,vence:'2026-11-09',monto:10000,pagos:[p('2026-11-09',10000)],borde:true},
    {n:2,vence:'2026-11-10',monto:10000,pagos:[]},
    {n:3,vence:'2026-11-11',monto:10000,pagos:[]},
    {n:4,vence:'2026-11-12',monto:10000,pagos:[],borde:true}]},
  // MÍO, una cuota vencida hace 9 días (con fin de semana en el medio) → mora + cobrador
  {id:'MIO2',clientId:'C3',status:'activo',frecuencia:'semanal',monto:25000,total:50000,cuotas:[
    {n:1,vence:'2026-11-02',monto:50000,pagos:[p('2026-11-05',20000)]}]},
  // MÍO con deuda acordada: la cuota de hoy, sin mora
  {id:'MIO3',clientId:'C6',status:'activo',frecuencia:'semanal',monto:10000,total:30000,acuerdo:{monto:30000},cuotas:[
    {n:1,vence:'2026-11-04',monto:15000,pagos:[],congelada:true,esAcuerdo:true},
    {n:2,vence:'2026-11-11',monto:15000,pagos:[],congelada:true,esAcuerdo:true}]},
  // NO deben aparecer: de la socia, pagado, purgado, en la papelera, cliente borrado
  {id:'DEB',clientId:'C2',status:'activo',gestorId:'s1',gestorPct:50,monto:10000,total:20000,cuotas:[
    {n:1,vence:'2026-11-11',monto:20000,pagos:[]},{n:2,vence:'2026-11-01',monto:5000,pagos:[]}]},
  {id:'PAG',clientId:'C4',status:'pagado',monto:1,total:1,cuotas:[{n:1,vence:'2026-11-11',monto:1,pagos:[]}]},
  {id:'PURG',clientId:'C1',status:'activo',monto:1,total:9,cuotas:[{n:1,vence:'2026-11-11',monto:9,pagos:[]}]},
  {id:'TRASH',clientId:'C1',status:'activo',deleted:true,monto:1,total:9,cuotas:[{n:1,vence:'2026-11-11',monto:9,pagos:[]}]},
  {id:'SINCLI',clientId:'C5',status:'activo',monto:1,total:9,cuotas:[{n:1,vence:'2026-11-11',monto:9,pagos:[]}]}];

(async()=>{
  // ===== 1) correr el script como lo correría GitHub, pero con estos datos y sin mandar nada
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'aviso-'));
  const datos=path.join(tmp,'datos.json');
  fs.writeFileSync(datos,JSON.stringify({settings,clients,loans}));
  const salida=execFileSync(process.execPath,[path.join(ROOT,'aviso','aviso-telegram.js')],
    {env:{...process.env,TZ,DATOS_JSON:datos,MODO_PRUEBA:'1',FECHA_PRUEBA:AHORA,APP_INDEX:path.join(ROOT,'index.html')}}).toString();
  const [json,msg]=salida.split('---MENSAJE---');
  const r=JSON.parse(json.trim());
  console.log('1) Lo que calculó el script (app v'+r.version+'), hoy='+r.hoy);
  console.log('   hoy:',JSON.stringify(r.hoyItems));
  console.log('   vencidos:',JSON.stringify(r.vencidos.map(v=>({c:v.cliente,n:v.cuotas,t:v.total,d:v.dias}))));
  if(r.hoy!=='2026-11-11')throw new Error('Deberia tomar el día de Argentina');

  // ===== 2) solo mis clientes
  const nombres=[...r.hoyItems.map(x=>x.cliente),...r.vencidos.map(x=>x.cliente)];
  if(nombres.some(n=>/Debora|Pagó|Borrado/.test(n)))throw new Error('Se colaron clientes que no son del dueño: '+nombres);
  if(!nombres.includes('Ana <Lopez>')||!nombres.includes('Carlos Diaz')||!nombres.includes('Con Acuerdo'))
    throw new Error('Faltan clientes propios');
  if(r.hoyItems.length!==2)throw new Error('Hoy vencen 2 cuotas mías (Ana y el acuerdo): '+r.hoyItems.length);
  console.log('2) OK Solo clientes sin socio; nada de la socia, pagados, purgados ni de la papelera');

  // ===== 3) los montos, contra la app de verdad a la misma hora
  const server=http.createServer((req,res)=>{let f=path.join(ROOT,req.url==='/'?'index.html':req.url.split('?')[0]);
    if(!fs.existsSync(f)){res.writeHead(404);res.end();return;}
    res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript'}[path.extname(f)]||'text/plain'});res.end(fs.readFileSync(f));});
  await new Promise(x=>server.listen(9063,x));
  const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const ctx=await browser.newContext({timezoneId:TZ});
  const page=await ctx.newPage();
  await page.clock.setFixedTime(new Date(AHORA));
  await page.goto('http://localhost:9063/');
  await page.fill('#lk-user','lautaro');await page.fill('#lk-pass','clave1234');await page.fill('#lk-pass2','clave1234');
  await page.click('#lk-create');await page.waitForTimeout(600);
  const app=await page.evaluate(([st,cl,lo])=>{
    // como en la app real: lo borrado y lo purgado está en la papelera, no en la lista
    S.settings={...S.settings,...st}; S.clients=cl.filter(c=>!c.deleted);
    S.loans=lo.filter(l=>!l.deleted&&!(st.purgados||[]).includes(l.id)&&l.clientId!=='C5'&&l.status!=='pagado');
    const out={hoy:todayStr(),items:{},venc:{}};
    lo.filter(l=>l.id==='MIO1'||l.id==='MIO2'||l.id==='MIO3').forEach(l=>l.cuotas.forEach(c=>{
      const rest=cRestante(c); if(rest<=0)return;
      const tot=rest+moraDe(c)+cobradorDe(c);
      if(c.vence===todayStr())out.items[l.clientId]=(out.items[l.clientId]||0)+tot;
      else if(c.vence<todayStr())out.venc[l.clientId]=(out.venc[l.clientId]||0)+tot;}));
    // y lo que muestra la pantalla "Cobros de hoy" con el filtro "Míos"
    iniGestor='mios'; go('inicio');
    out.pantallaHoy=cobrosDelDia(todayStr(),loansIni()).filter(x=>cRestante(x.c)>0).length;
    return out;},[settings,clients,loans]);
  await browser.close();server.close();
  console.log('3) La app calcula:',JSON.stringify(app));
  const nom={C1:'Ana <Lopez>',C3:'Carlos Diaz',C6:'Con Acuerdo'};
  for(const [cid,tot] of Object.entries(app.items)){
    const s=r.hoyItems.filter(x=>x.cliente===nom[cid]).reduce((a,x)=>a+x.total,0);
    if(s!==tot)throw new Error(`Hoy de ${nom[cid]}: script ${s} vs app ${tot}`);}
  for(const [cid,tot] of Object.entries(app.venc)){
    const v=r.vencidos.find(x=>x.cliente===nom[cid]);
    if(!v||v.total!==tot)throw new Error(`Vencido de ${nom[cid]}: script ${v&&v.total} vs app ${tot}`);}
  if(app.pantallaHoy!==r.hoyItems.length)throw new Error('La pantalla con "Míos" muestra '+app.pantallaHoy+' cobros de hoy');
  console.log('   OK Cada monto coincide con la app, peso por peso, y con la pantalla filtrada en "Míos"');

  // ===== 4) cuentas a mano, para no depender solo de la comparación
  const carlos=r.vencidos.find(x=>x.cliente==='Carlos Diaz');
  // resta 30.000 · 7 días hábiles (2 al 10, sin sáb y dom) × 5.000 = 35.000 de mora · cobrador 15.000
  if(carlos.total!==30000+35000+15000||carlos.dias!==7)throw new Error('Carlos deberia deber 80.000 con 7 días: '+JSON.stringify(carlos));
  const acuerdo=r.vencidos.find(x=>x.cliente==='Con Acuerdo');
  if(!acuerdo||acuerdo.total!==15000||acuerdo.dias!==0)throw new Error('El acuerdo vencido va sin mora: '+JSON.stringify(acuerdo));
  if(r.vencidos[0].cliente!=='Carlos Diaz')throw new Error('Primero el más atrasado');
  console.log('4) OK Carlos: 30.000 + 35.000 de mora + 15.000 de cobrador = 80.000; el acuerdo, sin mora');

  // ===== 5) el mensaje
  console.log('5) Mensaje:\n'+msg.trim().split('\n').map(x=>'   | '+x).join('\n'));
  if(!/Buen día, Lautaro/.test(msg))throw new Error('Deberia saludar');
  if(!/Ana &lt;Lopez&gt;/.test(msg))throw new Error('Los nombres tienen que ir escapados para Telegram');
  if(!/Cobros de hoy: 2/.test(msg)||!/Vencidos: 3 clientes/.test(msg))throw new Error('Faltan los totales');
  if(/Debora/.test(msg))throw new Error('No puede aparecer nada de la socia');
  if(!/Acuerdo 2\/2/.test(msg))throw new Error('Deberia nombrar la cuota del acuerdo como en la app');

  // ===== 6) si algo falla, no muestra datos y sale con error
  fs.writeFileSync(datos,'{roto');
  let fallo=false, err='';
  try{execFileSync(process.execPath,[path.join(ROOT,'aviso','aviso-telegram.js')],
    {env:{...process.env,TZ,DATOS_JSON:datos,MODO_PRUEBA:'1',APP_INDEX:path.join(ROOT,'index.html')},stdio:'pipe'});}
  catch(e){fallo=true;err=String(e.stderr);}
  if(!fallo)throw new Error('Con datos rotos tendría que fallar');
  console.log('6) OK Con datos rotos falla avisando:',err.trim().split('\n')[0]);

  console.log('\nTODO OK: AVISO DE TELEGRAM CON SOLO MIS CLIENTES');
  process.exit(0);
})().catch(e=>{console.error('FALLO:',e.message);process.exit(1);});
