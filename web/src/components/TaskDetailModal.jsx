// 작업 상세 창 — 트래커에서 작업을 선택하면 떠서, 어떤 지시를 했고 어떤 결과가 나왔는지 전문을 보여준다.
const AG = { director: { n: '총괄 Neo', c: '#4FC3F7' }, marketing: { n: '마케팅 Echo', c: '#FF7A45' }, strategy: { n: '전략 Oracle', c: '#B388FF' }, ops: { n: '운영 Link', c: '#00E5C0' }, review: { n: '검토 Glitch', c: '#FFD54A' } }
const STAT = { todo: { n: '할 일', c: '#9aa' }, doing: { n: '진행 중', c: '#00E5C0' }, done: { n: '완료', c: '#00FF88' }, error: { n: '오류', c: '#FF7A8A' } }
const SRC = { ceo: 'CEO 배정', chat: '팀장 대화' }

export default function TaskDetailModal({ task, onClose }) {
  if (!task) return null
  const ag = AG[task.agent] || { n: task.agent, c: '#888' }
  const st = STAT[task.status] || { n: task.status || '할 일', c: '#9aa' }
  const instruction = task.detail || task.task
  const isErr = task.status === 'error'

  return (
    <div className="modalbg" style={{ zIndex: 1000 }} onClick={e => { e.stopPropagation(); onClose() }}>
      <div className="modal apage px" onClick={e => e.stopPropagation()} style={{ maxWidth: 720 }}>
        <button className="mclose floatclose" onClick={onClose} aria-label="닫기">✕</button>
        <div className="ahero" style={{ borderColor: ag.c }}>
          <div className="ceobadge" style={{ background: ag.c }}>📋</div>
          <div className="ainfo">
            <div className="aname" style={{ color: ag.c }}>{ag.n}<span className="arole"> · 작업 상세</span></div>
            <div className="atag">
              <span style={{ color: st.c }}>● {st.n}</span>
              {task.source && SRC[task.source] && <span style={{ opacity: 0.7 }}> · {SRC[task.source]}</span>}
            </div>
            <div className="aspec">
              {task.created && <span>등록 {task.created}</span>}
              {task.completedAt && <span> · 완료 {task.completedAt}</span>}
            </div>
          </div>
        </div>
        <div className="mbody" style={{ display: 'block' }}>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 5, letterSpacing: 1 }}>▸ 지시한 내용</div>
            <div style={{ padding: 12, background: 'rgba(255,255,255,0.04)', borderRadius: 8, borderLeft: '3px solid ' + ag.c, whiteSpace: 'pre-wrap', lineHeight: 1.6, fontSize: 14 }}>
              {instruction}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 5, letterSpacing: 1 }}>▸ {isErr ? '오류' : '결과'}</div>
            {(task.result || task.error) ? (
              <div style={{ padding: 12, background: 'rgba(0,0,0,0.28)', borderRadius: 8, borderLeft: '3px solid ' + (isErr ? '#FF7A8A' : '#00FF88'), whiteSpace: 'pre-wrap', lineHeight: 1.65, fontSize: 13.5, color: isErr ? '#FFB4B4' : '#dfe' }}>
                {task.error || task.result}
              </div>
            ) : (
              <div style={{ padding: 12, opacity: 0.55, fontStyle: 'italic' }}>
                {task.status === 'doing' ? '⏳ 팀장이 작업 중입니다… 잠시 후 결과가 여기 표시됩니다.' : '아직 결과가 없습니다.'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
