import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, sha256 } from '../src/utils.mjs';
import { EMBEDDING_CONTRACT, DIM, documentInput, queryInput, validateVector } from '../src/embedder.mjs';
import { validateChunks, validateStore, loadCorpus, validateLocalSources } from '../src/corpus.mjs';
import { cosine, rankChunks, WEAK_THRESHOLD } from '../src/search.mjs';
import { buildMessages } from '../src/prompt.mjs';
import { readNDJSON, localHost } from '../src/ollama.mjs';
const v = Array.from({length:DIM},(_,i)=>i===0?1:0);
const chunk = {id:'DP-001',text:'교육용 상세페이지 제작 준비 기준입니다. '.repeat(12),url:'docs/sop.md#test',section:'테스트'};
const store = () => ({...EMBEDDING_CONTRACT,corpusHash:sha256([chunk]),chunks:[{...chunk,vector:[...v]}]});
test('CLI: 필수 질문, 허용 옵션과 k 범위를 검사',()=>{
  assert.equal(parseArgs(['무엇을','준비하나요?','--k','2','--no-rag']).question,'무엇을 준비하나요?');
  assert.equal(parseArgs(['--help']).help,true);
  for(const args of [[],['Q','--k','0'],['Q','--k','2.5'],['Q','--k'],['Q','--wat'],['Q','--log']]) assert.throws(()=>parseArgs(args));
});
test('임베딩 입력 형식을 한 모듈에서 통일',()=>{
  assert.equal(documentInput(chunk),'title: 테스트 | text: '+chunk.text);
  assert.equal(queryInput('질문'),'task: search result | query: 질문');
  assert.equal(validateVector(v),v);
  assert.throws(()=>validateVector([1,0]));
  assert.throws(()=>validateVector(Array(DIM).fill(0)));
  const invalid=[...v]; invalid[1]=NaN; assert.throws(()=>validateVector(invalid));
});
test('청크: 중복, 누락, 검증 필요 출처 거절',()=>{
  assert.equal(validateChunks([chunk]).length,1);
  assert.throws(()=>validateChunks([chunk,chunk]));
  assert.throws(()=>validateChunks([{...chunk,text:'짧음'}]));
  assert.throws(()=>validateChunks([{...chunk,url:''}]));
  assert.throws(()=>validateChunks([{...chunk,text:chunk.text+'[검증 필요]'}]));
});
test('인덱스: 다른 모델, 차원, 본문 또는 오래된 해시를 거절',()=>{
  assert.equal(validateStore(store(),[chunk]).chunks.length,1);
  for(const key of ['model','dtype','pooling','queryPrefix']) {const s=store();s[key]='wrong';assert.throws(()=>validateStore(s,[chunk]));}
  const wrong=store();wrong.chunks[0].vector=[1];assert.throws(()=>validateStore(wrong,[chunk]));
  assert.throws(()=>validateStore(store(),[{...chunk,text:chunk.text+'바뀜'}]));
});
test('정규화 벡터 내적, 순위, top-k, 약한 근거 기준',()=>{
  assert.equal(cosine(v,v),1);assert.equal(WEAK_THRESHOLD,0.55);
  assert.throws(()=>cosine([1],[1,2]));
  const other=[...v];other[0]=-1;
  const ranked=rankChunks([{...chunk,vector:other},{...chunk,id:'DP-002',vector:v}],v,1);
  assert.equal(ranked[0].id,'DP-002'); assert.equal('vector' in ranked[0],false);
  assert.throws(()=>rankChunks([],v,0));
});
test('프롬프트: 근거를 데이터로 전달하고 no-rag에서는 제거',()=>{
  const result={weak:true,results:[{...chunk,score:0.3}]};
  const messages=buildMessages('가격은?',result);
  assert.ok(messages[0].content.includes('실제 회사 정책이 아니다'));
  assert.ok(messages[1].content.includes('0.55'));
  assert.ok(messages[1].content.includes('DP-001'));
  const baseline=buildMessages('가격은?',result,true);
  assert.equal(baseline[1].content,'가격은?');assert.equal(baseline.some(m=>m.content.includes(chunk.text)),false);
});
test('Ollama는 로컬 호스트만 허용',()=>{
  assert.equal(localHost('http://127.0.0.1:11434'),'http://127.0.0.1:11434');
  assert.throws(()=>localHost('https://example.com'));assert.throws(()=>localHost('http://user:secret@localhost'));
});
test('NDJSON: 한글 UTF-8·임의 청크 경계·마지막 줄 처리',async()=>{
  const text='{"message":{"content":"안녕"}}\n{"done":true}';
  const data=new TextEncoder().encode(text);const values=[];
  const stream=new ReadableStream({start(controller){for(let i=0;i<data.length;i+=3)controller.enqueue(data.slice(i,i+3));controller.close();}});
  await readNDJSON(stream,v=>values.push(v));assert.equal(values[0].message.content,'안녕');assert.equal(values[1].done,true);
});
test('실제 코퍼스: 12~15청크 및 로컬 원문/앵커 일치',async()=>{
  const corpus=await loadCorpus();assert.ok(corpus.length>=12&&corpus.length<=15);await validateLocalSources(corpus);
});
