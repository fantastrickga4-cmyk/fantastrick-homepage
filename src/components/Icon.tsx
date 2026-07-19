// 사이트 전역에서 쓰는 SVG 아이콘 모음 (이모지 대체).
//
// 왜 이모지 대신 SVG인가:
//   이모지(🔒·⚠️·★ 등)는 기기·운영체제마다 그림이 다르게 나온다(윈도우/안드로이드/아이폰이 제각각).
//   SVG 아이콘은 어디서 봐도 똑같이 나오고, 글자 색·크기를 그대로 따라간다.
//
// 사용법: <IconLock /> 처럼 그냥 넣으면 된다.
//   - 크기: 부모 글자 크기(font-size)를 따라간다(width/height = 1em). 크게 하려면 부모 font-size만 키우면 됨.
//   - 색: 부모 글자 색(currentColor)을 따라간다. 색을 바꾸려면 부모/자신에 color 만 주면 됨.
//   - 접근성: 기본적으로 aria-hidden(장식). 의미는 옆 글자나 부모의 aria-label 이 전달한다.
//
// 서버/클라이언트 컴포넌트 양쪽에서 쓸 수 있다(순수 SVG, 상태 없음).

import type { SVGProps } from "react";

function Svg({
  children,
  solid,
  style,
  ...p
}: SVGProps<SVGSVGElement> & { solid?: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill={solid ? "currentColor" : "none"}
      stroke={solid ? "none" : "currentColor"}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ verticalAlign: "-0.125em", flex: "none", ...style }}
      {...p}
    >
      {children}
    </svg>
  );
}

/* 별점 — 채움(현재 색). 빈 별은 부모 span 색을 흐리게 주면 됨. */
export const IconStar = (p: SVGProps<SVGSVGElement>) => (
  <Svg solid {...p}>
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z" />
  </Svg>
);

/* 자물쇠 — 예약 오픈 전 날짜, 난이도 표시 */
export const IconLock = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M7 10.5V7a5 5 0 0 1 10 0v3.5" />
    <rect x="4.5" y="10.5" width="15" height="10" rx="2.2" fill="currentColor" stroke="none" />
  </Svg>
);

/* 성공 체크 (동그라미 안 체크) — 접수/완료 안내 */
export const IconCheck = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8 12.4l2.6 2.6L16.2 9" />
  </Svg>
);

/* 경고 (세모 안 느낌표) — 오류 안내 */
export const IconWarn = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M12 3.6L21.5 20.2H2.5z" />
    <path d="M12 9.8v4.2" />
    <path d="M12 17.2v.01" />
  </Svg>
);

/* 닫기 (X) */
export const IconClose = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);

/* 메뉴 (햄버거) */
export const IconMenu = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Svg>
);

/* 마감 (동그라미에 사선) — 예약 불가 시간 */
export const IconBan = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M5.6 5.6l12.8 12.8" />
  </Svg>
);

/* 임박 (스톱워치) — 시작이 가까워 예약 닫힌 시간 */
export const IconClock = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M10 3h4" />
    <path d="M12 5.5V4" />
    <circle cx="12" cy="13" r="8" />
    <path d="M12 9v4l2.8 2" />
  </Svg>
);

/* 가격·결제 (지폐) */
export const IconMoney = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <rect x="2.5" y="6" width="19" height="12" rx="2" />
    <circle cx="12" cy="12" r="2.6" />
    <path d="M5.5 9.5v5M18.5 9.5v5" />
  </Svg>
);

/* 예약·취소 (달력) */
export const IconCalendar = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
    <path d="M3.5 9.5h17M8 3v4M16 3v4" />
  </Svg>
);

/* 이용 안내 (연극 가면) */
export const IconMask = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M5.5 5c4.3-1.1 8.7-1.1 13 0 0 8-3 12.5-6.5 12.5S5.5 13 5.5 5z" />
    <path d="M9.3 9.4c.6-.6 1.5-.6 2.1 0M12.6 9.4c.6-.6 1.5-.6 2.1 0" />
    <path d="M9.5 13.2c1.4 1.3 3.6 1.3 5 0" />
  </Svg>
);

/* 오시는 길 (전철) */
export const IconSubway = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <rect x="5" y="3.5" width="14" height="13.5" rx="3.5" />
    <path d="M5 11h14" />
    <circle cx="9" cy="14" r="1" fill="currentColor" stroke="none" />
    <circle cx="15" cy="14" r="1" fill="currentColor" stroke="none" />
    <path d="M7.5 17.5L5.5 21M16.5 17.5l2 3.5" />
  </Svg>
);

/* 콘텐츠 제작 (연필) */
export const IconPencil = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1z" />
    <path d="M14.5 6.5l3 3" />
  </Svg>
);

/* 공간 디자인 (도면) */
export const IconPlan = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <rect x="3.5" y="4" width="17" height="16" rx="1.5" />
    <path d="M3.5 12h9M12.5 4v8M12.5 12v8M12.5 15.5h8" />
  </Svg>
);

/* 기술·장치 (톱니바퀴) */
export const IconGear = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="6.3" />
    <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />
    <path d="M12 3v2.6M12 18.4V21M3 12h2.6M18.4 12H21M5.64 5.64l1.84 1.84M16.52 16.52l1.84 1.84M18.36 5.64l-1.84 1.84M7.48 16.52l-1.84 1.84" />
  </Svg>
);
