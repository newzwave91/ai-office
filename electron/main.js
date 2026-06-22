// Electron 메인 프로세스
// 흐름: 작업폴더 준비 → 온보딩 창(claude 설치/로그인 확인) → 인증 완료 시 프로덕션 서버 기동 → 본 앱 창
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { startServer } from '../server/index.js'
import { readCompanyInfo, saveCompanyInfo } from '../server/office-api.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isDev = !app.isPackaged

// userData 폴더명을 제품명으로 고정 (%APPDATA%/AI팀장오피스). getPath 사용 전에 호출해야 함.
app.setName('AI팀장오피스')

// ── 경로 해석 ────────────────────────────────────────────────
// 패키징 시: web/dist 와 seed(.claude/CLAUDE.md/vault-template)는 extraResources로 동봉.
const RES = isDev ? path.resolve(__dirname, '..') : process.resourcesPath
const DIST_DIR = isDev ? path.join(RES, 'web', 'dist') : path.join(RES, 'web-dist')
const SEED_DIR = isDev ? path.join(RES, 'electron', 'seed') : path.join(RES, 'seed')

// 작업폴더(쓰기 가능): vault·.claude·CLAUDE.md가 여기 살고, claude가 이 폴더를 cwd로 실행됨
const WORKSPACE = path.join(app.getPath('userData'), 'workspace')

let mainWindow = null
let onboardWindow = null
let httpServer = null
let serverPort = 0

// ── 유틸: 디렉터리 재귀 복사 ─────────────────────────────────
function copyDir(src, dst) {
  if (!fs.existsSync(src)) return
  fs.mkdirSync(dst, { recursive: true })
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name)
    const d = path.join(dst, e.name)
    if (e.isDirectory()) copyDir(s, d)
    else fs.copyFileSync(s, d)
  }
}

// 첫 실행/업데이트 시 작업폴더 구성
// - .claude/, CLAUDE.md: 항상 seed에서 갱신(제품 업데이트 반영)
// - vault/: 없을 때만 빈 템플릿 복사(고객 데이터 보존)
function ensureWorkspace() {
  fs.mkdirSync(WORKSPACE, { recursive: true })
  // 1) .claude 갱신
  const claudeSeed = path.join(SEED_DIR, '.claude')
  if (fs.existsSync(claudeSeed)) {
    fs.rmSync(path.join(WORKSPACE, '.claude'), { recursive: true, force: true })
    copyDir(claudeSeed, path.join(WORKSPACE, '.claude'))
  }
  // 2) CLAUDE.md 갱신
  const mdSeed = path.join(SEED_DIR, 'CLAUDE.md')
  if (fs.existsSync(mdSeed)) fs.copyFileSync(mdSeed, path.join(WORKSPACE, 'CLAUDE.md'))
  // 3) vault: 최초만 템플릿 복사
  const vaultDir = path.join(WORKSPACE, 'vault')
  if (!fs.existsSync(vaultDir)) {
    const vaultSeed = path.join(SEED_DIR, 'vault-template')
    if (fs.existsSync(vaultSeed)) copyDir(vaultSeed, vaultDir)
    else fs.mkdirSync(vaultDir, { recursive: true })
  }
  // vault 폴더 골격 보장 — 패키징에서 빈 폴더가 누락돼도 항상 완전한 옵시디언 구조를 만든다(매 실행 idempotent)
  for (const f of ['00_지식금고/공통', '00_지식금고/마케팅', '00_지식금고/전략', '00_지식금고/운영', '00_지식금고/검토', '00_지식금고/총괄', '01_원문', '02_외부자료', '10_회의록', '90_산출물']) {
    fs.mkdirSync(path.join(vaultDir, f), { recursive: true })
  }
  // 사용 가이드라인 보장 — 기존 설치는 업데이트 시 시드에서 보충(사용자가 이미 가진 파일은 덮지 않음)
  const guideDst = path.join(vaultDir, '00_지식금고', '가이드라인.md')
  const guideSeed = path.join(SEED_DIR, 'vault-template', '00_지식금고', '가이드라인.md')
  if (!fs.existsSync(guideDst) && fs.existsSync(guideSeed)) fs.copyFileSync(guideSeed, guideDst)
}

// ── claude 바이너리 해석 ─────────────────────────────────────
// 네이티브 설치(~/.local/bin), npm 전역 등 여러 위치를 시도. 찾으면 dir를 PATH 앞에 붙여
// 인프로세스 서버의 spawn('claude')도 동일하게 찾도록 한다.
function claudeCandidates() {
  const home = app.getPath('home')
  const appdata = process.env.APPDATA || path.join(home, 'AppData', 'Roaming')
  const localapp = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local')
  return [
    path.join(home, '.local', 'bin', 'claude.exe'),
    path.join(home, '.local', 'bin', 'claude'),
    path.join(appdata, 'npm', 'claude.cmd'),
    path.join(appdata, 'npm', 'claude.ps1'),
    path.join(localapp, 'Programs', 'claude', 'claude.exe')
  ]
}
function resolveClaudeDir() {
  for (const c of claudeCandidates()) {
    if (fs.existsSync(c)) return path.dirname(c)
  }
  return null
}
function ensureClaudeOnPath() {
  const dir = resolveClaudeDir()
  if (dir && !(process.env.PATH || '').split(path.delimiter).includes(dir)) {
    process.env.PATH = dir + path.delimiter + (process.env.PATH || '')
  }
  return dir
}

// claude 서브커맨드 실행(쉘 경유 — .cmd/.ps1/native 모두 대응)
function runClaude(args, timeoutMs = 30000) {
  return new Promise(resolve => {
    let p
    try { p = spawn('claude', args, { shell: true, windowsHide: true }) }
    catch (e) { return resolve({ code: -1, out: '', err: String(e) }) }
    let out = '', err = ''
    const timer = setTimeout(() => { try { p.kill() } catch {}; resolve({ code: -2, out, err: 'timeout' }) }, timeoutMs)
    p.stdout.on('data', d => { out += d })
    p.stderr.on('data', d => { err += d })
    p.on('error', e => { clearTimeout(timer); resolve({ code: -1, out, err: String(e) }) })
    p.on('close', code => { clearTimeout(timer); resolve({ code, out: out.trim(), err: err.trim() }) })
  })
}

// ── IPC: 온보딩 단계 ─────────────────────────────────────────
ipcMain.handle('check-claude', async () => {
  ensureClaudeOnPath()
  const v = await runClaude(['--version'], 15000)
  const installed = v.code === 0 && /\d+\.\d+/.test(v.out)
  return { installed, version: installed ? v.out : null }
})

ipcMain.handle('install-claude', async () => {
  // 네이티브 인스톨러(npm/Node 불필요)
  const cmd = 'irm https://claude.ai/install.ps1 | iex'
  const r = await new Promise(resolve => {
    const p = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', cmd], { windowsHide: true })
    let out = '', err = ''
    p.stdout.on('data', d => { out += d; sendOnboard('install-log', String(d)) })
    p.stderr.on('data', d => { err += d; sendOnboard('install-log', String(d)) })
    p.on('error', e => resolve({ code: -1, err: String(e) }))
    p.on('close', code => resolve({ code, out, err }))
  })
  ensureClaudeOnPath()
  const v = await runClaude(['--version'], 15000)
  const ok = v.code === 0 && /\d+\.\d+/.test(v.out)
  return { ok, version: ok ? v.out : null, error: ok ? null : (r.err || 'claude 설치 후에도 실행을 확인하지 못했습니다.') }
})

ipcMain.handle('auth-status', async () => {
  ensureClaudeOnPath()
  const r = await runClaude(['auth', 'status'], 20000)
  try {
    const j = JSON.parse(r.out)
    return { loggedIn: !!j.loggedIn, email: j.email || null, plan: j.subscriptionType || null }
  } catch {
    return { loggedIn: false, email: null, plan: null, raw: (r.out || r.err || '').slice(0, 300) }
  }
})

// 로그인: 사용자가 직접 OAuth를 완료하도록 터미널 창에서 claude auth login 실행
ipcMain.handle('auth-login', async () => {
  ensureClaudeOnPath()
  // 보이는 콘솔 창에서 로그인(브라우저 OAuth가 열림). 완료 여부는 렌더러가 auth-status 폴링으로 확인.
  spawn('cmd', ['/c', 'start', '"Claude 로그인"', 'cmd', '/k', 'claude auth login'], { shell: true, windowsHide: false })
  return { started: true }
})

// ── 회사 정보 — 서버와 공유하는 헬퍼 사용(company.json 단일 소스 + CLAUDE.md 마커) ──
ipcMain.handle('get-company', async () => readCompanyInfo(WORKSPACE))
ipcMain.handle('save-company', async (_e, info) => {
  try { saveCompanyInfo(WORKSPACE, info); return { ok: true } }
  catch (e) { return { ok: false, error: String(e) } }
})

// 음성 받아쓰기(STT) 비밀키 주입 — userData/stt-config.json(=git 동기화 폴더 밖)에서 읽어 env로 넘긴다.
// 서버(office-api.js)는 process.env.RTZR_CLIENT_ID/SECRET만 읽으므로 키가 vault·exe에 노출되지 않는다.
function loadSttKeyIntoEnv() {
  try {
    const f = path.join(app.getPath('userData'), 'stt-config.json')
    if (!fs.existsSync(f)) return
    const cfg = JSON.parse(fs.readFileSync(f, 'utf8'))
    const id = cfg.clientId || cfg.client_id
    const secret = cfg.clientSecret || cfg.client_secret
    if (id && !process.env.RTZR_CLIENT_ID) process.env.RTZR_CLIENT_ID = String(id)
    if (secret && !process.env.RTZR_CLIENT_SECRET) process.env.RTZR_CLIENT_SECRET = String(secret)
  } catch { /* 무시 — 키 없으면 음성모드만 비활성, 앱은 정상 */ }
}

ipcMain.handle('start-app', async () => {
  if (!httpServer) {
    loadSttKeyIntoEnv()
    const r = await startServer({ root: WORKSPACE, distDir: DIST_DIR, port: 0, host: '127.0.0.1' })
    httpServer = r.server
    serverPort = r.port
  }
  await openMainWindow()
  if (onboardWindow) { onboardWindow.close(); onboardWindow = null }
  return { ok: true, port: serverPort }
})

function sendOnboard(channel, payload) {
  if (onboardWindow && !onboardWindow.isDestroyed()) onboardWindow.webContents.send(channel, payload)
}

// ── 창 ───────────────────────────────────────────────────────
function openOnboarding() {
  onboardWindow = new BrowserWindow({
    width: 560, height: 640, resizable: false, title: 'AI 팀장 오피스 — 설정',
    backgroundColor: '#0a0a0f',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false }
  })
  onboardWindow.setMenuBarVisibility(false)
  onboardWindow.loadFile(path.join(__dirname, 'onboarding.html'))
}

async function openMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 820, title: 'AI 팀장 오피스', backgroundColor: '#0a0a0f',
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  })
  mainWindow.setMenuBarVisibility(false)
  // 마이크 권한 명시 허용 — 음성 받아쓰기(getUserMedia)용. media 외에는 거부.
  mainWindow.webContents.session.setPermissionRequestHandler((wc, perm, cb) => cb(perm === 'media' || perm === 'audioCapture'))
  // 외부 링크는 기본 브라우저로
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' } })
  await mainWindow.loadURL(`http://127.0.0.1:${serverPort}/`)
}

app.whenReady().then(() => {
  ensureWorkspace()
  ensureClaudeOnPath()
  openOnboarding()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) openOnboarding()
  })
})

app.on('window-all-closed', () => {
  if (httpServer) { try { httpServer.close() } catch {} }
  if (process.platform !== 'darwin') app.quit()
})
