import { useEffect, useRef, useState } from 'react'
import TaskDetailModal from './TaskDetailModal.jsx'

const AG = { director: { n: '총괄', c: '#4FC3F7' }, marketing: { n: '마케팅', c: '#FF7A45' }, strategy: { n: '전략', c: '#B388FF' }, ops: { n: '운영', c: '#00E5C0' }, review: { n: '검토', c: '#FFD54A' } }
const STAT = { todo: '할 일', doing: '진행 중', done: '완료' }
const GROUPS = ['todo', 'doing', 'done']
const SRC = { ceo: 'CEO 배정', chat: '팀장 대화' }
// 오류 작업은 완료 칸에 묶어 보여준다(끝난 작업이므로).
const col = x => x.status === 'error' ? 'done' : (x.status || 'todo')
// 목록용 한 줄 요약: 결과의 첫 의미 있는 줄을 짧게.
const preview = s => { const l = String(s || '').split('\n').map(x => x.trim()).find(Boolean) || ''; return l.length > 64 ? l.slice(0, 64) + '…' : l }

export default function TrackerModal({ onClose }) {
  const [t, setT] = useState(null)
  const [err, setErr] = useState(null)
  const [selId, setSelId] = useState(null)
  const inputRef = useRef(null)
  const agRef = useRef(null)

  const load = () => fetch('/api/tracker').then(r => r.json()).then(j => { if (j.error) setErr(j.error); else { setT(j); setErr(null) } }).catch(() => setErr('트래커 API에 연결할 수 없습니다'))
  // 백그라운드 작업이 진행 중→완료로 바뀌는 걸 실시간 반영하기 위해 주기적으로 새로고침한다.
  useEffect(() => { load(); const iv = setInterval(load, 2500); return () => clearInterval(iv) }, [])
  const post = (body) => fetch('/api/tracker', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()).then(setT).catch(() => setErr('저장 실패'))

  const add = () => { const v = inputRef.current.value.trim(); if (!v) return; inputRef.current.value = ''; post({ action: 'add', agent: agRef.current.value, task: v }) }
  const tasks = (t && t.tasks) || []
  const openCount = tasks.filter(x => x.status !== 'done' && x.status !== 'error').length
  // 상세 창이 열려 있는 동안에도 폴링 결과로 갱신되도록 id로 다시 찾는다.
  const sel = selId ? tasks.find(x => x.id === selId) : null

  return (
    <div className="modalbg" onClick={onClose}>
      <div className="modal dashmodal px" onClick={e => e.stopPropagation()}>
        <div className="gmhead">
          <span className="gmtitle">✅ 작업 트래커</span>
          <span className="gmmeta">{t ? (openCount + '건 진행 · ' + tasks.length + '건 전체') : (err ? '오류' : '로딩…')}</span>
          <button className="gmclose" onClick={onClose}>✕</button>
        </div>
        <div className="dashbody">
          {err && <div className="gmerr">{err}<br /><span style={{ opacity: 0.7 }}>개발 서버 재시작을 확인해 주세요.</span></div>}
          <div className="trkadd">
            <select ref={agRef} className="trksel" defaultValue="director">
              {Object.keys(AG).map(id => <option key={id} value={id}>{AG[id].n}</option>)}
            </select>
            <input ref={inputRef} className="qin trkin" placeholder="새 작업 추가 (Enter)" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }} />
            <button className="rbtn" onClick={add}>추가</button>
          </div>
          {GROUPS.map(gk => {
            const rows = tasks.filter(x => col(x) === gk)
            return (
              <div key={gk} className="trkgroup">
                <div className="trkgh">{STAT[gk]} · {rows.length}</div>
                {rows.map(x => {
                  const c = (AG[x.agent] || {}).c || '#888'
                  const isErr = x.status === 'error'
                  const sum = isErr ? preview(x.error) : preview(x.result)
                  return (
                    <div key={x.id} className="trkrow" style={{ borderLeftColor: isErr ? '#FF7A8A' : c, flexWrap: 'wrap', cursor: 'pointer' }}
                      onClick={() => setSelId(x.id)} title="클릭하면 지시·결과 전문 보기">
                      <span className="trkag" style={{ color: c }}>{(AG[x.agent] || {}).n || x.agent}</span>
                      <span className="trktask">
                        {x.task}
                        {x.source && SRC[x.source] && <span className="trksrc"> · {SRC[x.source]}</span>}
                        {x.status === 'doing' && <span style={{ color: '#00E5C0' }}> · ⏳ 실행 중…</span>}
                        {isErr && <span style={{ color: '#FF7A8A' }}> · ⚠ 오류</span>}
                        {sum && <span style={{ display: 'block', opacity: 0.6, fontSize: 12, marginTop: 3 }}>↳ {sum}</span>}
                      </span>
                      <span className="trkbtns" onClick={e => e.stopPropagation()}>
                        {(x.result || x.error) && <button title="지시·결과 전문 보기" onClick={() => setSelId(x.id)}>보기</button>}
                        {gk === 'todo' && <button title="진행 시작" onClick={() => post({ action: 'update', id: x.id, status: 'doing' })}>▶</button>}
                        {gk === 'doing' && <button title="완료" onClick={() => post({ action: 'update', id: x.id, status: 'done' })}>✓</button>}
                        {gk === 'done' && <button title="되돌리기" onClick={() => post({ action: 'update', id: x.id, status: 'todo' })}>↺</button>}
                        <button title="삭제" onClick={() => post({ action: 'delete', id: x.id })}>✕</button>
                      </span>
                    </div>
                  )
                })}
                {rows.length === 0 && <div className="dempty">없음</div>}
              </div>
            )
          })}
        </div>
      </div>
      {sel && <TaskDetailModal task={sel} onClose={() => setSelId(null)} />}
    </div>
  )
}
