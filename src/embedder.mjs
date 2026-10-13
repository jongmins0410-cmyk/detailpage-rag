import { resolveProject } from './utils.mjs';
export const MODEL = 'onnx-community/embeddinggemma-300m-ONNX';
export const DTYPE = 'q8';
export const DIM = 768;
export const EMBEDDING_CONTRACT = Object.freeze({ model: MODEL, dtype: DTYPE, dim: DIM, pooling: 'mean', normalize: true, documentPrefix: 'title: {section} | text: {text}', queryPrefix: 'task: search result | query: {question}' });
let extractorPromise;
export function documentInput(chunk) { return 'title: ' + chunk.section + ' | text: ' + chunk.text; }
export function queryInput(question) { return 'task: search result | query: ' + question; }
async function extractor() {
  if (!extractorPromise) {
    console.error('임베딩 모델 로딩 중. 첫 실행에는 모델 다운로드가 필요합니다.');
    extractorPromise = (async () => {
      const { pipeline, env } = await import('@huggingface/transformers');
      env.cacheDir = process.env.RAG_CACHE_DIR || resolveProject('.cache');
      let lastFile = '';
      return pipeline('feature-extraction', MODEL, {
        dtype: DTYPE, device: 'cpu',
        session_options: { intraOpNumThreads: 2, interOpNumThreads: 1 },
        progress_callback: progress => {
          if (progress.status === 'download' && progress.file !== lastFile) {
            lastFile = progress.file; console.error('다운로드: ' + progress.file);
          }
        }
      });
    })();
  }
  return extractorPromise;
}
export function validateVector(vector) {
  if (!Array.isArray(vector) || vector.length !== DIM || vector.some(x => !Number.isFinite(x))) throw new Error('유효한 768차원 벡터가 아닙니다.');
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (Math.abs(norm - 1) > 0.02) throw new Error('벡터 정규화 계약 불일치: norm=' + norm);
  return vector;
}
async function embed(input) {
  const model = await extractor();
  const output = await model(input, { pooling: 'mean', normalize: true });
  return validateVector(Array.from(output.data));
}
export const embedDocument = chunk => embed(documentInput(chunk));
export const embedQuery = question => embed(queryInput(question));
