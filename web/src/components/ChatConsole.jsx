import { useEffect, useRef, useState } from 'react'
import JarvisCore from './JarvisCore.jsx'

// 음성모드 입력 — 마이크 오디오를 16kHz로 캡처해 WAV로 만들어 서버 /api/stt(RTZR 프록시)로 보낸다.
// 브라우저·Electron 모두 같은 서버 프록시 경로라 환경 분기가 필요 없다.

// Float32 PCM(mono) → 16-bit PCM WAV Blob. RTZR이 wav를 받으므로 서버측 트랜스코딩이 불필요하다.
function encodeWav(samples, sampleRate) {
  const buf = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buf)
  const w = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)) }
  w(0, 'RIFF'); view.setUint32(4, 36 + samples.length * 2, true); w(8, 'WAVE')
  w(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true)
  w(36, 'data'); view.setUint32(40, samples.length * 2, true)
  let off = 44
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true); off += 2
  }
  return new Blob([view], { type: 'audio/wav' })
}

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
  const [listening, setListening] = useState(false)   // 음성모드: 지금 사용자 발화를 녹음 중
  const [speaking, setSpeaking] = useState(false)
  const [converting, setConverting] = useState(false) // 녹음 구간을 RTZR로 변환 중
  const [voiceMode, setVoiceMode] = useState(false)   // 음성모드 ON/OFF (핸즈프리 입력)
  const voiceRef = useRef(null)                        // VAD 컨트롤러(정리용)
  const busyRef = useRef(busy); busyRef.current = busy
  const speakingRef = useRef(speaking); speakingRef.current = speaking
  const convertingRef = useRef(converting); convertingRef.current = converting
  const [typing, setTyping] = useState(false)
  const typingTimer = useRef(null)
  const onType = () => {
    // 키별 펄스 없이, 타이핑 중이라는 '상태'만 유지 → 오브가 자연스럽게(부드럽게) 깨어나 움직인다
    setTyping(true); clearTimeout(typingTimer.current); typingTimer.current = setTimeout(() => setTyping(false), 1400)
  }
  const coreState = (busy || converting) ? 'thinking' : (listening || voiceMode) ? 'listening' : speaking ? 'speaking' : typing ? 'typing' : 'idle'
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

  // 음성모드 마이크 정리(언마운트 시) — 채팅을 닫으면 마이크를 반드시 놓는다.
  useEffect(() => () => stopVoiceMode(), [])

  const mode = () => (deep ? 'deep' : 'fast')
  const send = () => {
    const v = inputRef.current.value.trim()
    if (!v || busy) return
    inputRef.current.value = ''
    onSend(v, mode())
  }

  // ── 음성모드(핸즈프리 입력) ─────────────────────────────────
  // ON: 마이크를 계속 열어두고 VAD(음성 활동 감지)로 '말하기 시작~침묵'을 잡아 그 구간만
  //     RTZR로 보내 자동 전송한다(마우스 클릭 불필요). 답변·변환·TTS 중엔 듣지 않고, 끝나면 자동 재개.
  const toggleVoiceMode = () => {
    if (voiceMode) { setVoiceMode(false); stopVoiceMode() }
    else { setVoiceMode(true); startVoiceMode() }
  }

  const stopVoiceMode = () => {
    const v = voiceRef.current
    if (v) {
      v.active = false
      try { v.proc.onaudioprocess = null; v.proc.disconnect(); v.source.disconnect() } catch (e) {}
      try { v.stream.getTracks().forEach(t => t.stop()) } catch (e) {}
      try { v.ctx.close() } catch (e) {}
      voiceRef.current = null
    }
    setListening(false)
  }

  const startVoiceMode = async () => {
    let stream
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }) }
    catch (e) { alert('마이크를 사용할 수 없습니다. Windows 설정 > 개인정보 보호 > 마이크에서 앱 접근을 허용해 주세요.'); setVoiceMode(false); return }
    const AC = window.AudioContext || window.webkitAudioContext
    const ctx = new AC({ sampleRate: 16000 })
    const source = ctx.createMediaStreamSource(stream)
    const proc = ctx.createScriptProcessor(4096, 1, 1)
    const sr = ctx.sampleRate
    const ctl = { active: true, stream, ctx, source, proc }
    voiceRef.current = ctl
    // VAD 파라미터(마이크·환경 따라 조정 가능)
    const START = 0.020                                  // 말하기 시작으로 보는 RMS
    const END = 0.012                                    // 침묵으로 보는 RMS
    const frameMs = 4096 / sr * 1000
    const endSilenceFrames = Math.ceil(900 / frameMs)    // ~0.9초 침묵이면 발화 끝
    const minVoicedFrames = Math.ceil(350 / frameMs)     // 최소 0.35초는 말해야 인정(노이즈 무시)
    let recording = false, frames = [], silence = 0, voiced = 0
    proc.onaudioprocess = (e) => {
      if (!ctl.active) return
      // 답변/변환/TTS 중엔 듣지 않음(겹침·자기 음성 방지). 상태 풀리면 자동 재개.
      if (busyRef.current || convertingRef.current || speakingRef.current) {
        if (recording) { recording = false; frames = []; silence = 0; voiced = 0; setListening(false) }
        return
      }
      const buf = e.inputBuffer.getChannelData(0)
      let sum = 0; for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
      const rms = Math.sqrt(sum / buf.length)
      if (!recording) {
        if (rms > START) { recording = true; frames = [new Float32Array(buf)]; silence = 0; voiced = 1; setListening(true) }
      } else {
        frames.push(new Float32Array(buf))
        if (rms < END) silence++; else { silence = 0; voiced++ }
        if (silence >= endSilenceFrames) {            // 발화 끝
          recording = false; setListening(false)
          const seg = frames; frames = []
          if (voiced >= minVoicedFrames) finalizeSegment(seg, sr)
          silence = 0; voiced = 0
        }
      }
    }
    source.connect(proc); proc.connect(ctx.destination)
  }

  // 녹음된 한 발화 → WAV → 서버 /api/stt(RTZR) → 텍스트 자동 전송
  const finalizeSegment = async (segFrames, sr) => {
    const total = segFrames.reduce((n, c) => n + c.length, 0)
    const audio = new Float32Array(total)
    let off = 0; for (const c of segFrames) { audio.set(c, off); off += c.length }
    if (audio.length < sr * 0.3) return
    const wav = encodeWav(audio, sr)
    setConverting(true)
    try {
      const r = await fetch('/api/stt', { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: wav }).then(x => x.json())
      console.log('[voice] /api/stt →', JSON.stringify(r).slice(0, 200))
      if (r.code === 'no_key') { alert('RTZR 음성 키가 설정되지 않았습니다. 설정 후 다시 음성모드를 켜 주세요.'); setVoiceMode(false); stopVoiceMode(); return }
      const txt = String((r.transcript) || '').trim()
      if (txt && !busyRef.current) onSend(txt, mode())
    } catch (e) { console.error('[voice] stt 실패:', e) }
    finally { setConverting(false) }
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
          <button className={'mic-btn' + (voiceMode ? ' on' : '')} onClick={toggleVoiceMode} title={voiceMode ? '음성모드 켜짐 — 말하면 자동 인식·전송 (눌러서 끄기)' : '음성모드 — 켜면 말로 자동 입력(핸즈프리)'}>{voiceMode ? '🎙️' : '🎤'}</button>
          <textarea ref={inputRef} rows={1} className="console-qin" disabled={busy} onChange={onType}
            placeholder={busy ? '응답을 기다리는 중…' : converting ? '음성 변환 중…' : voiceMode ? (listening ? '듣는 중… 말씀하세요' : '음성모드 ON — 말하면 자동 전송 (타이핑도 가능)') : dispName + ' 팀장에게 지시 (Enter 전송 · 🎤 음성모드)'}
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
