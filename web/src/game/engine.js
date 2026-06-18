import { MAP, BLOCK, COLS, ROWS, CYCLES, AGENTS, SCRIPTS, CABINETS } from './data.js'
import { mumble } from '../fx/audio.js'

const T = 16
const W = COLS * T
const H = ROWS * T

function walkable(c, r) {
  return c >= 0 && r >= 0 && c < COLS && r < ROWS && BLOCK.indexOf(MAP[r][c]) < 0
}

export function createGame(canvas, ovl, cb) {
  const g = canvas.getContext('2d')
  const ids = Object.keys(AGENTS)
  const cache = {}

  function spr(id, key, frame) {
    const k = id + key
    if (cache[k]) return cache[k]
    const c = document.createElement('canvas')
    c.width = 12; c.height = 16
    const x = c.getContext('2d')
    const a = AGENTS[id]
    const pal = { O: '#0D1117', E: '#0D1117', S: '#E8C9A8', s: '#CBA985', G: '#1A1A22', W: '#E6ECF4', w: '#BCC6D2', K: '#070A0F', T: a.col, H: a.pal.H, B: a.pal.B, D: a.pal.D }
    for (let r = 0; r < 16; r++) for (let i = 0; i < 12; i++) {
      const ch = frame[r][i]
      if (pal[ch]) { x.fillStyle = pal[ch]; x.fillRect(i, r, 1, 1) }
    }
    cache[k] = c
    return c
  }

  const bg = document.createElement('canvas')
  bg.width = W; bg.height = H
  const b = bg.getContext('2d')
  const fr = (x, y, w, h, c) => { b.fillStyle = c; b.fillRect(x, y, w, h) }

  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const t = MAP[r][c], x = c * T, y = r * T
    if (t === 'W' || t === 'N') {
      fr(x, y, 16, 16, '#101826'); fr(x, y + 12, 16, 3, '#0B1220'); fr(x, y + 15, 16, 1, '#00E5C0')
      if (t === 'N') {
        fr(x + 1, y + 2, 14, 11, '#1A2A3E'); fr(x + 2, y + 3, 12, 9, '#06141E')
        for (let i = 0; i < 6; i++) fr(x + 3 + ((c * 7 + i * 5) % 10), y + 4 + ((c * 3 + i * 7) % 7), 1, 2, i % 3 ? '#1E6A9E' : '#3AD8FF')
        fr(x + 1, y + 12, 14, 2, '#13202E')
      }
      continue
    }
    fr(x, y, 16, 16, (c + r) % 2 ? '#0A1320' : '#08101A')
    fr(x, y + 15, 16, 1, '#16283C'); fr(x + 15, y, 1, 16, '#16283C')
    if ((c * 31 + r * 17) % 13 === 0) fr(x + 12, y + 12, 1, 1, '#163A52')
    const nb = (dc, dr) => (MAP[r + dr] || '')[c + dc]
    if (t === 'Z') {
      fr(x, y, 16, 16, '#0C1218')
      fr(x, y, 16, 1, '#1E4E5E'); fr(x, y + 15, 16, 1, '#1E4E5E')
      if (nb(-1, 0) !== 'Z') fr(x, y, 1, 16, '#1E4E5E')
      if (nb(1, 0) !== 'Z') fr(x + 15, y, 1, 16, '#1E4E5E')
      for (let vy = 3; vy <= 12; vy += 3) fr(x + 3, y + vy, 10, 1, '#16222C')
    }
    if (t === 'R') {
      fr(x, y, 16, 16, '#0C1B2E')
      if (nb(0, -1) !== 'R') fr(x, y, 16, 2, '#1E4E6E')
      if (nb(0, 1) !== 'R') fr(x, y + 14, 16, 2, '#1E4E6E')
      if (nb(-1, 0) !== 'R') fr(x, y, 2, 16, '#1E4E6E')
      if (nb(1, 0) !== 'R') fr(x + 14, y, 2, 16, '#1E4E6E')
      fr(x + 7, y + 7, 2, 2, '#4FC3F7'); fr(x + 4, y + 4, 1, 1, '#163A55'); fr(x + 11, y + 10, 1, 1, '#163A55')
    }
    if (t === 'T') {
      fr(x, y, 16, 16, '#18222E')
      if (nb(0, -1) !== 'T') fr(x, y, 16, 2, '#1E4E5E')
      if (nb(0, 1) !== 'T') fr(x, y + 13, 16, 3, '#101A24')
      if (nb(-1, 0) !== 'T') fr(x, y, 2, 16, '#1E4E5E')
      if (nb(1, 0) !== 'T') fr(x + 14, y, 2, 16, '#1E4E5E')
    }
    if (t === 'D') {
      fr(x, y + 2, 16, 9, '#1A2430'); fr(x, y + 2, 16, 2, '#243240')
      fr(x, y + 11, 16, 4, '#121A24'); fr(x, y + 10, 16, 1, '#1E4E5E')
      if (nb(-1, 0) !== 'D') fr(x, y + 2, 1, 13, '#1E4E5E')
      if (nb(1, 0) !== 'D') fr(x + 15, y + 2, 1, 13, '#1E4E5E')
    }
    if (t === 'B') {
      fr(x, y, 16, 15, '#141C26'); fr(x + 1, y + 1, 14, 13, '#0A0F16')
      for (let s = 0; s < 3; s++) fr(x + 2, y + 2 + s * 4, 12, 3, '#10161E')
    }
    if (t === 'C') {
      fr(x + 4, y + 1, 8, 5, '#103A4A'); fr(x + 4, y + 1, 8, 1, '#4FC3F7')
      fr(x + 3, y + 6, 10, 9, '#18222C'); fr(x + 3, y + 6, 10, 1, '#283A48')
      fr(x + 3, y + 6, 1, 9, '#283A48'); fr(x + 12, y + 6, 1, 9, '#283A48'); fr(x + 6, y + 9, 4, 2, '#4FC3F7')
    }
    if (t === 'K') {
      fr(x + 2, y + 2, 12, 12, '#10161E'); fr(x + 2, y + 2, 12, 3, '#0A0F14')
      fr(x + 4, y + 7, 2, 2, '#FF3B5C'); fr(x + 8, y + 10, 4, 3, '#9AB0C0')
    }
    if (t === 'P') {
      fr(x + 4, y + 10, 8, 2, '#2A3440'); fr(x + 5, y + 12, 6, 3, '#20262E')
      fr(x + 6, y + 2, 4, 3, '#2BC0E0'); fr(x + 3, y + 4, 5, 4, '#2BC0E0'); fr(x + 8, y + 4, 5, 4, '#2BC0E0')
      fr(x + 5, y + 7, 6, 3, '#2BC0E0'); fr(x + 7, y + 3, 2, 2, '#3AD8FF'); fr(x + 4, y + 6, 2, 2, '#3AD8FF'); fr(x + 9, y + 6, 2, 2, '#3AD8FF')
    }
    if (CABINETS[t]) {
      fr(x + 1, y, 14, 15, '#121A24'); fr(x + 1, y, 14, 1, '#1C2836'); fr(x + 1, y + 14, 14, 1, '#0A1018')
      for (let dw = 0; dw < 3; dw++) { fr(x + 3, y + 2 + dw * 4, 10, 3, '#1A2632'); fr(x + 6, y + 3 + dw * 4, 4, 1, '#00E5C0') }
      fr(x + 1, y, 14, 2, CABINETS[t].col)
    }
  }
  for (let c = 0; c < COLS; c++) {
    if (MAP[6][c] === 'D' && MAP[6][c - 1] !== 'D') {
      const mx = c * 16 + 10, my = 6 * 16 - 3
      fr(mx, my, 11, 8, '#0A0F14'); fr(mx + 1, my + 1, 9, 6, '#0A3450')
      fr(mx + 4, my + 8, 3, 2, '#0A0F14')
      const did = ids.find(k => AGENTS[k].desk === c)
      if (did) fr(c * 16 + 2, 6 * 16 + 11, 5, 3, AGENTS[did].col)
    }
  }
  fr(3 * 16 + 4, 2 * 16 + 10, 9, 6, '#103048'); fr(3 * 16 + 5, 2 * 16 + 11, 7, 1, '#3AD8FF')
  fr(3 * 16 + 5, 2 * 16 + 13, 7, 1, '#1E6A9E'); fr(2 * 16 + 6, 3 * 16 + 2, 8, 5, '#103048')

  const LED = ['#3AD8FF', '#4FC3F7', '#FF5577', '#FFD54A', '#B388FF']
  function drawFX(tick) {
    for (const c of [1, 4, 7, 10]) {
      const mx = c * 16 + 10, my = 6 * 16 - 3
      g.globalAlpha = 0.65
      g.fillStyle = '#3AD8FF'
      g.fillRect(mx + 1, my + 1 + (((tick >> 2) + c) % 6), 9, 1)
      g.globalAlpha = 1
    }
    for (const cc of [0, 1]) {
      for (let s = 0; s < 3; s++) for (let i = 0; i < 4; i++) {
        g.fillStyle = LED[(i + s + cc + (tick >> 3)) % 5]
        g.fillRect(cc * 16 + 3 + i * 3, 16 + 3 + s * 4, 1, 1)
      }
    }
    const ca = 0.45 + 0.35 * Math.sin(tick / 7)
    g.globalAlpha = ca
    g.fillStyle = '#3AD8FF'
    g.fillRect(111, 18, 2, 12)
    g.globalAlpha = 0.5
    for (let i = 0; i < 3; i++) {
      const py = 30 - ((tick * 0.7 + i * 7) % 16)
      g.fillRect(100 + i * 9, py, 1, 1)
    }
    g.globalAlpha = 0.07
    g.fillStyle = '#4FC3F7'
    g.fillRect(50, 30, 13, 26)
    g.globalAlpha = 1
    const r0 = 5 + Math.sin(tick / 10) * 1.8
    g.fillStyle = '#7FDBFF'
    for (let k = 0; k < 8; k++) {
      const ang = tick / 16 + k * Math.PI / 4
      g.globalAlpha = k % 2 ? 0.45 : 0.9
      g.fillRect(Math.round(56 + Math.cos(ang) * r0), Math.round(38 + Math.sin(ang) * r0 * 0.55), 1, 1)
    }
    g.globalAlpha = 0.8
    g.fillRect(56, 38, 1, 1)
    g.globalAlpha = 0.85
    g.fillStyle = '#00E5C0'
    const px1 = 12 + ((tick * 1.3) % (W - 24))
    g.fillRect(px1, 135, 2, 1)
    for (let i = 1; i <= 4; i++) { g.globalAlpha = 0.85 - 0.18 * i; g.fillRect(px1 - i * 2, 135, 1, 1) }
    const py2 = 34 + ((tick * 1.05) % 116)
    g.globalAlpha = 0.85
    g.fillRect(87, py2, 1, 2)
    for (let i = 1; i <= 4; i++) { g.globalAlpha = 0.85 - 0.18 * i; g.fillRect(87, py2 - i * 2, 1, 1) }
    g.globalAlpha = 1
  }

  function homeTile(id) {
    const d = AGENTS[id].desk
    return d != null ? [d, 7] : [3, 4]
  }

  const chars = {}
  ids.forEach(id => {
    const [hx, hy] = homeTile(id)
    chars[id] = { id, tx: hx, ty: hy, x: hx * 16 + 2, y: hy * 16 - 2, dir: 'up', step: 0, path: [], busy: Date.now() + 1500 + Math.random() * 4000, paused: false, onArrive: null, state: '시스템 접속 중' }
  })

  const tags = {}
  ovl.innerHTML = ''
  ids.forEach(id => {
    const d = document.createElement('div')
    d.className = 'tag'
    d.style.background = 'rgba(5, 12, 9, 0.88)'
    d.style.color = AGENTS[id].col
    d.style.border = '1px solid ' + AGENTS[id].col
    d.textContent = AGENTS[id].person
    ovl.appendChild(d)
    tags[id] = d
  })
  ids.forEach(id => {
    const a = AGENTS[id]
    const d = document.createElement('div')
    d.className = 'tag fixed'
    d.style.background = 'rgba(5, 12, 9, 0.88)'
    d.style.color = a.dk
    d.style.border = '1px solid ' + a.col
    d.textContent = a.nm + ' 자리'
    if (a.desk != null) {
      d.dataset.dx = a.desk * 16 + 16
      d.dataset.dy = 6 * 16 + 18
    } else {
      d.dataset.dx = 3 * 16 + 8
      d.dataset.dy = 4 * 16 + 20
    }
    ovl.appendChild(d)
  })
  Object.keys(CABINETS).forEach((k, i) => {
    const d = document.createElement('div')
    d.className = 'tag fixed'
    d.style.background = 'rgba(5, 12, 9, 0.88)'
    d.style.color = CABINETS[k].col
    d.style.border = '1px solid ' + CABINETS[k].col
    d.textContent = CABINETS[k].nm
    d.dataset.dx = (12 + i) * 16 + 8
    d.dataset.dy = 10 * 16 - 10
    ovl.appendChild(d)
  })

  const bubs = {}
  ids.forEach(id => {
    const d = document.createElement('div')
    d.className = 'gbub'
    d.style.display = 'none'
    ovl.appendChild(d)
    bubs[id] = d
  })
  function bubble(id, text, ms) {
    const d = bubs[id]
    d.textContent = text
    d.style.display = 'block'
    clearTimeout(d._t)
    d._t = setTimeout(() => { d.style.display = 'none' }, ms || 3000)
    mumble(AGENTS[id].v, 4 + Math.floor(Math.random() * 4))
  }

  function syncTags() {
    const sc = canvas.clientWidth / W
    ids.forEach(id => {
      const ch = chars[id], d = tags[id]
      d.style.left = (ch.x + 6) * sc + 'px'
      d.style.top = (ch.y + 17) * sc + 'px'
      const bd = bubs[id]
      if (bd.style.display !== 'none') {
        bd.style.left = (ch.x + 6) * sc + 'px'
        bd.style.top = (ch.y - 3) * sc + 'px'
      }
    })
    ovl.querySelectorAll('.tag.fixed').forEach(d => {
      d.style.left = (+d.dataset.dx) * sc + 'px'
      d.style.top = (+d.dataset.dy) * sc + 'px'
    })
  }

  function occupied(c0, r0, me) {
    return ids.some(o => o !== me && chars[o].tx === c0 && chars[o].ty === r0)
  }

  function bfs(me, sc, sr, tc, tr) {
    if (!walkable(tc, tr) || occupied(tc, tr, me)) return null
    const q = [[sc, sr]], prev = {}, seen = { [sc + ',' + sr]: 1 }
    while (q.length) {
      const n = q.shift()
      if (n[0] === tc && n[1] === tr) {
        const p = []
        let k = tc + ',' + tr
        while (k !== sc + ',' + sr) {
          const pt = k.split(',')
          p.unshift([+pt[0], +pt[1]])
          k = prev[k]
        }
        return p
      }
      for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = n[0] + d[0], nr = n[1] + d[1], kk = nc + ',' + nr
        if (!seen[kk] && walkable(nc, nr) && !occupied(nc, nr, me)) {
          seen[kk] = 1; prev[kk] = n[0] + ',' + n[1]; q.push([nc, nr])
        }
      }
    }
    return null
  }

  function goTo(ch, tc, tr, dur, dir, arrive) {
    const p = bfs(ch.id, ch.tx, ch.ty, tc, tr)
    if (!p) { ch.busy = Date.now() + 1200; return false }
    ch.path = p
    ch.busy = Date.now() + p.length * 300 + dur
    ch.onArrive = () => { if (dir) ch.dir = dir; if (arrive) arrive() }
    return true
  }

  function decide(ch) {
    const inf = AGENTS[ch.id], r = Math.random()
    if (r < 0.30) {
      const [hx, hy] = homeTile(ch.id)
      ch.state = inf.desk != null ? '자기 콘솔에서 작업 중' : '홀로 테이블에서 총괄 업무 중'
      goTo(ch, hx, hy, 5000 + Math.random() * 5000, 'up', () => {
        if (Math.random() < 0.5) bubble(ch.id, inf.think[Math.floor(Math.random() * 2)], 3000)
      })
      return
    }
    if (r < 0.42) {
      ch.state = '에너지 셀 충전 중'
      goTo(ch, 11, 2, 4500, 'up', () => bubble(ch.id, '에너지 셀 충전 완료. 다시 접속하자.', 2800))
      return
    }
    if (r < 0.50) { ch.state = '카페인 합성 중'; goTo(ch, 12, 2, 4500, 'up', () => bubble(ch.id, '카페인 합성기 가동…', 2800)); return }
    if (r < 0.56) { ch.state = '서버랙 점검 중'; goTo(ch, Math.random() < 0.5 ? 0 : 1, 2, 4000, 'up'); return }
    if (r < 0.68) {
      const ci = Math.floor(Math.random() * 3)
      const ck = ['A', 'M', 'G'][ci]
      ch.state = CABINETS[ck].nm + ' 볼트 정리 중'
      goTo(ch, 12 + ci, 9, 5000, 'down', () => bubble(ch.id, CABINETS[ck].nm + ' 데이터 정리 좀 하고…', 2800))
      return
    }
    if (r < 0.90) {
      const idle = ids.filter(o => o !== ch.id && !chars[o].paused && chars[o].path.length === 0 && Date.now() > chars[o].busy - 2000)
      if (idle.length) {
        const pt = chars[idle[Math.floor(Math.random() * idle.length)]]
        const adj = [[1, 0], [-1, 0], [0, 1], [0, -1]]
          .map(d => [pt.tx + d[0], pt.ty + d[1]])
          .filter(p => walkable(p[0], p[1]) && !occupied(p[0], p[1], ch.id))
        if (adj.length) {
          const tgt = adj[0]
          const sc = SCRIPTS.find(s => (s[0] === ch.id && s[1] === pt.id) || (s[0] === pt.id && s[1] === ch.id))
          ch.state = AGENTS[pt.id].nm + ' 팀장과 대화하러 가는 중'
          const ok = goTo(ch, tgt[0], tgt[1], 9000, null, () => {
            ch.state = AGENTS[pt.id].nm + ' 팀장과 대화 중'
            pt.state = AGENTS[ch.id].nm + ' 팀장과 대화 중'
            ch.dir = pt.tx > ch.tx ? 'right' : pt.tx < ch.tx ? 'left' : pt.ty > ch.ty ? 'down' : 'up'
            pt.dir = ch.tx > pt.tx ? 'right' : ch.tx < pt.tx ? 'left' : ch.ty > pt.ty ? 'down' : 'up'
            pt.busy = Date.now() + 9000
            const first = !sc || sc[0] === ch.id
            const l1 = sc ? (first ? sc[2] : sc[3]) : '잠깐 얘기 좀 해요.'
            const l2 = sc ? (first ? sc[3] : sc[2]) : '네, 말씀하세요.'
            bubble(ch.id, l1, 3400)
            setTimeout(() => bubble(pt.id, l2, 3400), 3600)
          })
          if (ok) { pt.busy = Date.now() + ch.path.length * 300 + 9000; return }
        }
      }
    }
    ch.state = '홀로 테이블 자료 확인 중'
    goTo(ch, 9 + Math.floor(Math.random() * 3), 3 + Math.floor(Math.random() * 3), 3500, 'down')
  }

  let selId = null
  let tick = 0
  let raf = 0
  let alive = true
  let glitchId = null
  let glitchEnd = 0
  let dispatchFx = null

  function drawDispatch() {
    if (!dispatchFx) return
    if (tick > dispatchFx.until) { dispatchFx = null; return }
    const ox = W / 2, oy = 4
    g.fillStyle = '#00FF88'
    g.globalAlpha = 0.9
    g.fillRect(ox - 2, oy, 4, 2)
    for (const id of dispatchFx.targets) {
      const ch = chars[id]
      if (!ch) continue
      const tx = ch.x + 6, ty = ch.y + 4
      const col = AGENTS[id].col
      const steps = 16
      for (let s = 0; s <= steps; s++) {
        const f = s / steps
        const px = ox + (tx - ox) * f, py = oy + (ty - oy) * f
        g.globalAlpha = ((s + (tick >> 1)) % 3) === 0 ? 0.95 : 0.22
        g.fillStyle = col
        g.fillRect(Math.round(px), Math.round(py), 1, 1)
      }
      const r = 7 + Math.sin(tick / 4) * 1.6
      g.globalAlpha = 0.85
      for (let k = 0; k < 12; k++) {
        const a = tick / 6 + k * Math.PI / 6
        g.fillRect(Math.round(tx + Math.cos(a) * r), Math.round(ty + 3 + Math.sin(a) * r * 0.7), 1, 1)
      }
    }
    g.globalAlpha = 1
  }

  function loop() {
    if (!alive) return
    tick++
    if (tick % 260 === 0) {
      glitchId = ids[Math.floor(Math.random() * ids.length)]
      glitchEnd = tick + 16
    }
    ids.forEach(id => {
      const ch = chars[id]
      if (ch.paused) return
      if (ch.path.length) {
        const nx = ch.path[0][0] * 16 + 2, ny = ch.path[0][1] * 16 - 2
        const dx = nx - ch.x, dy = ny - ch.y
        ch.dir = dx > 0 ? 'right' : dx < 0 ? 'left' : dy > 0 ? 'down' : 'up'
        ch.x += Math.sign(dx); ch.y += Math.sign(dy); ch.step++
        if (ch.x === nx && ch.y === ny) {
          const n2 = ch.path.shift()
          ch.tx = n2[0]; ch.ty = n2[1]
          if (ch.path.length === 0 && ch.onArrive) { ch.onArrive(); ch.onArrive = null }
        }
      } else if (Date.now() > ch.busy) decide(ch)
    })
    g.imageSmoothingEnabled = false
    g.drawImage(bg, 0, 0)
    drawFX(tick)
    ids.slice().sort((a, z) => chars[a].y - chars[z].y).forEach(id => {
      const ch = chars[id]
      const X = Math.round(ch.x), Y = Math.round(ch.y)
      g.globalAlpha = 0.13
      g.fillStyle = AGENTS[id].col
      g.fillRect(X - 2, Y + 12, 16, 5)
      g.globalAlpha = 0.22
      g.fillRect(X, Y + 14, 12, 3)
      g.globalAlpha = 1
      const cyc = CYCLES[AGENTS[id].g][ch.dir]
      const ki = ch.path.length ? Math.floor(ch.step / 7) % cyc.length : 0
      const img = spr(id, ch.dir + ki, cyc[ki])
      const gl = id === glitchId && tick < glitchEnd
      if (gl) {
        g.globalAlpha = 0.35
        g.drawImage(img, X - 2, Y)
        g.drawImage(img, X + 2, Y)
        g.globalAlpha = 1
      }
      g.drawImage(img, X, Y)
      if (gl) {
        const sy = 3 + (tick % 9)
        g.drawImage(img, 0, sy, 12, 2, X + ((tick % 2) ? 2 : -2), Y + sy, 12, 2)
      }
      if (selId === id) {
        const bob = Math.round(Math.sin(tick / 9) * 1.5)
        const ax = X + 6, ay = Y - 9 + bob
        g.fillStyle = '#3AD8FF'
        g.fillRect(ax - 3, ay, 7, 2); g.fillRect(ax - 2, ay + 2, 5, 1); g.fillRect(ax - 1, ay + 3, 3, 1); g.fillRect(ax, ay + 4, 1, 1)
      }
    })
    drawDispatch()
    syncTags()
    raf = requestAnimationFrame(loop)
  }

  function onClick(e) {
    const rc = canvas.getBoundingClientRect()
    const ix = (e.clientX - rc.left) * W / rc.width
    const iy = (e.clientY - rc.top) * H / rc.height
    let hit = null
    ids.forEach(id => {
      const ch = chars[id]
      if (ix >= ch.x - 3 && ix <= ch.x + 15 && iy >= ch.y - 4 && iy <= ch.y + 18) hit = id
    })
    if (hit) { selectChar(hit); return }
    const tc = Math.floor(ix / 16), tr = Math.floor(iy / 16)
    if (tr >= 0 && tr < ROWS && tc >= 0 && tc < COLS && CABINETS[MAP[tr][tc]]) {
      cb.onCabinet(MAP[tr][tc])
    }
  }
  canvas.addEventListener('click', onClick)

  function selectChar(id) {
    const ch = chars[id]
    if (!ch) return
    ch.paused = true; ch.path = []; ch.onArrive = null
    ch.x = ch.tx * 16 + 2; ch.y = ch.ty * 16 - 2; ch.dir = 'down'
    ch.state = '대표님과 통신 중'
    selId = id
    cb.onSelectChar(id)
  }

  loop()

  return {
    release(id) {
      if (id && chars[id]) { chars[id].paused = false; chars[id].busy = Date.now() + 800; chars[id].state = '업무 복귀 중' }
      if (selId === id) selId = null
    },
    setSelected(id) { selId = id },
    focus(id) { selectChar(id) },
    dispatch(ids) {
      const targets = (ids || []).filter(id => chars[id])
      if (!targets.length) return
      dispatchFx = { targets, until: tick + 200 }
      targets.forEach((id, i) => {
        const ch = chars[id]
        if (!ch || ch.paused) return
        const [hx, hy] = homeTile(id)
        ch.state = 'CEO 지시 수신 — 자리로 복귀'
        goTo(ch, hx, hy, 4000, 'up', () => bubble(id, ['작업 받았습니다.', '바로 착수할게요.', '확인했습니다, 대표님.'][i % 3], 3000))
      })
    },
    getStates() {
      const out = {}
      ids.forEach(id => { out[id] = chars[id].state })
      return out
    },
    destroy() {
      alive = false
      cancelAnimationFrame(raf)
      canvas.removeEventListener('click', onClick)
    }
  }
}
