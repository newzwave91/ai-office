import { useEffect, useRef, useState } from 'react'

export default function ChatModal({ agent, agentId, cfg, state, messages, busy, onSend, onClose }) {
  const dispName = (cfg && cfg.name) || agent.person
  const dispRole = (cfg && cfg.role) || agent.role
  const dispImg = (cfg && cfg.img) || ('/agents/' + agentId + '.png')
  const endRef = useRef(null)
  const inputRef = useRef(null)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (endRef.current) endRef.current.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, busy])

  useEffect(() => {
    if (!busy) { setElapsed(0); return }
    const t = setInterval(() => setElapsed(e => e + 1), 1000)
    return () => clearInterval(t)
  }, [busy])

  useEffect(() => {
    if (inputRef.current) inputRef.current.focus()
  }, [busy])

  const send = () => {
    const v = inputRef.current.value.trim()
    if (!v || busy) return
    inputRef.current.value = ''
    onSend(v)
  }

  return (
    <div className="modalbg" onClick={onClose}>
      <div className="modal apage px" onClick={e => e.stopPropagation()}>
        <button className="mclose floatclose" onClick={onClose} aria-label="닫기">✕</button>
        <div className="ahero" style={{ borderColor: agent.col }}>
          <img className="aportrait" src={dispImg} alt={dispName}
            style={{ borderColor: agent.col, boxShadow: '0 0 18px ' + agent.col + '44' }}
            onError={e => { e.currentTarget.src = '/agents/' + agentId + '.png' }} />
          <div className="ainfo">
            <div className="aname" style={{ color: agent.col }}>{dispName}<span className="arole"> · {dispRole}</span></div>
            {agent.tagline && <div className="atag">{agent.tagline}</div>}
            {agent.specialty && <div className="aspec">전문 · {agent.specialty}</div>}
            {agent.persona && <div className="apersona">“{agent.persona}”</div>}
            <div className="astate">
              <span className="adot" style={{ background: agent.col }} />
              {busy ? '답변 작성 중…' : (state || '대화 가능')}
            </div>
          </div>
        </div>
        <div className="mbody">
          {messages.map((m, i) => (
            <div key={i} className={'mrow ' + (m.who === 'user' ? 'me' : 'them')}>
              <div className={'mbub ' + (m.who === 'user' ? 'me' : 'them')}
                style={m.who === 'user' ? { background: '#404058' } : { borderColor: agent.col }}>
                {m.text}
                {m.saved && <div className="msaved">✓ 지식금고 적립 — {m.saved}</div>}
              </div>
            </div>
          ))}
          {busy && (
            <div className="mrow them">
              <div className="mbub them typing" style={{ borderColor: agent.col }}>
                금고를 확인하며 생각 중<span className="dots">...</span> {elapsed}초
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>
        {!busy && messages.length <= 1 && (
          <div className="mchips">
            {agent.chips.map((q, i) => (
              <button key={i} className="mchip" onClick={() => onSend(q)}>{q}</button>
            ))}
          </div>
        )}
        <div className="minput">
          <textarea ref={inputRef} rows={2} className="qin" disabled={busy}
            placeholder={busy ? '답변을 기다리는 중…' : agent.nm + ' 팀장에게 메시지 (Enter 전송)'}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} />
          <button className="rbtn" disabled={busy} onClick={send}>보내기</button>
        </div>
      </div>
    </div>
  )
}
