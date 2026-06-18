import { useEffect, useRef, useState } from 'react'

export default function GitSyncModal({ onClose }) {
  const [st, setSt] = useState(null)
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState('')
  const [result, setResult] = useState(null)
  const urlRef = useRef(null)

  const load = () => fetch('/api/git-sync').then(r => r.json()).then(s => {
    setSt(s)
    if (urlRef.current && s.remote && !urlRef.current.value) urlRef.current.value = s.remote
  }).catch(() => setErr('git-sync API에 연결할 수 없습니다 (개발 서버 재시작 확인)'))
  useEffect(() => { load() }, [])

  const post = async (body) => {
    const res = await fetch('/api/git-sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const txt = await res.text()
    try { return JSON.parse(txt) } catch { throw new Error('서버 응답이 올바르지 않습니다 — 개발 서버를 재시작했는지 확인해 주세요(vite.config.js 변경 반영).') }
  }

  const saveRemote = async () => {
    const url = urlRef.current.value.trim()
    if (!url) return
    setBusy('save'); setErr(null)
    try {
      const r = await post({ action: 'setRemote', url })
      if (r.error) setErr(r.error); else { setErr(null); setSt(r) }
    } catch (e) { setErr(String(e.message || e)) }
    setBusy('')
  }
  const sync = async () => {
    setBusy('sync'); setErr(null); setResult(null)
    try {
      const r = await post({ action: 'sync' })
      if (r.error && !r.steps) setErr(r.error)
      setResult(r)
      load()
    } catch (e) { setErr(String(e.message || e)) }
    setBusy('')
  }

  return (
    <div className="modalbg" onClick={onClose}>
      <div className="modal dashmodal px" onClick={e => e.stopPropagation()}>
        <div className="gmhead">
          <span className="gmtitle">⬆ GitHub 동기화</span>
          <span className="gmmeta">{st ? (st.repo ? ('repo · ' + (st.branch || 'main') + (st.remote ? ' · 연결됨' : ' · 원격 미설정')) : 'git 저장소 아님') : '로딩…'}</span>
          <button className="gmclose" onClick={onClose}>✕</button>
        </div>
        <div className="dashbody gitbody">
          {st && st.gitOk === false && <div className="gmerr" style={{ position: 'static', padding: '10px' }}>PC에서 git을 찾지 못했습니다. git이 설치되어 있고 PATH에 잡히는지 확인하세요.</div>}
          {err && <div className="giterr">{err}</div>}

          <div className="gitsec">
            <div className="gitsec-h">저장소 주소</div>
            <div className="gitrow">
              <input ref={urlRef} className="qin giturl" placeholder="https://github.com/계정/저장소.git" defaultValue={(st && st.remote) || ''} />
              <button className="rbtn" onClick={saveRemote} disabled={!!busy}>{busy === 'save' ? '저장 중…' : '주소 저장'}</button>
            </div>
            <div className="gitnote">예: https://github.com/내계정/ai-office-backup.git · GitHub에서 빈 저장소를 먼저 만들어 두세요.</div>
          </div>

          <div className="gitsec">
            <button className="gitsync-btn" onClick={sync} disabled={!!busy || !(st && st.remote)}>
              {busy === 'sync' ? '⏳ 동기화 중…' : '⬆ 지금 동기화 (add · commit · pull · push)'}
            </button>
            {st && !st.remote && <div className="gitnote">먼저 저장소 주소를 저장하세요.</div>}
          </div>

          {result && (
            <div className="gitsec">
              <div className="gitsec-h">{result.ok ? '✅ 동기화 완료' : '⚠️ 동기화 실패'}</div>
              {result.steps && result.steps.map((s, i) => (
                <div key={i} className={'gitstep ' + (s.ok ? 'ok' : 'fail')}>
                  <span>{s.ok ? '✓' : '✕'} {s.label}</span><span className="gitmsg">{s.msg}</span>
                </div>
              ))}
              {result.error && <div className="giterr" style={{ marginTop: 8 }}>{result.error}</div>}
            </div>
          )}

          <div className="gitguide">
            <div className="gitsec-h">처음 한 번만 — GitHub 로그인</div>
            push가 되려면 이 PC에 GitHub 인증이 한 번 등록돼 있어야 합니다.
            <ul>
              <li>가장 쉬움: 터미널에서 <code>gh auth login</code> (GitHub CLI 설치 시)</li>
              <li>또는 첫 push 때 뜨는 <b>Git Credential Manager</b> 창에서 GitHub 로그인</li>
              <li>또는 Personal Access Token(PAT)을 비밀번호 대신 입력</li>
            </ul>
            한 번 로그인해두면 그 다음부턴 이 버튼만 누르면 됩니다.
          </div>
        </div>
      </div>
    </div>
  )
}
