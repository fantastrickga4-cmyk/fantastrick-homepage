# 폴더 지도 (DIRECTORY_MAP)

> 이 프로젝트에 어떤 폴더·파일이 있는지 한눈에 보는 지도예요. 바뀌면 업데이트해요.

```
fantastrick-homepage\   ← Next.js 웹앱 (예약·리뷰 자체 시스템)
├─ CLAUDE.md            ← Claude(AI)가 지킬 작업 약속 (제일 먼저 읽음)
├─ README.md            ← 변경 기록 (무엇을 바꿨는지)
├─ DIRECTORY_MAP.md     ← 이 폴더 지도
├─ 협업_시작안내.md      ← 새로 합류한 사람용 시작 안내
├─ package.json         ← Next.js·React·Supabase 등 도구 설정
├─ next.config.ts       ← Next.js 설정
├─ tsconfig.json        ← TypeScript 설정
├─ .env.local.example   ← 환경변수(비밀키) 예시 — 복사해서 .env.local 만들기
├─ supabase\
│  └─ schema.sql        ← 예약·리뷰 데이터베이스 표 만드는 SQL (Supabase에 1회 실행)
├─ public\
│  ├─ images\           ← 웹에서 쓰는 이미지(로고·포스터·지도 등, assets에서 복사)
│  └─ fonts\            ← 로고 글씨체로 직접 만든 폰트(fantastrick-logo.woff2, 1KB)
│                         ⚠️ 대문자 F A N T S R I C K + Y 만 들어있음 — 히어로 워드마크 전용
├─ src\
│  ├─ app\
│  │  ├─ layout.tsx     ← 공통 틀(헤더·푸터·폰트). 제목용 디스플레이 폰트=next/font(Gothic A1) + 전역 필름 그레인(.grain)
│  │  ├─ globals.css    ← 전체 디자인(시네마틱 CSS). 브랜드 3색 토큰·타입스케일·radius 3단계·시네마틱 모션·포커스 링
│  │  ├─ page.tsx       ← 메인 홈페이지 (히어로·테마 캐러셀·매장·리뷰 발췌·B2B 티저). next/image·히어로 패럴랙스
│  │  ├─ rooms\[id]\    ← 테마 상세 (이용금액·시놉시스·주의사항·인원·오시는 길·환불규정). 4개 테마 미리 만들어둠
│  │  ├─ faq\           ← 자주 묻는 질문 (가격·결제 / 예약·취소 / 이용 안내 / 오시는 길)
│  │  ├─ reserve\       ← 예약 화면
│  │  ├─ reservation\   ← 예약 조회·취소 (전화번호로)
│  │  ├─ reviews\       ← 후기 목록·작성
│  │  ├─ business\      ← 비즈니스(B2B) 페이지
│  │  ├─ admin\         ← 관리자 (예약관리[날짜별·목록]·캘린더·시간대·리뷰·팝업공지·설정·문자)
│  │  └─ api\           ← 서버 처리 (예약 생성/조회/취소, 리뷰 목록/작성, admin\*)
│  ├─ components\       ← Header.tsx, Footer.tsx, NoticeModal.tsx(팝업 공지)
│  └─ lib\              ← data.ts(매장·테마·THEME_SLOTS 테마별 시간표), settings.ts(관리자 설정·공지),
│                          theme-content.ts(테마별 가격·시놉시스·주의사항 + 계좌·환불규정·사업자정보 — 기존 사이트 원문),
│                          expire.ts(미입금 30분 자동취소 + 자정 이후 예약은 오전 10시까지 유예),
│                          sms-templates.ts(기존 문자 문구 4종×4테마 원문),
│                          supabase.ts(DB연결), util.ts(전화번호 등)
├─ assets\images\       ← 원본 이미지 보관소 16장 (여기가 원본. public/images 는 실제 쓰는 10장만 —
│                         안 쓰던 6장은 2026-07-16 정리했고 원본은 여기 그대로 있음)
└─ docs\                ← 문서·옛 프로토타입(참고용)
   ├─ 기능_로드맵.md          ← 앞으로 추가할 기능 목록·결정사항
   ├─ 설정_안내.md            ← ★ Supabase·Vercel 연결 방법 (사장님용)
   ├─ 하이브리드_설계.html    ← (옛) 메인 프로토타입 — 디자인 원본 참고용
   ├─ 비즈니스.html           ← (옛) 비즈니스 프로토타입
   ├─ 시안미리보기.html       ← (옛) 설계 시안 10가지
   └─ 홈페이지_설계시안_10.md  ← (옛) 경쟁사 분석 + 시안 글
```

> 📌 옛 `docs/*.html` 프로토타입은 **디자인 원본 참고용**으로 보존. 실제 사이트는 이제 `src/app/` 의 Next.js 앱입니다.
