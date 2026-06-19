#!/usr/bin/env node
// vault 결정적 린트 — '형식(기계)' 검사만 담당한다. '의미(모순·낡은 정보)' 검사는 /점검에서 AI가 한다.
// (영상의 2겹 린트: 기계는 형식을, AI는 의미를)
//
// office-api.js의 scanGraph(위키링크 그래프·ghost 노드 탐지) 로직을 워크스페이스 단독 실행용으로 옮긴 것.
// server/ 는 고객 워크스페이스에 동봉되지 않으므로 import할 수 없다 → 의도적으로 self-contained(의존성 0).
//
// 사용: node .claude/scripts/lint-vault.mjs [vault경로=./vault]
import fs from 'node:fs'
import path from 'node:path'

const VAULT = path.resolve(process.cwd(), process.argv[2] || 'vault')
if (!fs.existsSync(VAULT)) {
  console.error(`[lint] vault 폴더를 찾을 수 없습니다: ${VAULT}`)
  process.exit(2)
}

// 카탈로그·시스템·거버넌스 파일(사실 노트가 아님): 고아 후보에서 제외하고, '들어오는 링크' 출처로도 세지 않는다.
// 결정로그·회사정보는 office-api.js protectedReason의 '회사 거버넌스(영구 보존)' — index.md 카탈로그 대상이 아니다.
const SYSTEM = new Set(['index', 'log', '가이드라인', 'README', '대표_대화로그', '환영합니다!', '🏠 홈', '시작 가이드', '스킬 인덱스', '결정로그', '회사정보'])
const FACT_FOLDERS = ['공통', '마케팅', '전략', '운영', '검토', '총괄']

const title = f => path.basename(f).replace(/\.md$/, '')
function walk(dir, skipDir = () => false) {
  const out = []
  if (!fs.existsSync(dir)) return out
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue            // .trash, .obsidian, .git 제외
    const fp = path.join(dir, e.name)
    if (e.isDirectory()) { if (!skipDir(e.name)) out.push(...walk(fp, skipDir)); continue }
    if (e.name.endsWith('.md')) out.push(fp)
  }
  return out
}
function linksOf(fp) {
  const txt = fs.readFileSync(fp, 'utf8')
  const re = /\[\[([^\]]+)\]\]/g
  const seen = new Set(), list = []
  let m
  while ((m = re.exec(txt))) {
    const t = m[1].split('|')[0].split('#')[0].trim()  // [[제목|별칭]], [[제목#소제목]] 정규화
    if (t && !seen.has(t)) { seen.add(t); list.push(t) }
  }
  return list
}

// 1) 존재하는 노트 제목 집합 (템플릿 제외, 그 외 전부 — 01_원문·02_외부자료로의 링크도 해소되도록)
const allMd = walk(VAULT, n => n === '_템플릿')
const titles = new Set(allMd.map(title))

// 2) 링크 출처로 스캔할 '위키' 영역만 (불변 원문층 01_원문·02_외부자료·템플릿은 링크 검사 제외)
const GV = path.join(VAULT, '00_지식금고')
const sources = [...walk(GV), ...walk(path.join(VAULT, '10_회의록')), ...walk(path.join(VAULT, '90_산출물'))]

// 3) 깨진 링크 + 들어오는 링크 카운트(고아 판정용; 카탈로그/시스템 출처는 제외)
const broken = []
const incoming = new Map()
for (const fp of sources) {
  const src = title(fp)
  const isCatalog = SYSTEM.has(src)
  for (const tgt of linksOf(fp)) {
    if (!titles.has(tgt)) broken.push({ from: path.relative(VAULT, fp).replaceAll('\\', '/'), to: tgt })
    if (!isCatalog && tgt !== src) incoming.set(tgt, (incoming.get(tgt) || 0) + 1)
  }
}

// 4) 고아 노트: 분야 폴더 사실 노트 중 (카탈로그 외) 들어오는 링크가 0개
const orphans = []
for (const folder of FACT_FOLDERS) {
  for (const fp of walk(path.join(GV, folder))) {
    const t = title(fp)
    if (SYSTEM.has(t)) continue
    if (!(incoming.get(t) > 0)) orphans.push(path.relative(VAULT, fp).replaceAll('\\', '/'))
  }
}

// 5) 인덱스 정합성: 카탈로그에 있으나 파일 없음(유령) / 파일 있으나 카탈로그에 없음(미등록)
function indexCheck(indexFile, noteFolders) {
  if (!fs.existsSync(indexFile)) return { missing: true, phantom: [], unlisted: [] }
  const listed = new Set(linksOf(indexFile))
  const phantom = [...listed].filter(t => !titles.has(t))
  const actual = []
  for (const folder of noteFolders) for (const fp of walk(folder)) { const t = title(fp); if (!SYSTEM.has(t)) actual.push(t) }
  const unlisted = actual.filter(t => !listed.has(t))
  return { missing: false, phantom, unlisted }
}
const idxFact = indexCheck(path.join(GV, 'index.md'), FACT_FOLDERS.map(f => path.join(GV, f)))
const idxSkill = indexCheck(path.join(GV, '스킬', '스킬 인덱스.md'), [path.join(GV, '스킬')])

// ── 출력 (사람이 읽는 텍스트 + 마지막에 기계용 요약 1줄) ──
const out = []
out.push(`# vault 린트 (기계 검사) — ${path.relative(process.cwd(), VAULT) || VAULT}`)
out.push(`스캔: 노트 ${allMd.length}개 / 위키 출처 ${sources.length}개\n`)

out.push(`## 깨진 위키링크 (${broken.length})`)
out.push(broken.length ? broken.map(b => `- ${b.from} → [[${b.to}]] (대상 노트 없음)`).join('\n') : '- 없음')

out.push(`\n## 고아 노트 — 들어오는 링크 0 (${orphans.length})`)
out.push(orphans.length ? orphans.map(o => `- ${o}`).join('\n') : '- 없음')

function idxReport(name, r) {
  out.push(`\n## ${name} 정합성`)
  if (r.missing) { out.push('- (인덱스 파일 없음)'); return }
  out.push(`- 유령 항목(목록엔 있으나 파일 없음) ${r.phantom.length}: ${r.phantom.map(t => `[[${t}]]`).join(', ') || '없음'}`)
  out.push(`- 미등록(파일은 있으나 목록에 없음) ${r.unlisted.length}: ${r.unlisted.map(t => `[[${t}]]`).join(', ') || '없음'}`)
}
idxReport('index.md (사실 노트)', idxFact)
idxReport('스킬 인덱스 (노하우)', idxSkill)

const total = broken.length + orphans.length + idxFact.phantom.length + idxFact.unlisted.length + idxSkill.phantom.length + idxSkill.unlisted.length
out.push(`\n## 요약: 형식 이슈 ${total}건`)
out.push('[LINT]' + JSON.stringify({
  broken: broken.length, orphans: orphans.length,
  indexPhantom: idxFact.phantom.length + idxSkill.phantom.length,
  indexUnlisted: idxFact.unlisted.length + idxSkill.unlisted.length,
}) + '[/LINT]')

console.log(out.join('\n'))
