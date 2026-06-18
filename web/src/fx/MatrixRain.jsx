import { useEffect, useRef } from 'react'

const GLYPHS = 'アイウエオカキクケコサシスセソタチツテト0123456789AIOFFICE'

export default function MatrixRain() {
  const ref = useRef(null)

  useEffect(() => {
    const cv = ref.current
    const g = cv.getContext('2d')
    let w = 0, h = 0, cols = 0
    let drops = []
    const FS = 14

    const resize = () => {
      w = cv.width = window.innerWidth
      h = cv.height = window.innerHeight
      cols = Math.ceil(w / FS)
      drops = Array.from({ length: cols }, () => Math.floor(Math.random() * -h / FS))
    }
    resize()
    window.addEventListener('resize', resize)

    let alive = true
    let last = 0
    const step = ts => {
      if (!alive) return
      if (ts - last > 60) {
        last = ts
        g.fillStyle = 'rgba(3, 8, 6, 0.12)'
        g.fillRect(0, 0, w, h)
        g.font = FS + 'px monospace'
        for (let i = 0; i < cols; i++) {
          const ch = GLYPHS[Math.floor(Math.random() * GLYPHS.length)]
          const y = drops[i] * FS
          g.fillStyle = Math.random() < 0.08 ? '#9FFFCB' : '#0E5C36'
          g.fillText(ch, i * FS, y)
          if (y > h && Math.random() > 0.975) drops[i] = 0
          drops[i]++
        }
      }
      requestAnimationFrame(step)
    }
    requestAnimationFrame(step)

    return () => { alive = false; window.removeEventListener('resize', resize) }
  }, [])

  return <canvas ref={ref} className="mrain" aria-hidden="true" />
}
