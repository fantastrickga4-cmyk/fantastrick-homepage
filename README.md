# 판타스트릭 홈페이지 — 변경 기록 (README)

> 무엇을 바꿨는지 시간 순으로 적는 곳이에요. (최신이 위)

## 2026-07-15 — 📅 예약관리 "날짜별 보기" 신설 + 테마별·요일별 시간표 (기존 Booked 예약확인 이식 2차)
> 기존 `fantastrick.co.kr` 관리자의 **예약확인** 화면을 우리 관리자로 이식. 기존 사이트는 **읽기 전용으로 분석만**(로그인→조회→스크린샷, 무변경). 빌드·타입 통과, 실제 브라우저로 예약 등록→입금확인→취소→마감→해제까지 E2E 통과(테스트 데이터는 DB에서 완전 삭제해 원복).
- **⚠️ 큰 발견 — 시간표는 "매장별"이 아니라 "테마별·요일별"**: 7/17~23 7개 요일을 실측하니 테마마다 시작시각·간격이 전부 달랐음(사자의 서 70분 간격 9칸 / 락다운시티 2시간 간격 5칸). 3호점은 한 매장에 시간표가 다른 테마가 2개라 어제 만든 **매장별 시간표로는 표현 자체가 불가능**했음. 주말은 더 일찍 시작해 칸이 늘어남(태초의 신부 평일 7칸 → 주말 10칸).
- **`lib/data.ts`** — 실측 시간표를 `THEME_SLOTS` 상수로 심음(테마 4개 × 요일). `slotsForThemeDate()` 신설 — 우선순위 **테마 > 매장 > 전역**이라 기존 매장별·전역 설정은 그대로 살아있음(하위호환). `slotEndTime()` 추가.
- **`lib/settings.ts` · `api/admin/settings`** — `themeSlots`(app_settings의 `theme_slots` 키) 추가. 저장 시 `sanitizeSlots`로 알 수 없는 테마·잘못된 시간 제거(기존 매장별 정화 로직을 공용화).
- **`api/reservations` POST · `reserve/page.tsx`** — 손님 예약화면·서버 검증도 테마 시간표 기준으로 전환. 이제 실제 운영 시간표대로만 예약을 받음(기존엔 전 테마 공통 `10:00~22:00` 9칸이라 현실과 안 맞았음).
- **`admin/page.tsx`** — 예약관리에 **날짜별 보기**(기본) 신설: 달력(날짜별 건수) → 테마 탭(건수 배지) → 그 날 시간대별 행. 각 행은 손님이면 `이름·전화·인원`+입금/상태 배지(클릭 시 상세 모달에서 입금확인·확정·노쇼·취소·메모), 비었으면 `+ 예약 넣기`(테마·날짜·시간 자동 입력)·`마감`, 닫힌 칸은 `열기`. 기존 목록·검색·통계·입금대기 큐·CSV는 **목록·검색** 보기로 그대로 유지. 30초 폴링.
- **표시 규칙** — 끝시각은 `시작+테마 소요시간`, 단 다음 칸과 겹치면 다음 칸 시작까지만 표시. 사자의 서는 실제로 **80분짜리를 70분 간격**으로 받고 있어(기존 사이트 Rooms의 Duration=80 확인) 그대로 그리면 칸이 겹쳐 보이기 때문. 시간표 밖에 잡힌 예약(옛 시간·수동)도 `시간표 밖` 표시로 함께 노출해 누락 없음.
- 수정: `src/lib/data.ts`, `src/lib/settings.ts`, `src/app/api/admin/settings/route.ts`, `src/app/api/reservations/route.ts`, `src/app/reserve/page.tsx`, `src/app/admin/page.tsx`, `src/app/globals.css`.

## 2026-07-14 — 🎠 테마 섹션을 가로 슬라이드(캐러셀)로 — PC·모바일 동일 구성
> 기존 테마 섹션은 CSS 그리드(모바일에서 카드가 세로로 쌓임). 요청대로 **PC·모바일 모두 좌우 스와이프 슬라이드**로 통일. 세로 포스터 카드 디자인은 그대로.
- **`page.tsx`** — `ThemeCarousel` 컴포넌트 신설(가로 스크롤 레일 + 좌우 화살표). `theme-grid` div → `<ThemeCarousel themes={THEMES}/>`. 화살표는 `scrollLeft`로 현재 위치 감지해 끝이면 자동 숨김.
- **`globals.css`** — `.theme-grid`(그리드) → `.theme-rail`(flex 가로 스크롤 + `scroll-snap-type:x`). 카드폭: PC=4개 한 줄(딱 맞음), 태블릿=2개, 모바일=82%(다음 카드 살짝 보임). 스크롤바 숨김, 호버 리프트 안 잘리게 여백. `.tc-arrow` 화살표(모바일은 스와이프라 숨김).
- 검증: PC(1280) 4개 한 줄·overflow 0(기존과 동일한 모습), 모바일(390) 스와이프 이동 OK, 태블릿(860) 화살표 표시·이동 OK.

## 2026-07-14 — 🌙 모바일 다크모드 배경 검게 뒤집히는 문제 수정 (color-scheme 선언)
> 증상: 폰(삼성 인터넷)이 다크모드일 때 홈 히어로 등 배경이 새까맣게 반전됨. 원인: 사이트는 **밝은 팔레트 전용**인데 `color-scheme`을 선언 안 해서, 삼성 인터넷 다크모드가 "이 사이트는 다크 대응 안 하나 보다" 하고 **자동으로 색을 반전(force-dark)**시킴.
- **`layout.tsx`** — `viewport`에 `colorScheme: "light"` 추가 → `<meta name="color-scheme" content="light">` 렌더.
- **`globals.css`** — `:root`에 `color-scheme: light;` 추가.
- 이 두 선언이 브라우저에 "밝은 테마 전용"임을 알려 강제 반전을 막음(삼성 인터넷·크롬 모바일이 존중). ⚠️ 헤드리스 크롬의 강제다크 플래그는 color-scheme을 무시하고 무조건 반전시켜 자동 재현 불가 → **실제 폰에서 최종 확인 필요**(캐시 때문에 새로고침/재접속 권장).

## 2026-07-14 — 🛠️ 관리자 이식(기존 워드프레스 Booked) 1차: 입금대기 큐 + 매장별·요일별 시간대
> 기존 `fantastrick.co.kr`(워드프레스+Booked 예약 플러그인)의 관리자 기능을 **읽기 전용으로 분석**(원본 무변경)해 우리 Next.js 관리자로 이식하는 작업. 분석 보고서 `docs/관리자_이식_분석_보고서.html`. 그중 P1 두 가지 구현. 빌드·타입 통과, prod DB 왕복 E2E(저장→config 반영→요일계산→원복)까지 PASS.
- **① 입금대기 전용 큐** — 예약 관리 탭에 "💰 입금대기 N건" 버튼(대기&미입금 건이 있을 때만 노란색으로 노출). 누르면 대기+미입금만 필터, 다시 누르면 해제. `api/admin/reservations` GET에 `deposit=unpaid` 필터 + 통계에 `pendingUnpaid` 추가.
- **② 매장별·요일별 예약 시간대** — 기존은 시간대가 전 매장 공통이라 2호점(월~목 부분운영)에도 예약칸이 떴음. 이제 설정 탭에서 매장을 켜면 그 매장 전용 시간표를 쓰고, 요일마다 "기본 사용/휴무/직접 지정" 선택 가능. 설정 없는 매장은 기존 전역 시간대(fallback) 그대로 → **하위호환 유지**.
  - `lib/data.ts`: `StoreSlots` 타입 + `slotsForStoreDate()` 헬퍼 + `DOW_LABELS`·`isSlotTime` 추가.
  - `lib/settings.ts`: `AppConfig.storeSlots`(app_settings의 `store_slots` 키) 추가.
  - `api/admin/settings` PUT: `storeSlots` 저장 + `sanitizeStoreSlots`(알 수 없는 매장·잘못된 시간 자동 제거).
  - `api/reservations` POST: 시간 검증을 `slotsForStoreDate(store, 요일)` 기준으로 변경(서버도 요일별 반영).
  - `app/reserve/page.tsx`: 선택 테마(매장)·날짜(요일)로 `activeSlots` 계산해 렌더, 휴무 요일이면 "예약 안 받음" 안내.
  - 관리자 설정탭: `StoreSlotsEditor`·`SlotChips` 컴포넌트 신설.
- 수정: `src/lib/data.ts`, `src/lib/settings.ts`, `src/app/api/admin/settings/route.ts`, `src/app/api/admin/reservations/route.ts`, `src/app/api/reservations/route.ts`, `src/app/reserve/page.tsx`, `src/app/admin/page.tsx`. 신규 문서: `docs/관리자_이식_분석_보고서.html`.

## 2026-07-13 — 🎨 밝은 팔레트 교체: 웜 아이보리 → 쿨 갤러리(A안)
> 밝은 팔레트 3안 비교(`docs/샘플_라이트팔레트_비교.html`) 중 **A안 "쿨 갤러리"(차가운 흰빛·미술관 모던)** 채택. 브랜드 3색(블루 #043cb2·퍼플 #622698·레드 #b20e19)은 그대로 두고 배경·텍스트 중립톤만 웜→쿨로 교체. 홈 실렌더로 히어로 톤 전환 확인.
- **`globals.css`** — 표면/텍스트 토큰 교체: `--bg` #f4f1ea→#f4f6f9, `--bg2` #eae6dc→#e9ecf1, `--surface2` #f3efe6→#f0f2f6, `--text` #17182a→#131620, `--muted` #565b74→#535a69, `--faint` #7b8199→#8b93a3. 토큰을 우회하던 하드코딩 웜색(그라디언트 표면·히어로 오버레이 `rgba(244,241,234,…)` 등)도 전부 쿨톤으로 일괄 치환.
- **`layout.tsx`** — 브라우저 테마색 `#f4f1ea`→`#f4f6f9`.
- 🔙 되돌리려면 백업 태그 `backup-light-v1-20260712`(웜 아이보리) 참고.

## 2026-07-10 — ✍️ 역할별 폰트 시스템 정리(재설계 X · 폰트 역할만)
> UX 분석·결정 반영: **큰 제목=나눔명조 ExtraBold(세리프)**, 본문·버튼·숫자·라벨·카드제목=Pretendard(산세리프) 유지. 빌드 통과(에러 0)·콘솔 에러 0·데스크톱/모바일/비즈니스 실렌더로 한글 제목이 나눔명조로 보이는 것 확인.
- **무용지물 Gothic A1 제거** (`layout.tsx`) — 기존 `next/font/google`의 Gothic A1은 한글 subset 미노출(라틴만 받는 낭비)이라 삭제. `--font-display` 주입도 CSS 변수로 이전.
- **나눔명조 800 로드** (`layout.tsx`) — Google Fonts `<link>`로 `Nanum+Myeongjo:wght@800`만 로드(preconnect 포함). 한글 글리프는 unicode-range split 서빙이라 CWV 안전. `document.fonts.check` 로 실제 로드 확인.
- **CSS 변수 정의** (`globals.css`) — `:root`에 `--font-display:"Nanum Myeongjo","Pretendard",serif` 추가.
- **적용 맵** — ✅나눔명조: `.hero h1`·`h2.title`·`.reserve h2`·`.biz-hero h1`(큰 제목). 세리프 자간 완화(-.02em/-.01em → -.005em, 삐침 겹침 방지). ❌Pretendard 유지: `.eyebrow`(.3em 트래킹 라벨)·`.rev-summary .score`(숫자)·버튼·카드제목(`.tcard .tt h3` 17px)·배지·칩.
- **숫자 tabular** — `.hero .meta b`·`.biz-hero .meta b`·`.stat b`·`.rev-summary .score`에 `font-feature-settings:"tnum"`(자릿수 정렬).
- 수정 파일: `src/app/layout.tsx`, `src/app/globals.css`.

## 2026-07-10 — 🎨 디자인 업그레이드(재설계 X · 품질만 상향, 12항목)
> 구조·정체성·페이지 구성·URL·콘텐츠는 그대로 두고 "디자인 품질"만 벤치마크급으로 끌어올림. 승인 계획서: `docs/디자인_업그레이드_계획서.html`. 빌드 통과(에러 0)·콘솔 에러 0·데스크톱/모바일 실렌더 확인 완료.
- **① 모바일 햄버거 메뉴 실구현** (`Header.tsx`) — 기존엔 숨겨진 요소로 스크롤해 먹통이었음. `useState` 슬라이드 드로어(오버레이+패널)로 재작성: 메뉴 5개 + 예약/조회 버튼, `aria-expanded`/`aria-controls`, ESC·바깥클릭·링크클릭 시 닫힘, 열릴 때 body 스크롤 잠금 + 첫 항목 포커스. 데스크톱 동작 불변.
- **② 브랜드 컬러 정본화** (`globals.css`) — 공식 3색 반영. 기존 토큰명(`--cyan`/`--cyan-deep`/`--gold`/`--danger`)은 유지(참조 보존)하되 값·의미를 브랜드로 조정: 딥블루 #043CB2(메인), 보라를 Phantom Violet(#622698, 다크 텍스트엔 #8f6ae0), 레드를 Illusion Red(#B20E19, 텍스트엔 #e05561). 시맨틱 토큰 `--brand/--brand-bright/--violet/--blood/--grad` 추가.
- **③ 미정의 토큰 버그 수정 + Primary CTA 생기** — `--amber`·`--green` 실제 정의(관리자 `.stat.amber/.green` 참조 버그 해결). `.btn.primary`를 그라디언트(#3b7bf0→#043cb2)+hover 글로우+active `scale(.98)`로 격상.
- **④ 포커스 링 + 소형 텍스트 대비** — 전역 `:focus-visible` 링, 폼 `outline:none`을 `:focus-visible`로 대체. `--faint` 대비 상향(#6a7298→#828cb0, AA), 터치타깃(.chip/.btn.sm/.menu-btn/.opt) min-height 44px.
- **⑤ 히어로 시네마틱화** (`globals.css`·`page.tsx`) — 초저속 Ken Burns 줌(24s), 스크롤 패럴랙스(JS), 비네트+오로라 글로우, 진입 스태거(eyebrow→h1→sub→cta→meta). `prefers-reduced-motion` 전면 정지.
- **⑥ 디스플레이 폰트 + 타입 스케일 토큰화** (`layout.tsx`) — 제목/eyebrow 전용 디스플레이 폰트를 `next/font/google`(Gothic A1, self-host)로 도입(본문 Pretendard 유지). `--fs-xs~--fs-2xl` 타입스케일 토큰 정의.
- **⑦ 다크 크래프트 폴리시** — 히어로/비즈 배경 Fantasy Blue→Phantom Violet 오로라 글로우, 카드(.tcard/.cap/.ref) 호버 글로우 격상, **전역 필름 그레인 오버레이 1장**(`layout.tsx`의 `.grain`).
- **⑧ 홈 리뷰/평점 섹션 신설** (`page.tsx`) — STORES↔BUSINESS 사이에 별점 요약(4.8/5) + 대표 후기 4건 발췌 카드 + "전체 후기 보기" 링크. 데이터는 정적 대표 샘플(전체·작성은 기존 `/reviews`).
- **⑨ 스무스 스크롤 + reveal 스태거** — CSS `scroll-behavior` 유지 + `.reveal`에 인덱스(`--i`) 기반 `transition-delay` 스태거(비즈 역량카드·리뷰카드·레퍼런스).
- **⑩ 스티키 핀 연출 1곳** — ABOUT 포스터를 데스크톱에서 `position:sticky`로 고정(좌측 텍스트가 흐르는 Apple식). 모바일 폴백=정적.
- **⑪ next/image 전환 + 폼 시맨틱화** — 주요 이미지(히어로 LCP=`priority`, 포스터·지도·레퍼런스 lazy)를 `next/image`로(CLS 제거). 예약 화면 `.opt` div→`<button aria-pressed>`(마감시간 `disabled`).
- **⑫ radius 3단계 통일 + 인라인 색 정리** — `--r-sm/--r/--r-lg/--r-full`로 축소·치환. 소형 인라인 `--faint`→`--muted` 등 주요부 정리.
- 수정 파일: `src/app/globals.css`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/reserve/page.tsx`, `src/app/business/page.tsx`, `src/components/Header.tsx`.

## 2026-06-24 (이어서4)
- 🗓️ **관리자 2차** — 캘린더 뷰(월별·날짜별 예약), 시간대 열기/닫기(마감·휴무), 설정(예약금·시간대·노출테마). 설정은 예약 화면에 실시간 반영(마감시간 🚫 표시·예약 차단).
- 💬 **관리자 3차(문자/알림 구조)** — 문자 템플릿(확정/취소/리마인더) 편집·발송내역, 방문 전날 리마인더 자동발송(Vercel Cron 매일). 확정/취소 시 문자 발송 연결. ⚠️실제 발송은 **알리고(ALIGO) 키 등록 시 작동**(미등록 시 발송내역만 '미발송'으로 기록). 새 예약 30초 폴링 알림(#14).
- env 추가: ADMIN_PASSWORD, CRON_SECRET (Vercel 등록 완료). (나중에 ALIGO_API_KEY/USER_ID/SENDER, 토스 결제 키)

## 2026-06-24 (이어서3)
- 🛠️ **관리자 페이지 1차 (`/admin`)** — 비밀번호 로그인 보호. 예약 목록·검색·필터, 상세·메모, 상태변경(대기/확정/취소/노쇼), 입금확인, 확정처리, 취소·환불 보기/완료, 수동 예약 등록, 테마별 인기 통계, 새 예약 폴링 알림. 환경변수 ADMIN_PASSWORD(로컬 .env.local + Vercel). 남은 관리자 기능: 캘린더·시간대관리·설정·문자/알림(2·3차)

## 2026-06-24 (이어서2)
- 🔒 **예약 조회·취소 본인확인 강화** — 전화번호만 → **전화번호 + 예약자 이름** 둘 다 일치해야 조회·취소 가능 (남의 번호만으로 못 보게). 조회/취소 API와 화면에 이름 입력 추가. (더 강한 SMS 인증은 알리고 연동 시 업그레이드 예정)
- 📦 **저장소 독립 + GitHub 자동배포** — fantastrick2026 → 본인 계정 `fantastrickga4-cmyk/fantastrick-homepage`로 이전. main push 시 Vercel 자동배포(CLI 배포는 신규계정 차단되어 GitHub 연동으로 해결)

## 2026-06-24
- 🔌 **Supabase 연결 완료** — 예약·조회·취소·리뷰 전 과정 실제 저장 동작 확인(E2E PASS). 키는 `.env.local`(깃 제외). ⚠️Supabase 새 키(sb_secret_)는 supabase-js에서 거부됨 → **Legacy service_role 키(eyJ...)** 사용
- 🚀 **Vercel 배포 완료** — 라이브: **https://fantastrick-homepage.vercel.app** (프로덕션에서도 예약·리뷰 작동 확인). Supabase 환경변수 2개는 Vercel에 등록됨. (※ GitHub 자동배포는 아직 미연결 — 현재는 CLI로 수동 배포. 다음에 대시보드에서 Git 연결 예정)
- 🔜 다음: `fantastrick.co.kr` 도메인 연결 → 가비아 호스팅 해지(이메일·tgc 이전 확인 후) → 예약금 결제(토스)·자동문자(알리고)

## 2026-06-23
- 🏗️ **Next.js 앱으로 전환 + 자체 예약/리뷰 시스템 1차 구현** (정적 HTML 프로토타입 → 실제 웹앱)
  - 기술 결정: **Next.js(App Router) + Supabase + Vercel** (사장님 다른 앱들과 동일 스택, 무료). 디자인은 기존 시네마틱 CSS를 그대로 이식해 100% 보존
  - 결정 사항: **고객 구분=전화번호**(회원가입 X), **예약=자체 시스템**
  - 페이지: `/`(메인·테마 캐러셀), `/reserve`(예약), `/reservation`(전화번호로 조회·취소), `/reviews`(후기 목록·작성), `/business`(B2B)
  - API: 예약 생성/조회, 예약 취소, 리뷰 목록/작성 (`src/app/api/...`)
  - DB 스키마: `supabase/schema.sql` (reservations·reviews, 전화번호 기반, 중복슬롯 방지, RLS)
  - 안전장치: Supabase 미연결 시에도 화면은 정상, API는 친절한 안내(503) 반환
  - 예약금 결제(토스)·자동문자(알리고)는 **자리만 마련** — 가입 후 연결 예정(유료)
  - 설정 방법은 `docs/설정_안내.md` 참고
- 📝 **기능 로드맵 문서 신설** → `docs/기능_로드맵.md` — 사용자가 불러준 필요 기능 정리: 예약(자체/외부 결정 필요)·예약금 자동 처리·예약 취소·자동 문자(SMS, 메일 제외)·리뷰 페이지. 결정 대기: 고객 구분을 아이디 vs 전화번호 중 무엇으로 할지

## 2026-06-18
- 🎉 프로젝트 시작! `E:\fantastrick_hompage` 폴더 생성
- `CLAUDE.md`(작업 약속) 작성 — databank 프로젝트의 작업 스타일·규칙을 홈페이지 제작에 맞게 차용
- `README.md`(이 파일), `DIRECTORY_MAP.md`(폴더 지도) 생성
- 📚 운영자료(마스터 기획서·마케팅 보고서·매장 자료·게임 이미지) 분석 → 브랜드 정체성 파악: **강남 11년차 이머시브 방탈출·머더룸 브랜드**, 슬로건 "일상이 멈추고, 이야기가 시작된다", 매장 3곳·테마 4종(태초의 신부/사자의 서/락다운시티/시간의 영속성)
- 🖼️ 실제 게임 이미지 7장을 `assets/images/`로 복사(영문 이름 정리)
- 🔎 경쟁사(키이스케이프·비트포비아/던전·핌아트웍스·셜록홈즈) 홈페이지 구조 리서치 → `docs/홈페이지_설계시안_10.md`
- 🎨 **홈페이지 설계 시안 10가지** 작성 + 시각 미리보기 페이지 제작 → `docs/시안미리보기.html` (크롬으로 확인 완료)
- 🛠️ 화면 확인용 도구 설치: `playwright`(npm, 설치된 크롬 사용) → `package.json`, `node_modules/`
- ✅ **방향 확정: 하이브리드(시안 4+3/10+8)** — 사용자 선택
- 🧩 하이브리드 **고화질 설계 프로토타입** 제작 → `docs/하이브리드_설계.html` (다크 시네마틱, 반응형, 스크롤 등장 애니메이션, 테마 필터). 크롬+모바일 화면 확인 완료
- 🔗 예약 버튼에 실제 주소 연결: 전체예약 `/booking/`, 테마별 `/rooms/firstfoundbride·bookofduat·ldc·time/`. 상단/히어로/플로팅 "예약하기"는 스크롤 없이 예약 페이지로 직행
- 🏢 **비즈니스(B2B) 전용 페이지** 신설 → `docs/비즈니스.html` (역량 3축·서비스·진행 5단계·레퍼런스·문의 폼, 골드 톤). 키이스케이프식으로 메인은 B2B를 티저로만 보여주고 버튼으로 전용 페이지 이동. 메인↔비즈니스 이동 동작 확인
- ✉️ 공식 이메일을 `fantastrick@fantastrick.co.kr`로 통일(메인·비즈니스 양쪽)
- 🗂️ 메인 **테마 섹션을 컴팩트 카드**로 개편(이미지 축소·줄거리 제거, 카드 전체가 예약 링크)
- 🎠 테마를 **가로 캐러셀(슬라이더)**로 전환 — 한 화면에 **정확히 4개**, **마우스 클릭&드래그**·터치 스와이프로 이동, **하단 슬라이드바**(드래그 가능)로 더 있는지 표시(화살표 버튼 제거). 드래그 후 오클릭(이동) 방지
- 🔜 3호점(TGC)에 **coming soon 테마 2개** 추가: `흑백사서 : ?`(테마명 추후 공개), `? ? ?`(미정) — 클릭 불가·"준비중" 표기
- 📝 테마 섹션 카테고리 용어 확정: **"인터랙티브 콘텐츠"**(업계 표준처럼 들리되 우리가 선점하는 용어 전략). 설명문은 경쟁사(키이스케이프 '몰입형 경험 콘텐츠') 템플릿과 겹치지 않게 '객석 vs 무대' 대비 구조로 새로 작성 (레퍼런스 `homepage_ref/플레이어블 스토리에 대한 문장 레퍼런스.png` 참고하되 차별화)
- 📥 `homepage_ref` 폴더에 자료 입수 확인: **공식 로고 3종**(검정/투명파랑/투명흰), **브랜드 컬러 팔레트**, **사업소개서**, 사업자등록증
- 🏷️ **공식 로고 적용**: 흰색 투명 로고를 메인·비즈니스 헤더/푸터에 삽입 → `assets/images/logo-white.png`(+blue/black 백업). 임시 'F' 마크 대체
- 🎨 **공식 브랜드 컬러 파악**(차후 적용 예정): Fantasy Blue `#043CB2`, Midnight Tricks `#13142A`, Engineered Sky `#2D67D8`, Structure Gray `#455071`, Fog White `#DBDFE7`, Illusion Red `#B20E19`, Phantom Violet `#622698` — 현재 시안(cyan/gold)에서 블루 계열로 통일 검토
- 🖼️ **테마별 공식 포스터** 4종 적용 → `assets/images/poster-bride·duat·ldc·time`. 테마 카드 이미지 비율 **1:1 정사각**(정중앙 크롭). 장르 태그(상단 좌)·매장 태그(상단 우)·난이도(자물쇠)·테마명 라벨
- 🛠️ 카드 호버 확대를 `<img> transform:scale` → **`background-image` + `background-size` 확대**로 전환. transform 클리핑 버그(확대 시 이미지가 카드 밖으로 삐져나옴)를 구조적으로 차단
- 🔖 **파비콘** 적용(`assets/images/favicon.png`) — 메인·비즈니스 양쪽 `<head>`에 연결
- 🔒 테마 난이도 표시를 ★ → **자물쇠 아이콘**(SVG)으로 변경 (태초4/사자3/락다운2/시간2, 5점 만점)

- 🎨 **공식 브랜드 컬러 적용**: B2C/메인 = 브랜드 블루(Fantasy Blue `#043CB2`~`#2f74e6`, 로고 색), B2B/비즈니스 = Phantom Violet, 머더룸 = 레드 계열, 배경 미드나잇 블루. (양쪽 페이지 CSS 변수+rgba 일괄 적용)

- 🗺️ 매장 섹션을 **2단 압축 레이아웃**으로 변경: 왼쪽=매장 카드 3개(세로·컴팩트), 오른쪽=지도 이미지(`assets/images/stores-map.png`). 지도 클릭 시 My Maps 뷰어로 연결. 모바일은 1단 스택
- 📍 매장명 라벨 PNG 3종(Pretendard, 다크 블록) 제작해 ref 폴더 저장 → 사용자가 My Maps에 올려 라벨 포함 지도 재캡처 → 고해상도(1592×1231) 이미지로 교체. 중복되던 HTML 라벨 오버레이는 제거
- 🔗 **Git 저장소 초기화 + GitHub 연결**: `.gitignore`(node_modules 등 제외) 작성, 로컬 커밋 후 **비공개(Private) 원격저장소** 생성·푸시 → `github.com/fantastrick2026/fantastrick-homepage` (bwl과 별개 독립 저장소, 기본 브랜치 main). Vercel 배포는 아직 안 함

### 다음 할 일 (제안)
- [ ] 프로토타입 피드백 반영 → 정식 `index.html`(+`business.html`) + `css/` + `js/`로 분리·정교화
- [ ] 예약 방식 결정(자체 예약 vs 네이버/외부 연동)
- [ ] 부족한 테마 대표 이미지(태초의 신부·사자의 서) 확보
