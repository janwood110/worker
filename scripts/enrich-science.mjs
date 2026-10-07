import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const renderRoot = process.env.SCIENCE_RENDER_ROOT || '/tmp/nobari-science-render/node_modules';
const {marked}=await import(pathToFileURL(path.join(renderRoot,'marked/lib/marked.esm.js')).href);
const {default:katex}=await import(pathToFileURL(path.join(renderRoot,'katex/dist/katex.mjs')).href);
const escape=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
let invalidMath=0;
const correctionsFile='deploy/scientific-corrections.json';
const corrections=fs.existsSync(correctionsFile)?JSON.parse(fs.readFileSync(correctionsFile,'utf8')):{};
const correctBody=(text,name)=>(corrections[name]||[]).reduce((s,[from,to])=>s.replaceAll(from,to),text);
export function renderMarkdown(markdown){
  const maths=[];
  const place=(value,display)=>{
    let output;
    try{output=katex.renderToString(value.trim(),{output:'mathml',displayMode:display,throwOnError:true,strict:'ignore',trust:false});}
    catch{invalidMath++;output=`<code dir="ltr">${escape(value.trim())}</code>`;}
    const html=display?`<div style="direction:ltr;overflow-x:auto;margin:1em 0;text-align:center">${output}</div>`:output;
    const token=`SCIMATHPLACEHOLDER${maths.length}END`;maths.push({token,html});return token;
  };
  let prepared=markdown.replace(/\\\[([\s\S]*?)\\\]/g,(_,s)=>place(s,true)).replace(/\$\$([\s\S]*?)\$\$/g,(_,s)=>place(s,true));
  prepared=prepared.replace(/\\\((.*?)\\\)/g,(_,s)=>place(s,false)).replace(/(?<!\\)\$([^$\n]+)\$/g,(_,s)=>place(s,false));
  let result=marked.parse(prepared,{gfm:true,breaks:false});
  for(const {token,html}of maths)result=result.replaceAll(`<p>${token}</p>`,html).replaceAll(token,html);
  if(/<h1\b|<img\b|<script\b|<iframe\b|<style\b/i.test(result))throw new Error('Protected or active markup in scientific addition.');
  return result;
}
const frozen=html=>({head:(html.match(/<head\b[^>]*>[\s\S]*?<\/head>/i)||[])[0],h1:html.match(/<h1\b[^>]*>[\s\S]*?<\/h1>/gi)||[],images:html.match(/<img\b[^>]*>/gi)||[],scripts:html.match(/<script\b[^>]*>[\s\S]*?<\/script>/gi)||[],identity:(html.match(/<h2>هویت نویسنده[\s\S]*?<\/article>/)||[])[0]});
export function enrichWorker(site,markdown){
  const htmlFile=path.join(site,'index.html');
  const before=fs.readFileSync(htmlFile,'utf8');
  if(before.includes('data-science-depth="2026-10-07"'))throw new Error(`Addition already present: ${site}`);
  const anchor=before.search(/<h2\b[^>]*>\s*منابع علمی/);
  if(anchor<0)throw new Error(`Scientific references anchor absent: ${site}`);
  const added=`\n<section data-science-depth="2026-10-07" dir="rtl">\n${renderMarkdown(markdown)}\n</section>\n`;
  const after=correctBody(before.slice(0,anchor)+added+before.slice(anchor),path.basename(site));
  if(JSON.stringify(frozen(before))!==JSON.stringify(frozen(after)))throw new Error(`Protected content changed: ${site}`);
  fs.writeFileSync(htmlFile,after);
  const mdFile=path.join(site,'article.md');
  const original=fs.readFileSync(mdFile,'utf8');
  const actualAnchor=original.search(/\n## منابع علمی/);
  if(actualAnchor<0)throw new Error(`Markdown references anchor absent: ${site}`);
  fs.writeFileSync(mdFile,correctBody(original.slice(0,actualAnchor)+'\n\n'+markdown+'\n\n'+original.slice(actualAnchor),path.basename(site)));
}
if(process.argv[2]==='--render'){
  const input=JSON.parse(fs.readFileSync(0,'utf8'));
  process.stdout.write(JSON.stringify(input.map(item=>({...item,html:renderMarkdown(item.markdown)}))));
}else if(process.argv[2]==='--apply'){
  const base=process.argv[3];
  const patchDir=process.argv[4]||'deploy/remaining-184';
  const patches={};
  for(const file of fs.readdirSync(patchDir).filter(f=>/^science-enrichment-\d+\.json$/.test(f)).sort())Object.assign(patches,JSON.parse(fs.readFileSync(path.join(patchDir,file),'utf8')));
  const names=fs.readFileSync(path.join(patchDir,'workers.txt'),'utf8').trim().split(/\r?\n/);
  if(names.length!==184||new Set(names).size!==184||Object.keys(patches).length!==185||!patches['0'])throw new Error('Target accounting mismatch.');
  for(const name of names){if(!patches[name])throw new Error(`Missing scientific body: ${name}`);enrichWorker(path.join(base,name),patches[name]);}
  console.log(`Enriched ${names.length} packaged Workers; protected head, H1, images, author identity and scripts preserved. Formula fallbacks: ${invalidMath}.`);
}
