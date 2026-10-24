import {writeFile} from 'node:fs/promises';
// The dev bypass is local-only and compiled out by EmDash in production.
const origin='http://localhost:4321';
try {
 const auth=await fetch(`${origin}/_emdash/api/auth/dev-bypass`,{redirect:'manual'});
 if(!auth.ok) throw new Error('Start pnpm dev, then retry the local model migration.');
 const cookies=auth.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
 if(!cookies) throw new Error('No local development session was returned.');
 const response=await fetch(`${origin}/_emdash/api/customseda/model`,{
  method:'POST',headers:{Cookie:cookies,Origin:origin,'X-EmDash-Request':'1','Content-Type':'application/json'},body:'{}',
 });
 if(!response.ok) throw new Error(`Local catalog model migration failed (${response.status}).`);
 const result=await response.json();
 const types=await fetch(`${origin}/_emdash/api/typegen`);
 if(!types.ok) throw new Error('Model applied, but generating local CMS types failed.');
 await writeFile('emdash-env.d.ts',await types.text());
 console.log(`${result.data.version}: ${result.data.applied?'applied':'already applied'}. Local D1 only.`);
} catch(error) {console.error(error.message);process.exitCode=1;}
