import { useEffect, useRef, useState } from 'react'
import JarvisCore from './JarvisCore.jsx'

export default function ChatConsole({ agent, agentId, cfg, state, messages, busy, onSend, onAdopt, onClose }) {
  const dispName = (cfg && cfg.name) || agent.person
  const dispRole = (cfg && cfg.role) || agent.role
  const defImg = agent.custom ? '/agents/_custom.png' : '/agents/' + agentId + '.png'
  const dispImg = (cfg && cfg.img) || defImg
  const endRef = useRef(null)
  const inputRef = useRef(null)
  const recRef = useRef(null)
  const spokenRef = useRef(0)
  const [elapsed, setElapsed] = useState(0)
  const [listening, setListening] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [typing, setTyping] = useState(false)
  const typingTimer = useRef(null)
  const onType = () => {
    // 키별 펄스 없이, 타이핑 중이라는 '상태'만 유지 → 오브가 자연스럽게(부드럽게) 깨어나 움직인다
    setTyping(true); clearTimeout(typingTimer.current); typingTimer.current = setTimeout(() => setTyping(false), 1400)
  }
  const coreState = busy ? 'thinking' : listening ? 'listening' : speaking ? 'speaking' : typing ? 'typing' : 'idle'
  const [deep, setDeep] = useState(false)
  const [tts, setTts] = useState(false)
  const [koVoices, setKoVoices] = useState([])
  const [voiceName, setVoiceName] = useState('')
  const [rate, setRate] = useState(1.05)
  const [tree, setTree] = useState(null)
  const [collapsed, setCollapsed] = useState({})
  const [openFile, setOpenFile] = useState(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const searchTimer = useRef(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const toggleFolder = label => setCollapsed(c => ({ ...c, [label]: !c[label] }))

  // 사용 가능한 한국어 음성 로드 + 최적 음성 자동 선택 (Google 한국의 우선)
  useEffect(() => {
    if (!window.speechSynthesis) return
    const pickBest = list => {
      if (!list.length) return ''
      const find = re => list.find(v => re.test(v.name))
      return (find(/google/i) || find(/yuna|heami|sun.?hi|nara|injoon|jisu/i) || list[0]).name
    }
    const load = () => {
      const all = window.speechSynthesis.getVoices() || []
      const ko = all.filter(v => (v.lang || '').toLowerCase().startsWith('ko'))
      setKoVoices(ko)
      setVoiceName(prev => prev || pickBest(ko))
    }
    load()
    window.speechSynthesis.onvoiceschanged = load
    return () => { try { window.speechSynthesis.onvoiceschanged = null } catch (e) {} }
  }, [])

  // 탐색기 로드 — 원문·외부자료·회의록·산출물 폴더는 기본 접힘
  useEffect(() => {
    fetch('/api/vault').then(r => r.json()).then(t => {
      setTree(t)
      const init = {}
      ;(t.groups || []).forEach(g => { if (/^(01_|02_|10_|90_)/.test(g.label)) init[g.label] = true })
      setCollapsed(init)
    }).catch(() => {})
  }, [])

  useEffect(() => { if (endRef.current) endRef.current.scrollIntoView({ behavior: 'smooth' }) }, [messages.length, busy])
  useEffect(() => {
    if (!busy) { setElapsed(0); return }
    const t = setInterval(() => setElapsed(e => e + 1), 1000); return () => clearInterval(t)
  }, [busy])

  // AI 음성 답변 (TTS) — 인사(첫 메시지) 제외, 새 답변만 읽기. 선택된 한국어 음성·속도 적용.
  const speak = (text) => {
    if (!tts || !window.speechSynthesis) return
    // 마크다운·이모지 등은 읽기 거슬리니 정리
    const clean = String(text).replace(/[#*`_>~|\-]+/g, ' ').replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').slice(0, 600)
    const u = new SpeechSynthesisUtterance(clean)
    u.lang = 'ko-KR'; u.rate = rate; u.pitch = 1.0
    const v = koVoices.find(x => x.name === voiceName)
    if (v) u.voice = v
    u.onstart = () => setSpeaking(true)
    u.onend = () => setSpeaking(false)
    u.onerror = () => setSpeaking(false)
    window.speechSynthesis.cancel(); window.speechSynthesis.speak(u)
  }
  useEffect(() => {
    const last = messages[messages.length - 1]
    if (messages.length > spokenRef.current && messages.length > 1 && last && last.who === 'agent') speak(last.text)
    spokenRef.current = messages.length
  }, [messages.length, tts])
  useEffect(() => () => { if (window.speechSynthesis) window.speechSynthesis.cancel() }, [])

  const mode = () => (deep ? 'deep' : 'fast')
  const send = () => {
    const v = inputRef.current.value.trim()
    if (!v || busy) return
    inputRef.current.value = ''
    onSend(v, mode())
  }

  // 보이스 받아쓰기
  const toggleVoice = () => {
    if (listening) { if (recRef.current) recRef.current.stop(); return }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { alert('이 브라우저는 음성 인식을 지원하지 않습니다. Chrome 또는 Edge에서 사용해 주세요.'); return }
    const rec = new SR()
    rec.lang = 'ko-KR'; rec.interimResults = true; rec.continuous = false
    rec.onresult = e => {
      let txt = ''
      for (let i = 0; i < e.results.length; i++) txt += e.results[i][0].transcript
      if (inputRef.current) inputRef.current.value = txt
      if (e.results[e.results.length - 1].isFinal && txt.trim() && !busy) {
        setListening(false)
        const v = txt.trim(); inputRef.current.value = ''; onSend(v, mode())
      }
    }
    rec.onerror = () => setListening(false)
    rec.onend = () => setListening(false)
    recRef.current = rec
    try { rec.start(); setListening(true) } catch (e) { setListening(false) }
  }

  const viewPath = async (p, name, isProtected) => {
    setEditing(false)
    try {
      const r = await fetch('/api/file?path=' + encodeURIComponent(p)).then(x => x.json())
      if (r.error) setOpenFile({ name, content: '열 수 없는 파일입니다: ' + r.error, error: true })
      else setOpenFile({ name, path: p, content: r.content, protected: !!isProtected })
    } catch (e) { setOpenFile({ name, content: '파일을 불러오지 못했습니다.', error: true }) }
  }

  // 열린 파일 저장(수정·보완). 보호 파일은 서버가 막는다.
  const saveFile = async () => {
    try {
      const r = await fetch('/api/file?path=' + encodeURIComponent(openFile.path), {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: draft })
      }).then(x => x.json())
      if (r.error) { window.alert('저장할 수 없습니다: ' + r.error); return }
      setOpenFile(o => ({ ...o, content: draft }))
      setEditing(false)
      reloadTree()
      if (query.trim()) runSearch(query)
    } catch (e) { window.alert('저장 중 오류가 발생했습니다.') }
  }

  // 탐색기 새로고침(접힘 상태 유지)
  const reloadTree = () => fetch('/api/vault').then(r => r.json()).then(setTree).catch(() => {})

  // 팀장이 제작한 파일을 휴지통(vault/.trash)으로 이동. 보호 파일은 서버가 막는다.
  const delPath = async (p, name) => {
    if (!window.confirm(`'${name}'\n이 파일을 휴지통으로 옮길까요? (vault/.trash 에서 복구 가능)`)) return
    try {
      const r = await fetch('/api/file?path=' + encodeURIComponent(p), { method: 'DELETE' }).then(x => x.json())
      if (r.error) { window.alert('삭제할 수 없습니다: ' + r.error); return }
      if (openFile && openFile.name === name) setOpenFile(null)
      reloadTree()
      if (query.trim()) runSearch(query)
    } catch (e) { window.alert('삭제 중 오류가 발생했습니다.') }
  }

  // 탐색기 검색 — 파일명·내용 동시 검색(서버), 입력 디바운스 250ms
  const runSearch = (q) => {
    setQuery(q)
    clearTimeout(searchTimer.current)
    if (!q.trim()) { setResults(null); return }
    searchTimer.current = setTimeout(() => {
      fetch('/api/search?q=' + encodeURIComponent(q.trim())).then(r => r.json()).then(j => setResults(j.results || [])).catch(() => setResults([]))
    }, 250)
  }

  return (
    <div className="console-root px">
      {/* 좌측 탐색기 */}
      <aside className="console-explorer">
        <div className="cexp-head">📁 탐색기</div>
        <div className="cexp-sub">D:\dev\ai-office\vault</div>
        <div className="cexp-search">
          <input className="cexp-searchin" value={query} onChange={e => runSearch(e.target.value)}
            placeholder="🔍 파일명·내용 검색" />
          {query && <button className="cexp-searchx" onClick={() => runSearch('')} title="검색 지우기">✕</button>}
        </div>
        <div className="cexp-tree">
          {results !== null ? (
            <div className="cexp-results">
              <div className="cexp-rhead">{results.length ? `결과 ${results.length}건` : `"${query}" 결과 없음`}</div>
              {results.map((r, i) => (
                <div key={i} className="cexp-result">
                  <div className="cexp-file-row">
                    <button className="cexp-file" onClick={() => viewPath(r.path, r.name, r.protected)} title={r.path}>
                      <span className="cexp-fico">📄</span>
                      <span className="cexp-fname">{r.name}</span>
                    </button>
                    {r.protected
                      ? <span className="cexp-lock" title="보호된 위키 시스템·원본 — 삭제할 수 없습니다">🔒</span>
                      : <button className="cexp-del" title="휴지통으로 이동" onClick={() => delPath(r.path, r.name)}>🗑</button>}
                  </div>
                  <div className="cexp-rmeta">{r.dir.replace(/^vault\//, '')}</div>
                  {r.snippet && <div className="cexp-rsnip">{r.snippet}</div>}
                </div>
              ))}
            </div>
          ) : (<>
            {!tree && <div className="cexp-empty">스캔 중…</div>}
            {tree && tree.groups.map((g, gi) => {
              const open = !collapsed[g.label]
              return (
                <div key={gi} className="cexp-grp">
                  <button className={'cexp-folder' + (open ? ' open' : '')} onClick={() => toggleFolder(g.label)}>
                    <span className="cexp-caret">{open ? '▾' : '▸'}</span>
                    <span className="cexp-flabel" title={g.label}>{g.label}</span>
                    <span className="cexp-fcount">{g.files.length}</span>
                  </button>
                  {open && g.files.map((f, fi) => (
                    <div key={fi} className="cexp-file-row">
                      <button className="cexp-file" onClick={() => f.name.endsWith('.md') ? viewPath(g.rel + '/' + f.name, f.name, f.protected) : null} title={f.name}>
                        <span className="cexp-fico">{f.name.endsWith('.md') ? '📄' : '•'}</span>
                        <span className="cexp-fname">{f.name}</span>
                      </button>
                      {f.name.endsWith('.md') && (f.protected
                        ? <span className="cexp-lock" title="보호된 위키 시스템·원본 — 삭제할 수 없습니다">🔒</span>
                        : <button className="cexp-del" title="휴지통으로 이동" onClick={() => delPath(g.rel + '/' + f.name, f.name)}>🗑</button>
                      )}
                    </div>
                  ))}
                </div>
              )
            })}
          </>)}
        </div>
      </aside>

      {/* 메인 콘솔 */}
      <main className="console-main">
        <div className="console-top">
          <div className="console-agent">
            <img className="console-portrait" src={dispImg} alt={dispName} style={{ borderColor: agent.col }} onError={e => { e.currentTarget.src = defImg }} />
            <div>
              <div className="console-name" style={{ color: agent.col }}>{dispName}<span className="console-role"> · {dispRole}</span></div>
              <div className="console-state"><span className="adot" style={{ background: agent.col }} />{busy ? '응답 작성 중…' : (state || '대기 중')}</div>
            </div>
          </div>
          <div className="console-tools">
            <button className={'sndbtn px modebtn' + (deep ? ' deep' : '')} onClick={() => setDeep(v => !v)} title={deep ? '금고 모드: 지식금고를 깊이 검색하고 자동 적립 (느림)' : '빠른 모드: 읽기 전용·적립 안 함 (빠름)'}>{deep ? '🧠 금고' : '⚡ 빠른'}</button>
            <button className={'sndbtn px' + (tts ? '' : ' off')} onClick={() => { setTts(v => !v); if (window.speechSynthesis) window.speechSynthesis.cancel() }} title="AI 음성 답변 켜기/끄기">{tts ? '🔊 음성' : '🔇 음성'}</button>
            {tts && koVoices.length > 0 && (
              <select className="voicesel px" value={voiceName} onChange={e => setVoiceName(e.target.value)} title="한국어 음성 선택">
                {koVoices.map(v => <option key={v.name} value={v.name}>{v.name.replace(/\s*\(.*\)\s*/, '').replace('Microsoft ', '').replace('Google ', 'Google ').slice(0, 22)}</option>)}
              </select>
            )}
            {tts && (
              <select className="voicesel px" value={rate} onChange={e => setRate(parseFloat(e.target.value))} title="읽기 속도">
                <option value={0.9}>느리게</option>
                <option value={1.05}>보통</option>
                <option value={1.25}>빠르게</option>
              </select>
            )}
            <button className="sndbtn px" onClick={onClose}>✕ 닫기</button>
          </div>
        </div>

        <div className="console-stagewrap">
          <div className="console-core">
            <div className="jarvis-stage"><JarvisCore state={coreState} size={520} color={agent.col} label={dispName} /></div>
            <div className="console-corelabel">{
              coreState === 'thinking' ? '· 처리 중 ·' : coreState === 'listening' ? '· 듣는 중 ·' : coreState === 'speaking' ? '· 응답 중 ·' : coreState === 'typing' ? '· 입력 감지 ·' : '· 대기 ·'
            }</div>
          </div>
          <div className="console-conv">
            {messages.map((m, i) => (
              <div key={i} className={'mrow ' + (m.who === 'user' ? 'me' : 'them')}>
                <div className={'mbub ' + (m.who === 'user' ? 'me' : 'them')} style={m.who === 'user' ? { background: '#404058' } : { borderColor: agent.col }}>
                  {m.text}
                  {m.saved && <div className="msaved">✓ 지식금고 적립 — {m.saved}</div>}
                  {m.who === 'agent' && i > 0 && !m.saved && (
                    <button className="adoptbtn" disabled={m.adopting} onClick={() => onAdopt && onAdopt(i)}>{m.adopting ? '⏳ 적립 중…' : '💾 금고에 적립'}</button>
                  )}
                </div>
              </div>
            ))}
            {busy && (
              <div className="mrow them"><div className="mbub them typing" style={{ borderColor: agent.col }}>금고를 확인하며 생각 중<span className="dots">...</span> {elapsed}초</div></div>
            )}
            <div ref={endRef} />
          </div>
        </div>

        {!busy && messages.length <= 1 && (
          <div className="console-chips">
            {agent.chips.map((q, i) => <button key={i} className="mchip" onClick={() => onSend(q, mode())}>{q}</button>)}
          </div>
        )}

        <div className="console-input">
          <button className={'mic-btn' + (listening ? ' on' : '')} onClick={toggleVoice} disabled={busy} title="음성으로 지시 (Chrome/Edge)">🎤</button>
          <textarea ref={inputRef} rows={1} className="console-qin" disabled={busy} onChange={onType}
            placeholder={busy ? '응답을 기다리는 중…' : (listening ? '듣고 있어요… 말씀하세요' : dispName + ' 팀장에게 지시 (Enter 전송 · 🎤 음성)')}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} />
          <button className="rbtn" disabled={busy} onClick={send}>전송</button>
        </div>
      </main>

      {/* 파일 뷰어 */}
      {openFile && (
        <div className="cfileview-back" onClick={() => { setOpenFile(null); setEditing(false) }}>
          <div className="cfileview" onClick={e => e.stopPropagation()}>
            <div className="cfileview-head"><span>📄 {openFile.name}{editing && <span style={{ color: '#FFD54A' }}> · 수정 중</span>}</span><button className="gmclose" onClick={() => { setOpenFile(null); setEditing(false) }}>✕</button></div>
            {editing
              ? <textarea className="cfileview-edit" value={draft} onChange={e => setDraft(e.target.value)} autoFocus />
              : <pre className="cfileview-body">{openFile.content}</pre>}
            {!openFile.error && (
              <div className="cfileview-foot">
                {openFile.protected ? (
                  <span className="cfileview-locknote">🔒 보호된 위키 시스템·원본 — 수정·삭제할 수 없습니다</span>
                ) : editing ? (<>
                  <button className="cfv-btn save" onClick={saveFile}>💾 저장</button>
                  <button className="cfv-btn" onClick={() => setEditing(false)}>취소</button>
                </>) : (<>
                  <button className="cfv-btn" onClick={() => { setDraft(openFile.content); setEditing(true) }}>✏ 수정</button>
                  <button className="cfv-btn del" onClick={() => delPath(openFile.path, openFile.name)}>🗑 휴지통</button>
                </>)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
