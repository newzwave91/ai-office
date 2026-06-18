let ctx = null
let enabled = false   // 모든 효과음 끔(무음). 켜려면 true.

export function setEnabled(v) { enabled = v }
export function isEnabled() { return enabled }

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    ctx = new AC()
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => { })
  return ctx
}

function tone(freq, dur, type, vol, when) {
  if (!enabled) return
  const c = ac()
  if (!c || c.state !== 'running') return
  const t = c.currentTime + (when || 0)
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type || 'square'
  o.frequency.value = freq
  g.gain.setValueAtTime(vol || 0.04, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g)
  g.connect(c.destination)
  o.start(t)
  o.stop(t + dur + 0.02)
}

// 짧고 은은한 "마우스 클릭" 틱. 사용자 행동(버튼 클릭·제출)에만 사용.
export function uiClick() {
  tone(1250, 0.018, 'square', 0.03)
  tone(1900, 0.012, 'square', 0.02, 0.012)
}

// 평소에 나던 소리들은 모두 끔 (앰비언트·자동음 제거). import 호환 위해 함수는 유지.
export function mumble() { }
export function uiOpen() { }
export function uiClose() { }
export function uiSend() { }
export function uiRecv() { }
export function uiBlip() { }

if (typeof window !== 'undefined') {
  const wake = () => { ac() }
  window.addEventListener('pointerdown', wake, { once: true })
  window.addEventListener('keydown', wake, { once: true })

  // 버튼·클릭 가능한 UI를 누를 때만 클릭음
  const CLICKABLE = 'button, .mchip, .cexp-file, .rcard, [role="button"]'
  document.addEventListener('click', e => {
    if (!enabled) return
    const t = e.target
    if (t && t.closest && t.closest(CLICKABLE)) uiClick()
  }, true)

  // Enter로 제출할 때도 클릭음 (입력창에서 Shift+Enter 줄바꿈은 제외)
  const SUBMIT_FIELDS = 'textarea, input[type="text"], .qin, .console-qin, .giturl, .trkin'
  document.addEventListener('keydown', e => {
    if (!enabled) return
    if (e.key !== 'Enter' || e.shiftKey) return
    const t = e.target
    if (t && t.matches && t.matches(SUBMIT_FIELDS)) uiClick()
  }, true)
}
