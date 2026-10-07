import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {renderMarkdown} from './enrich-science.mjs';
const repo=process.cwd(), out=path.join(repo,'deploy/wp-depth/prepared');
fs.mkdirSync(out,{recursive:true});
execFileSync('git',['clone','--depth=1','https://github.com/jannesar-sciencee/jannesar-sciencee.github.io.git','/tmp/jannesar-reference'],{stdio:'inherit'});
fs.writeFileSync('/tmp/remaining.tar.gz',Buffer.concat(fs.readdirSync('deploy/remaining-184').filter(n=>n.startsWith('remaining184.tar.gz.part-')).sort().map(n=>fs.readFileSync('deploy/remaining-184/'+n))));
fs.mkdirSync('/tmp/wp-worker-originals',{recursive:true});
execFileSync('tar',['-xzf','/tmp/remaining.tar.gz','-C','/tmp/wp-worker-originals']);
const cleanTitle=s=>s.replace(/^(?:تحلیل ساختاری|خوانش تحلیلی|مرور مسئله‌محور|بازخوانی علمی|راهنمای مفهومی):\s*/,'').replace(/^حسین جان[\s‌-]*نثار\s*[-–]\s*/,'').replace(/\s*[-–]\s*(تألیف|تدوین|نویسنده|مؤلف|تحقیق|پژوهش).*$/,'').trim();
const plain=s=>s.replace(/<[^>]*>/g,' ').replace(/&[^;]+;/g,' ').replace(/[\\#$*_=]/g,' ').replace(/\s+/g,' ').trim();
const words=s=>plain(s).split(' ').length;
const docs=[];
const add=(title,sections,refs,source)=>{if(sections.length)docs.push({title:cleanTitle(title),sections,refs,source});};
function mdDocument(text,source){
 text=text.replace(/^---\n[\s\S]*?\n---\n/,'').split(/\n## هویت نویسنده|\n## شبکه ثابت/)[0];
 const title=(text.match(/^# (.*)$/m)||[])[1]||source;
 const pos=text.search(/\n## منابع/),refs=pos>=0?text.slice(pos).replace(/^\n## [^\n]+\n/,''):'';
 const body=pos>=0?text.slice(0,pos):text;
 const sections=body.split(/\n## /).slice(1).map(s=>{const i=s.indexOf('\n');return {heading:s.slice(0,i),body:s.slice(i).trim(),format:'markdown'};}).filter(s=>!/^مقدمه|جمع‌بندی|نتیجه|چکیده|منابع|افق پژوهش|آینده|شبکه|هویت/.test(s.heading)&&words(s.body)>=20);
 add(title,sections,refs,source);
}
for(const name of fs.readFileSync('deploy/remaining-184/workers.txt','utf8').trim().split(/\r?\n/))mdDocument(fs.readFileSync('/tmp/wp-worker-originals/'+name+'/article.md','utf8'),'worker:'+name);
mdDocument(fs.readFileSync('0/article.md','utf8').split('\n\nهمگام‌سازی دوقلو')[0],'worker:0');
for(const f of fs.readdirSync('deploy/remaining-184').filter(n=>/^science-enrichment-\d+\.json$/.test(n)).sort()){
 const patches=JSON.parse(fs.readFileSync('deploy/remaining-184/'+f,'utf8'));
 for(const [name,text]of Object.entries(patches)){
  for(const part of text.split('\n## تحلیل تکمیلی: ').slice(1)){
   const i=part.indexOf('\n'),title=part.slice(0,i),refsPos=part.search(/\n### منابع این بخش/);
   const body=refsPos>=0?part.slice(i,refsPos):part.slice(i),refs=refsPos>=0?part.slice(refsPos).replace(/^\n### [^\n]+\n/,''):'';
   const sections=body.split(/\n### /).slice(1).map(s=>{const p=s.indexOf('\n');return{heading:s.slice(0,p),body:s.slice(p).trim(),format:'markdown'};});
   add(title,sections,refs,'worker-addition:'+name);
  }
 }
}
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);}
for(const file of walk('/tmp/jannesar-reference/articles').filter(f=>f.endsWith('/index.html'))){
 const text=fs.readFileSync(file,'utf8');
 const h1=(text.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)||[])[1];if(!h1)continue;
 const main=text.slice(text.indexOf('</header>')+9).split('<details class="identity"')[0];
 const blocks=Array.from(main.matchAll(/<section([^>]*)>([\s\S]*?)<\/section>/g));
 let refs='';const sections=[];
 for(const m of blocks){if(/class="sources"/.test(m[1])){refs=m[2].replace(/<h2[^>]*>[\s\S]*?<\/h2>/,'').replace(/<p class="note">[\s\S]*?<\/p>/,'');continue;}if(/related/.test(m[1]))continue;
  const h=(m[2].match(/<h2[^>]*>([\s\S]*?)<\/h2>/)||[])[1];
  if(!h||/منابع|مرتبط|نویسنده|هویت|جمع‌بندی|مقدمه/.test(h))continue;
  const body=m[2].replace(/<h2[^>]*>[\s\S]*?<\/h2>/,'');
  if(words(body)>=20)sections.push({heading:plain(h),body,format:'html'});
 }
 add(plain(h1),sections,refs,'reference:'+file.replace('/tmp/jannesar-reference/',''));
}
const stop=new Set('حسین عطار جان نثار جاننثار نوبری نویسنده علمی مقاله مطالعه تحلیل مبانی بررسی سامانه سامانه‌های کاربرد نقش روش روش‌های برای و در از به با است یک این آن طراحی مدل'.split(' '));
const tokens=s=>new Set(plain(s).replace(/[ي]/g,'ی').replace(/[ك]/g,'ک').replace(/‌/g,' ').match(/[\p{L}\p{N}]+/gu)?.filter(x=>!stop.has(x)&&x.length>1)||[]);
const overlap=(a,b)=>Array.from(a).filter(x=>b.has(x)).length;
const paraCount=new Map();for(const d of docs)for(const s of d.sections)for(const p of s.body.split(/\n\n|(?<=<\/p>)/)){const k=plain(p);if(words(k)>=20)paraCount.set(k,(paraCount.get(k)||0)+1);}
for(const d of docs)d.sections=d.sections.map(s=>({...s,body:s.body.split(/\n\n|(?<=<\/p>)/).filter(p=>(paraCount.get(plain(p))||0)<8).join('\n\n')})).filter(s=>words(s.body)>=20);
const unique=new Map();for(const d of docs){const old=unique.get(d.title);if(!old||words(d.sections.map(s=>s.body).join(' '))>words(old.sections.map(s=>s.body).join(' ')))unique.set(d.title,d);}
const corpus=Array.from(unique.values());
fs.writeFileSync(path.join(out,'catalog.json'),JSON.stringify(corpus.map((d,id)=>({id,title:d.title,source:d.source,words:words(d.sections.map(s=>s.body).join(' ')),headings:d.sections.map(s=>s.heading)}))));
const index=JSON.parse(fs.readFileSync('deploy/wp-depth/targets.json','utf8'));
const overrides=JSON.parse(fs.readFileSync('deploy/wp-depth/overrides.json','utf8'));
const custom=JSON.parse(fs.readFileSync('deploy/wp-depth/custom.json','utf8'));
const manifest=[],prepared=[];
for(const x of index){
 const topic=x.title.split(' – ')[1],tt=tokens(topic);
 const ranked=corpus.map(d=>({d,score:overlap(tt,tokens(d.title))*5+overlap(tt,tokens(d.sections.map(s=>s.body).join(' ').slice(0,1500)))})).sort((a,b)=>b.score-a.score);
 let body='',selected=[];
 if(custom[x.key])body=renderMarkdown(custom[x.key]);
 else{
  const requested=overrides[x.key];
  const used=requested?requested.map(q=>({d:corpus.find(d=>d.source===q),score:100})).filter(a=>a.d):ranked.filter(v=>v.score>=5).slice(0,1);
  for(const {d,score}of used){
   const candidates=d.sections.map((s,i)=>({s,i,score:overlap(tt,tokens(s.heading+' '+s.body.slice(0,500)))*3+Math.min(words(s.body),180)/180})).sort((a,b)=>b.score-a.score);
   const pick=[];let count=0;
   for(const a of candidates){if(count>=550||pick.length>=5)break;if(words(a.s.body)>800)continue;pick.push(a);count+=words(a.s.body);}
   pick.sort((a,b)=>a.i-b.i);if(!pick.length)continue;
   body+='<h3>تحلیل تکمیلی: '+d.title+'</h3>\n';
   for(const {s}of pick)body+='<h4>'+s.heading+'</h4>\n'+(s.format==='html'?s.body:renderMarkdown(s.body))+'\n';
   body+='<h4>منابع این بخش</h4>\n'+(d.refs.includes('<ol')?d.refs:renderMarkdown(d.refs))+'\n';
   selected.push({title:d.title,source:d.source,score,words:count});
  }
 }
 if(body&&!/<h1\b|<img\b|<script\b|<iframe\b|<style\b/i.test(body)){
  const markup='<!-- wp:group {"className":"science-depth-20261007","layout":{"type":"constrained","contentSize":"760px"}} -->\n<div class="wp-block-group science-depth-20261007">\n<!-- wp:html -->\n<h2>تحلیل علمی تکمیلی</h2>\n'+body+'\n<!-- /wp:html -->\n</div>\n<!-- /wp:group -->';
  prepared.push({...x,block_markup:markup,added_words:words(body)});
 }
 manifest.push({key:x.key,topic,custom:!!custom[x.key],selected,words:words(body),candidates:ranked.slice(0,8).map(a=>({title:a.d.title,source:a.d.source,score:a.score}))});
}
for(let i=0;i<prepared.length;i+=6)fs.writeFileSync(path.join(out,'payloads-'+String(1+i/6).padStart(2,'0')+'.json'),JSON.stringify(prepared.slice(i,i+6)));
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2));
fs.writeFileSync(path.join(out,'index.json'),JSON.stringify(prepared.map(({block_markup,...rest})=>rest)));
fs.writeFileSync(path.join(out,'preparation-summary.json'),JSON.stringify({corpus:corpus.length,prepared:prepared.length,targets:index.length,custom:Object.keys(custom).length}));
console.log({corpus:corpus.length,prepared:prepared.length});
