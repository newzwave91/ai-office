import { useEffect, useState } from 'react'

const KIND_COLOR = { wiki: '#B388FF', vault: '#00E5C0', raw: '#7A9A8A', minutes: '#4FC3F7', output: '#FFD54A' }

export default function StoragePanel() {
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)

  const load = async () => {
    try {
      const r = await fetch('/api/vault')
      setData(await r.json())
      setErr(null)
    } catch (e) {
      setErr('저장소 API에 연결할 수 없습니다')
    }
  }

  useEffect(() => {
    load()
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [])

  const total = data ? data.groups.filter(g => g.kind === 'vault').reduce((s, g) => s + g.files.length, 0) : 0

  return (
    <div className="dlgout px" style={{ marginTop: 8 }}>
      <div className="phead">
        <span>&gt; vault.scan() — 노트 {total}개</span>
        <span className="pscan">{data ? 'SYNC ' + data.scannedAt : ''}</span>
      </div>
      <div className="dlgin" style={{ minHeight: 0 }}>
        {err && <div className="empt">{err}</div>}
        {data && (
          <div className="scgrid">
            {data.groups.map(gr => (
              <div className="scitem" key={gr.label}>
                <span className="slab" style={{ color: KIND_COLOR[gr.kind] || '#30303A' }}>{gr.label}</span>
                <span className={'scount' + (gr.files.length ? '' : ' zero')}>{gr.files.length}개</span>
              </div>
            ))}
          </div>
        )}
        {data && (
          <div className="psys">
            시스템: 팀장 에이전트 {data.system.agents} · 스킬 {data.system.skills} · 커맨드 {data.system.commands} · 5초마다 자동 동기화 · 내용은 Obsidian에서 확인
          </div>
        )}
      </div>
    </div>
  )
}
