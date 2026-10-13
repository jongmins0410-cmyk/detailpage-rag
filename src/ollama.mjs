export const LLM_MODEL = 'qwen3.5:2b';
export function timeoutSetting(value = process.env.OLLAMA_TIMEOUT_MS || '300000') {
  const result = Number(value);
  if (!Number.isInteger(result) || result < 1000 || result > 900000) throw new Error('OLLAMA_TIMEOUT_MS는 1000~900000 사이 정수여야 합니다.');
  return result;
}
export function localHost(value = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434') {
  const url = new URL(value);
  if (!['localhost','127.0.0.1','[::1]'].includes(url.hostname) || !['http:','https:'].includes(url.protocol) || url.username || url.password) throw new Error('로컬 전용 과제입니다. OLLAMA_HOST는 인증정보 없는 localhost/127.0.0.1 주소여야 합니다.');
  return url.origin;
}
export async function checkOllama() {
  if (process.env.OLLAMA_MODEL && process.env.OLLAMA_MODEL !== LLM_MODEL) throw new Error('과제 비교 모델은 qwen3.5:2b로 고정되어 있습니다. OLLAMA_MODEL을 해제하세요.');
  const host = localHost();
  let response;
  try { response = await fetch(host + '/api/tags', { signal: AbortSignal.timeout(7000) }); }
  catch { throw new Error('Ollama에 연결할 수 없습니다. Ollama 앱을 실행하거나 ollama serve 후 다시 시도하세요.'); }
  if (!response.ok) throw new Error('Ollama 모델 목록 HTTP ' + response.status);
  const data = await response.json();
  const model = data.models?.find(m => m.name === LLM_MODEL || m.model === LLM_MODEL);
  if (!model) throw new Error('모델이 없습니다. ollama pull ' + LLM_MODEL + ' 실행 후 다시 시도하세요.');
  return { host, model: LLM_MODEL, digest: model.digest || null, details: model.details || null };
}
// NDJSON은 네트워크 청크 경계와 JSON 줄 경계가 다를 수 있다.
export async function readNDJSON(stream, onObject) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  const parse = line => { if (line.trim()) onObject(JSON.parse(line)); };
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      let newline;
      while ((newline = pending.indexOf('\n')) >= 0) { parse(pending.slice(0,newline)); pending = pending.slice(newline+1); }
    }
    pending += decoder.decode();
    parse(pending);
  } finally { reader.releaseLock(); }
}
export async function chat(messages, { onToken = () => {}, signal, modelInfo } = {}) {
  const info = modelInfo || await checkOllama();
  const timeoutMs = timeoutSetting();
  const combined = signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
  let response;
  try {
    response = await fetch(info.host + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: combined,
      body: JSON.stringify({ model: LLM_MODEL, messages, stream: true, think: false, options: { temperature: 0, seed: 42, num_predict: 320, num_ctx: 8192 } }) });
  } catch (error) { throw new Error('Ollama 요청 실패 또는 시간 초과: ' + error.message); }
  if (!response.ok) throw new Error('Ollama 답변 HTTP ' + response.status + ': ' + (await response.text()).slice(0,200));
  if (!response.body) throw new Error('Ollama 응답 본문이 없습니다.');
  let answer = '', final = null;
  await readNDJSON(response.body, item => {
    if (item.error) throw new Error(item.error);
    if (item.message?.content) { answer += item.message.content; onToken(item.message.content); }
    if (item.done) final = item;
  });
  if (!final) throw new Error('스트림이 완료 신호 없이 종료됐습니다. 부분 응답을 완료로 취급하지 않습니다.');
  if (!answer.trim()) throw new Error('빈 답변입니다. 모델 상태를 확인하세요.');
  return { answer, model: LLM_MODEL, modelDigest: info.digest, doneReason: final.done_reason || null, usage: { promptTokens: final.prompt_eval_count ?? null, answerTokens: final.eval_count ?? null, totalDurationNs: final.total_duration ?? null } };
}
