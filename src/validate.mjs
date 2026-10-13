import { loadCorpus, validateLocalSources, loadStore } from './corpus.mjs';
import { isMain, reportError } from './utils.mjs';
export async function validateProject() {
  const chunks = await loadCorpus();
  await validateLocalSources(chunks);
  const store = await loadStore();
  return { ok: true, chunks: chunks.length, vectors: store.chunks.length, dimension: store.dim, corpusHash: store.corpusHash, checkedAt: new Date().toISOString(), note: '공개 URL의 현재 HTTP 상태/내용은 docs/sources.md와 별도 관찰 기록으로 확인합니다.' };
}
if (isMain(import.meta.url)) validateProject().then(result => console.log(JSON.stringify(result,null,2))).catch(reportError);
