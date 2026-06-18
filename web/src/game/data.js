export const MAP = [
  'WWWNNWWNNWWNNWW',
  'BBFFFFZZFFFCKFP',
  'FFTTTFFFFFFFFFF',
  'FFTTTFFFFRRRFFF',
  'FFFFFFFFFRRRFFF',
  'FFFFFFFFFRRRFFF',
  'FDDFDDFDDFDDFFF',
  'FFFFFFFFFFFFFFP',
  'FFFFFFFFFFFFFFF',
  'FFFFFFFFFFFFFFF',
  'FFFFFFFFFFFFAMG'
]
export const BLOCK = 'WNBTDCKPAMGZ'
export const COLS = 15
export const ROWS = 11

// v2 스프라이트 — 또렷한 눈(G), 흰 옷깃(W), 팀장색 넥타이(T), 구두(K), 피부그림자(s). 라이선스 0% (직접 작성)
const d0 = ['...OOOOOO...', '..OHHHHHHO..', '.OHHHHHHHHO.', '.OHHHHHHHHO.', '.OHSSSSSSHO.', '.OSSGSSGSSO.', '.OSSSSSSSSO.', '..OSssssSO..', '..OWBTTBWO..', '.OBWBTTBWBO.', '.OBBBTTBBBO.', '..OBBTTBBO..', '..ODDDDDDO..', '..ODD..DDO..', '..ODD..DDO..', '..OKK..KKO..']
const d1 = d0.slice(0, 13).concat(['..ODD..DDO..', '..ODD...OO..', '..OKK.......'])
const u0 = ['...OOOOOO...', '..OHHHHHHO..', '.OHHHHHHHHO.', '.OHHHHHHHHO.', '.OHHHHHHHHO.', '.OHHHHHHHHO.', '.OHHHHHHHHO.', '..OHHHHHHO..', '..OBBBBBBO..', '.OBWBBBBWBO.', '.OBBBBBBBBO.', '..OBBBBBBO..', '..ODDDDDDO..', '..ODD..DDO..', '..ODD..DDO..', '..OKK..KKO..']
const u1 = u0.slice(0, 13).concat(['..ODD..DDO..', '..ODD...OO..', '..OKK.......'])
const l0 = ['...OOOOOO...', '..OHHHHHHO..', '.OHHHHHHHHO.', '.OHHHHHHHHO.', '.OSSSSHHHHO.', '.OSGSSHHHHO.', '.OSSSSHHHHO.', '..OSSsHHHO..', '..OWBBTBBO..', '..OBBBBBBO..', '..OBBBBBBO..', '..OBBBBBBO..', '..ODDDDDDO..', '..ODD..DDO..', '..ODD..DDO..', '..OKK..KKO..']
const l1 = l0.slice(0, 13).concat(['.ODD....DDO.', '.ODD....DDO.', '.OKK....KKO.'])

const fd0 = ['...OOOOOO...', '..OHHHHHHO..', '.OHHHHHHHHO.', '.OHHHHHHHHO.', '.OHSSSSSSHO.', '.OHSGSSGSHO.', '.OHSSSSSSHO.', '.OHHSssSHHO.', '.OHWBTTBWHO.', '.OHBWTTWBHO.', '.OHBBTTBBHO.', '.OHBBTTBBHO.', '.ODDDDDDDDO.', '.ODDDDDDDDO.', '..OSS..SSO..', '..OKK..KKO..']
const fd1 = fd0.slice(0, 14).concat(['..OSS...OO..', '..OKK.......'])
const fu0 = ['...OOOOOO...', '..OHHHHHHO..', '.OHHHHHHHHO.', '.OHHHHHHHHO.', '.OHHHHHHHHO.', '.OHHHHHHHHO.', '.OHHHHHHHHO.', '.OHHHHHHHHO.', '.OHBBBBBBHO.', '.OHBBBBBBHO.', '.OHBBBBBBHO.', '.OHBBBBBBHO.', '.ODDDDDDDDO.', '.ODDDDDDDDO.', '..OSS..SSO..', '..OKK..KKO..']
const fu1 = fu0.slice(0, 14).concat(['..OSS...OO..', '..OKK.......'])
const fl0 = ['...OOOOOO...', '..OHHHHHHO..', '.OHHHHHHHHO.', '.OHHHHHHHHO.', '.OSSSSHHHHO.', '.OSGSSHHHHO.', '.OSSSSHHHHO.', '..OSSsHHHO..', '..OWBBTBHHO.', '..OBBBBBHHO.', '..OBBBBBHHO.', '..OBBBBBBO..', '.ODDDDDDDDO.', '.ODDDDDDDDO.', '.OSS....SSO.', '.OKK....KKO.']
const fl1 = fl0.slice(0, 14).concat(['..OSS..SSO..', '..OKK..KKO..'])

const flip = fr => fr.map(r => r.split('').reverse().join(''))

export const CYCLES = {
  m: {
    down: [d0, d1, d0, flip(d1)],
    up: [u0, u1, u0, flip(u1)],
    left: [l0, l1],
    right: [flip(l0), flip(l1)]
  },
  f: {
    down: [fd0, fd1, fd0, flip(fd1)],
    up: [fu0, fu1, fu0, flip(fu1)],
    left: [fl0, fl1],
    right: [flip(fl0), flip(fl1)]
  }
}

export const AGENTS = {
  director: {
    nm: '총괄', person: 'Neo', role: '총괄팀장', col: '#4FC3F7', dk: '#B3E5FC', g: 'm', v: 172,
    pal: { H: '#2E2E3A', B: '#1C2634', D: '#121A24' }, desk: null,
    tagline: '회사 전체 흐름을 보고 우선순위를 조율합니다',
    specialty: '팀 업무 취합·정리, 우선순위 조율, 주간 정리, 업무 최적화, 지식금고 총괄 관리',
    persona: '차분하고 균형 잡힌 시선. 부분 최적화가 아니라 회사 전체 흐름을 본다. 팀장 의견이 충돌하면 양쪽을 적시한 뒤 판단 기준과 함께 권고한다.',
    intro: 'Neo입니다. 팀 전체 그림은 제가 챙기고 있어요. 무엇을 정리해드릴까요?',
    chips: ['이번 주 팀 전체 업무를 정리해줘', '팀장들 업무에서 중복·비효율 찾아 최적화안 줘', '지식금고 상태를 점검하고 총괄 노트로 정리해줘', '다음 주 우선순위 3개만 정해줘'],
    think: ['팀장들 업무가 살짝 겹치는데…', '이번 주 정리본을 금고에 쌓아야지…']
  },
  marketing: {
    nm: '마케팅', person: 'Echo', role: '마케팅 팀장', col: '#FF7A45', dk: '#FFC4A8', g: 'm', v: 205,
    pal: { H: '#6B4226', B: '#281E1A', D: '#1A1210' }, desk: 1,
    tagline: '집행 가능한 콘텐츠·채널 전략을 설계합니다',
    specialty: '마케팅 기획, 콘텐츠 전략, 채널 운영, 홍보·후크 문구, 유튜브 숏폼, 퍼포먼스 마케팅',
    persona: '실무 10년차. 화려한 말보다 집행 가능한 계획을 선호하고 간결·근거 중심으로 말한다. 모든 제안에 왜 이 채널·메시지인지 근거를 붙인다.',
    intro: '아, 대표님! 마침 이번 주 콘텐츠 일정 보고 있었어요. 뭐 도와드릴까요?',
    chips: ['유튜브 숏폼 30일 콘텐츠 캘린더 짜줘', '우리 블로그가 AI 검색에 인용되려면 뭘 바꿔야 해?', '신규 제안서에 들어갈 우리 핵심 차별점 정리해줘', '금고의 고객 정보 기반으로 이번 주 콘텐츠 우선순위 정해줘'],
    think: ['이번 주 콘텐츠 일정이 빠듯한데…', '이 채널은 전환 근거가 약해…']
  },
  strategy: {
    nm: '전략', person: 'Oracle', role: '전략 기획 팀장', col: '#B388FF', dk: '#DCC8FF', g: 'm', v: 188,
    pal: { H: '#3A3A4E', B: '#221E30', D: '#161320' }, desk: 4,
    tagline: '결론부터, 숫자로 전략을 검증합니다',
    specialty: '사업전략, 매출·KPI 분해, 시장·경쟁 분석, 가격·수익 모델, 시나리오 설계',
    persona: '결론부터 말한다. 객단가×건수×전환율로 사고하고, 확인 안 된 숫자는 지어내지 않고 [확인 필요]로 표시한다.',
    intro: '결론부터 말씀드릴 준비는 늘 돼 있습니다. 무슨 건이죠?',
    chips: ['올해 목표를 분기별 KPI로 분해해줘', '객단가×건수×전환율로 매출 시나리오 3개 만들어줘', '경쟁사 대비 우리 포지셔닝 약점 진단해줘', '다음 분기에 집중할 핵심 문제 1개만 골라줘'],
    think: ['객단가 곱하기 건수 곱하기 전환율…', '이 숫자는 확인이 필요해…']
  },
  ops: {
    nm: '운영', person: 'Link', role: '운영·기록 팀장', col: '#00E5C0', dk: '#9FFFE8', g: 'f', v: 268,
    pal: { H: '#7A4A2E', B: '#182622', D: '#101A16' }, desk: 7,
    tagline: '회의록·프로세스·문서를 구조로 정리합니다',
    specialty: '회의록, 업무보고, 문서 정리, 프로세스·온보딩 설계, 지식금고 운영 점검',
    persona: '기록과 구조에 강하다. 액션 아이템에는 담당과 기한을 꼭 채우고, 문서는 구조부터 잡는다.',
    intro: '네, 대표님. 기록할 준비 됐어요. 말씀하세요.',
    chips: ['주간 회의록 템플릿을 우리 규칙대로 설계해줘', '신규 고객 온보딩 프로세스를 단계별로 문서화해줘', '지식금고 운영 상태를 점검하고 개선점 알려줘', '이번 주 업무보고 초안 구조 잡아줘'],
    think: ['액션 아이템에 기한이 빠졌네…', '이 문서는 구조부터 잡아야…']
  },
  review: {
    nm: '검토', person: 'Glitch', role: '검토 팀장', col: '#FFD54A', dk: '#FFEDB0', g: 'f', v: 242,
    pal: { H: '#4A3A30', B: '#282416', D: '#1A180E' }, desk: 10,
    tagline: '내보내기 전, 리스크와 금지표현을 거릅니다',
    specialty: '계약·문구 검수, 규정·법규 점검, 리스크·금지표현 점검, 검수 프로세스 설계',
    persona: '보장성·과장 표현에 예민하다. 출처 불명 수치를 잡아내고, 무엇이든 내보내기 전에 한 번 거치게 한다.',
    intro: '잠깐요, 그 문구 내보내기 전에 저 한번 거치시죠. 무슨 일이세요?',
    chips: ['콘텐츠 게시 전 리스크 체크리스트 만들어줘', '"국내 최고" 같은 위험 문구의 안전한 대안 정리해줘', '신규 고객 계약서에서 꼭 확인할 조항 알려줘', '우리 콘텐츠 검수 프로세스의 구멍을 찾아줘'],
    think: ['이 표현, 보장성 아닌가…', '출처 불명 수치 발견…']
  }
}

export const SCRIPTS = [
  ['marketing', 'review', '이 문구 리스크 없을까요? 더 나은 하루.', '보장 느낌만 빼면 괜찮아요. 대안 드릴게요.'],
  ['strategy', 'marketing', '블로그 전환율 숫자부터 봅시다.', '이번 주 데이터 정리해서 드릴게요.'],
  ['ops', 'strategy', '어제 회의 액션 아이템, 담당이 비어 있어요.', '매출 분해 건은 제가 가져갈게요.'],
  ['review', 'ops', '검수 이력은 어디에 적립하죠?', '지식금고 검토 폴더에 노트로 남겨주세요.'],
  ['marketing', 'ops', '고객사 미팅 회의록 오늘 나와요?', '정리 끝나는 대로 올릴게요.'],
  ['strategy', 'review', '신규 패키지 가격안, 리스크 있어요?', '과장 표현만 없으면 문제없어 보여요.'],
  ['director', 'ops', '이번 주 팀 업무 정리본 부탁해요.', '네, 금요일에 묶어서 올리겠습니다.'],
  ['director', 'strategy', '우선순위가 분산된 느낌이에요. 핵심 하나만 꼽읍시다.', '동의합니다. 결론부터 정리해 드릴게요.'],
  ['director', 'marketing', '콘텐츠 일정, 검토 쪽이랑 겹치지 않게 조율했어요?', '네, 심의 일정 먼저 빼두고 짰습니다.']
]

export const CABINETS = {
  A: { nm: '지식금고', col: '#00E5C0', info: '지식 금고 데이터 볼트 — vault/00_지식금고. 팀장들이 보존 가치가 있는 사실을 분야별로 적립하는 곳이다.' },
  M: { nm: '회의록', col: '#4FC3F7', info: '회의록 데이터 볼트 — vault/10_회의록. /회의록 이나 /회의 커맨드를 쓰면 여기에 차곡차곡 쌓인다.' },
  G: { nm: '산출물', col: '#FFD54A', info: '산출물 데이터 볼트 — vault/90_산출물. 완성된 기획서와 전략 문서가 저장되는 곳이다.' }
}
