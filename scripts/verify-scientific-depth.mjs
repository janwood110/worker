import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import crypto from 'node:crypto';
const root='/tmp/science-live-originals';fs.mkdirSync(root,{recursive:true});
fs.writeFileSync('/tmp/science-live-originals.tar.gz',Buffer.concat(fs.readdirSync('deploy/remaining-184').filter(n=>n.startsWith('remaining184.tar.gz.part-')).sort().map(n=>fs.readFileSync('deploy/remaining-184/'+n))));
execFileSync('tar',['-xzf','/tmp/science-live-originals.tar.gz','-C',root]);
const names=fs.readFileSync('deploy/remaining-184/workers.txt','utf8').trim().split(/\r?\n/);
if(names.length!==184||new Set(names).size!==184)throw new Error('Wrong Worker inventory');
execFileSync('git',['fetch','--depth=2','origin','c62409e1f24320c7557c3336a542cd05deedfd64'],{stdio:'inherit'});
const zeroBefore=execFileSync('git',['show','c62409e1f24320c7557c3336a542cd05deedfd64^:0/index.html'],{encoding:'utf8'});
const fields=html=>({
 head:(html.match(/<head\b[^>]*>[\s\S]*?<\/head>/i)||[])[0],
 h1:html.match(/<h1\b[^>]*>[\s\S]*?<\/h1>/gi)||[],
 images:html.match(/<img\b[^>]*>/gi)||[],
 scripts:html.match(/<script\b[^>]*>[\s\S]*?<\/script>/gi)||[],
 identity:(html.match(/<h2>\s*هویت نویسنده[\s\S]*?<\/article>/)||[])[0]
});
const results=[];
async function check(name){
 const before=name==='0'?zeroBefore:fs.readFileSync(path.join(root,name,'index.html'),'utf8');
 const canonical=(before.match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)/i)||[])[1]||('https://'+name+'.0l0l.workers.dev/');
 const url=new URL(canonical);if(url.protocol!=='https:'||!url.hostname.endsWith('.0l0l.workers.dev'))throw new Error('Unexpected Worker URL '+name);
 let response,text;for(let attempt=0;attempt<3;attempt++){try{response=await fetch(url,{signal:AbortSignal.timeout(30000),redirect:'follow'});text=await response.text();if(response.status===200)break;}catch(e){if(attempt===2)throw e;}}
 const a=fields(text||''),b=fields(before),checks={};
 for(const k of Object.keys(b))checks[k]=JSON.stringify(a[k])===JSON.stringify(b[k]);
 checks.bodyAdded=/data-science-depth="2026-10-07"/.test(text||'');
 checks.http=response?.status===200;
 const result={name,url:String(url),status:response?.status,bytes:Buffer.byteLength(text||''),checks,protectedFieldsUnchanged:Object.entries(checks).filter(([k])=>!['bodyAdded','http'].includes(k)).every(([,v])=>v),sha256:crypto.createHash('sha256').update(text||'').digest('hex')};
 results.push(result);console.log(name,checks.http&&checks.bodyAdded&&result.protectedFieldsUnchanged?'PASS':'FAIL');
}
const queue=['0',...names];let cursor=0;
await Promise.all(Array.from({length:8},async()=>{while(cursor<queue.length){const name=queue[cursor++];try{await check(name);}catch(e){results.push({name,error:String(e)});console.log(name,'ERROR',String(e));}}}));
results.sort((a,b)=>a.name.localeCompare(b.name));
const failures=results.filter(r=>r.error||!r.checks?.http||!r.checks.bodyAdded||!r.protectedFieldsUnchanged);
fs.mkdirSync('deploy/wp-depth/verification',{recursive:true});
fs.writeFileSync('deploy/wp-depth/verification/workers-live.json',JSON.stringify({verifiedAt:new Date().toISOString(),total:results.length,passed:results.length-failures.length,failures,results},null,2));
console.log('Verified',results.length,'Workers;',failures.length,'failures');
if(failures.length)process.exitCode=1;
