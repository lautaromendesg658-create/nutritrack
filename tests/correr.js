// Corre todas las pruebas y resume el resultado.
const { execFileSync }=require('child_process');
const fs=require('fs'), path=require('path');
const dir=__dirname;
const archivos=fs.readdirSync(dir)
  .filter(f=>f.endsWith('.js')&&f!=='correr.js').sort();
let fallaron=0;
for(const f of archivos){
  process.stdout.write(f.replace(/\.js$/,'').padEnd(22));
  try{
    execFileSync(process.execPath,[path.join(dir,f)],{stdio:'pipe',timeout:600000});
    console.log('OK');
  }catch(e){
    fallaron++;
    console.log('FALLÓ');
    const txt=((e.stdout||'')+'').trim().split('\n').slice(-6).join('\n');
    console.log(txt.replace(/^/gm,'    '));
  }
}
console.log(`\n${archivos.length-fallaron}/${archivos.length} en verde`);
process.exit(fallaron?1:0);
