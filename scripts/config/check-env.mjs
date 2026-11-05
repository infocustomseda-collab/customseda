import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseEnv} from 'node:util';

// Only active configuration counts: backups and the invoking shell cannot hide missing files.
export const environmentFiles=['.env','.env.cloudflare-production','.env.cloudflare-staging'];

export async function checkEnvironment(root=process.cwd()) {
 let template;
 try {template=parseEnv(await readFile(resolve(root,'.env.example'),'utf8'));}
 catch {throw new Error('No se puede leer .env.example. Recupera el archivo antes de continuar.');}
 const expected=Object.keys(template);
 if(!expected.length)throw new Error('.env.example no contiene ninguna clave activa.');
 const present=new Set();
 const files=[];
 for(const file of environmentFiles) {
  let source;
  try {source=await readFile(resolve(root,file),'utf8');}
  catch(error) {
   if(error.code==='ENOENT')continue;
   throw new Error(`No se puede leer ${file}. Revisa sus permisos.`);
  }
  files.push(file);
  for(const key of Object.keys(parseEnv(source)))present.add(key);
 }
 return {
  files,
  missing:expected.filter(key=>!present.has(key)).sort(),
  undocumented:[...present].filter(key=>!Object.hasOwn(template,key)).sort(),
  count:expected.length,
 };
}

export async function assertEnvironment(root=process.cwd()) {
 const result=await checkEnvironment(root);
 const errors=[];
 if(result.missing.length)errors.push(`Faltan claves en la configuración local: ${result.missing.join(', ')}. Solicita los valores por un canal privado y guárdalos en el archivo de entorno correspondiente.`);
 if(result.undocumented.length)errors.push(`Faltan claves activas en .env.example: ${result.undocumented.join(', ')}. Añade solo sus nombres, con el valor vacío.`);
 if(errors.length)throw new Error(errors.join('\n'));
 return result;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
 assertEnvironment().then(result=>console.log(`Entorno comprobado: ${result.count} claves presentes en ${result.files.length} archivos. No se muestran ni validan valores.`))
  .catch(error=>{console.error(error.message);process.exitCode=1;});
}
