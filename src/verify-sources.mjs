import { createHash } from 'node:crypto';
import { loadCorpus } from './corpus.mjs';
import { resolveProject, writeJSON, isMain, reportError } from './utils.mjs';
export async function verifySources() {
  const corpus=await loadCorpus();
  const urls=[...new Set(corpus.filter(c=>c.url.startsWith('https://')).map(c=>c.url))];
  const checks=await Promise.all(urls.map(async url=>{
    const observedAt=new Date().toISOString();
    try {
      const response=await fetch(url,{signal:AbortSignal.timeout(45000)});
      const html=await response.text();
      const title=html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g,' ').trim()||null;
      return {url,finalUrl:response.url,observedAt,status:response.status,ok:response.ok,title,bodyBytes:Buffer.byteLength(html),sha256:createHash('sha256').update(html).digest('hex'),chunkIds:corpus.filter(c=>c.url===url).map(c=>c.id),note:'HTTP 접근과 문서 동일성 확인용. 의미·요약 정확성은 docs/sources.md와 실제 원문 검토가 별도로 필요하다.'};
    } catch(error) {return {url,observedAt,ok:false,error:error.message};}
  }));
  await writeJSON(resolveProject('experiments','source-check.json'),checks);
  console.log(JSON.stringify(checks,null,2));
  if(checks.some(c=>!c.ok))process.exitCode=1;
}
if(isMain(import.meta.url))verifySources().catch(reportError);
