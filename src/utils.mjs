import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const resolveProject = (...parts) => path.join(ROOT, ...parts);
export const isMain = url => Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(url);
export const sha256 = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export async function readJSON(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) { throw new Error('JSON 읽기 실패: ' + path.relative(ROOT, file) + ' (' + error.message + ')'); }
}
export async function writeJSON(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file + '.tmp', JSON.stringify(value, null, 2) + '\n', 'utf8');
  await fs.rename(file + '.tmp', file);
}
export function parseArgs(args) {
  const options = { k: 3, noRag: false, showPrompt: false, json: false, help: false, question: '', log: null };
  const words = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--no-rag') options.noRag = true;
    else if (arg === '--show-prompt') options.showPrompt = true;
    else if (arg === '--json') options.json = true;
    else if (arg === '--k') {
      const value = args[++i];
      if (!value || !/^\d+$/.test(value) || +value < 1 || +value > 20) throw new Error('--k는 1~20 사이 정수입니다.');
      options.k = +value;
    } else if (arg === '--log') {
      options.log = args[++i];
      if (!options.log || options.log.startsWith('--')) throw new Error('--log 뒤에 저장할 JSON 경로가 필요합니다.');
    } else if (arg.startsWith('--')) throw new Error('알 수 없는 옵션: ' + arg);
    else words.push(arg);
  }
  options.question = words.join(' ').trim();
  if (!options.help && !options.question) throw new Error('질문을 입력하세요. 예: node src/ask.mjs "제작 전 무엇을 준비하나요?"');
  if (options.question.length > 4000) throw new Error('질문은 4,000자 이내로 입력하세요.');
  return options;
}
export function reportError(error) { console.error('오류: ' + error.message); process.exitCode = 1; }

export function resolveLogPath(value) {
  const root = resolveProject('.local-logs');
  const file = path.resolve(ROOT, value);
  if (!file.startsWith(root + path.sep) || !file.endsWith('.json')) throw new Error('--log는 Git에서 제외되는 .local-logs/ 안의 JSON 파일만 허용합니다.');
  return file;
}
