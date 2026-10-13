import { embedQuery } from './embedder.mjs';
import { loadStore } from './corpus.mjs';
import { parseArgs, isMain, reportError } from './utils.mjs';
export const WEAK_THRESHOLD = 0.55;
export function cosine(a, b) {
  if (a.length !== b.length || !a.length) throw new Error('벡터 차원이 다릅니다.');
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return Math.max(-1, Math.min(1, dot));
}
export function rankChunks(chunks, vector, k) {
  if (!Number.isInteger(k) || k < 1 || k > 20) throw new Error('k는 1~20 사이 정수여야 합니다.');
  return chunks.map(({ vector: documentVector, ...chunk }) => ({ ...chunk, score: cosine(vector, documentVector) })).sort((a,b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, k);
}
export async function search(question, k = 3, providedStore) {
  if (typeof question !== 'string' || !question.trim()) throw new Error('빈 질문으로 검색할 수 없습니다.');
  if (!Number.isInteger(k) || k < 1 || k > 20) throw new Error('k는 1~20 사이 정수여야 합니다.');
  const store = providedStore || await loadStore();
  const start = performance.now();
  const results = rankChunks(store.chunks, await embedQuery(question), k);
  return { question, k, threshold: WEAK_THRESHOLD, weak: !results.length || results[0].score < WEAK_THRESHOLD, elapsedMs: Math.round(performance.now() - start), results };
}
export function formatSearch(result) {
  const lines = ['질문: ' + result.question, '근거 상태: ' + (result.weak ? '약함 (최고 점수 < ' + WEAK_THRESHOLD + ')' : '검색 기준 충족, 답의 존재/정확성 보장은 아님')];
  for (const [i, c] of result.results.entries()) lines.push('\n' + (i+1) + '. [' + c.id + '] ' + c.score.toFixed(4) + ' | ' + c.section, c.text, '출처: ' + c.url);
  return lines.join('\n');
}
if (isMain(import.meta.url)) (async () => {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) { console.log('node src/search.mjs "질문" [--k 3] [--json]'); return; }
  const result = await search(options.question, options.k);
  console.log(options.json ? JSON.stringify(result, null, 2) : formatSearch(result));
})().catch(reportError);
