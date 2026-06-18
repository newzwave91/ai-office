import { useEffect, useState } from 'react'

const LOGS = ['> 인젝션 프로토콜 시작', '> 지식 파싱·구조화', '> 신경망 채널 동기화', '> 두뇌 구획에 전송', '> 주입 완료 ✓']

export default function BrainInjection({ title, onDone }) {
  const [pct, setPct] = useState(0)
  const [lines, setLines] = useState([])

  useEffect(() => {
    let p = 0
    const iv = setInterval(() => {
      p = Math.min(100, p + Math.round(7 + Math.random() * 11))
      setPct(p)
      if (p >= 100) { clearInterval(iv); setTimeout(() => onDone && onDone(), 700) }
    }, 130)
    const tos = LOGS.map((l, i) => setTimeout(() => setLines(x => [...x, l]), 200 * i + 120))
    return () => { clearInterval(iv); tos.forEach(clearTimeout) }
  }, [])

  return (
    <div className="binj-back">
      <div className="binj px">
        <div className="binj-brain">🧠</div>
        <div className="binj-title">브레인 인젝션</div>
        <div className="binj-sub">B R A I N&nbsp;&nbsp;I N J E C T I O N</div>
        {title && <div className="binj-name">“{title}” 적립</div>}
        <div className="binj-bar"><div className="binj-fill" style={{ width: pct + '%' }} /></div>
        <div className="binj-pct">학습 데이터로 변환 … {pct}%</div>
        <div className="binj-log">{lines.map((l, i) => <div key={i}>{l}</div>)}</div>
      </div>
    </div>
  )
}
