// 오피스 API — dev(vite)와 prod(Electron 독립 서버)가 공유하는 라우트 등록 모듈.
// registerOfficeApi(app, root): connect 호환 app(vite server.middlewares 또는 connect())에
// /api/* 핸들러를 등록한다. root는 .claude/, CLAUDE.md, vault/를 담은 작업 디렉터리(쓰기 가능).
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

const MODELS = { opus: 'claude-opus-4-8', sonnet: 'claude-sonnet-4-6', haiku: 'claude-haiku-4-5-20251001' }
const TONES = {
  calm: '응답 톤은 차분하고 신중하게. 단정적 표현을 줄이고 근거를 충분히 제시하라.',
  balanced: '',
  creative: '응답 톤은 적극적으로. 아이디어를 폭넓게 제안하되 실행 가능성도 함께 짚어라.',
  strict: '응답 톤은 깐깐하게. 리스크·약점·반례를 먼저 짚은 뒤 제안하라.'
}
const AGENT_IDS = ['director', 'marketing', 'strategy', 'ops', 'review']

function readBody(req) {
  return new Promise(resolve => {
    let b = ''
    req.on('data', d => { b += d })
    req.on('end', () => resolve(b))
  })
}
function json(res, code, obj) {
  res.statusCode = code
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(obj))
}

// ── 회사 정보 (vault/company.json 단일 소스 + CLAUDE.md 마커 채움) ──
// onboarding(electron)과 서버(/api/company)가 공유한다.
const COMPANY_FIELDS = [['name', '회사명'], ['industry', '업종/하는 일'], ['customers', '주요 고객 또는 제품'], ['role', '내 역할'], ['docStyle', '문서 스타일']]
const COMPANY_PLACEHOLDER = '(설정에서 입력하세요)'

export function readCompanyInfo(root) {
  const def = { name: '', industry: '', customers: '', role: '', docStyle: '추천에 맞게.' }
  try { return { ...def, ...JSON.parse(fs.readFileSync(path.join(root, 'vault', 'company.json'), 'utf8')) } }
  catch { return def }
}

export function saveCompanyInfo(root, info) {
  const v = k => String((info && info[k]) || '').replace(/[\r\n]/g, ' ').trim()
  const data = { name: v('name'), industry: v('industry'), customers: v('customers'), role: v('role'), docStyle: v('docStyle') || '추천에 맞게.' }
  const vaultDir = path.join(root, 'vault')
  fs.mkdirSync(vaultDir, { recursive: true })
  fs.writeFileSync(path.join(vaultDir, 'company.json'), JSON.stringify(data, null, 2), 'utf8')
  const block = COMPANY_FIELDS.map(([key, label]) => {
    const val = key === 'docStyle' ? data.docStyle : (data[key] || COMPANY_PLACEHOLDER)
    return `- ${label}: ${val}`
  }).join('\n')
  try {
    const mdPath = path.join(root, 'CLAUDE.md')
    if (fs.existsSync(mdPath)) {
      let md = fs.readFileSync(mdPath, 'utf8')
      if (/<!-- COMPANY:START -->[\s\S]*?<!-- COMPANY:END -->/.test(md)) {
        md = md.replace(/<!-- COMPANY:START -->[\s\S]*?<!-- COMPANY:END -->/, '<!-- COMPANY:START -->\n' + block + '\n<!-- COMPANY:END -->')
        fs.writeFileSync(mdPath, md, 'utf8')
      }
    }
    const noteDir = path.join(vaultDir, '00_지식금고', '공통')
    fs.mkdirSync(noteDir, { recursive: true })
    fs.writeFileSync(path.join(noteDir, '회사정보.md'), `---\ndate: ${new Date().toISOString().slice(0, 10)}\nsource: 설정\ntags: [회사정보]\n---\n\n# 회사 정보\n\n${block}\n`, 'utf8')
  } catch { /* CLAUDE.md/노트 갱신 실패는 company.json 저장과 무관하게 무시 */ }
  return data
}

export function registerOfficeApi(app, root) {
  const ROOT = root
  const VAULT = path.join(ROOT, 'vault')
  const TRACKER = path.join(VAULT, 'tracker.json')
  const AGENT_CONFIG = path.join(VAULT, 'agent-config.json')
  const USERLOG = path.join(VAULT, '대표_대화로그.md')

  // 위키 보호 규칙(CLAUDE.md 3계층): 불변 원본·위키 시스템·영구 거버넌스는 삭제 불가.
  // 그 외(90_산출물·회의록·지식금고 개별 노트 등 팀장 산출물)는 삭제 가능. rel은 ROOT 기준 경로.
  function protectedReason(relRaw) {
    const rel = String(relRaw).replaceAll('\\', '/')
    if (rel.includes('/01_원문/') || rel.includes('/02_외부자료/')) return '불변 원본 — 절대 삭제 금지'
    if (/\/00_지식금고\/(index|log|가이드라인)\.md$/.test(rel)) return '위키 시스템 파일(카탈로그·로그·가이드)'
    if (/\/00_지식금고\/공통\/(결정로그|회사정보)\.md$/.test(rel)) return '회사 거버넌스(영구 보존)'
    return null
  }
  function scanVault() {
    const groups = []
    function files(dir) {
      if (!fs.existsSync(dir)) return []
      return fs.readdirSync(dir, { withFileTypes: true })
        .filter(e => e.isFile() && e.name.endsWith('.md'))
        .map(e => {
          const fp = path.join(dir, e.name)
          const st = fs.statSync(fp)
          return { name: e.name, size: st.size, mtime: st.mtime.toISOString().slice(0, 16).replace('T', ' '), protected: !!protectedReason(path.relative(ROOT, fp)) }
        })
    }
    const vaultRel = p => path.relative(ROOT, p).replaceAll('\\', '/')
    const gv = path.join(VAULT, '00_지식금고')
    if (fs.existsSync(gv)) {
      const rootFiles = files(gv)
      if (rootFiles.length) groups.push({ label: '00_지식금고 (위키 시스템)', rel: vaultRel(gv), kind: 'wiki', files: rootFiles })
      for (const sub of fs.readdirSync(gv, { withFileTypes: true }).filter(e => e.isDirectory())) {
        const dir = path.join(gv, sub.name)
        groups.push({ label: '00_지식금고/' + sub.name, rel: vaultRel(dir), kind: 'vault', files: files(dir) })
      }
    }
    function filesRec(dir) {
      if (!fs.existsSync(dir)) return []
      const out = []
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) out.push(...filesRec(path.join(dir, e.name)))
        else out.push({ name: e.name, protected: !!protectedReason(path.relative(ROOT, path.join(dir, e.name))) })
      }
      return out
    }
    const TOPS = { '01_원문': 'raw', '02_외부자료': 'raw', '10_회의록': 'minutes', '90_산출물': 'output' }
    for (const top of Object.keys(TOPS)) {
      const dir = path.join(VAULT, top)
      groups.push({ label: top, rel: vaultRel(dir), kind: TOPS[top], files: filesRec(dir) })
    }
    const count = d => fs.existsSync(d) ? fs.readdirSync(d).filter(n => n.endsWith('.md')).length : 0
    const system = {
      agents: count(path.join(ROOT, '.claude', 'agents')),
      skills: fs.existsSync(path.join(ROOT, '.claude', 'skills')) ? fs.readdirSync(path.join(ROOT, '.claude', 'skills')).length : 0,
      commands: count(path.join(ROOT, '.claude', 'commands'))
    }
    return { groups, system, scannedAt: new Date().toLocaleTimeString('ko-KR') }
  }

  function scanGraph() {
    const SKIP = new Set(['index', 'log', '가이드라인', 'README', '환영합니다!', '대표_대화로그'])
    const nodes = {}
    const links = []
    function kindOf(rel) {
      if (rel.includes('00_지식금고')) {
        const m = rel.match(/00_지식금고[\/\\]([^\/\\]+)[\/\\]/)
        return m ? m[1] : '지식금고'
      }
      if (rel.includes('01_원문')) return '원문'
      if (rel.includes('02_외부자료')) return '외부자료'
      if (rel.includes('10_회의록')) return '회의록'
      if (rel.includes('90_산출물')) return '산출물'
      return '기타'
    }
    function walk(dir, fn) {
      if (!fs.existsSync(dir)) return
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name.startsWith('.')) continue
        const fp = path.join(dir, e.name)
        if (e.isDirectory()) { walk(fp, fn); continue }
        if (!e.name.endsWith('.md')) continue
        fn(fp, e.name.replace(/\.md$/, ''))
      }
    }
    walk(VAULT, (fp, title) => {
      if (SKIP.has(title)) return
      const rel = path.relative(VAULT, fp).replaceAll('\\', '/')
      nodes[title] = { id: title, kind: kindOf(rel) }
    })
    walk(VAULT, (fp, title) => {
      if (SKIP.has(title) || !nodes[title]) return
      const txt = fs.readFileSync(fp, 'utf8')
      const re = /\[\[([^\]]+)\]\]/g
      const seen = new Set()
      let m
      while ((m = re.exec(txt))) {
        const tgt = m[1].split('|')[0].split('#')[0].trim()
        if (!tgt || tgt === title || SKIP.has(tgt) || seen.has(tgt)) continue
        seen.add(tgt)
        if (!nodes[tgt]) nodes[tgt] = { id: tgt, kind: 'ghost' }
        links.push({ source: title, target: tgt })
      }
    })
    return { nodes: Object.values(nodes), links, scannedAt: new Date().toLocaleTimeString('ko-KR') }
  }

  function readTracker() {
    try { return JSON.parse(fs.readFileSync(TRACKER, 'utf8')) } catch { return { tasks: [] } }
  }
  function writeTracker(t) { fs.writeFileSync(TRACKER, JSON.stringify(t, null, 2), 'utf8') }
  const mkId = () => 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5)
  const nowIso = () => new Date().toISOString().slice(0, 16).replace('T', ' ')
  // 작업 한 건을 부분 갱신(읽기→수정→쓰기). 동기 fs라 콜백 간 경합 없음.
  function patchTask(id, patch) {
    const t = readTracker()
    const x = t.tasks.find(k => k.id === id)
    if (x) { Object.assign(x, patch); writeTracker(t) }
    return x
  }
  // 실행 작업을 트래커에 즉시 등록(진행 중 상태). 클라이언트와 무관하게 디스크에 남는다.
  function addTaskRecord({ agent, task, source, status }) {
    const t = readTracker()
    const id = mkId()
    const full = String(task)
    const st = status || 'doing'
    const rec = { id, agent: isAgent(agent) ? agent : 'director', task: full.slice(0, 200), status: st, source: source || 'ceo', created: new Date().toISOString().slice(0, 10) }
    if (st === 'doing') rec.startedAt = nowIso()
    if (full.length > 200) rec.detail = full.slice(0, 4000) // 상세 창에서 보일 지시 원문(라벨이 잘릴 때만)
    t.tasks.push(rec)
    writeTracker(t)
    return id
  }
  // 서버 기동 시: 앱 종료 등으로 끊긴 '진행 중' 작업은 더 이상 돌지 않으므로 '오류'로 정리한다.
  try {
    const t0 = readTracker()
    if (Array.isArray(t0.tasks) && t0.tasks.some(x => x.status === 'doing')) {
      for (const x of t0.tasks) if (x.status === 'doing') { x.status = 'error'; x.error = '앱 종료로 중단됨'; x.completedAt = nowIso() }
      writeTracker(t0)
    }
  } catch { /* 무시 */ }
  function trackerSummary() {
    const t = readTracker()
    const open = t.tasks.filter(x => x.status !== 'done' && x.status !== 'error').length
    const done = t.tasks.filter(x => x.status === 'done').length
    const byAgent = {}
    for (const x of t.tasks) {
      if (x.status === 'done' || x.status === 'error') continue
      byAgent[x.agent] = (byAgent[x.agent] || 0) + 1
    }
    return { open, done, byAgent, total: t.tasks.length }
  }
  function tailLines(file, n) {
    try {
      return fs.readFileSync(file, 'utf8').split('\n').filter(l => l.trim()).slice(-n)
    } catch { return [] }
  }

  function readAgentConfig() {
    try { return JSON.parse(fs.readFileSync(AGENT_CONFIG, 'utf8')) } catch { return {} }
  }
  function writeAgentConfig(c) { fs.writeFileSync(AGENT_CONFIG, JSON.stringify(c, null, 2), 'utf8') }

  // ── 커스텀 에이전트 레지스트리 (기본 5명 외 사용자가 추가한 팀장) ──
  const CUSTOM_AGENTS = path.join(VAULT, 'custom-agents.json')
  function readCustomAgents() { try { return JSON.parse(fs.readFileSync(CUSTOM_AGENTS, 'utf8')) } catch { return {} } }
  function writeCustomAgents(c) { fs.writeFileSync(CUSTOM_AGENTS, JSON.stringify(c, null, 2), 'utf8') }
  // 기본 5명 + 커스텀 모두 유효한 에이전트로 인정
  function isAgent(id) { return AGENT_IDS.includes(id) || !!readCustomAgents()[id] }
  // 순수 소문자 id 생성(서버 검증 /^[a-z]+$/ 충족), 중복·기존 페르소나 파일 회피
  function mkAgentId() {
    const cust = readCustomAgents(), abc = 'abcdefghijklmnopqrstuvwxyz'
    const taken = id => AGENT_IDS.includes(id) || cust[id] || fs.existsSync(path.join(ROOT, '.claude', 'agents', id + '.md'))
    for (let n = 0; n < 500; n++) { let id = 'c'; for (let i = 0; i < 6; i++) id += abc[Math.floor(Math.random() * 26)]; if (!taken(id)) return id }
    return null
  }

  function logUser(agent, question) {
    try {
      if (!fs.existsSync(USERLOG)) fs.writeFileSync(USERLOG, '# 대표 대화 로그\n\n> 대표의 모든 대화(질문·말투·표현)를 자동 누적한다. 대표가 명시적으로 요청할 때만 읽어 분석하고, 평상시 작업·답변에는 참조하지 않는다.\n\n', 'utf8')
      const ts = new Date().toISOString().slice(0, 16).replace('T', ' ')
      const q = String(question || '').replace(/\s+/g, ' ').trim().slice(0, 500)
      if (q) fs.appendFileSync(USERLOG, '- [' + ts + '] (' + agent + ') ' + q + '\n', 'utf8')
    } catch (e) { /* 로깅 실패는 조용히 무시 */ }
  }

  function runGit(args, timeoutMs) {
    return new Promise(resolve => {
      let p
      const env = { ...process.env, GIT_TERMINAL_PROMPT: '0' }
      try { p = spawn('git', args, { cwd: ROOT, windowsHide: true, env }) }
      catch (e) { return resolve({ code: -1, out: '', err: String(e) }) }
      let out = '', err = '', done = false
      const finish = r => { if (done) return; done = true; resolve(r) }
      const timer = setTimeout(() => { try { p.kill() } catch {} finish({ code: -2, out: out.trim(), err: '시간 초과(' + Math.round((timeoutMs || 90000) / 1000) + '초) — 네트워크나 인증 대기로 멈춘 것 같습니다.' }) }, timeoutMs || 90000)
      p.stdout.on('data', d => { out += d })
      p.stderr.on('data', d => { err += d })
      p.on('error', e => { clearTimeout(timer); finish({ code: -1, out: out.trim(), err: 'git 실행 실패 (설치/PATH 확인): ' + String(e) }) })
      p.on('close', code => { clearTimeout(timer); finish({ code, out: out.trim(), err: err.trim() }) })
    })
  }
  async function gitStatus() {
    const inside = await runGit(['rev-parse', '--is-inside-work-tree'])
    const repo = inside.code === 0
    let remote = null, branch = null
    if (repo) {
      const r = await runGit(['remote', 'get-url', 'origin']); if (r.code === 0) remote = r.out
      const b = await runGit(['rev-parse', '--abbrev-ref', 'HEAD']); if (b.code === 0) branch = b.out
    }
    return { repo, remote, branch, gitOk: inside.code !== -1 }
  }

  // claude CLI 호출 코어: 응답 소켓과 무관하게 항상 onClose(code,out,err)를 호출한다.
  // 결과를 디스크(트래커)에 저장하는 백그라운드 작업이 창/연결 상태에 의존하지 않게 하는 핵심.
  // shell:true로 띄우면 p는 cmd.exe라 p.kill()이 손자 프로세스(claude.exe)를 못 죽인다.
  // Windows에서는 taskkill /T로 트리째 종료해 고아 claude 프로세스를 남기지 않는다.
  function killTree(p) {
    try {
      if (process.platform === 'win32' && p && p.pid) spawn('taskkill', ['/pid', String(p.pid), '/t', '/f'], { windowsHide: true })
      else if (p) p.kill()
    } catch { /* 무시 */ }
  }
  function spawnClaudeRaw(allowed, model, prompt, timeoutMs, onClose) {
    let p
    try { p = spawn('claude', ['-p', '--allowedTools', allowed, '--model', model], { cwd: ROOT, shell: true, windowsHide: true }) }
    catch (e) { return onClose(-1, '', String(e)) }
    let out = '', err = '', done = false
    const finish = code => { if (done) return; done = true; clearTimeout(timer); onClose(code, out.trim(), err.trim()) }
    const timer = setTimeout(() => { killTree(p); finish(-2) }, timeoutMs || 180000)
    p.stdout.on('data', d => { out += d })
    p.stderr.on('data', d => { err += d })
    p.on('error', e => { err += String(e); finish(-1) })
    p.on('close', code => finish(code))
    p.stdin.write(prompt, 'utf8')
    p.stdin.end()
  }
  // 응답 소켓에 묶인 호출(분류·검수 등 즉답형). 소켓이 끊겼으면 응답을 생략한다.
  function spawnClaude(allowed, model, prompt, res, onDone, timeoutMs) {
    spawnClaudeRaw(allowed, model, prompt, timeoutMs, (code, out, err) => {
      if (res.writableEnded) return
      onDone(code, out, err)
    })
  }
  // 커스터마이즈된 팀장 이름/직함/역할 재정의를 프롬프트 머리말로 만든다(/api/ask와 공유).
  function agentIdentityLine(acfg) {
    const parts = []
    if (acfg.name || acfg.role) parts.push(`이 팀장의 표시 이름은 '${acfg.name || ''}', 직함은 '${acfg.role || ''}'(으)로 설정돼 있다`)
    if (acfg.desc) parts.push(`이 팀장의 역할·전문분야는 다음과 같이 재정의되었다: "${acfg.desc}". 페르소나 파일의 기본 직무보다 이 재정의된 역할을 최우선으로 삼아, 그 분야의 전문가로서 사고하고 답하라`)
    return parts.length ? `(${parts.join('. ')}. 자기소개·서명에는 위 이름과 직함을 사용하라.) ` : ''
  }
  // 트래커 작업 한 건을 백그라운드로 실제 실행하고, 끝나면 결과/오류를 그 작업에 저장한다.
  // 창·모달을 닫아도(연결이 끊겨도) 끝까지 돌고 결과가 트래커에 남는다.
  function runAgentJob({ taskId, agent, instruction }, onSettled) {
    const acfg = readAgentConfig()[agent] || {}
    const model = MODELS[acfg.model] || MODELS.sonnet
    const toneLine = TONES[acfg.tone] ? (TONES[acfg.tone] + ' ') : ''
    const prompt = agentIdentityLine(acfg)
      + '.claude/agents/' + agent + '.md 파일을 읽고 그 페르소나에 맞춰, 아래 업무를 실제로 수행하라(대화가 아니라 실무 처리다). '
      + 'CLAUDE.md 수칙대로 ① vault/00_지식금고의 관련 노트를 먼저 확인하고, ② 결과가 문서형 산출물이면 vault/90_산출물/에 마크다운으로 저장하라(파일명은 주제 키워드). 트래커 파일(vault/tracker.json)은 절대 수정하지 마라. '
      + '확인 안 된 숫자는 지어내지 말고 [확인 필요]로 표시. '
      + '작업이 끝나면 마지막 메시지에 결과 요약을 800자 이내로 출력하라 — (1) 핵심 결론 (2) 한 일 (3) 저장한 파일 경로(있으면). '
      + toneLine + '업무: ' + instruction
    patchTask(taskId, { status: 'doing', startedAt: nowIso() })
    spawnClaudeRaw('Read,Glob,Grep,Write(vault/**),Edit(vault/**)', model, prompt, 300000, (code, out, err) => {
      if (code === 0 && out) patchTask(taskId, { status: 'done', result: out.slice(0, 4000), completedAt: nowIso() })
      else patchTask(taskId, { status: 'error', error: (err || ('claude exit ' + code)).slice(0, 1000), completedAt: nowIso() })
      if (onSettled) onSettled()
    })
  }
  // 백그라운드 팀장 실행 큐 — 한 번에 1건만 실행한다.
  // 여러 claude를 동시에 띄우면 머신/세션이 thrash되어 CEO 분류·팀장 응답까지 타임아웃되기 때문.
  const jobQueue = []
  let jobRunning = false
  function pumpQueue() {
    if (jobRunning || !jobQueue.length) return
    jobRunning = true
    const job = jobQueue.shift()
    runAgentJob(job, () => { jobRunning = false; pumpQueue() })
  }
  function enqueueAgentJob(job) { jobQueue.push(job); pumpQueue() }

  app.use('/api/vault', (req, res) => {
    try { json(res, 200, scanVault()) } catch (e) { json(res, 500, { error: String(e) }) }
  })
  app.use('/api/graph', (req, res) => {
    try { json(res, 200, scanGraph()) } catch (e) { json(res, 500, { error: String(e) }) }
  })
  app.use('/api/tracker', async (req, res) => {
    try {
      if (req.method !== 'POST') return json(res, 200, readTracker())
      const body = JSON.parse(await readBody(req) || '{}')
      const t = readTracker()
      const now = new Date().toISOString().slice(0, 10)
      if (body.action === 'add' && body.task) {
        t.tasks.push({ id: mkId(), agent: isAgent(body.agent) ? body.agent : 'director', task: String(body.task).slice(0, 200), status: 'todo', priority: body.priority || 'normal', created: now })
      } else if (body.action === 'addMany' && Array.isArray(body.tasks)) {
        for (const x of body.tasks) {
          if (!x || !x.task) continue
          t.tasks.push({ id: mkId(), agent: isAgent(x.agent) ? x.agent : 'director', task: String(x.task).slice(0, 200), status: 'todo', priority: x.priority || 'normal', created: now, source: body.source || 'ceo' })
        }
      } else if (body.action === 'update' && body.id) {
        const x = t.tasks.find(k => k.id === body.id)
        if (x) { if (body.status) x.status = body.status; if (body.priority) x.priority = body.priority }
      } else if (body.action === 'delete' && body.id) {
        t.tasks = t.tasks.filter(k => k.id !== body.id)
      }
      writeTracker(t)
      json(res, 200, t)
    } catch (e) { json(res, 500, { error: String(e) }) }
  })
  app.use('/api/dashboard', (req, res) => {
    try {
      const v = scanVault()
      json(res, 200, {
        vault: v.groups.map(g => ({ label: g.label, kind: g.kind, count: g.files.length })),
        system: v.system,
        tracker: trackerSummary(),
        recentLog: tailLines(path.join(VAULT, '00_지식금고', 'log.md'), 8),
        decisions: tailLines(path.join(VAULT, '00_지식금고', '공통', '결정로그.md'), 6).filter(l => l.startsWith('- [')),
        scannedAt: new Date().toLocaleTimeString('ko-KR')
      })
    } catch (e) { json(res, 500, { error: String(e) }) }
  })
  app.use('/api/agent-config', async (req, res) => {
    try {
      if (req.method !== 'POST') return json(res, 200, readAgentConfig())
      const body = JSON.parse(await readBody(req) || '{}')
      const id = body.agentId
      if (!id || !/^[a-z]+$/.test(id)) return json(res, 400, { error: 'bad agentId' })
      const c = readAgentConfig()
      const cur = c[id] || {}
      if (body.reset) { delete c[id] }
      else {
        if (typeof body.name === 'string') cur.name = body.name.slice(0, 30)
        if (typeof body.role === 'string') cur.role = body.role.slice(0, 40)
        if (typeof body.desc === 'string') cur.desc = body.desc.slice(0, 600)
        if (body.model && MODELS[body.model]) cur.model = body.model
        if (body.tone && TONES[body.tone] !== undefined) cur.tone = body.tone
        if (typeof body.img === 'string') cur.img = body.img
        c[id] = cur
      }
      writeAgentConfig(c)
      json(res, 200, c)
    } catch (e) { json(res, 500, { error: String(e) }) }
  })
  // 커스텀 에이전트 목록/추가/삭제
  app.use('/api/agents', async (req, res) => {
    try {
      if (req.method !== 'POST') return json(res, 200, { agents: readCustomAgents() })
      const body = JSON.parse(await readBody(req) || '{}')
      if (body.action === 'delete') {
        const cust = readCustomAgents()
        if (!cust[body.id]) return json(res, 400, { error: '커스텀 에이전트만 삭제할 수 있습니다(기본 5명은 보호됨).' })
        try { // 페르소나 파일을 휴지통으로 이동
          const pf = path.join(ROOT, '.claude', 'agents', body.id + '.md')
          if (fs.existsSync(pf)) { const dest = path.join(VAULT, '.trash', 'claude-agents', body.id + '.md'); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.renameSync(pf, dest) }
        } catch { /* 무시 */ }
        delete cust[body.id]; writeCustomAgents(cust)
        return json(res, 200, { ok: true, agents: cust })
      }
      // 추가: 이름·(선택)직책·역할설명을 받아 AI가 직책 추천 + 페르소나 자동생성
      const name = String(body.name || '').replace(/[\r\n]/g, ' ').trim().slice(0, 30)
      if (!name) return json(res, 400, { error: '이름이 필요합니다' })
      const col = /^#[0-9a-fA-F]{6}$/.test(body.col || '') ? body.col : '#7CE0FF'
      const model = MODELS[body.model] ? body.model : 'sonnet'
      const tone = (body.tone && TONES[body.tone] !== undefined) ? body.tone : 'balanced'
      const roleHint = String(body.role || '').slice(0, 40)
      const descHint = String(body.desc || '').slice(0, 600)
      const id = mkAgentId()
      if (!id) return json(res, 500, { error: 'id 생성 실패' })
      const company = readCompanyInfo(ROOT)
      const prompt = 'CLAUDE.md의 회사 컨텍스트와 vault/00_지식금고/index.md를 참고해(없으면 생략), 새 AI 팀장의 페르소나를 설계하라. '
        + '회사: ' + (company.name || '(미입력)') + ' / 업종: ' + (company.industry || '(미입력)') + '. '
        + '새 팀장 이름 "' + name + '". 사용자가 적은 직책 의도 "' + (roleHint || '(미입력 — 네가 회사에 맞게 추천)') + '". 역할 설명 "' + (descHint || '(미입력 — 이름·회사 맥락으로 추론)') + '". '
        + '이 회사에 가장 알맞은 직책을 판단해 추천하고, 그 직책에 맞는 전문가 페르소나를 설계하라. '
        + '출력은 오직 JSON 한 개: {"role":"직책","specialty":"전문분야 한 줄","persona":"사고방식·말투 2~3문장","intro":"첫 인사 한 문장","chips":["예시 질문 4개"],"description":"언제 이 팀장에게 위임하는지 한 줄(분류용)"}. JSON 외 텍스트 금지.'
      spawnClaudeRaw('Read,Glob,Grep', MODELS[model], prompt, 180000, (code, out, err) => {
        let p = null
        if (code === 0 && out) { try { const m = out.match(/\{[\s\S]*\}/); p = JSON.parse(m ? m[0] : out) } catch { p = null } }
        if (!p) { if (!res.writableEnded) json(res, 500, { error: '페르소나 생성 실패: ' + String(err || 'AI 응답 파싱 불가').slice(0, 200) }); return }
        const role = (roleHint || String(p.role || '팀장')).slice(0, 40)
        const specialty = String(p.specialty || descHint || '').slice(0, 300)
        const persona = String(p.persona || '').slice(0, 600)
        const intro = String(p.intro || (name + '입니다. 무엇을 도와드릴까요?')).slice(0, 200)
        const chips = Array.isArray(p.chips) ? p.chips.slice(0, 4).map(s => String(s).slice(0, 60)) : []
        const description = String(p.description || (role + ' 담당')).replace(/\n/g, ' ').slice(0, 200)
        const md = '---\nname: ' + id + '\ndescription: ' + description + '\nmodel: ' + model + '\n---\n\n'
          + '당신은 ' + (company.name || '우리 회사') + '의 ' + role + ' ' + name + '다. ' + persona + '\n\n'
          + '## 작업 원칙\n- ' + (specialty || '담당 분야') + ' 영역의 전문가로서, 시작 전 성공 기준 1줄을 정의하고 근거 중심으로 답한다.\n'
          + '- 업종 특수 규칙(법규·금지표현·브랜드 톤 등)이 지식금고 공통 폴더에 있으면 최우선으로 지킨다.\n\n'
          + '## 공통 수칙\n- vault/00_지식금고/공통과 관련 분야 노트를 먼저 읽고 작업한다. 금고에 없는 사실은 지어내지 않는다.\n'
          + '- 불확실하면 추측 대신 질문한다. 요청한 것만 만들고 범위를 확장하지 않는다.\n- CLAUDE.md의 회사 컨텍스트를 기본 전제로 삼는다.\n'
        try { fs.writeFileSync(path.join(ROOT, '.claude', 'agents', id + '.md'), md, 'utf8') }
        catch (e) { if (!res.writableEnded) json(res, 500, { error: '페르소나 파일 저장 실패: ' + String(e) }); return }
        const cust = readCustomAgents()
        cust[id] = { id, name, role, desc: specialty, col, model, tone, intro, chips, description, created: new Date().toISOString().slice(0, 10), custom: true }
        writeCustomAgents(cust)
        if (!res.writableEnded) json(res, 200, { ok: true, agent: cust[id], agents: cust })
      })
    } catch (e) { json(res, 500, { error: String(e) }) }
  })
  // 직책 추천만(가볍게) — 추가/편집 폼의 "직책 추천" 버튼용
  app.use('/api/recommend-role', async (req, res) => {
    if (req.method !== 'POST') return json(res, 405, { error: 'POST only' })
    try {
      const body = JSON.parse(await readBody(req) || '{}')
      const name = String(body.name || '').slice(0, 30)
      const descHint = String(body.desc || '').slice(0, 600)
      const company = readCompanyInfo(ROOT)
      const prompt = '회사 "' + (company.name || '(미입력)') + '" / 업종 "' + (company.industry || '(미입력)') + '". '
        + '새 팀원 이름 "' + name + '", 역할 설명 "' + (descHint || '(미입력)') + '". 이 회사에 가장 도움이 될 직책 1개를 추천하라. '
        + '파일을 읽지 말고(도구 사용 금지) 위 정보만으로 즉시 답하라. 출력은 JSON 하나만: {"role":"추천 직책","summary":"왜 적합한지 한 줄"}. JSON 외 텍스트 금지.'
      spawnClaudeRaw('Read', MODELS.haiku, prompt, 60000, (code, out, err) => {
        let p = null
        if (code === 0 && out) { try { const m = out.match(/\{[\s\S]*\}/); p = JSON.parse(m ? m[0] : out) } catch { p = null } }
        if (!p) { if (!res.writableEnded) json(res, 500, { error: '추천 실패' }); return }
        if (!res.writableEnded) json(res, 200, { role: String(p.role || '').slice(0, 40), summary: String(p.summary || '').slice(0, 200) })
      })
    } catch (e) { json(res, 500, { error: String(e) }) }
  })
  app.use('/api/company', async (req, res) => {
    try {
      if (req.method !== 'POST') return json(res, 200, readCompanyInfo(ROOT))
      const body = JSON.parse(await readBody(req) || '{}')
      json(res, 200, saveCompanyInfo(ROOT, body))
    } catch (e) { json(res, 500, { error: String(e) }) }
  })
  app.use('/api/agent-portrait', async (req, res) => {
    if (req.method !== 'POST') return json(res, 405, { error: 'POST only' })
    try {
      const body = JSON.parse(await readBody(req) || '{}')
      const id = body.agentId
      if (!id || !/^[a-z]+$/.test(id)) return json(res, 400, { error: 'bad agentId' })
      const c = readAgentConfig()
      const dir = path.join(ROOT, 'web', 'public', 'agents')
      const file = path.join(dir, 'custom-' + id + '.png')
      if (body.reset) {
        if (fs.existsSync(file)) fs.unlinkSync(file)
        if (c[id]) { delete c[id].img; writeAgentConfig(c) }
        return json(res, 200, { ok: true, img: null })
      }
      const m = String(body.dataUrl || '').match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/)
      if (!m) return json(res, 400, { error: 'png/jpeg/webp dataUrl 필요' })
      const buf = Buffer.from(m[2], 'base64')
      if (buf.length > 3 * 1024 * 1024) return json(res, 400, { error: '이미지가 너무 큽니다(3MB 이하)' })
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(file, buf)
      const img = '/agents/custom-' + id + '.png?t=' + Date.now()
      c[id] = { ...(c[id] || {}), img }
      writeAgentConfig(c)
      json(res, 200, { ok: true, img })
    } catch (e) { json(res, 500, { error: String(e) }) }
  })
  app.use('/api/git-sync', async (req, res) => {
    try {
      if (req.method !== 'POST') return json(res, 200, await gitStatus())
      const body = JSON.parse(await readBody(req) || '{}')
      if (body.action === 'setRemote') {
        const url = String(body.url || '').trim()
        if (!/^(https:\/\/[^\s]+|git@[^\s]+)$/.test(url) || url.length > 300) return json(res, 400, { error: '올바른 저장소 주소가 아닙니다 (https://github.com/계정/저장소.git)' })
        const inside = await runGit(['rev-parse', '--is-inside-work-tree'])
        if (inside.code !== 0) { const ini = await runGit(['init']); if (ini.code !== 0) return json(res, 500, { error: 'git init 실패: ' + ini.err }) }
        await runGit(['remote', 'remove', 'origin'])
        const add = await runGit(['remote', 'add', 'origin', url])
        if (add.code !== 0) return json(res, 500, { error: 'remote 등록 실패: ' + add.err })
        return json(res, 200, await gitStatus())
      }
      if (body.action === 'sync') {
        const steps = []
        const note = (label, r) => steps.push({ label, ok: r.code === 0, msg: (r.err || r.out || '').slice(0, 300) })
        const inside = await runGit(['rev-parse', '--is-inside-work-tree'])
        if (inside.code !== 0) note('git init', await runGit(['init']))
        const rem = await runGit(['remote', 'get-url', 'origin'])
        if (rem.code !== 0) return json(res, 400, { error: '원격 저장소 주소를 먼저 등록하세요.', steps })
        note('브랜치 main', await runGit(['checkout', '-B', 'main']))
        note('스테이징', await runGit(['add', '-A']))
        const msg = 'office sync ' + new Date().toISOString().slice(0, 16).replace('T', ' ')
        const commit = await runGit(['-c', 'user.name=AI Office', '-c', 'user.email=office@local', 'commit', '-m', msg])
        steps.push({ label: '커밋', ok: commit.code === 0 || /nothing to commit/i.test(commit.out + commit.err), msg: commit.code === 0 ? '커밋 완료' : '변경 없음' })
        const pull = await runGit(['pull', '--no-edit', '-X', 'ours', 'origin', 'main'], 90000)
        steps.push({ label: '원격 병합(pull)', ok: true, msg: pull.code === 0 ? '병합 완료' : '첫 푸시이거나 원격 비어있음 — 건너뜀' })
        const push = await runGit(['push', '-u', 'origin', 'main'], 120000)
        note('푸시(push)', push)
        const ok = push.code === 0
        return json(res, 200, { ok, steps, error: ok ? null : ('push 실패 — GitHub 인증을 확인하세요. ' + (push.err || '').slice(0, 300)) })
      }
      return json(res, 400, { error: 'unknown action' })
    } catch (e) { json(res, 500, { error: String(e) }) }
  })
  app.use('/api/ceo', async (req, res) => {
    if (req.method !== 'POST') return json(res, 405, { error: 'POST only' })
    try {
      const { question, history } = JSON.parse(await readBody(req))
      logUser('ceo', question)
      // CEO 지시를 분류 전에 즉시 트래커에 기록한다(팀장 업무처럼 바로 뜨고, 분류가 실패/지연돼도 사라지지 않음).
      const ceoTaskId = addTaskRecord({ agent: 'director', task: question, source: 'ceo' })
      let hist = ''
      if (Array.isArray(history) && history.length) {
        hist = '지금까지의 대화:\n' + history.slice(-6).map(m => (m.who === 'user' ? '대표' : 'CEO') + ': ' + String(m.text).slice(0, 300)).join('\n') + '\n\n'
      }
      const prompt = 'CLAUDE.md의 오케스트레이션(헤르메스 방식)과 회사 컨텍스트를 읽고, 너는 우리 회사 대표 직속 CEO 오케스트레이터로서 답한다. '
        + '팀장: marketing(Echo·마케팅/콘텐츠/채널), strategy(Oracle·전략/매출/KPI/시장분석), ops(Link·회의록/문서/프로세스), review(Glitch·검수/규정·법규/리스크), director(Neo·총괄/우선순위/취합). '
        + '너의 역할은 깊은 실무가 아니라 빠른 분류·배정이다. 파일을 일일이 읽지 말고, 맥락이 꼭 필요하면 vault/00_지식금고/index.md만 한 번 훑어라(없으면 그냥 진행). 분류는 신속해야 한다. '
        + '절차: ① 최소 동원 원칙 준수 — 단순 조회·단답은 팀장 1명, 창작·기획·전략처럼 여러 직무가 실제로 필요할 때만 2~3명, 무관한 팀장은 부르지 않는다. 사용자가 특정 직무 단어를 쓰지 않았으면 그 팀장을 임의로 넣지 않는다. '
        + '출력은 반드시 이 순서: 먼저 대표에게 보일 한국어 보고 — (1) 결론 1줄 (2) 누구에게 무엇을 맡겼는지 (3) 다음 액션. 800자 이내, 확인 안 된 숫자는 [확인 필요]로. '
        + '그 다음 맨 마지막 줄에 기계용 계획을 정확히 이 형식으로 한 줄만 출력한다: [PLAN]{"brief":"2~3줄 요약","tasks":[{"agent":"팀장id","task":"구체·실행가능 지시"}]}[/PLAN] '
        + 'agent는 marketing/strategy/ops/review/director 중에서만. tasks는 최소 동원 원칙대로 1~3개. PLAN 블록 안에는 JSON 외 글자를 넣지 마라. '
        + hist + '대표 지시: ' + question
      spawnClaudeRaw('Read,Glob,Grep', MODELS.sonnet, prompt, 240000, (code, out, err) => {
        if (code === 0 && out) {
          const full = out
          let plan = null, report = full
          const m = full.match(/\[PLAN\]([\s\S]*?)\[\/PLAN\]/)
          if (m) {
            report = full.replace(m[0], '').trim()
            try { plan = JSON.parse(m[1].trim()) } catch { plan = null }
          }
          // 분류된 팀장별 업무를 트래커에 등록하고 백그라운드로 실제 실행한다.
          // 모달을 닫아도(연결이 끊겨도) 작업은 유지·완료되고 결과가 트래커에 남는다.
          const taskIds = []
          if (plan && Array.isArray(plan.tasks)) {
            for (const x of plan.tasks) {
              if (!x || !x.task) continue
              const agent = isAgent(x.agent) ? x.agent : 'director'
              const id = addTaskRecord({ agent, task: x.task, source: 'ceo', status: 'todo' })
              taskIds.push(id)
              enqueueAgentJob({ taskId: id, agent, instruction: x.task })
            }
          }
          // CEO 지시 작업은 분류·배정 보고를 결과로 저장하고 완료 처리(어떤 지시였고 누구에게 맡겼는지 남음).
          patchTask(ceoTaskId, { status: 'done', result: report, completedAt: nowIso() })
          if (!res.writableEnded) json(res, 200, { answer: report, plan, taskIds })
        } else {
          // 분류 실패 시에도 CEO 지시 작업을 오류로 남겨 사라지지 않게 한다.
          patchTask(ceoTaskId, { status: 'error', error: (err || ('claude exit ' + code)).slice(0, 1000), completedAt: nowIso() })
          if (!res.writableEnded) json(res, 500, { error: err || ('claude exit ' + code) })
        }
      })
    } catch (e) { json(res, 500, { error: String(e) }) }
  })
  app.use('/api/file', async (req, res) => {
    const url = new URL(req.url, 'http://x')
    const rel = url.searchParams.get('path') || ''
    const abs = path.resolve(ROOT, rel)
    if (!abs.startsWith(VAULT) || !abs.endsWith('.md') || !fs.existsSync(abs)) {
      return json(res, 400, { error: 'vault 안의 .md 파일만 열 수 있습니다' })
    }
    if (req.method === 'PUT') {
      // 기존 파일 수정·보완. 보호 파일(불변 원본·위키 시스템·거버넌스)은 수정도 막는다.
      const reason = protectedReason(rel)
      if (reason) return json(res, 403, { error: '보호된 파일입니다 — ' + reason })
      const body = JSON.parse(await readBody(req) || '{}')
      if (typeof body.content !== 'string') return json(res, 400, { error: 'content(문자열)가 필요합니다' })
      if (body.content.length > 300000) return json(res, 400, { error: '내용이 너무 깁니다(300KB 이하)' })
      try { fs.writeFileSync(abs, body.content, 'utf8'); return json(res, 200, { ok: true, saved: rel }) }
      catch (e) { return json(res, 500, { error: '저장 실패: ' + String(e) }) }
    }
    if (req.method === 'DELETE') {
      // 클라이언트 플래그를 믿지 않고 서버가 경로로 보호 여부를 재검증한다(UI 우회 차단).
      const reason = protectedReason(rel)
      if (reason) return json(res, 403, { error: '보호된 파일입니다 — ' + reason })
      try {
        // 하드 삭제 대신 vault/.trash/로 이동(되돌릴 수 있게). 폴더 구조 보존, 동명 충돌 시 타임스탬프.
        const sub = rel.replace(/^vault[/\\]/, '')
        let dest = path.join(VAULT, '.trash', sub)
        if (fs.existsSync(dest)) {
          const ts = new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-')
          dest = path.join(path.dirname(dest), ts + '__' + path.basename(dest))
        }
        fs.mkdirSync(path.dirname(dest), { recursive: true })
        fs.renameSync(abs, dest)
        return json(res, 200, { ok: true, trashed: rel })
      } catch (e) { return json(res, 500, { error: '휴지통 이동 실패: ' + String(e) }) }
    }
    json(res, 200, { path: rel, content: fs.readFileSync(abs, 'utf8') })
  })
  app.use('/api/search', (req, res) => {
    try {
      const url = new URL(req.url, 'http://x')
      const q = (url.searchParams.get('q') || '').trim()
      if (!q) return json(res, 200, { results: [], q: '' })
      const ql = q.toLowerCase()
      const results = []
      const LIMIT = 60
      const SKIP = new Set(['대표_대화로그.md']) // 대표 대화 원본은 평상시 미참조(CLAUDE.md)
      function walk(dir) {
        if (results.length >= LIMIT || !fs.existsSync(dir)) return
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          if (results.length >= LIMIT) break
          if (e.name.startsWith('.')) continue // .trash, .obsidian 등 제외
          const fp = path.join(dir, e.name)
          if (e.isDirectory()) { walk(fp); continue }
          if (!e.name.endsWith('.md') || SKIP.has(e.name)) continue
          const nameMatch = e.name.toLowerCase().includes(ql)
          let content = ''
          try { content = fs.readFileSync(fp, 'utf8') } catch { /* 무시 */ }
          const idx = content.toLowerCase().indexOf(ql)
          if (!nameMatch && idx < 0) continue
          let snippet = ''
          if (idx >= 0) {
            const start = Math.max(0, idx - 30)
            snippet = (start > 0 ? '…' : '') + content.slice(start, idx + ql.length + 60).replace(/\s+/g, ' ').trim() + '…'
          }
          const rel = path.relative(ROOT, fp).replaceAll('\\', '/')
          results.push({ path: rel, name: e.name, dir: path.relative(ROOT, dir).replaceAll('\\', '/'), snippet, nameMatch, protected: !!protectedReason(rel) })
        }
      }
      walk(VAULT)
      json(res, 200, { results, q })
    } catch (e) { json(res, 500, { error: String(e) }) }
  })
  app.use('/api/adopt', async (req, res) => {
    if (req.method !== 'POST') return json(res, 405, { error: 'POST only' })
    try {
      const { agent, question, answer } = JSON.parse(await readBody(req))
      if (!/^[a-z]+$/.test(agent || '')) return json(res, 400, { error: 'bad agent' })
      const acfg = readAgentConfig()[agent] || {}
      const model = MODELS[acfg.model] || MODELS.sonnet
      const prompt = 'CLAUDE.md의 지식 금고 규칙에 따라, 아래 문답에서 보존 가치가 있는 사실(고객 사실·결정사항·사용자 선호/규칙)만 vault/00_지식금고의 해당 분야 폴더(공통/마케팅/전략/운영/검토/총괄 중 하나)에 노트로 적립하라. '
        + '같은 주제 노트가 있으면 갱신하고, 모순되면 [모순 날짜] 표기. 명시적 결정·원칙은 vault/00_지식금고/공통/결정로그.md에 "- [날짜] 내용"(60자 이내) append. '
        + '노트를 만들거나 갱신했으면 index.md와 log.md("## [날짜] 기록 | 제목")도 갱신하라. 잡담·일회성·추측은 적립하지 마라. '
        + '적립할 신규 지식이 없으면 정확히 "NONE"만 출력. 적립했으면 마지막 줄에 "[금고 적립: 경로/파일명]"만 출력하라.\n\n[문답]\n대표: ' + question + '\n팀장: ' + answer
      spawnClaude('Read,Glob,Grep,Write(vault/**),Edit(vault/**)', model, prompt, res, (code, out, err) => {
        if (code === 0) { const t = out; const m = t.match(/\[금고 적립:\s*([^\]]+)\]/); json(res, 200, { saved: m ? m[1].trim() : null }) }
        else json(res, 500, { error: err || ('claude exit ' + code) })
      })
    } catch (e) { json(res, 500, { error: String(e) }) }
  })
  app.use('/api/ask', async (req, res) => {
    if (req.method !== 'POST') return json(res, 405, { error: 'POST only' })
    try {
      const { agent, question, history, mode } = JSON.parse(await readBody(req))
      const deep = mode === 'deep'
      if (!/^[a-z]+$/.test(agent || '')) return json(res, 400, { error: 'bad agent' })
      const agentFile = path.join(ROOT, '.claude', 'agents', agent + '.md')
      if (!fs.existsSync(agentFile)) return json(res, 404, { error: 'agent not found' })
      logUser(agent, question)
      const acfg = readAgentConfig()[agent] || {}
      const askModel = MODELS[acfg.model] || MODELS.sonnet
      const toneLine = (TONES[acfg.tone] || '') ? (TONES[acfg.tone] + ' ') : ''
      const idParts = []
      if (acfg.name || acfg.role) idParts.push(`이 팀장의 표시 이름은 '${acfg.name || ''}', 직함은 '${acfg.role || ''}'(으)로 설정돼 있다`)
      if (acfg.desc) idParts.push(`이 팀장의 역할·전문분야는 다음과 같이 재정의되었다: "${acfg.desc}". 페르소나 파일의 기본 직무보다 이 재정의된 역할을 최우선으로 삼아, 그 분야의 전문가로서 사고하고 답하라`)
      const idLine = idParts.length ? `(${idParts.join('. ')}. 자기소개·서명에는 위 이름과 직함을 사용하라.) ` : ''
      let hist = ''
      if (Array.isArray(history) && history.length) {
        hist = '지금까지의 대화(맥락 참고용):\n'
          + history.slice(-6).map(m => (m.who === 'user' ? '대표' : '나') + ': ' + String(m.text).slice(0, 300)).join('\n')
          + '\n\n'
      }
      let prompt, allowed
      if (deep) {
        prompt = '.claude/agents/' + agent + '.md 파일을 읽고, 그 페르소나에 맞춰 해당 팀장으로서 답해라. '
          + '수칙대로 vault/00_지식금고의 관련 노트를 먼저 확인하고, 금고에 있는 사실(고객, 목표, 규칙)을 답변에 적극 활용해라. vault/대표_대화로그.md는 대표가 말투·질문 패턴 분석을 명시적으로 요청할 때만 읽어라. '
          + '답변 수준: 전략·기획성 질문이면 결론 1줄 → 핵심 근거 → 실행 제안(번호 목록) 순으로 구조화하고, 단순 질문이면 간결하게. '
          + '화면 대화창에 들어가므로 1200자 이내. 확인 안 된 숫자는 지어내지 말고 [확인 필요]로 표시. '
          + '답변 후: 이번 문답에 보존 가치가 있는 정보(고객 사실, 결정사항, 사용자 선호·규칙)가 있으면 '
          + 'CLAUDE.md의 지식 금고 규칙대로 노트로 적립하라. 폴더는 반드시 기존 6개(공통/마케팅/전략/운영/검토/총괄) 중에서만 고르고 새 폴더를 만들지 마라. '
          + '같은 주제의 노트가 이미 있으면 새로 만들지 말고 기존 노트를 갱신하고, 기존 노트와 모순되면 [모순 날짜] 표기 후 답변에서 보고하라. 잡담·일회성 질문·추측은 적립하지 마라. '
          + '이번 문답에 "앞으로 회사가 따를 명시적 결정·원칙"이 나왔으면 vault/00_지식금고/공통/결정로그.md에 "- [날짜] 결정 내용"(명령형/단정형, 60자 이내) 한 줄을 append 하라. 0~3개만, 추측·일반론은 제외, 없으면 생략. '
          + '노트를 만들거나 갱신했다면 vault/00_지식금고/index.md의 해당 항목과 log.md(append-only, "## [날짜] 기록 | 제목" 형식)도 함께 갱신하라. '
          + '작업 순서(필수): ① 관련 노트 검색 ② 적립할 게 있으면 Write/Edit로 먼저 저장 ③ 모든 도구 사용이 끝난 뒤 마지막 메시지에서 답변을 출력한다. '
          + '너의 마지막 메시지만 사용자 화면에 표시되므로, 마지막 메시지에 반드시 답변 본문 전체를 담고, 적립한 경우에만 맨 아래 한 줄로 "[금고 적립: 경로/파일명]"을 덧붙여라. '
          + toneLine + hist + '질문: ' + question
        allowed = 'Read,Glob,Grep,Write(vault/**),Edit(vault/**)'
      } else {
        prompt = '.claude/agents/' + agent + '.md 파일을 읽고 그 페르소나로 답하라. 속도가 중요하다. '
          + '맥락이 꼭 필요할 때만 vault/00_지식금고/index.md를 한 번만 빠르게 훑어 관련 사실을 반영하되, 파일을 일일이 열거나 grep으로 전체 검색하지 마라. 확실하면 바로 답하라. '
          + '노트 적립·index·log·결정로그 갱신은 하지 마라(읽기 전용 모드). '
          + 'vault/대표_대화로그.md는 대표가 자신의 말투·질문 패턴 분석을 명시적으로 요청할 때만 읽어라. 그 외에는 절대 읽지 마라. '
          + '답변 수준: 전략·기획성 질문이면 결론 1줄 → 핵심 근거 → 실행 제안, 단순 질문이면 한두 문장으로 간결하게. 1200자 이내. 확인 안 된 숫자는 [확인 필요]. '
          + '마지막 메시지에 답변 본문만 출력하라. '
          + toneLine + hist + '질문: ' + question
        allowed = 'Read,Glob,Grep'
      }
      if (idLine) prompt = idLine + prompt
      // 팀장에게 지시한 내용을 트래커에 기록하고, 결과를 그 작업에 저장한다(창을 닫아도 남음).
      const taskId = addTaskRecord({ agent, task: question, source: 'chat' })
      spawnClaudeRaw(allowed, askModel, prompt, 180000, (code, out, err) => {
        if (code === 0 && out) {
          patchTask(taskId, { status: 'done', result: out.slice(0, 4000), completedAt: nowIso() })
          if (!res.writableEnded) json(res, 200, { answer: out, taskId })
        } else {
          patchTask(taskId, { status: 'error', error: (err || ('claude exit ' + code)).slice(0, 1000), completedAt: nowIso() })
          if (!res.writableEnded) json(res, 500, { error: err || ('claude exit ' + code) })
        }
      })
    } catch (e) { json(res, 500, { error: String(e) }) }
  })
}
