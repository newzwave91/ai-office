import { useEffect, useState } from 'react'
import { MODEL_LABEL, TONE_LABEL } from './AgentEditModal.jsx'

const MODEL_DESC = { opus: '최고 성능', sonnet: '균형(기본)', haiku: '초고속' }
const TONE_ICON = { calm: '🌙', balanced: '⚖️', creative: '✨', strict: '🔎' }
const COLORS = ['#7CE0FF', '#FF8AD8', '#A0FF8A', '#FFB870', '#C8A0FF', '#8AF0E0', '#FF7A8A', '#E0E060']

export default function AgentAddModal({ onAdded, onClose }) {
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [desc, setDesc] = useState('')
  const [col, setCol] = useState('#7CE0FF')
  const [model, setModel] = useState('sonnet')
  const [tone, setTone] = useState('balanced')
  const [busy, setBusy] = useState(false)            // 추가(페르소나 생성) 진행
  const [recommending, setRecommending] = useState(false)  // 직책 추천 진행(폼 전체를 잠그지 않음)
  const [rec, setRec] = useState(null)        // 직책 추천 결과 요약
  const [err, setErr] = useState(null)

  // 안내 메시지는 2.5초 뒤 자동 소멸 — 입력칸은 내내 활성(잠그지 않음)
  useEffect(() => { if (!err) return; const t = setTimeout(() => setErr(null), 2500); return () => clearTimeout(t) }, [err])

  const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json())

  const recommend = async () => {
    if (recommending) return                       // 재진입 가드(버튼을 disabled로 만들지 않음 → 포커스 안 튕김)
    if (!name.trim() && !desc.trim()) { setErr('이름이나 역할 설명을 먼저 입력하세요'); return }
    setRecommending(true); setErr(null)
    const ctrl = new AbortController()
    const to = setTimeout(() => ctrl.abort(), 20000)
    try {
      const r = await fetch('/api/recommend-role', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, desc }), signal: ctrl.signal }).then(x => x.json())
      if (r.error) setErr(r.error)
      else { if (r.role) setRole(r.role); setRec(r.summary || null) }
    } catch (e) { setErr('추천이 지연돼 취소했어요. 직책은 직접 입력하셔도 됩니다.') }
    finally { clearTimeout(to); setRecommending(false) }
  }

  const add = async () => {
    if (!name.trim()) { setErr('이름을 입력하세요'); return }
    setBusy(true); setErr(null)
    try {
      const r = await post('/api/agents', { name, role, desc, col, model, tone })
      if (r.error) { setErr(r.error); return }
      onAdded && onAdded(r.agents, r.agent)
      onClose()
    } catch (e) { setErr('추가 실패 — 서버 연결을 확인해 주세요') }
    finally { setBusy(false) }
  }

  return (
    <div className="modalbg" onClick={onClose}>
      <div className="modal apage px" onClick={e => e.stopPropagation()}>
        <button className="mclose floatclose" onClick={onClose} aria-label="닫기">✕</button>
        <div className="ahero" style={{ borderColor: col }}>
          <div className="aedit-portrait">
            <img className="aportrait" src="/agents/_custom.png" alt="새 팀장" style={{ borderColor: col }} />
          </div>
          <div className="ainfo">
            <div className="aname" style={{ color: col }}>＋ 새 AI 팀장 추가</div>
            <div className="atag">이름·역할을 적으면 AI가 직책을 추천하고 페르소나를 자동 생성합니다</div>
            <div className="aspec">지식금고와 회사 컨텍스트 기반 · 명단/팀/채팅에 바로 추가됩니다</div>
          </div>
        </div>
        <div className="aedit-body">
          <div className="aedit-sec">
            <div className="aedit-h">👤 이름 · 직책</div>
            <input className="aedit-name" value={name} onChange={e => setName(e.target.value)} maxLength={30} style={{ color: col }} placeholder="이름 (예: Iris)" autoFocus />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input className="aedit-role" value={role} onChange={e => setRole(e.target.value)} maxLength={40} placeholder="직책 (비우면 AI가 추천)" style={{ flex: 1 }} />
              <button className="aedit-reset" onClick={recommend} disabled={busy} title="회사 맥락으로 직책 추천">{recommending ? '🤖 추천 중…' : '🤖 직책 추천'}</button>
            </div>
            {rec && <div className="aedit-note" style={{ color: col }}>추천 근거: {rec}</div>}
          </div>
          <div className="aedit-sec">
            <div className="aedit-h">🎯 역할·전문분야 (선택)</div>
            <textarea className="aedit-desc" value={desc} onChange={e => setDesc(e.target.value)} maxLength={600} rows={3}
              placeholder="이 팀장이 어떤 역할·전문성을 갖는지 (비우면 이름·회사 맥락으로 AI가 추론)" />
          </div>
          <div className="aedit-sec">
            <div className="aedit-h">🎨 색상</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {COLORS.map(c => (
                <button key={c} onClick={() => setCol(c)} title={c}
                  style={{ width: 26, height: 26, borderRadius: '50%', background: c, border: col === c ? '2px solid #fff' : '2px solid transparent', cursor: 'pointer' }} />
              ))}
              <input type="color" value={col} onChange={e => setCol(e.target.value)} style={{ width: 30, height: 26, background: 'transparent', border: 'none', cursor: 'pointer' }} />
            </div>
          </div>
          <div className="aedit-sec">
            <div className="aedit-h">🤖 두뇌 (모델)</div>
            <div className="aedit-models">
              {['opus', 'sonnet', 'haiku'].map(k => (
                <button key={k} className={'aedit-model' + (model === k ? ' on' : '')} style={model === k ? { borderColor: col } : {}} onClick={() => setModel(k)}>
                  <div className="amname" style={model === k ? { color: col } : {}}>{MODEL_LABEL[k]}</div>
                  <div className="amdesc">{MODEL_DESC[k]}</div>
                </button>
              ))}
            </div>
          </div>
          <div className="aedit-sec">
            <div className="aedit-h">🎭 성격</div>
            <div className="aedit-tones">
              {['calm', 'balanced', 'creative', 'strict'].map(k => (
                <button key={k} className={'aedit-tone' + (tone === k ? ' on' : '')} style={tone === k ? { borderColor: col, color: col } : {}} onClick={() => setTone(k)}>
                  {TONE_ICON[k]} {TONE_LABEL[k]}
                </button>
              ))}
            </div>
          </div>
          {err && <div className="gmerr" style={{ marginTop: 6 }}>{err}</div>}
        </div>
        <div className="aedit-foot">
          {busy ? <span className="aedit-note">🧠 AI가 페르소나 생성 중… (최대 1분)</span> : <span />}
          <button className="rbtn" onClick={add} disabled={busy}>{busy ? '생성 중…' : '＋ 추가'}</button>
        </div>
      </div>
    </div>
  )
}
