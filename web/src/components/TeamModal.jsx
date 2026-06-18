import { MODEL_LABEL } from './AgentEditModal.jsx'

const portraitOf = (a, c, id) => c.img || (a.custom ? '/agents/_custom.png' : '/agents/' + id + '.png')

export default function TeamModal({ agents, config, states, onChat, onEdit, onAdd, onDelete, onClose, companyName }) {
  const cfg = config || {}
  const ids = Object.keys(agents)
  return (
    <div className="modalbg" onClick={onClose}>
      <div className="modal dashmodal px" onClick={e => e.stopPropagation()}>
        <div className="gmhead">
          <span className="gmtitle">👥 내 AI 팀</span>
          <span className="gmmeta">팀장 {ids.length}명 · 카드=대화 · ⚙=편집 · ＋=추가</span>
          <button className="gmclose" onClick={onClose}>✕</button>
        </div>
        <div className="dashbody">
          <div className="teambanner">🏢 {(companyName && companyName !== 'AI') ? companyName : 'AI'} 디지털 오피스 — 팀장들이 지식금고를 컨텍스트로 상주합니다</div>
          <div className="teamgrid">
            {ids.map(id => {
              const a = agents[id]
              const c = cfg[id] || {}
              const nm = c.name || a.person
              const role = c.role || a.role
              const img = portraitOf(a, c, id)
              const model = c.model || a.model || 'sonnet'
              const st = (states && states[id]) || '대기 중'
              return (
                <div key={id} className="teamcard" style={{ borderColor: a.col }}>
                  <img className="teamportrait" src={img} alt={nm} style={{ borderColor: a.col }} onError={e => { e.currentTarget.src = a.custom ? '/agents/_custom.png' : '/agents/' + id + '.png' }} />
                  <div className="teammain">
                    <div className="teamname" style={{ color: a.col }}>{nm}{a.custom && <span style={{ fontSize: 10, opacity: 0.6 }}> · 커스텀</span>}</div>
                    <div className="teamrole">{role}</div>
                    <div className="teammeta">
                      <span className="teammodel" style={{ borderColor: a.col, color: a.col }}>{MODEL_LABEL[model]}</span>
                      <span className="teamstate" title={st}>{st}</span>
                    </div>
                    <div className="teamactions">
                      <button className="teambtn chat" onClick={() => onChat(id)} style={{ borderColor: a.col, color: a.col }}>대화 ▸</button>
                      <button className="teambtn gear" onClick={() => onEdit(id)} title="편집">⚙</button>
                      {a.custom && <button className="teambtn" onClick={() => onDelete && onDelete(id, nm)} title="삭제(커스텀)" style={{ color: '#FF8A8A', borderColor: 'rgba(255,90,90,0.4)' }}>🗑</button>}
                    </div>
                  </div>
                </div>
              )
            })}
            <button className="teamcard teamadd" onClick={onAdd}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 120, cursor: 'pointer', borderStyle: 'dashed', borderColor: 'rgba(0,255,150,0.4)', color: '#9FE8C0', background: 'rgba(0,255,110,0.04)', fontSize: 14 }}>
              ＋ 에이전트 추가
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
