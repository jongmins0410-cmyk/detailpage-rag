import { search } from './search.mjs';
import { buildMessages } from './prompt.mjs';
import { chat, checkOllama } from './ollama.mjs';
import { parseArgs, isMain, reportError, writeJSON, resolveLogPath } from './utils.mjs';
export async function ask(question, { k = 3, noRag = false, onToken, onPrompt, store, modelInfo } = {}) {
  const startedAt = new Date().toISOString();
  const start = performance.now();
  const info = modelInfo || await checkOllama();
  const retrieval = noRag ? null : await search(question, k, store);
  const messages = buildMessages(question, retrieval, noRag);
  onPrompt?.(messages);
  const generated = await chat(messages, { onToken, modelInfo: info });
  const citedIds = [...new Set(generated.answer.match(/DP-\d{3}/g) || [])];
  const retrievedIds = new Set(retrieval?.results.map(r => r.id) || []);
  return { startedAt, finishedAt: new Date().toISOString(), mode: noRag ? 'no-rag' : 'rag', question, settings: { k, temperature: 0, seed: 42, numPredict: 320, think: false }, retrieval, messages, ...generated, citedIds, unknownCitations: citedIds.filter(id => !retrievedIds.has(id)), elapsedMs: Math.round(performance.now() - start) };
}
if (isMain(import.meta.url)) (async () => {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) { console.log('node src/ask.mjs "질문" [--k 3] [--no-rag] [--show-prompt] [--json] [--log .local-logs/demo.json]'); return; }
  const logPath = options.log ? resolveLogPath(options.log) : null;
  if (!options.json) console.log('상세페이지 제작 준비 안내 | ' + (options.noRag ? '자료 없는 비교 모드' : '교육용 자료 기반 RAG'));
  const result = await ask(options.question, { ...options, onToken: options.json ? undefined : token => process.stdout.write(token), onPrompt: options.showPrompt ? messages => console.error('\n[실제로 전달하는 프롬프트]\n' + JSON.stringify(messages,null,2)) : undefined });
  if (options.json) console.log(JSON.stringify(result,null,2));
  else {
    console.log('\n\n검색된 참고 자료 (검색됐다고 모두 답의 근거인 것은 아닙니다):');
    if (!result.retrieval) console.log('없음: --no-rag 모드');
    else {
      if (result.retrieval.weak) console.log('주의: 관련 자료가 약합니다.');
      for (const c of result.retrieval.results) console.log('['+c.id+'] '+c.section+' | '+c.score.toFixed(4)+'\n'+c.url);
    }
    if (result.unknownCitations.length) console.log('주의: 검색되지 않은 인용 ID가 있습니다: ' + result.unknownCitations.join(', '));
    if (result.doneReason === 'length') console.log('주의: 생성 길이 제한으로 답변이 잘렸을 수 있습니다.');
  }
  if (logPath) { await writeJSON(logPath,result); console.error('비공개 실행 원문 저장 완료: ' + options.log); }
})().catch(reportError);
