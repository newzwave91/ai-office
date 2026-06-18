import { useEffect, useRef } from 'react'

// 상태별 에너지(0~1). 색은 팀장 색(color prop). 대기(idle)도 활성 수준, 입력은 ~2배 속도.
// 대기는 차분(act≈0 → 데이터필드 OFF·느림·어둑), 활성은 확연히 깨어남(act 높음 → 필드 ON·빠름·밝음)
const ENERGY = { idle: 0.3, typing: 0.72, listening: 1.0, thinking: 0.92, speaking: 0.96 }
const TAU = Math.PI * 2
// 레퍼런스(jarvis.png) 픽셀 분석값: 좌측 골드 호 ≈ rgb(212,184,74), 하이라이트 ≈ rgb(248,222,140)
const AMBER = [214, 186, 74]
const AMBER_HI = [248, 222, 140]
const DEG = Math.PI / 180

const toRgb = (hex) => {
  let h = String(hex || '').replace('#', '')
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  const n = parseInt(h, 16)
  return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [45, 170, 255]
}

export default function JarvisCore({ state = 'idle', size = 450, color = '#2DAAFF', label = '' }) {
  const canvasRef = useRef(null)
  const stateRef = useRef(state); stateRef.current = state
  const colorRef = useRef([45, 170, 255]); colorRef.current = toRgb(color)
  const labelRef = useRef(label); labelRef.current = label
  const ripples = useRef([])

  useEffect(() => {
    const cv = canvasRef.current
    if (!cv) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    cv.width = size * dpr; cv.height = size * dpr
    const g = cv.getContext('2d'); g.scale(dpr, dpr)
    const cx = size / 2, cy = size / 2, R = size * 0.42
    // 리서치: 단일 스케일 팩터로 선두께·블러를 통일(반경은 R 기준 유지)
    const S = Math.max(size / 520, 0.5)
    const lerp = (a, b, k) => a + (b - a) * k
    const easeOut = (p) => 1 - Math.pow(1 - p, 3)
    const hash = (i) => { const s = Math.sin(i * 12.9898 + 4.1) * 43758.5453; return s - Math.floor(s) }
    let raf, t = 0, energy = 0.22, col = [45, 170, 255], prev = stateRef.current
    let flow = 0, surge = 0
    // 리서치: 부팅 스윕(트림패스)·게이즈 댐핑·오디오레벨 평활·생각상태 위상
    let boot = 0                                   // 0→1 (등장 스윕, easeOut)
    let gazeX = 0, gazeY = 0, retX = 0, retY = 0   // 댐핑된 조준선(중앙은 비움)
    let lvl = 0, lvlT = 0                           // 시뮬 오디오 레벨(이중 평활)
    let thinkPhase = 0                             // 생각상태 전용 인디터미닛 회전

    // ── 레퍼런스 기하 (픽셀 분석 기반) ──
    const top = -Math.PI / 2          // 위쪽
    const bandRad = R * 0.68          // 메인 링(앰버+시안 공유 반경) = 0.573*half
    const A_A0 = 150 * DEG, A_AS = 80 * DEG      // 앰버: 좌측 150°→230°
    const A_C0 = 235 * DEG, A_CS = 210 * DEG     // 시안: 235°→85°(상단·우측), 하단(85~150) 열림

    function frame() {
      const st = stateRef.current
      if (st !== prev) {
        if (st === 'typing' || st === 'listening' || st === 'thinking' || st === 'speaking') {
          if (ripples.current.length < 2) ripples.current.push({ age: 0 })
          surge = Math.min(1, surge + 0.7)         // 즉시 피드백(<100ms): puff/리플
        }
        prev = st
      }
      const baseE = ENERGY[st] != null ? ENERGY[st] : 0.22
      energy = lerp(energy, baseE, 0.07)
      surge = lerp(surge, 0, 0.05)
      const act = Math.max(0, (energy - 0.3) / 0.7)
      const drive = act + surge * 0.8
      t += 0.5 + drive * 3.4
      flow += 0.004 + drive * 0.02
      if (flow > 1e6) flow -= 1e6
      boot = Math.min(1, boot + 0.022)             // ~0.75s 부팅 스윕
      const bv = easeOut(boot)
      const lum = 0.55 + 0.45 * Math.min(1, act + surge * 0.6)   // 대기=어둑, 활성=풀 밝기 (상태 차이 강조)
      thinkPhase += (st === 'thinking' ? 0.010 : 0.004) + drive * 0.004
      // 시뮬 오디오 레벨: listening/speaking은 음절형 변동, 그 외 drive 추종(이중 평활)
      const voice = (st === 'listening' || st === 'speaking')
      const lTarget = voice
        ? Math.min(1, 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(t * 0.05)) * (0.6 + 0.4 * Math.sin(t * 0.13 + 1.7)) + 0.3 * surge)
        : drive * 0.5
      lvlT = lerp(lvlT, lTarget, 0.18)             // 1차 평활(아날라이저 smoothing 대응)
      lvl = lerp(lvl, lvlT, 0.2)                    // 2차 평활(렌더측 lerp) — 트위치 방지
      const tc = colorRef.current
      col = col.map((c, i) => lerp(c, tc[i], 0.06))
      const r = Math.round(col[0]), gn = Math.round(col[1]), b = Math.round(col[2])
      const C = a => 'rgba(' + r + ',' + gn + ',' + b + ',' + (a * bv * lum) + ')'
      const Wt = a => 'rgba(' + Math.min(255, r + 140) + ',' + Math.min(255, gn + 140) + ',' + Math.min(255, b + 140) + ',' + (a * bv * lum) + ')'
      const Am = a => 'rgba(' + AMBER[0] + ',' + AMBER[1] + ',' + AMBER[2] + ',' + (a * bv * lum) + ')'
      const AmHi = a => 'rgba(' + AMBER_HI[0] + ',' + AMBER_HI[1] + ',' + AMBER_HI[2] + ',' + (a * bv * lum) + ')'
      g.clearRect(0, 0, size, size)

      const pulse = 0.5 + 0.5 * Math.sin(t * 0.018)
      const sp = t * 0.004
      const breathe = 1 + 0.008 * Math.sin(t * 0.011)   // 유휴 호흡(가장 약한 모션)
      const driftX = Math.sin(t * 0.0034) * R * 0.008, driftY = Math.cos(t * 0.0027) * R * 0.006
      const idle = act <= 0.02

      // 리서치: 댐핑된 시선 추적(저역통과). 게이즈는 결정론적 궤도, 레티클이 0.08로 지연 추종.
      gazeX = Math.cos(t * 0.0021) * R * 0.05 + Math.sin(t * 0.0013 + 2.0) * R * 0.02
      gazeY = Math.sin(t * 0.0019 + 0.7) * R * 0.045
      retX += (gazeX - retX) * 0.08
      retY += (gazeY - retY) * 0.08

      const ring = (rad, w, style) => { g.beginPath(); g.arc(cx, cy, rad, 0, TAU); g.lineWidth = w; g.strokeStyle = style; g.stroke() }
      const arc = (rad, a0, a1, w, style, cap) => { g.beginPath(); g.arc(cx, cy, rad, a0, a1); g.lineWidth = w; g.lineCap = cap || 'butt'; g.strokeStyle = style; g.stroke(); g.lineCap = 'butt' }
      const gapRing = (rad, gaps, rot, w, al, ff) => { const s = TAU / gaps, p = (1 - ff) * 0.5; for (let i = 0; i < gaps; i++) { const a0 = rot + i * s; arc(rad, a0 + s * p, a0 + s * (1 - p), w, C(al)) } }
      const rdot = (rad, ang, rr, style) => { g.beginPath(); g.arc(cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad, rr, 0, TAU); g.fillStyle = style; g.fill() }
      const radTick = (rad, ang, len, w, style) => { g.beginPath(); g.moveTo(cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad); g.lineTo(cx + Math.cos(ang) * (rad + len), cy + Math.sin(ang) * (rad + len)); g.lineWidth = w; g.strokeStyle = style; g.stroke() }
      const glow = (amt, hue, fn) => { g.shadowBlur = amt; g.shadowColor = hue; fn(); g.shadowBlur = 0 }
      // 끊긴 세그먼트 호(브로큰 링): 다양한 길이의 부분호 + 갭, rot로 회전
      const segArc = (rad, rot, w, al, segs) => { for (let i = 0; i < segs.length; i++) { const a0 = rot + segs[i][0]; arc(rad, a0, a0 + segs[i][1], w, C(al), 'round') } }

      g.save()
      g.translate(driftX, driftY)
      const scl = breathe * (1 + act * 0.03)   // 활성 시 살짝 확대(깨어나 다가오는 느낌)
      g.translate(cx, cy); g.scale(scl, scl); g.translate(-cx, -cy)

      // ── 1 · 배경 글로우 ──
      const bg = g.createRadialGradient(cx, cy, 0, cx, cy, R * 1.05)
      bg.addColorStop(0, C(0.10 + energy * 0.05)); bg.addColorStop(0.55, C(0.03)); bg.addColorStop(1, C(0))
      g.fillStyle = bg; g.beginPath(); g.arc(cx, cy, R * 1.05, 0, TAU); g.fill()

      // ── 1b · 희미한 헥사 텍스처(원거리 depth 평면, 알파 0.05~0.10) ──
      if (!idle || boot > 0.9) {
        const hexN = 5, hr = R * 0.052
        for (let i = 0; i < hexN; i++) {
          const ha = thinkPhase * 0.2 + i * (TAU / hexN), hd = R * (0.34 + 0.1 * hash(i * 3 + 1))
          const hx = cx + Math.cos(ha) * hd, hy = cy + Math.sin(ha) * hd
          g.beginPath()
          for (let k = 0; k <= 6; k++) { const aa = k * (TAU / 6) + sp * 0.3; const px = hx + Math.cos(aa) * hr, py = hy + Math.sin(aa) * hr; if (k === 0) g.moveTo(px, py); else g.lineTo(px, py) }
          g.lineWidth = 1; g.strokeStyle = C(0.05 + 0.05 * lvl); g.stroke()
        }
      }

      // ── 2 · 외곽 프레임 + 코너 브래킷 ──
      const mm = R * 1.0, bl = R * 0.14
      const brAlpha = 0.3 + pulse * 0.08            // 브래킷 알파 펄스(0.30~0.38)
      g.lineWidth = 1.4; g.strokeStyle = C(brAlpha); g.lineCap = 'round'
      const corner = (sx, sy) => { g.beginPath(); g.moveTo(cx + sx * mm, cy + sy * mm - sy * bl); g.lineTo(cx + sx * mm, cy + sy * mm); g.lineTo(cx + sx * mm - sx * bl, cy + sy * mm); g.stroke() }
      glow(14 * S, C(0.4), () => { corner(-1, -1); corner(1, -1); corner(-1, 1); corner(1, 1) }); g.lineCap = 'butt'
      glow(8 * S, C(0.6), () => ring(R * 0.99, 1.1, C(0.28)))

      // ── 3 · 타코미터 틱 밴드 (거의 전체 링, 상단 길고 밝게, 하단 비움) ──
      const tickN = idle ? 100 : 132
      for (let i = 0; i < tickN; i++) {
        const a = sp * 0.12 + i * (TAU / tickN)
        const dDown = Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2)))
        if (dDown < 0.42) continue                 // 하단(아래) 갭
        const topness = (1 - Math.sin(a)) / 2      // 위쪽=1, 아래=0
        const major = i % 8 === 0                  // 리서치: 매 N번째 메이저 틱(길고 밝게)
        const len = R * (0.028 + 0.075 * topness) * (major ? 1.35 : 1)
        const r1 = R * 0.95, r0 = r1 - len
        radTick(r0, a, len, major ? 1.8 : 0.9, C(Math.min(0.85, (0.16 + 0.5 * topness) * (major ? 1.4 : 1))))
      }
      arc(R * 0.95, top - 1.9, top + 1.9, 1, C(0.18))   // 틱 밴드 안쪽 가이드(상단호)
      // 끊긴 점선 회전 링(텍스처) — 인접 링과 반대 방향
      g.setLineDash([2, 12]); g.lineDashOffset = -t * 0.18; ring(R * 0.86, 1.1, C(0.16)); g.setLineDash([]); g.lineDashOffset = 0
      // 리서치: 빠른 세그먼트(브로큰) 링 1개만 빠르게 — 동시 고속 레이어 1~2개 제한
      segArc(R * 0.9, t * 0.012, 1.2, 0.2 + 0.12 * lvl, [[0, 70 * DEG], [120 * DEG, 40 * DEG], [200 * DEG, 90 * DEG]])

      // ── 4 · 메인 링 (좌측 골드 호 + 상단·우측 시안 호, 같은 반경) ──
      // 시안 측: 반투명 두꺼운 베이스 + 밝은 호 + 바깥 가는 호
      arc(bandRad, A_C0, A_C0 + A_CS, R * 0.075, C(0.07))
      glow(8 * S, C(0.5), () => arc(bandRad, A_C0, A_C0 + A_CS, R * 0.028, C(0.6), 'round'))
      arc(bandRad + R * 0.045, A_C0 + 0.08, A_C0 + A_CS - 0.06, 1.4, C(0.34))
      // 앰버 측: 어두운 트랙 + 굵은 솔리드 골드 + 안쪽 하이라이트 (warm은 여기 한정 — 정체성)
      arc(bandRad, A_A0, A_A0 + A_AS, R * 0.07, Am(0.16))
      glow(15 * S, Am(0.5), () => arc(bandRad, A_A0, A_A0 + A_AS, R * 0.052, Am(0.95), 'round'))
      arc(bandRad + R * 0.017, A_A0 + 0.05, A_A0 + A_AS - 0.05, R * 0.01, AmHi(0.85), 'round')
      // 앰버 안쪽 가는 시안 동반 호
      arc(bandRad - R * 0.06, A_A0 + 0.08, A_A0 + A_AS - 0.02, 1.6, C(0.55), 'round')
      // 양 끝 캡 점 + 상단 끝 근처 시안/화이트 점(레퍼런스)
      glow(9 * S, AmHi(0.8), () => rdot(bandRad, A_A0 + A_AS, R * 0.016, AmHi(0.98)))
      rdot(bandRad, A_A0, R * 0.01, Am(0.86))
      rdot(bandRad - R * 0.06, A_A0 + A_AS - 0.04, R * 0.009, Wt(0.92))
      rdot(bandRad - R * 0.1, A_A0 + A_AS - 0.12, R * 0.006, C(0.8))
      // 활성 시 앰버 호 위를 미끄러지는 시머
      if (act > 0.02) {
        const seg = 0.26, swA = A_A0 + (A_AS - seg) * ((flow * 0.6) % 1)
        glow(8 * S, AmHi(0.6), () => arc(bandRad, swA, swA + seg, R * 0.052, AmHi(0.18 + 0.4 * act), 'round'))
      }

      // ── 5 · 안쪽 동심 끊긴 호 (가는 시안) — 인접 링 반대 방향(카운터로테이션) ──
      gapRing(R * 0.56, 4, sp * 0.5, 1.6, 0.22, 0.66)
      gapRing(R * 0.5, 7, -sp * 0.45, 1, 0.16, 0.76)
      // 리서치: 안쪽 미세 graduation 링(메이저/마이너) — 깊이감, 매우 약하게
      const gradN = 60
      for (let i = 0; i < gradN; i++) {
        const a = -sp * 0.3 + i * (TAU / gradN)
        if (Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2))) < 0.5) continue
        const mj = i % 5 === 0
        radTick(R * 0.44, a, R * (mj ? 0.03 : 0.015), mj ? 1.1 : 0.7, C(mj ? 0.22 : 0.1))
      }

      // ── 6 · 메인 링 위 데이터 점/틱 + 진행 호(트림패스, 12시→시계방향) ──
      const dpN = 30
      for (let i = 0; i <= dpN; i++) {
        const a = A_C0 + A_CS * (i / dpN), big = i % 5 === 0
        rdot(bandRad + R * 0.05, a, big ? 1.6 : 1, C(big ? 0.5 : 0.2))
        if (hash(i) > 0.7) radTick(bandRad + R * 0.062, a, R * 0.026, 1, C(0.28))
      }
      // 진행 호: 레벨/활성을 12시 시작 시계방향으로 채움(기능 바인딩 — 처리 진척 표현)
      {
        const prog = 0.12 + 0.7 * (act > 0.02 ? (0.4 + 0.6 * lvl) : pulse * 0.25)
        glow(7 * S, C(0.45), () => arc(R * 0.62, top, top + prog * TAU, 2 * S, C(0.18 + 0.4 * act), 'round'))
      }

      // ── 7 · 입력/음성 활성 데이터 필드 (level 연동, 베이스 위에 덧입힘) ──
      if (act > 0.02) {
        const rays = 48
        for (let i = 0; i < rays; i++) {
          const a = sp * 0.7 + i * (TAU / rays)
          const wob = 0.5 + 0.5 * Math.sin(t * 0.06 + i * 0.8 - flow * 1.4)
          const r0 = bandRad + R * 0.085, len = R * (0.015 + 0.05 * (drive * 0.5 + lvl * 0.6) * wob)
          radTick(r0, a, len, 0.8, C(0.04 + 0.16 * drive))
        }
        // 호 위 데이터 점 흐름 + 트레일(앞 밝게/뒤 흐리게)
        const dots = Math.round((0.4 + lvl) * 9)
        for (let i = 0; i < dots; i++) {
          const fade = 1 - (i / Math.max(1, dots)) * 0.7
          rdot(R * 0.5, flow * 1.3 + i * (TAU / Math.max(1, dots)), 1.3, Wt((0.35 + 0.4 * act) * fade))
        }
        // 스윕 스캐너 라인(음성 강할 때만)
        if (lvl > 0.3 || act > 0.3) {
          const sy = cy + Math.sin(t * 0.012) * R * 0.42, hh = Math.sqrt(Math.max(0, (R * 0.6) ** 2 - (sy - cy) ** 2))
          g.strokeStyle = C(0.07 + 0.18 * Math.max(act, lvl)); g.lineWidth = 1; g.beginPath(); g.moveTo(cx - hh, sy); g.lineTo(cx + hh, sy); g.stroke()
        }
      }
      // 생각상태: 오디오 없음 → 인디터미닛 회전 글로우(말하기 펄스보다 느리게)
      if (st === 'thinking') {
        const ga = thinkPhase * 1.4
        glow(10 * S, C(0.5), () => rdot(R * 0.5, ga, 2.4 * S, Wt(0.7)))
        rdot(R * 0.5, ga + Math.PI, 1.6 * S, C(0.4))
      }

      // ── 8 · 열린 중앙: 워드마크 + 미세 조준 마커(댐핑 추적, 중앙은 비움) ──
      const lab = labelRef.current
      if (lab) {
        g.font = '700 ' + Math.round(R * 0.13) + 'px Galmuri11, monospace'
        g.textAlign = 'center'; g.textBaseline = 'middle'
        g.fillStyle = C(0.7)
        glow(10 * S, C(0.5), () => g.fillText(String(lab).toUpperCase(), cx, cy))
        // 워드마크 양옆 가는 라인
        const tw = g.measureText(String(lab).toUpperCase()).width
        g.strokeStyle = C(0.2); g.lineWidth = 1
        g.beginPath(); g.moveTo(cx - tw / 2 - R * 0.12, cy); g.lineTo(cx - tw / 2 - R * 0.03, cy)
        g.moveTo(cx + tw / 2 + R * 0.03, cy); g.lineTo(cx + tw / 2 + R * 0.12, cy); g.stroke()
      } else {
        // 중앙 OPEN: 크로스헤어는 댐핑된 레티클 위치에, 정중앙은 갭으로 비움
        const rx = cx + retX, ry = cy + retY, gap = R * 0.018, arm = R * 0.05
        g.strokeStyle = C(0.18); g.lineWidth = 1.5
        g.beginPath()
        g.moveTo(rx - arm, ry); g.lineTo(rx - gap, ry); g.moveTo(rx + gap, ry); g.lineTo(rx + arm, ry)
        g.moveTo(rx, ry - arm); g.lineTo(rx, ry - gap); g.moveTo(rx, ry + gap); g.lineTo(rx, ry + arm)
        g.stroke()
        // 아크리액터형 코어: 펄스 + 타이트 동심 케이지(period ~2-3s, 추가 글로우)
        const corePulse = 0.5 + 0.5 * Math.sin(t * 0.016)
        const dotR = R * 0.012 + energy * R * 0.008 + corePulse * R * 0.004 + lvl * R * 0.01
        const coreHalo = g.createRadialGradient(cx, cy, 0, cx, cy, R * (0.07 + 0.03 * corePulse))
        coreHalo.addColorStop(0, Wt(0.45 + 0.3 * energy)); coreHalo.addColorStop(0.5, C(0.2)); coreHalo.addColorStop(1, C(0))
        g.fillStyle = coreHalo; g.beginPath(); g.arc(cx, cy, R * (0.07 + 0.03 * corePulse), 0, TAU); g.fill()
        glow(12 * S * (0.5 + corePulse), C(0.7), () => { g.fillStyle = Wt(0.6 + 0.3 * energy); g.beginPath(); g.arc(cx, cy, dotR, 0, TAU); g.fill() })
        ring(R * (0.05 + 0.005 * corePulse), 1, C(0.3)); ring(R * 0.034, 1, C(0.2))
      }

      // ── 9 · 글린트 + 상태 진입 리플(puff 서지 동반) ──
      rdot(R * 0.95, t * 0.011, 1.8, Wt(0.8))
      rdot(bandRad, A_C0 + 0.04, 1.8, Wt(0.6))
      const rip = ripples.current
      for (let i = rip.length - 1; i >= 0; i--) {
        rip[i].age += 1; const p = rip[i].age / 64
        if (p >= 1) { rip.splice(i, 1); continue }
        const ease = easeOut(p)
        ring(R * 0.1 + ease * R * 0.86, 2 * S, C((1 - p) * 0.6))
      }

      g.restore()
      raf = requestAnimationFrame(frame)
    }
    frame()
    return () => cancelAnimationFrame(raf)
  }, [size])

  return <canvas ref={canvasRef} className="jarvis-core" />
}
