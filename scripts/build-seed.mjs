// seed 빌더 — 고객 배포본에 동봉할 깨끗한 초기 상태를 electron/seed/ 에 생성한다.
//  - .claude/         : 제품 에이전트·스킬·커맨드 (저장소에서 복사)
//  - CLAUDE.md        : 운영 규칙 (electron/claude-template.md — 회사 컨텍스트 빈 마커)
//  - vault-template/  : 회사 실데이터가 전혀 없는 v2 빈 지식금고 골격
//                       (electron/vault-template/ 를 복사 — 카파시 스킬+옵시디언+LLM 위키 구조)
// 주의: 대표님 기밀 vault(저장소의 vault/)는 절대 복사하지 않는다.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const SEED = path.join(ROOT, 'electron', 'seed')
const TPL = path.join(SEED, 'vault-template')

function copyDir(src, dst, skip = () => false) {
  if (!fs.existsSync(src)) return
  fs.mkdirSync(dst, { recursive: true })
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (skip(e.name)) continue
    const s = path.join(src, e.name), d = path.join(dst, e.name)
    if (e.isDirectory()) copyDir(s, d, skip)
    else fs.copyFileSync(s, d)
  }
}

// 0) 초기화
fs.rmSync(SEED, { recursive: true, force: true })
fs.mkdirSync(SEED, { recursive: true })

// 1) .claude (node_modules·세션류 제외)
copyDir(path.join(ROOT, '.claude'), path.join(SEED, '.claude'), n => n === 'node_modules' || n === '.DS_Store')

// 2) CLAUDE.md — 회사 컨텍스트가 빈 제품용 템플릿을 사용(저장소의 실제 CLAUDE.md 아님)
fs.copyFileSync(path.join(ROOT, 'electron', 'claude-template.md'), path.join(SEED, 'CLAUDE.md'))

// 3) 빈 vault 골격 — 커밋된 v2 일반 시드(electron/vault-template/)를 그대로 복사한다.
//    회사색 없는 골격: 🏠 홈·시작 가이드·스킬 폴더(스킬 인덱스)·_템플릿·분야 폴더(.gitkeep)·.obsidian 설정 포함.
copyDir(path.join(ROOT, 'electron', 'vault-template'), TPL, n => n === '.DS_Store' || n === 'workspace.json')

console.log('[build-seed] seed 생성 완료 →', SEED)
