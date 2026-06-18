import { useEffect, useState } from 'react'

const AG = { director: '총괄', marketing: '마케팅', strategy: '전략', ops: '운영', review: '검토' }
const CAT_COL = { 공통: '#9AE6C8', 마케팅: '#FF7A45', 전략: '#B388FF', 운영: '#00E5C0', 검토: '#FFD54A', 총괄: '#4FC3F7' }

export default function DashboardModal({ onClose }) {
  const [d, setD] = useState(null)
  const [err, setErr] = useState(null)
  useEffect(() => {
    fetch('/api/dashboard').then(r => r.json()).then(j => { if (j.error) setErr(j.error); else setD(j) }).catch(() => setErr('대시보드 API에 연결할 수 없습니다'))
  }, [])

  const noteTotal = d ? d.vault.filter(v => v.kind === 'vault' || v.kind === 'wiki').reduce((s, v) => s + v.count, 0) : 0

  return (
    <div className="modalbg" onClick={onClose}>
      <div className="modal dashmodal px" onClick={e => e.stopPropagation()}>
        <div className="gmhead">
          <span className="gmtitle">🏢 오피스 대시보드</span>
          <span className="gmmeta">{d ? ('동기화 ' + d.scannedAt) : (err ? '오류' : '로딩…')}</span>
          <button className="gmclose" onClick={onClose}>✕</button>
        </div>
        <div className="dashbody">
          {err && <div className="gmerr">{err}<br /><span style={{ opacity: 0.7 }}>vite.config.js 수정 후 개발 서버를 재시작했는지 확인해 주세요.</span></div>}
          {d && (
            <>
              <div className="dashcards">
                <div className="dcard"><div className="dnum">{noteTotal}</div><div className="dlbl">지식금고 노트</div></div>
                <div className="dcard"><div className="dnum">{d.tracker.open}</div><div className="dlbl">진행 작업</div></div>
                <div className="dcard"><div className="dnum">{d.tracker.done}</div><div className="dlbl">완료 작업</div></div>
                <div className="dcard"><div className="dnum">{d.system.agents}</div><div className="dlbl">팀장</div></div>
              </div>
              <div className="dsec dashbars">
                <div className="dsec-h">분야별 지식 (지식금고)</div>
                {(() => {
                  const cats = d.vault.filter(v => v.kind === 'vault').map(v => ({ nm: v.label.split('/').pop(), count: v.count }))
                  const max = Math.max(1, ...cats.map(c => c.count))
                  return cats.map((c, i) => (
                    <div key={i} className="barrow">
                      <span className="barlbl">{c.nm}</span>
                      <span className="bartrack"><span className="barfill" style={{ width: Math.round(c.count / max * 100) + '%', background: CAT_COL[c.nm] || '#6FCF9A' }} /></span>
                      <span className="barnum">{c.count}</span>
                    </div>
                  ))
                })()}
              </div>
              <div className="dashgrid">
                <div className="dsec">
                  <div className="dsec-h">분야별 노트</div>
                  {d.vault.map((v, i) => <div key={i} className="drow"><span className="dlabel">{v.label}</span><span className="dcount">{v.count}</span></div>)}
                </div>
                <div className="dsec">
                  <div className="dsec-h">팀장별 진행 작업</div>
                  {Object.keys(AG).map(id => <div key={id} className="drow"><span className="dlabel">{AG[id]} 팀장</span><span className="dcount">{d.tracker.byAgent[id] || 0}</span></div>)}
                </div>
                <div className="dsec">
                  <div className="dsec-h">최근 결정 로그</div>
                  {d.decisions.length ? d.decisions.map((l, i) => <div key={i} className="dlogline">{l.replace(/^-\s*/, '')}</div>) : <div className="dempty">아직 없음</div>}
                </div>
                <div className="dsec">
                  <div className="dsec-h">최근 활동</div>
                  {d.recentLog.length ? d.recentLog.map((l, i) => <div key={i} className="dlogline">{l.replace(/^##\s*/, '')}</div>) : <div className="dempty">없음</div>}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
