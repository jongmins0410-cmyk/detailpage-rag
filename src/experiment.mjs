import os from 'node:os';
import fs from 'node:fs/promises';
import { loadStore } from './corpus.mjs';
import { search } from './search.mjs';
import { checkOllama } from './ollama.mjs';
import { ask } from './ask.mjs';
import { resolveProject, writeJSON, isMain, reportError } from './utils.mjs';
export const QUESTIONS = [
  {id:'Q1',kind:'정상',question:'상세페이지 제작 전에 어떤 상품 정보를 준비해야 하나요?',expectedIds:['DP-001'],expected:'브랜드·상품 정보와 원본 자료를 안내하고 빈 항목을 추정하지 않는다.'},
  {id:'Q2',kind:'경계',question:'제품 사진이 두 장 있어요. 사진 품질이 좋은지 지금 판단해 줄 수 있나요?',expectedIds:['DP-002'],expected:'CLI는 사진을 보지 못하므로 품질을 확정하지 않고 별도 확인을 안내한다.'},
  {id:'Q3',kind:'정상',question:'제품 효능과 성능 수치를 상세페이지에 쓰기 전에 무엇을 확인하나요?',expectedIds:['DP-003'],expected:'확인 가능한 근거와 적용 조건을 요구한다.'},
  {id:'Q4',kind:'경계',question:'우리 프로젝트 무료 수정은 정확히 몇 번이고 추가 비용은 얼마인가요?',expectedIds:['DP-005','DP-004'],expected:'실제 계약이 없으므로 횟수와 금액을 지어내지 않고 서면 합의를 확인한다.'},
  {id:'Q5',kind:'정상',question:'웹 검색으로 찾은 사진과 폰트를 바로 사용해도 되나요?',expectedIds:['DP-007'],expected:'검색 발견과 사용 권한은 다르며 라이선스·허가를 확인한다.'},
  {id:'Q6',kind:'정상',question:'일반 텍스트와 큰 텍스트의 최소 대비 기준은 각각 얼마인가요?',expectedIds:['DP-012'],expected:'일반 4.5:1, 큰 텍스트 3:1의 조건을 뒤바꾸지 않고 공식 출처를 표시한다.'},
  {id:'Q7',kind:'범위밖',question:'지금 내 쇼핑몰에서 판매 중인 텀블러의 실제 재고가 몇 개인가요?',expectedIds:[],expected:'실시간 재고 연동이 없으므로 수량을 생성하지 않고 실제 관리 시스템 확인을 안내한다.'},
  {id:'Q8',kind:'무관',question:'내일 서울 날씨는 어떤가요?',expectedIds:[],expected:'날씨 자료가 없음을 밝히고 예보를 지어내지 않는다.'},
  {id:'Q9',kind:'무관',question:'김치찌개 만드는 레시피를 알려 주세요.',expectedIds:[],expected:'자료 범위 밖임을 밝히고 검색 문서로 레시피를 만들어내지 않는다.'}
];
export async function runExperiment() {
  const startedAt = new Date().toISOString();
  const runId = startedAt.replace(/[:.]/g,'-');
  const relativeDir = 'experiments/runs/' + runId;
  const output = resolveProject(relativeDir);
  await fs.mkdir(output,{recursive:true});
  const store = await loadStore();
  const modelInfo = await checkOllama();
  const manifest = { name:'RAG 유무 비교 E1',runId,startedAt,status:'running',environment:{node:process.version,platform:process.platform,arch:process.arch,cpu:os.cpus()[0]?.model||null,ramGB:Math.round(os.totalmem()/1024**3)},modelInfo,embedding:{model:store.model,dtype:store.dtype,dim:store.dim,corpusHash:store.corpusHash},settings:{topK:3,temperature:0,seed:42,numPredict:320,think:false},design:'질문 원문·순서·모델·생성 설정은 고정. 기준군은 검색 없는 일반 안내 프롬프트, RAG군은 검색 자료 및 근거 제한 규칙을 사용한다. 따라서 순수 검색 효과만 분리한 인과 실험이 아닌 두 파이프라인의 비교다.',questions:QUESTIONS,searches:[],runs:[]};
  await writeJSON(resolveProject(relativeDir,'manifest.json'),manifest);
  for (const q of QUESTIONS) {
    console.error('[검색] '+q.id+' '+q.question);
    const retrieval=await search(q.question,3,store);
    manifest.searches.push({id:q.id,...retrieval,expectedIds:q.expectedIds,expectedInTop3:q.expectedIds.length?q.expectedIds.some(id=>retrieval.results.some(c=>c.id===id)):null});
    await writeJSON(resolveProject(relativeDir,'searches.json'),manifest.searches);
    for (const noRag of [true,false]) {
      const mode=noRag?'no-rag':'rag';
      console.error('[답변] '+q.id+' '+mode);
      const file=q.id+'-'+mode+'.json';
      try {
        const result=await ask(q.question,{k:3,noRag,store,modelInfo});
        await writeJSON(resolveProject(relativeDir,file),{case:q,...result});
        manifest.runs.push({id:q.id,mode,file:relativeDir+'/'+file,ok:true,elapsedMs:result.elapsedMs,citedIds:result.citedIds,unknownCitations:result.unknownCitations,doneReason:result.doneReason});
      } catch(error) {
        await writeJSON(resolveProject(relativeDir,file),{case:q,mode,error:error.message,observedAt:new Date().toISOString()});
        manifest.runs.push({id:q.id,mode,file:relativeDir+'/'+file,ok:false,error:error.message});
      }
      await writeJSON(resolveProject(relativeDir,'manifest.json'),manifest);
    }
  }
  manifest.finishedAt=new Date().toISOString();
  manifest.status=manifest.runs.every(r=>r.ok)?'completed':'completed-with-errors';
  await writeJSON(resolveProject(relativeDir,'manifest.json'),manifest);
  await writeJSON(resolveProject('experiments','latest.json'),{runId,manifest:relativeDir+'/manifest.json',status:manifest.status});
  console.log(JSON.stringify({runId,status:manifest.status,searches:manifest.searches.length,answers:manifest.runs.length,errors:manifest.runs.filter(r=>!r.ok).length},null,2));
}
if(isMain(import.meta.url))runExperiment().catch(reportError);
