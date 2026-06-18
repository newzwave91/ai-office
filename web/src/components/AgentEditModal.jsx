import { useRef, useState } from 'react'

export const MODEL_LABEL = { opus: 'Opus 4.8', sonnet: 'Sonnet 4.6', haiku: 'Haiku 4.5' }
const MODEL_DESC = { opus: '최고 성능 · 전략·창작·복잡한 판단', sonnet: '균형 · 빠르고 똑똑한 기본값', haiku: '초고속 · 단순 조회·요약·분류' }
export const TONE_LABEL = { calm: '차분함', balanced: '균형', creative: '창의적', strict: '깐깐함' }
const TONE_ICON = { calm: '🌙', balanced: '⚖️', creative: '✨', strict: '🔎' }

export default function AgentEditModal({ agentId, agent, config, onSaved, onClose }) {
  const cfg = config || {}
  const [name, setName] = useState(cfg.name || agent.person)
  const [role, setRole] = useState(cfg.role || agent.role)
  const [desc, setDesc] = useState(cfg.desc || agent.specialty)
  const [model, setModel] = useState(cfg.model || 'sonnet')
  const [tone, setTone] = useState(cfg.tone || 'balanced')
  const [img, setImg] = useState(cfg.img || ('/agents/' + agentId + '.png'))
  const [busy, setBusy] = useState(false)
  const [recommending, setRecommending] = useState(false)
  const fileRef = useRef(null)

  const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json())

  const recommend = async () => {
    if (recommending || (!name.trim() && !desc.trim())) return
    setRecommending(true)
    const ctrl = new AbortController()
    const to = setTimeout(() => ctrl.abort(), 20000)
    try {
      const r = await fetch('/api/recommend-role', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, desc }), signal: ctrl.signal }).then(x => x.json())
      if (r && r.role) setRole(r.role)
    } catch (e) { /* 취소/실패 무시 */ }
    finally { clearTimeout(to); setRecommending(false) }
  }

  const save = async () => {
    setBusy(true)
    try {
      const c = await post('/api/agent-config', { agentId, name, role, desc, model, tone })
      onSaved && onSaved(c)
      onClose()
    } catch (e) { /* noop */ }
    setBusy(false)
  }

  const upload = (e) => {
    const f = e.target.files && e.target.files[0]
    if (!f) return
    if (f.size > 3 * 1024 * 1024) { alert('이미지가 너무 큽니다 (3MB 이하).'); return }
    const reader = new FileReader()
    reader.onload = async () => {
      setBusy(true)
      try {
        const r = await post('/api/agent-portrait', { agentId, dataUrl: reader.result })
        if (r.img) { setImg(r.img); onSaved && onSaved(null, true) }
      } catch (e) { /* noop */ }
      setBusy(false)
    }
    reader.readAsDataURL(f)
  }

  const reset = async () => {
    setBusy(true)
    try {
      await post('/api/agent-portrait', { agentId, reset: true })
      const c = await post('/api/agent-config', { agentId, reset: true })
      onSaved && onSaved(c, true)
      onClose()
    } catch (e) { /* noop */ }
    setBusy(false)
  }

  return (
    <div className="modalbg" onClick={onClose}>
      <div className="modal apage px" onClick={e => e.stopPropagation()}>
        <button className="mclose floatclose" onClick={onClose} aria-label="닫기">✕</button>
        <div className="ahero" style={{ borderColor: agent.col }}>
          <div className="aedit-portrait">
            <img className="aportrait" src={img} alt={name} style={{ borderColor: agent.col }} onError={e => { e.currentTarget.src = '/agents/' + agentId + '.png' }} />
            <button className="aedit-cam" onClick={() => fileRef.current && fileRef.current.click()} disabled={busy} title="사진 변경">📷</button>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} onChange={upload} />
          </div>
          <div className="ainfo">
            <input className="aedit-name" value={name} onChange={e => setName(e.target.value)} maxLength={30} style={{ color: agent.col }} placeholder="이름" />
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input className="aedit-role" value={role} onChange={e => setRole(e.target.value)} maxLength={40} placeholder="직함 (예: 마케팅팀장)" style={{ flex: 1 }} />
              <button className="aedit-reset" onClick={recommend} disabled={busy} title="회사 맥락으로 직책 추천">{recommending ? '🤖 추천 중…' : '🤖 추천'}</button>
            </div>
          </div>
        </div>
        <div className="aedit-body">
          <div className="aedit-sec">
            <div className="aedit-h">🎯 역할·전문분야</div>
            <textarea className="aedit-desc" value={desc} onChange={e => setDesc(e.target.value)} maxLength={600} rows={4}
              placeholder="이 팀장이 어떤 역할·전문성을 갖는지 설명 (예: 데이터 분석가 — 지표 관리, 리포트 자동화, 인사이트 도출)" />
            <div className="aedit-note">여기에 적은 역할이 AI 답변의 전문성을 결정합니다. 직함과 함께 답변에 반영됩니다.</div>
          </div>
          <div className="aedit-sec">
            <div className="aedit-h">🤖 두뇌 (Claude 모델)</div>
            <div className="aedit-models">
              {['opus', 'sonnet', 'haiku'].map(k => (
                <button key={k} className={'aedit-model' + (model === k ? ' on' : '')} style={model === k ? { borderColor: agent.col } : {}} onClick={() => setModel(k)}>
                  <div className="amname" style={model === k ? { color: agent.col } : {}}>{MODEL_LABEL[k]}</div>
                  <div className="amdesc">{MODEL_DESC[k]}</div>
                </button>
              ))}
            </div>
          </div>
          <div className="aedit-sec">
            <div className="aedit-h">🎭 성격</div>
            <div className="aedit-tones">
              {['calm', 'balanced', 'creative', 'strict'].map(k => (
                <button key={k} className={'aedit-tone' + (tone === k ? ' on' : '')} style={tone === k ? { borderColor: agent.col, color: agent.col } : {}} onClick={() => setTone(k)}>
                  {TONE_ICON[k]} {TONE_LABEL[k]}
                </button>
              ))}
            </div>
            <div className="aedit-note">성격은 답변 톤에 반영됩니다. (Claude는 샘플링 파라미터 대신 톤 가이드로 적용)</div>
          </div>
        </div>
        <div className="aedit-foot">
          <button className="aedit-reset" onClick={reset} disabled={busy}>기본값으로 복원</button>
          <button className="rbtn" onClick={save} disabled={busy}>{busy ? '저장 중…' : '저장'}</button>
        </div>
      </div>
    </div>
  )
}
