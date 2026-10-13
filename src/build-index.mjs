import { EMBEDDING_CONTRACT, embedDocument } from './embedder.mjs';
import { loadCorpus, validateLocalSources } from './corpus.mjs';
import { resolveProject, writeJSON, sha256, isMain, reportError } from './utils.mjs';
export async function buildIndex() {
  const input = await loadCorpus();
  await validateLocalSources(input);
  const started = performance.now();
  const chunks = [];
  for (const chunk of input) {
    console.error('인덱싱 ' + (chunks.length + 1) + '/' + input.length + ': ' + chunk.id);
    chunks.push({ ...chunk, vector: await embedDocument(chunk) });
  }
  const store = { ...EMBEDDING_CONTRACT, createdAt: new Date().toISOString(), corpusHash: sha256(input), chunks };
  await writeJSON(resolveProject('data', 'vectors.json'), store);
  console.log(JSON.stringify({ chunks: chunks.length, dim: store.dim, elapsedMs: Math.round(performance.now() - started), createdAt: store.createdAt }, null, 2));
  return store;
}
if (isMain(import.meta.url)) buildIndex().catch(reportError);
