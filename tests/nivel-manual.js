const { chromium } = require('playwright-core');
const http = require('http'); const fs=require('fs'); const path=require('path');
const ROOT='/home/user/nutritrack';
const server=http.createServer((req,res)=>{let f=path.join(ROOT,req.url==='/'?'index.html':req.url.split('?')[0]);
  if(!fs.existsSync(f)){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':{'.html':'text/html','.json':'application/json','.png':'image/png','.js':'text/javascript'}[path.extname(f)]||'text/plain'});res.end(fs.readFileSync(f));});
// IRREGULAR: paga siempre pero 3 días tarde · NUEVO: sin préstamos
const datos=`(()=>{
  S.settings.mora={tipo:'pct',valor:10,porDia:true};
  S.settings.cobrador={monto:0,dias:3,bordes:false};
  S.settings.diasNoLaborables=[];
  S.clients=[{id:'IRR',nombre:'Iara Labourdette'},{id:'NUE',nombre:'Cliente Nuevo'}];
  const d=n=>ymd(new Date(pd(todayStr()).getTime()+n*86400000)), ts=f=>pd(f).getTime();
  const cs=[];
  for(let i=1;i<=10;i++){const v=d(-40+i);
    cs.push({n:i,vence:v,monto:10000,pagos:[{t:ts(d(-40+i+3)),monto:10000,mora:3000,cobrador:0}]});}
  S.loans=[{id:'L1',clientId:'IRR',tipo:'personal',monto:50000,interes:100,total:100000,
    frecuencia:'diaria',inicio:d(-39),createdAt:ts(d(-39)),status:'pagado',cuotas:cs}];
  S.loans.forEach(l=>saveLoan(l));
})()`;
(async()=>{
  await new Promise(r=>server.listen(9053,r));
  const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const errores=[];
  const ctx=await browser.newContext({viewport:{width:430,height:950}});
  const page=await ctx.newPage();
  page.on('pageerror',e=>errores.push('PAGEERROR: '+e.message));
  page.on('dialog',async d=>{await d.accept();});
  await page.goto('http://localhost:9053/');
  await page.fill('#lk-user','lautaro');await page.fill('#lk-pass','clave1234');await page.fill('#lk-pass2','clave1234');
  await page.click('#lk-create');await page.waitForTimeout(600);
  await page.evaluate(datos);await page.waitForTimeout(700);

  // ===== 1) el automático sigue funcionando
  let R=await page.evaluate(()=>cumplimiento('IRR'));
  console.log('1) Automático:',R.nivel,'| auto:',R.nivelAuto,'| manual:',!!R.manual);
  if(R.nivel!=='regular'||R.nivelAuto!=='regular'||R.manual)throw new Error('Deberia calificarlo solo como irregular');
  console.log('   OK Lo califica solo');

  // ===== 2) se puede poner a mano desde la ficha
  await page.evaluate(()=>go('clientes','IRR'));await page.waitForTimeout(700);
  if(!(await page.evaluate(()=>!!$('[data-nivel]'))))throw new Error('Deberia estar el botón de calificar');
  await page.click('[data-nivel]');await page.waitForTimeout(600);
  const modal=await page.evaluate(()=>({
    opciones:$$('[data-niv]').map(d=>d.dataset.niv),
    marcaAuto:$('#modal').textContent.replace(/\s+/g,' ').match(/lo que dice el sistema/g),
    h3:$('#modal h3').textContent}));
  console.log('2) Modal:',JSON.stringify({opciones:modal.opciones,h3:modal.h3}));
  if(modal.opciones.length!==5)throw new Error('Deberian estar las 5 calificaciones');
  if(!modal.marcaAuto)throw new Error('Deberia marcar cuál dice el sistema');
  await page.click('[data-niv="bueno"]');await page.waitForTimeout(300);
  await page.fill('#niv-nota','Me consta que labura, se atrasó por la mudanza');
  await page.click('#niv-save');await page.waitForTimeout(800);
  R=await page.evaluate(()=>cumplimiento('IRR'));
  console.log('   tras guardarlo:',JSON.stringify({nivel:R.nivel,auto:R.nivelAuto,manual:!!R.manual,nota:R.notaNivel}));
  if(R.nivel!=='bueno')throw new Error('Deberia mandar lo que puse a mano');
  if(R.nivelAuto!=='regular')throw new Error('Deberia conservar lo que dice el sistema');
  if(!R.manual||!/mudanza/.test(R.notaNivel||''))throw new Error('Deberia guardar la nota');
  console.log('   OK Manda la calificación a mano y guarda la del sistema aparte');

  // ===== 3) se ve en la ficha y en la lista, marcada con la manito
  let txt=(await page.textContent('#view')).replace(/\s+/g,' ');
  if(!/CONFIABLE ✋/.test(txt))throw new Error('El veredicto deberia marcarse como manual');
  if(!/Calificación puesta a mano: Me consta/.test(txt))throw new Error('Deberia explicar la nota');
  if(!/el sistema diría <b>IRREGULAR|el sistema diría IRREGULAR/.test(txt))
    throw new Error('Deberia decir qué dice el sistema: '+(txt.match(/sistema diría[^.]*/)||[''])[0]);
  await page.click('.tabs button[data-v="clientes"]');await page.waitForTimeout(700);
  const chapa=await page.evaluate(()=>$$('[data-cli] .badge.niv').map(b=>b.textContent.trim()));
  console.log('3) En la lista:',JSON.stringify(chapa));
  if(!chapa.some(t=>/CONFIABLE ✋/.test(t)))throw new Error('La lista deberia mostrar la manual con ✋');
  await page.screenshot({path:'/tmp/shots/v94-nivel.png',fullPage:true});
  console.log('   OK Se ve en la ficha y en la lista');

  // ===== 4) al crear un préstamo también avisa con la calificación manual
  await page.evaluate(()=>formPrestamo('IRR'));await page.waitForTimeout(700);
  const enForm=await page.evaluate(()=>$('#p-hist').textContent.replace(/\s+/g,' '));
  console.log('4) Al prestar:',enForm.slice(0,80));
  if(!/CONFIABLE/.test(enForm))throw new Error('Deberia usar la calificación manual');
  await page.evaluate(()=>closeModal());await page.waitForTimeout(300);
  console.log('   OK También al decidir un préstamo nuevo');

  // ===== 5) volver al automático
  await page.evaluate(()=>go('clientes','IRR'));await page.waitForTimeout(600);
  await page.click('[data-nivel]');await page.waitForTimeout(600);
  await page.click('#niv-auto');await page.waitForTimeout(800);
  R=await page.evaluate(()=>({...cumplimiento('IRR'),manual2:!!client('IRR').nivelManual}));
  console.log('5) Tras volver al automático:',JSON.stringify({nivel:R.nivel,manual:!!R.manual,campo:R.manual2}));
  if(R.nivel!=='regular'||R.manual||R.manual2)throw new Error('Deberia volver a calificarlo solo');
  txt=(await page.textContent('#view')).replace(/\s+/g,' ');
  if(/✋/.test(txt))throw new Error('No deberia quedar la marca');
  console.log('   OK Vuelve al automático sin rastros');

  // ===== 6) un cliente sin historial también se puede calificar
  await page.evaluate(()=>go('clientes','NUE'));await page.waitForTimeout(700);
  txt=(await page.textContent('#view')).replace(/\s+/g,' ');
  if(!/calificarlo a mano/.test(txt))throw new Error('Deberia ofrecerlo igual sin historial');
  await page.click('[data-nivel]');await page.waitForTimeout(600);
  await page.click('[data-niv="malo"]');await page.waitForTimeout(300);
  await page.click('#niv-save');await page.waitForTimeout(800);
  R=await page.evaluate(()=>cumplimiento('NUE'));
  console.log('6) Cliente nuevo marcado a mano:',R.nivel,'| auto:',R.nivelAuto);
  if(R.nivel!=='malo'||R.nivelAuto!=='nuevo')throw new Error('Deberia quedar problemático a mano');
  txt=(await page.textContent('#view')).replace(/\s+/g,' ');
  if(!/PROBLEMÁTICO ✋/.test(txt))throw new Error('Deberia verse el veredicto');
  console.log('   OK Se puede calificar a un cliente sin historial');

  // ===== 7) el socio no puede calificar clientes ajenos
  const bloq=await page.evaluate(()=>{
    SESSION={rol:'socio',socioId:'s9',nombre:'Ajeno'};
    formNivel('NUE');
    const abrio=!!$('#modal .sheet');
    SESSION={rol:'dueno',socioId:null,nombre:'lautaro'};
    return abrio;});
  if(bloq)throw new Error('Un socio no deberia calificar un cliente que no es suyo');
  console.log('7) OK El socio no puede tocar clientes ajenos');

  if(errores.length){console.error('ERRORES JS:');errores.forEach(e=>console.error('  '+e));
    throw new Error(errores.length+' error(es) de JS');}
  console.log('\nTODO OK: CALIFICACIÓN MANUAL DEL CLIENTE');
  await browser.close();server.close();process.exit(0);
})().catch(e=>{console.error('FALLO:',e.message);process.exit(1);});
