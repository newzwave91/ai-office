import { useEffect, useMemo, useRef, useState } from 'react'
import { createGame } from './game/engine.js'
import { AGENTS, CABINETS } from './game/data.js'
import ChatConsole from './components/ChatConsole.jsx'
import StoragePanel from './components/StoragePanel.jsx'
import CeoModal from './components/CeoModal.jsx'
import DashboardModal from './components/DashboardModal.jsx'
import TrackerModal from './components/TrackerModal.jsx'
import TeamModal from './components/TeamModal.jsx'
import AgentEditModal from './components/AgentEditModal.jsx'
import AgentAddModal from './components/AgentAddModal.jsx'
import BrainInjection from './components/BrainInjection.jsx'
import GitSyncModal from './components/GitSyncModal.jsx'
import MatrixRain from './fx/MatrixRain.jsx'
import { uiOpen, uiClose, uiSend, uiRecv, uiBlip } from './fx/audio.js'

export default function App() {
  const cvRef = useRef(null)
  const ovlRef = useRef(null)
  const gameRef = useRef(null)

  const [chatId, setChatId] = useState(null)
  const [hist, setHist] = useState({})
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)
  const [clock, setClock] = useState('--:--')
  const [states, setStates] = useState({})
  const [showCeo, setShowCeo] = useState(false)
  const [showDash, setShowDash] = useState(false)
  const [showTracker, setShowTracker] = useState(false)
  const [showTeam, setShowTeam] = useState(false)
  const [editId, setEditId] = useState(null)
  const [inject, setInject] = useState(null)
  const [showGit, setShowGit] = useState(false)
  const [agentCfg, setAgentCfg] = useState({})
  const [company, setCompany] = useState({ name: '', industry: '' })
  const [customAgents, setCustomAgents] = useState({})
  const [showAdd, setShowAdd] = useState(false)

  const fetchCfg = () => fetch('/api/agent-config').then(r => r.json()).then(c => setAgentCfg(c || {})).catch(() => {})
  const fetchAgents = () => fetch('/api/agents').then(r => r.json()).then(j => setCustomAgents(j.agents || {})).catch(() => {})
  useEffect(() => { fetchCfg(); fetchAgents() }, [])
  useEffect(() => { fetch('/api/company').then(r => r.json()).then(c => setCompany(c || {})).catch(() => {}) }, [])
  const officeTitle = (company.name && company.name.trim()) ? company.name.trim() : 'AI'
  useEffect(() => { document.title = officeTitle + ' 오피스' }, [officeTitle])

  // 기본 5명 + 커스텀 에이전트 병합(커스텀은 AGENTS 형태로 변환). 픽셀 캐릭터는 기본 5명만.
  const AG_ALL = useMemo(() => {
    const m = { ...AGENTS }
    for (const id of Object.keys(customAgents)) {
      const c = customAgents[id]
      m[id] = {
        person: c.name, nm: c.name, role: c.role || '팀장', col: c.col || '#7CE0FF', model: c.model || 'sonnet',
        specialty: c.desc || '', persona: '', intro: c.intro || '', tagline: c.role || '',
        chips: (c.chips && c.chips.length) ? c.chips : ['지금 가장 도움이 필요한 일이 뭐야?', '이번 주 우선순위를 정리해줘'],
        custom: true
      }
    }
    return m
  }, [customAgents])
  const agentCount = Object.keys(AG_ALL).length

  const deleteAgent = async (id, nm) => {
    if (!window.confirm(`'${nm}' 팀장을 삭제할까요? (페르소나 파일은 휴지통으로 이동)`)) return
    try {
      const r = await fetch('/api/agents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', id }) }).then(x => x.json())
      if (r.error) { window.alert(r.error); return }
      if (chatId === id) closeChat()
      setCustomAgents(r.agents || {})
    } catch (e) { window.alert('삭제 실패 — 서버 연결을 확인해 주세요') }
  }

  const AG_NM = { director: '총괄', marketing: '마케팅', strategy: '전략', ops: '운영', review: '검토' }
  const onDispatch = (ids) => {
    if (gameRef.current) gameRef.current.dispatch(ids)
    const names = ids.map(i => AG_NM[i] || i).join('·')
    setToast({ col: '#00FF88', nm: 'CEO 디스패치', text: names + ' 팀장에게 작업을 배정했습니다.' })
    setTimeout(() => setToast(null), 5000)
  }

  const openChat = id => {
    uiOpen()
    setChatId(id)
    setHist(h => h[id] ? h : { ...h, [id]: [] })
  }

  const closeChat = () => {
    uiClose()
    if (chatId) gameRef.current.release(chatId)
    setChatId(null)
  }

  const sendMsg = async (id, text, mode = 'fast') => {
    uiSend()
    const prev = hist[id] || []
    setHist(h => ({ ...h, [id]: [...prev, { who: 'user', text }] }))
    setBusy(true)
    try {
      const r = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent: id, question: text, history: prev, mode })
      })
      const j = await r.json()
      let ans = j.answer || ('응답에 실패했어요. (' + (j.error || '알 수 없는 오류') + ')')
      let saved = null
      const m = ans.match(/\[금고 적립:\s*([^\]]+)\]/)
      if (m) { saved = m[1].trim(); ans = ans.replace(m[0], '').trim() }
      uiRecv()
      setHist(h => ({ ...h, [id]: [...(h[id] || []), { who: 'agent', text: ans, saved }] }))
      if (saved) setInject(saved)
    } catch (e) {
      setHist(h => ({ ...h, [id]: [...(h[id] || []), { who: 'agent', text: '서버 연결에 실패했어요. 개발 서버(npm run dev)를 확인해 주세요.' }] }))
    }
    setBusy(false)
  }

  const adoptMsg = async (id, idx) => {
    const msgs = hist[id] || []
    const answer = msgs[idx] && msgs[idx].text
    if (!answer) return
    let question = ''
    for (let i = idx - 1; i >= 0; i--) { if (msgs[i] && msgs[i].who === 'user') { question = msgs[i].text; break } }
    const mark = (patch) => setHist(h => { const a = [...(h[id] || [])]; if (a[idx]) a[idx] = { ...a[idx], ...patch }; return { ...h, [id]: a } })
    mark({ adopting: true })
    try {
      const r = await fetch('/api/adopt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agent: id, question, answer }) }).then(x => x.json())
      mark({ adopting: false, saved: r.saved || undefined })
      if (r.saved) setInject(r.saved)
      else { setToast({ col: '#FFD54A', nm: '적립', text: '보존할 신규 지식이 없어 적립하지 않았어요.' }); setTimeout(() => setToast(null), 4000) }
    } catch (e) {
      mark({ adopting: false })
      setToast({ col: '#FF7A8A', nm: '적립 실패', text: '서버 연결을 확인해 주세요.' }); setTimeout(() => setToast(null), 4000)
    }
  }

  useEffect(() => {
    const game = createGame(cvRef.current, ovlRef.current, {
      onAmbient: () => { },
      onSelectChar: id => openChat(id),
      onCabinet: key => {
        uiBlip()
        const cb = CABINETS[key]
        setToast({ col: cb.col, nm: cb.nm, text: cb.info })
        setTimeout(() => setToast(null), 5000)
      }
    })
    gameRef.current = game
    const st = setInterval(() => setStates({ ...game.getStates() }), 1000)
    const clk = setInterval(() => {
      const d = new Date()
      setClock(String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'))
    }, 1000)
    return () => { game.destroy(); clearInterval(clk); clearInterval(st) }
  }, [])

  const summon = id => {
    if (!AGENTS[id]) { openChat(id); return }   // 커스텀(픽셀 캐릭터 없음) → 바로 채팅 열기
    if (chatId && chatId !== id) gameRef.current.release(chatId)
    gameRef.current.focus(id)
  }

  return (
    <>
      <MatrixRain />
      <div className="wrap">
        <div className="hdr px">
          <div>
            <div className="htitle">{officeTitle} OFFICE</div>
            <div className="hdesc">AI 팀장 {agentCount}명이 상주하는 디지털 오피스</div>
          </div>
          <div className="hright">
            <span className="hsub">SYS ONLINE · {clock} · AGENTS {agentCount}</span>
            <button className="sndbtn px" onClick={() => setShowTeam(true)}>👥 팀</button>
            <button className="sndbtn px" onClick={() => setShowCeo(true)}>🧭 CEO</button>
            <button className="sndbtn px" onClick={() => setShowDash(true)}>🏢 대시보드</button>
            <button className="sndbtn px" onClick={() => setShowTracker(true)}>✅ 작업</button>
            <button className="sndbtn px" onClick={() => setShowGit(true)}>⬆ GitHub</button>
          </div>
        </div>
        <div className="cols">
          <div>
            <div className="gframe">
              <canvas ref={cvRef} width={240} height={176} />
              <div ref={ovlRef} className="ovl" />
              {toast && (
                <div className="toast px" style={{ borderColor: toast.col }}>
                  <span style={{ color: toast.col }}>{toast.nm}</span> {toast.text}
                </div>
              )}
            </div>
            <div className="foot px">팀장 카드나 픽셀 캐릭터를 클릭하면 통신 채널이 열립니다 · 보존 가치가 있는 내용은 지식금고에 자동 적립</div>
          </div>
          <div className="sidecol">
            <div className="roster">
              {Object.keys(AG_ALL).map(id => {
                const a = AG_ALL[id]
                const defImg = a.custom ? '/agents/_custom.png' : '/agents/' + id + '.png'
                return (
                  <button key={id} className={'rcard px' + (chatId === id ? ' on' : '')}
                    style={{ borderColor: chatId === id ? a.col : undefined }} onClick={() => summon(id)}>
                    <img className="ravatar-img" src={(agentCfg[id] && agentCfg[id].img) || defImg} alt={a.person}
                      style={{ borderColor: a.col }} onError={e => { e.currentTarget.src = defImg }} />
                    <span className="rinfo">
                      <span className="rname">{(agentCfg[id] && agentCfg[id].name) || a.person} · {(agentCfg[id] && agentCfg[id].role) || a.role}</span>
                      <span className="rstate">{states[id] || (a.custom ? '대기 중' : '접속 중')}</span>
                    </span>
                    <span className="rtalk" style={{ color: a.col }}>접속 ▸</span>
                  </button>
                )
              })}
            </div>
            <StoragePanel />
          </div>
        </div>
        {chatId && AG_ALL[chatId] && (
          <ChatConsole agent={AG_ALL[chatId]} agentId={chatId} cfg={agentCfg[chatId]} state={states[chatId]}
            messages={hist[chatId] || []} busy={busy}
            onSend={(t, m) => sendMsg(chatId, t, m)} onAdopt={idx => adoptMsg(chatId, idx)} onClose={closeChat} />
        )}
        {showCeo && <CeoModal onDispatch={onDispatch} onClose={() => setShowCeo(false)} />}
        {showDash && <DashboardModal onClose={() => setShowDash(false)} />}
        {showTracker && <TrackerModal onClose={() => setShowTracker(false)} />}
        {showTeam && (
          <TeamModal agents={AG_ALL} config={agentCfg} states={states} companyName={officeTitle}
            onChat={id => { setShowTeam(false); openChat(id) }}
            onEdit={id => setEditId(id)} onAdd={() => { setShowTeam(false); setShowAdd(true) }}
            onDelete={deleteAgent} onClose={() => setShowTeam(false)} />
        )}
        {editId && AG_ALL[editId] && (
          <AgentEditModal agentId={editId} agent={AG_ALL[editId]} config={agentCfg[editId]}
            onSaved={() => { fetchCfg(); fetchAgents() }} onClose={() => setEditId(null)} />
        )}
        {showAdd && (
          <AgentAddModal onAdded={(agents) => { setCustomAgents(agents || {}); }} onClose={() => setShowAdd(false)} />
        )}
        {inject && <BrainInjection title={inject} onDone={() => setInject(null)} />}
        {showGit && <GitSyncModal onClose={() => setShowGit(false)} />}
      </div>
    </>
  )
}
