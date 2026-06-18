import { useEffect, useRef, useState } from 'react'

const AG = { director: '총괄 Neo', marketing: '마케팅 Echo', strategy: '전략 Oracle', ops: '운영 Link', review: '검토 Glitch' }
const CHIPS = ['이번 주 우선순위를 정리해줘', '신규 고객 1곳 늘릴 실행안 잡아줘', '지금 회사에서 가장 시급한 일 하나만 골라줘']

export default function CeoModal({ onDispatch, onClose }) {
  const [msgs, setMsgs] = useState([{ who: 'agent', text: '대표님, 한 줄로 지시해 주세요. 제가 성격을 분류해 담당 팀장에게 배정하고 종합 보고드리겠습니다.' }])
  const [busy, setBusy] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const endRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => { if (endRef.current) endRef.current.scrollIntoView({ behavior: 'smooth' }) }, [msgs, busy])
  useEffect(() => {
    if (!busy) { setElapsed(0); return }
    const t = setInterval(() => setElapsed(e => e + 1), 1000)
    return () => clearInterval(t)
  }, [busy])
  useEffect(() => { if (inputRef.current) inputRef.current.focus() }, [busy])

  const send = async (text) => {
    if (!text || busy) return
    const prev = msgs
    setMsgs(m => [...m, { who: 'user', text }])
    setBusy(true)
    try {
      const r = await fetch('/api/ceo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: text, history: prev }) })
      const j = await r.json()
      const ans = j.answer || ('응답 실패 (' + (j.error || '알 수 없는 오류') + ')')
      const plan = j.plan
      setMsgs(m => [...m, { who: 'agent', text: ans, plan }])
      if (plan && Array.isArray(plan.tasks) && plan.tasks.length) {
        const ids = [...new Set(plan.tasks.map(t => t.agent))]
        if (onDispatch) onDispatch(ids, plan)
        // 트래커 등록·백그라운드 실행은 서버(/api/ceo)가 이미 처리함 — 창을 닫아도 유지·완료됨
      }
    } catch (e) {
      setMsgs(m => [...m, { who: 'agent', text: '서버 연결에 실패했어요. vite.config.js 수정 후 개발 서버를 재시작했는지 확인해 주세요.' }])
    }
    setBusy(false)
  }
  const submit = () => { const v = inputRef.current.value.trim(); if (!v || busy) return; inputRef.current.value = ''; send(v) }

  return (
    <div className="modalbg" onClick={onClose}>
      <div className="modal apage px" onClick={e => e.stopPropagation()}>
        <button className="mclose floatclose" onClick={onClose} aria-label="닫기">✕</button>
        <div className="ahero" style={{ borderColor: '#00FF88' }}>
          <div className="ceobadge">🧭</div>
          <div className="ainfo">
            <div className="aname" style={{ color: '#00FF88' }}>CEO 오케스트레이터<span className="arole"> · 헤르메스 방식</span></div>
            <div className="atag">한 줄 지시 → 분류 → 담당 팀장 배정 → 종합 보고</div>
            <div className="aspec">최소 동원 원칙 적용 · 배정된 작업은 트래커에 자동 등록되고 오피스에 디스패치됩니다</div>
            <div className="astate"><span className="adot" style={{ background: '#00FF88' }} />{busy ? '분류·배정 중…' : '대기 중'} · Opus 4.8</div>
          </div>
        </div>
        <div className="mbody">
          {msgs.map((m, i) => (
            <div key={i} className={'mrow ' + (m.who === 'user' ? 'me' : 'them')}>
              <div className={'mbub ' + (m.who === 'user' ? 'me' : 'them')} style={m.who === 'user' ? { background: '#404058' } : { borderColor: '#00FF88' }}>
                {m.text}
                {m.plan && Array.isArray(m.plan.tasks) && m.plan.tasks.length > 0 && (
                  <div className="planbox">
                    <div className="planlabel">배정 ▸</div>
                    {m.plan.tasks.map((t, k) => (<div key={k} className="planrow"><b>{AG[t.agent] || t.agent}</b> — {t.task}</div>))}
                    <div className="plannote">✓ 작업 트래커에 등록 · 백그라운드 실행 중 (창을 닫아도 진행되고 결과는 트래커에 남습니다)</div>
                  </div>
                )}
              </div>
            </div>
          ))}
          {busy && (
            <div className="mrow them">
              <div className="mbub them typing" style={{ borderColor: '#00FF88' }}>분류·배정 중<span className="dots">...</span> {elapsed}초</div>
            </div>
          )}
          <div ref={endRef} />
        </div>
        {!busy && msgs.length <= 1 && (
          <div className="mchips">{CHIPS.map((q, i) => <button key={i} className="mchip" onClick={() => send(q)}>{q}</button>)}</div>
        )}
        <div className="minput">
          <textarea ref={inputRef} rows={2} className="qin" disabled={busy}
            placeholder={busy ? '배정 중…' : 'CEO에게 한 줄 지시 (Enter 전송)'}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }} />
          <button className="rbtn" disabled={busy} onClick={submit}>지시</button>
        </div>
      </div>
    </div>
  )
}
