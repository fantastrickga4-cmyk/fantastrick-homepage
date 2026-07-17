import ReserveClient from "./ReserveClient";

// 이 페이지는 **서버 컴포넌트**다. 주소창의 ?theme= 을 서버가 읽어 넘겨준다.
//
// 왜 이렇게 바꿨나 (2026-07-17):
//   전에는 화면 쪽에서 useSearchParams() 로 읽었는데, 그러면 Next 규칙상 <Suspense> 로 감싸고
//   "껍데기"를 먼저 그려야 한다. 그 껍데기가 실제 내용과 높이가 다르면 내용이 채워질 때
//   **푸터가 확 밀린다**(화면 튐 = 손님이 버튼 누르려는 순간 화면이 움직여 오조작).
//   1차 점검에서 CLS 0.36 이 나와 껍데기에 minHeight:560 을 줬는데, 그건 "테마를 안 고른
//   첫 화면(554px)" 기준이었다. **?theme= 로 들어오면 달력이 바로 떠서 996px** 이라
//   2차 점검에서 폰 CLS 0.18 로 여전히 실패했다 — 그리고 그게 하필 손님의 주 진입 경로
//   (테마 상세 → [이 테마 예약하기] → /reserve?theme=xxx)였다.
//
//   높이를 숫자로 박는 방식은 "다른 경로에서 또 어긋나는" 성질이 있어서, 껍데기 자체를 없앴다.
//   서버가 테마를 알고 첫 HTML 을 그리므로 튈 일이 없다.
export default async function ReservePage({
  searchParams,
}: {
  searchParams: Promise<{ theme?: string }>;
}) {
  const { theme } = await searchParams;
  return <ReserveClient preset={typeof theme === "string" ? theme : ""} />;
}
