import fs from 'node:fs';
import crypto from 'node:crypto';
const targets=JSON.parse(fs.readFileSync('deploy/wp-depth/verification/published-pages.json','utf8'));
if(targets.length!==214||new Set(targets.map(x=>x.key)).size!==214)throw new Error('Expected all 214 science pages');
const results=[];let cursor=0;
async function check(x){
 const api='https://public-api.wordpress.com/wp/v2/sites/'+x.site_id+'/pages/'+x.page_id;
 let response,data,body,apiError;
 for(let attempt=0;attempt<3;attempt++){
  try{response=await fetch(api,{signal:AbortSignal.timeout(30000),headers:{'Cache-Control':'no-cache'}});data=await response.json();body=data.content?.rendered||'';if(response.status===200&&body.includes('science-depth-20261007'))break;}
  catch(e){apiError=String(e);}
 }
 let publicResponse,html;
 for(let attempt=0;attempt<3;attempt++){
  try{publicResponse=await fetch(x.link+'?science-depth-verify=20261007',{signal:AbortSignal.timeout(30000),headers:{'Cache-Control':'no-cache'}});html=await publicResponse.text();if(publicResponse.status===200&&html.includes('science-depth-20261007'))break;}
  catch(e){apiError=String(e);}
 }
 const checks={published:(data?.status||'publish')==='publish',apiBody:response?.status===200&&body.includes('science-depth-20261007'),publicBody:publicResponse?.status===200&&html?.includes('science-depth-20261007')};
 const robots=Array.from((html||'').matchAll(/<meta\b[^>]*name=['"]robots['"][^>]*>/gi)).map(m=>m[0]);
 const result={key:x.key,site_id:x.site_id,page_id:x.page_id,url:x.link,edit:'https://'+x.domain+'/wp-admin/post.php?post='+x.page_id+'&action=edit',apiStatus:response?.status,publicStatus:publicResponse?.status,checks,mathmlCount:(body.match(/<math\b/g)||[]).length,robots,headerRobots:publicResponse?.headers.get('x-robots-tag'),publicContentSha256:crypto.createHash('sha256').update(body||html||'').digest('hex'),error:!checks.apiBody&&!checks.publicBody?apiError:undefined};
 results.push(result);console.log(x.key,checks.published&&(checks.apiBody||checks.publicBody)?'PASS':'FAIL');
}
await Promise.all(Array.from({length:6},async()=>{while(cursor<targets.length){const x=targets[cursor++];try{await check(x);}catch(e){results.push({key:x.key,error:String(e)});console.log(x.key,'ERROR',String(e));}}}));
results.sort((a,b)=>a.key.localeCompare(b.key));
const failures=results.filter(r=>r.error||!r.checks?.published||!r.checks.apiBody&&!r.checks.publicBody);
fs.writeFileSync('deploy/wp-depth/verification/wordpress-live.json',JSON.stringify({verifiedAt:new Date().toISOString(),total:results.length,passed:results.length-failures.length,failures,results},null,2));
console.log('Verified',results.length,'WordPress science articles;',failures.length,'failures');
if(failures.length)process.exitCode=1;
