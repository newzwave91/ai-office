// 프로덕션 독립 서버 — 빌드된 프론트(web/dist)와 /api/*를 같은 주소로 서빙한다.
// dev의 vite와 동일한 registerOfficeApi를 재사용하므로 동작이 일치한다.
import http from 'node:http'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import connect from 'connect'
import serveStatic from 'serve-static'
import { registerOfficeApi } from './office-api.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// root: .claude/, CLAUDE.md, vault/를 담은 작업 디렉터리(쓰기 가능)
// distDir: 빌드된 프론트(web/dist)
export function startServer({ root, distDir, port = 0, host = '127.0.0.1' }) {
  const app = connect()
  registerOfficeApi(app, root)
  // 런타임에 업로드된 커스텀 초상화(root/web/public/agents/*) 서빙 — dist보다 먼저
  app.use(serveStatic(path.join(root, 'web', 'public')))
  app.use(serveStatic(distDir, { index: ['index.html'] }))
  // SPA fallback: 정적으로 못 찾은 GET은 index.html로
  app.use((req, res) => {
    const idx = path.join(distDir, 'index.html')
    if (fs.existsSync(idx)) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      fs.createReadStream(idx).pipe(res)
    } else {
      res.statusCode = 404
      res.end('빌드된 프론트(web/dist)를 찾을 수 없습니다.')
    }
  })
  return new Promise(resolve => {
    const srv = http.createServer(app)
    srv.listen(port, host, () => resolve({ server: srv, port: srv.address().port, host }))
  })
}

// CLI 직접 실행 지원: node server/index.js [port]
// (테스트·디버그용. ROOT=저장소 루트, distDir=web/dist)
const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedDirectly) {
  const ROOT = process.env.OFFICE_ROOT || path.resolve(__dirname, '..')
  const distDir = process.env.OFFICE_DIST || path.join(ROOT, 'web', 'dist')
  const port = Number(process.argv[2] || process.env.PORT || 4317)
  startServer({ root: ROOT, distDir, port }).then(({ port, host }) => {
    console.log(`[office] http://${host}:${port}  (root=${ROOT})`)
  })
}
