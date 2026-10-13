import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOT, resolveProject, readJSON, sha256 } from './utils.mjs';
import { EMBEDDING_CONTRACT, validateVector } from './embedder.mjs';
export function validateChunks(chunks) {
  if (!Array.isArray(chunks) || !chunks.length) throw new Error('청크 배열이 비어 있습니다.');
  const ids = new Set();
  for (const chunk of chunks) {
    for (const key of ['id', 'text', 'url', 'section']) if (typeof chunk[key] !== 'string' || !chunk[key].trim()) throw new Error('청크 필드 누락: ' + key);
    if (!/^DP-\d{3}$/.test(chunk.id) || ids.has(chunk.id)) throw new Error('청크 ID 오류 또는 중복: ' + chunk.id);
    ids.add(chunk.id);
    if (chunk.text.length < 120) throw new Error(chunk.id + ': 독립된 사실 단위 본문이 120자보다 짧습니다.');
    if (chunk.text.includes('[검증 필요]')) throw new Error(chunk.id + ': 출처 검증이 완료되지 않았습니다.');
    if (chunk.url.startsWith('https://')) {
      let parsed; try { parsed = new URL(chunk.url); } catch { throw new Error(chunk.id + ': 출처 URL 형식 오류'); }
      if (!parsed.hostname || parsed.username || parsed.password) throw new Error(chunk.id + ': 출처에 인증정보를 넣을 수 없습니다.');
    } else if (!/^docs\/[^?#]+\.md#[A-Za-z0-9_-]+$/.test(chunk.url)) throw new Error(chunk.id + ': 출처 형식 오류');
  }
  return chunks;
}
export async function validateLocalSources(chunks) {
  for (const chunk of chunks.filter(c => c.url.startsWith('docs/'))) {
    const [file, anchor] = chunk.url.split('#');
    const full = path.resolve(ROOT, file);
    if (!full.startsWith(ROOT + path.sep)) throw new Error('프로젝트 밖 출처는 허용하지 않습니다.');
    const markdown = await fs.readFile(full, 'utf8');
    if (!markdown.includes('id="' + anchor + '"')) throw new Error(chunk.id + ': 출처 앵커가 없습니다.');
    if (!markdown.includes(chunk.text)) throw new Error(chunk.id + ': 원문과 청크 본문이 일치하지 않습니다.');
  }
  const external = chunks.filter(c => c.url.startsWith('https://'));
  if (external.length) {
    const checks = await readJSON(resolveProject('experiments','source-check.json'));
    for (const chunk of external) if (!checks.some(check => check.url === chunk.url && check.ok === true && check.chunkIds?.includes(chunk.id))) throw new Error(chunk.id + ': 공개 출처 확인 기록과 불일치합니다. node src/verify-sources.mjs로 확인하세요.');
  }
}
export function validateStore(store, chunks) {
  for (const [key, expected] of Object.entries(EMBEDDING_CONTRACT)) {
    if (store[key] !== expected) throw new Error('임베딩 계약 불일치 (' + key + '). node src/build-index.mjs로 다시 만드세요.');
  }
  if (store.corpusHash !== sha256(chunks)) throw new Error('청크가 변경되어 인덱스가 오래되었습니다. node src/build-index.mjs로 다시 만드세요.');
  if (!Array.isArray(store.chunks) || store.chunks.length !== chunks.length) throw new Error('청크/벡터 수 불일치');
  for (let i = 0; i < chunks.length; i++) {
    for (const field of ['id','text','url','section']) if (store.chunks[i][field] !== chunks[i][field]) throw new Error('원문/인덱스 불일치: ' + chunks[i].id);
    validateVector(store.chunks[i].vector);
  }
  return store;
}
export async function loadCorpus() { return validateChunks(await readJSON(resolveProject('data', 'chunks.json'))); }
export async function loadStore() {
  const chunks = await loadCorpus();
  return validateStore(await readJSON(resolveProject('data', 'vectors.json')), chunks);
}
