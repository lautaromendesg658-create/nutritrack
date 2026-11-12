// Aviso diario por Telegram: a la mañana, los cobros de hoy y los vencidos de los clientes
// del DUEÑO (los que no tienen socio). Lo corre GitHub Actions todos los días.
//
// Las cuentas (saldo, mora, cobrador) NO están copiadas acá: se toman de la app publicada,
// extrayendo sus propias funciones de cálculo, así lo que llega al celular da exactamente
// lo mismo que la pantalla. Si la app cambia, el aviso cambia con ella.
//
// IMPORTANTE: el repositorio es público y los registros de GitHub Actions también. Por eso
// este script NUNCA imprime nombres ni montos: solo cantidades.
//
// Variables (en GitHub: Settings → Secrets and variables → Actions):
//   FIREBASE_API_KEY, FIREBASE_PROJECT_ID, NEGOCIO_CODIGO, TELEGRAM_TOKEN, TELEGRAM_CHAT_ID
// Solo para pruebas locales: DATOS_JSON (archivo con {settings,clients,loans}), MODO_PRUEBA=1
// (muestra el mensaje en vez de mandarlo), FECHA_PRUEBA (fija "ahora"), APP_INDEX (index local).

const fs=require('fs'), path=require('path');
const APP_URL=process.env.APP_URL||'https://lautaromendesg658-create.github.io/nutritrack/';
const PRUEBA=process.env.MODO_PRUEBA==='1';

// ---------- reloj fijo para las pruebas ----------
if(process.env.FECHA_PRUEBA){
  const Real=Date, fijo=new Real(process.env.FECHA_PRUEBA).getTime();
  global.Date=class extends Real{constructor(...a){super(...(a.length?a:[fijo]));} static now(){return fijo;}};
}

// ---------- la lógica de la app, sacada de su propio código ----------
const FUNCIONES=['ymd','pd','cPagadoBase','cMoraPagada','cCobradorPagado','cDescuento','cRestante',
  'diasAtraso','moraDe','cobradorDe','cuotasAcuerdo','etiquetaCuota'];
const CONSTANTES=['todayStr'];

// Busca "function nombre(" y devuelve la función completa, salteando llaves dentro de textos.
function extraerFuncion(src,nombre){
  const ini=src.search(new RegExp('\\nfunction '+nombre+'\\('));
  if(ini<0)throw new Error('no encontré la función '+nombre+' en la app');
  let i=src.indexOf('{',ini), prof=0, modo=[];
  for(;i<src.length;i++){
    const ch=src[i], m=modo[modo.length-1];
    if(m==="'"||m==='"'){ if(ch==='\\')i++; else if(ch===m)modo.pop(); continue; }
    if(m==='`'){ if(ch==='\\')i++; else if(ch==='`')modo.pop();
      else if(ch==='$'&&src[i+1]==='{'){modo.push('${');i++;prof++;} continue; }
    if(m==='//'){ if(ch==='\n')modo.pop(); continue; }
    if(ch==='/'&&src[i+1]==='/'){modo.push('//');i++;continue;}
    if(ch==="'"||ch==='"'||ch==='`'){modo.push(ch);continue;}
    if(ch==='{')prof++;
    else if(ch==='}'){prof--; if(m==='${'&&prof>=0){modo.pop();}
      if(prof===0)return src.slice(ini+1,i+1);}
  }
  throw new Error('la función '+nombre+' quedó sin cerrar');
}
function extraerConstante(src,nombre){
  const m=src.match(new RegExp('\\nconst '+nombre+'=[^\\n]*;'));
  if(!m)throw new Error('no encontré '+nombre+' en la app');
  return m[0].slice(1);
}
function cargarLogica(indexHtml,settings){
  const codigo=CONSTANTES.map(n=>extraerConstante(indexHtml,n))
    .concat(FUNCIONES.map(n=>extraerFuncion(indexHtml,n))).join('\n');
  const version=(indexHtml.match(/const APP_VER=(\d+)/)||[])[1]||'?';
  const fab=new Function('S',codigo+'\nreturn {'+FUNCIONES.concat(CONSTANTES).join(',')+'};');
  return {L:fab({settings}),version};
}
async function leerIndex(){
  if(process.env.APP_INDEX)return fs.readFileSync(process.env.APP_INDEX,'utf8');
  try{ // la versión publicada, que es la que usa el dueño
    const r=await fetch(APP_URL+'index.html?v='+Date.now(),{cache:'no-store'});
    if(r.ok)return await r.text();
  }catch(e){}
  return fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8'); // copia del repositorio
}

// ---------- datos desde Firebase ----------
async function leerDatos(){
  if(process.env.DATOS_JSON)return JSON.parse(fs.readFileSync(process.env.DATOS_JSON,'utf8'));
  // Los valores se suelen copiar del bloque de configuración tal cual: con comillas, la coma del
  // final o el "projectId:" adelante. Se limpian solos; en el registro solo se dice QUÉ se limpió.
  const limpiar=(nombre,v)=>{
    const orig=String(v||''); let x=orig.trim();
    x=x.replace(/^[A-Za-z_]+\s*:\s*/,'');           // projectId: "…"
    x=x.replace(/[,;]+$/,'').trim();                   // coma o punto y coma final
    x=x.replace(/^["'`]+|["'`]+$/g,'').trim();         // comillas
    if(nombre==='FIREBASE_PROJECT_ID')x=x.replace(/\.firebaseapp\.com$/,'').replace(/\.web\.app$/,'');
    if(x!==orig)console.log(nombre+': tenía caracteres de más (comillas, coma, espacios o prefijo), los saqué.');
    return x;};
  const key=limpiar('FIREBASE_API_KEY',process.env.FIREBASE_API_KEY);
  const proj=limpiar('FIREBASE_PROJECT_ID',process.env.FIREBASE_PROJECT_ID);
  const cod=limpiar('NEGOCIO_CODIGO',process.env.NEGOCIO_CODIGO);
  if(!key||!proj||!cod)throw new Error('faltan FIREBASE_API_KEY, FIREBASE_PROJECT_ID o NEGOCIO_CODIGO');
  // revisión de FORMATO, sin mostrar los valores (el registro es público)
  if(/^\d+$/.test(proj))throw new Error('FIREBASE_PROJECT_ID es un número: ese es el messagingSenderId. El projectId es un texto tipo mi-proyecto-1234');
  if(/^AIza/.test(proj))throw new Error('en FIREBASE_PROJECT_ID está la apiKey: van cambiados');
  if(proj.includes(':'))throw new Error('FIREBASE_PROJECT_ID parece el appId (tiene ":"). El projectId es un texto tipo mi-proyecto-1234');
  if(proj.includes('.'))throw new Error('FIREBASE_PROJECT_ID tiene un punto: parece el authDomain o el storageBucket. Es solo la parte antes del primer punto');
  if(!/^[a-z0-9-]{4,40}$/.test(proj))throw new Error('FIREBASE_PROJECT_ID no tiene forma de projectId (solo minúsculas, números y guiones)');
  if(!/^AIza[0-9A-Za-z_-]{35}$/.test(key))throw new Error('FIREBASE_API_KEY no tiene forma de apiKey (empieza con AIza y tiene 39 caracteres)');
  console.log('Formato de las claves de Firebase: ok.');
  const base=`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(proj)}/databases/(default)/documents/negocios/${encodeURIComponent(cod)}`;
  // si la clave de Firebase está restringida a la página de la app, Google mira de dónde viene el pedido
  const H={'Content-Type':'application/json','Referer':APP_URL};
  // el motivo que da Google cuando rechaza (no trae datos de clientes, se puede mostrar)
  const motivo=async r=>{try{const j=await r.json();const e=j.error||(j[0]&&j[0].error)||{};
    return `${r.status} ${e.status||''} ${e.message||''}`.trim();}catch(_){return String(r.status);}};
  // solo clientes y préstamos: los documentos (fotos) pesan mucho y no hacen falta
  const r=await fetch(`${base}:runQuery?key=${encodeURIComponent(key)}`,{method:'POST',
    headers:H,
    body:JSON.stringify({structuredQuery:{from:[{collectionId:'items'}],
      where:{fieldFilter:{field:{fieldPath:'kind'},op:'IN',
        value:{arrayValue:{values:[{stringValue:'client'},{stringValue:'loan'}]}}}}}})});
  if(!r.ok)throw new Error('Firebase rechazó leer los préstamos: '+await motivo(r));
  const filas=await r.json(), clients=[], loans=[];
  for(const f of filas){
    const d=f.document; if(!d||!d.fields||!d.fields.json)continue;
    let ent; try{ent=JSON.parse(d.fields.json.stringValue);}catch(e){continue;}
    (d.fields.kind.stringValue==='client'?clients:loans).push(ent);
  }
  const rs=await fetch(`${base}/meta/settings?key=${encodeURIComponent(key)}`,{headers:H});
  if(!rs.ok)throw new Error('Firebase rechazó leer los ajustes: '+await motivo(rs));
  const sd=await rs.json();
  const settings=JSON.parse(sd.fields.json.stringValue);
  return {settings,clients,loans};
}

// ---------- el mensaje ----------
const plata=n=>'$ '+String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g,'.');
const html=s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

function calcular({settings,clients,loans},L){
  const purgados=new Set(settings.purgados||[]);
  const cli=new Map(clients.filter(c=>!c.deleted&&!purgados.has(c.id)).map(c=>[c.id,c]));
  // MIS clientes = préstamos activos SIN socio (igual que el filtro "Míos" de la app)
  const mios=loans.filter(l=>!l.deleted&&!purgados.has(l.id)&&l.status==='activo'&&!l.gestorId&&cli.has(l.clientId));
  const hoy=L.todayStr(), hoyItems=[], venc=new Map();
  for(const l of mios)for(const c of (l.cuotas||[])){
    const rest=L.cRestante(c); if(rest<=0)continue;
    const total=rest+L.moraDe(c)+L.cobradorDe(c);
    if(c.vence===hoy)hoyItems.push({cliente:cli.get(l.clientId).nombre,etiqueta:L.etiquetaCuota(l,c),total});
    else if(c.vence<hoy){
      const g=venc.get(l.clientId)||{cliente:cli.get(l.clientId).nombre,cuotas:0,total:0,dias:0,desde:c.vence};
      g.cuotas++; g.total+=total; g.dias=Math.max(g.dias,L.diasAtraso(c));
      if(c.vence<g.desde)g.desde=c.vence;
      venc.set(l.clientId,g);
    }
  }
  hoyItems.sort((a,b)=>a.cliente.localeCompare(b.cliente));
  const vencidos=[...venc.values()].sort((a,b)=>a.desde<b.desde?-1:a.desde>b.desde?1:b.total-a.total);
  const conteo={clientes:clients.length,prestamos:loans.length,
    activos:loans.filter(l=>!l.deleted&&l.status==='activo').length,mios:mios.length};
  return {hoy,hoyItems,vencidos,nombre:settings.nombreDueno||'',conteo};
}

function armarMensaje(r){
  const ah=new Date(), fecha=ah.toLocaleDateString('es-AR',{weekday:'long'})+' '+ah.getDate()+'/'+(ah.getMonth()+1);
  const totHoy=r.hoyItems.reduce((a,x)=>a+x.total,0), totVen=r.vencidos.reduce((a,x)=>a+x.total,0);
  const L=[`☀️ <b>Buen día${r.nombre?', '+html(r.nombre):''}</b> — ${fecha}`, `<i>Solo tus clientes (sin socio)</i>`,''];
  if(r.hoyItems.length){
    L.push(`📌 <b>Cobros de hoy: ${r.hoyItems.length}</b> · ${plata(totHoy)}`);
    r.hoyItems.forEach(x=>L.push(`• ${html(x.cliente)} — ${html(x.etiqueta)} · ${plata(x.total)}`));
  }else L.push('📌 <b>Hoy no tenés cuotas que venzan</b>');
  L.push('');
  if(r.vencidos.length){
    L.push(`🔴 <b>Vencidos: ${r.vencidos.length} cliente${r.vencidos.length===1?'':'s'}</b> · ${plata(totVen)}`);
    r.vencidos.forEach(x=>L.push(`• ${html(x.cliente)} — ${x.cuotas} cuota${x.cuotas===1?'':'s'} · ${plata(x.total)}`
      +(x.dias?` · ${x.dias} día${x.dias===1?'':'s'} de mora`:'')));
  }else L.push('✅ <b>No tenés vencidos</b>');
  L.push('', `💰 <b>Total para cobrar: ${plata(totHoy+totVen)}</b>`);
  // Telegram corta en 4096 caracteres: si no entra, se resume el final
  let txt=L.join('\n');
  while(txt.length>3900&&L.length>6){L.splice(L.length-4,1);txt=L.join('\n')+'\n<i>(lista recortada: mirá el resto en la app)</i>';}
  return txt;
}

async function mandar(texto){
  // el token tiene forma 1234567890:AAH…; si se pegó con texto alrededor (la frase de BotFather,
  // el link de la API, espacios), se rescata de adentro
  const crudo=String(process.env.TELEGRAM_TOKEN||'');
  const hallado=crudo.match(/\d{6,12}:[A-Za-z0-9_-]{30,}/);
  if(!hallado)throw new Error('TELEGRAM_TOKEN no tiene forma de token (números, dos puntos y un texto largo, como 7412345678:AAHk…)');
  const tok=hallado[0];
  if(tok!==crudo.trim())console.log('TELEGRAM_TOKEN: tenía texto de más alrededor, usé solo el token.');
  const chat=String(process.env.TELEGRAM_CHAT_ID||'').trim().replace(/^["'`]+|["'`]+$/g,'');
  if(!tok||!chat)throw new Error('faltan TELEGRAM_TOKEN o TELEGRAM_CHAT_ID');
  const r=await fetch(`https://api.telegram.org/bot${tok}/sendMessage`,{method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({chat_id:chat,text:texto,parse_mode:'HTML',disable_web_page_preview:true})});
  if(!r.ok){ // Telegram explica el motivo ("chat not found", "Unauthorized"…): no trae datos, se puede mostrar
    let d=''; try{d=(await r.json()).description||'';}catch(_){}
    const ayuda=/Unauthorized|Not Found/i.test(d)?' → el TELEGRAM_TOKEN está mal o incompleto'
      :/chat not found/i.test(d)?' → el TELEGRAM_CHAT_ID está mal, o no apretaste Iniciar en el chat con tu bot'
      :/blocked|can't initiate|initiate conversation/i.test(d)?' → falta apretar Iniciar en el chat con tu bot':'';
    throw new Error('Telegram respondió '+r.status+' '+d+ayuda);
  }
}

// ¿Ya salió el aviso de hoy? Hay varios intentos programados por si GitHub descarta alguno:
// el que llega después de uno exitoso no manda nada. Si no se puede averiguar, manda igual
// (mejor un aviso repetido que ninguno). Las pruebas a mano no cuentan ni se frenan.
async function yaSalioHoy(){
  const {GITHUB_EVENT_NAME:ev,GITHUB_TOKEN:tok,GITHUB_REPOSITORY:repo,GITHUB_WORKFLOW_REF:wf}=process.env;
  if(ev!=='schedule'||!tok||!repo)return false;
  try{
    const archivo=(wf||'').split('@')[0].split('/').pop()||'aviso-telegram.yml';
    const hoyUTC=new Date().toISOString().slice(0,10);
    const r=await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${archivo}/runs?event=schedule&status=success&created=%3E%3D${hoyUTC}&per_page=5`,
      {headers:{Authorization:'Bearer '+tok,Accept:'application/vnd.github+json'}});
    if(!r.ok)return false;
    const j=await r.json();
    return (j.workflow_runs||[]).some(x=>String(x.id)!==String(process.env.GITHUB_RUN_ID));
  }catch(e){return false;}
}

(async()=>{
  try{
    if(await yaSalioHoy()){console.log('El aviso de hoy ya salió en un intento anterior: no mando nada.');return;}
    const datos=await leerDatos();
    const {L,version}=cargarLogica(await leerIndex(),datos.settings);
    const r=calcular(datos,L), texto=armarMensaje(r);
    if(PRUEBA){console.log(JSON.stringify({version,hoy:r.hoy,hoyItems:r.hoyItems,vencidos:r.vencidos}));
      console.log('---MENSAJE---\n'+texto);return;}
    await mandar(texto);
    const k=r.conteo;
    console.log(`Leí ${k.clientes} clientes y ${k.prestamos} préstamos (${k.activos} activos, ${k.mios} activos sin socio).`);
    console.log(`Aviso enviado (app v${version}): ${r.hoyItems.length} cobros de hoy, ${r.vencidos.length} clientes vencidos.`);
  }catch(e){
    console.error('No se pudo armar el aviso: '+e.message);
    if(!PRUEBA)try{await mandar('⚠️ <b>No pude armar el aviso de cobros de hoy.</b>\nAbrí la app para ver tus cobros. (Motivo: '+html(e.message)+')');}
      catch(e2){console.error('Tampoco pude avisar por Telegram: '+e2.message);}
    process.exit(1);
  }
})();
