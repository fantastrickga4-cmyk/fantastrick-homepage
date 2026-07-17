import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 정적 이미지는 public/ 아래에서 직접 서빙 (외부 도메인 없음)
  reactStrictMode: true,
  // ⚠️ minimumCacheTTL 은 "**Vercel 서버**가 최적화된 이미지를 얼마나 보관할지"만 정한다.
  //    손님 폰(브라우저)이 얼마나 보관할지는 **원본 파일의 Cache-Control 을 그대로 물려받는다**.
  //    그래서 이것만으로는 재방문 때마다 포스터를 다시 받는 문제가 안 고쳐진다
  //    (2차 점검 실측: x-vercel-cache: HIT 인데 손님에게 가는 값은 max-age=0).
  //    → 실제 해결은 아래 headers() 의 /images, /fonts 규칙이다. 이건 서버 보관용으로 유지.
  images: { minimumCacheTTL: 60 * 60 * 24 * 30 },
  // 상위 폴더(D:\test3)의 다른 lockfile 을 루트로 잘못 잡지 않도록 이 프로젝트로 고정
  outputFileTracingRoot: import.meta.dirname,
  // 태블릿 앱(BankNotify)이 보내는 주소를 받아준다.
  //   앱은 "설정한주소 + /webhook/deposit" 으로 보내도록 만들어져 있다(PC 서버 시절 주소).
  //   앱을 다시 설치하지 않고도 홈페이지가 받을 수 있게 여기서 진짜 문으로 넘겨준다.
  //   ⚠️ 이 줄을 지우면 이미 설치된 앱이 입금 알림을 못 보낸다 — 앱을 새로 깔기 전엔 지우지 말 것.
  async rewrites() {
    return [{ source: "/webhook/deposit", destination: "/api/bank/deposit" }];
  },
  // 모든 경로에 기본 보안 헤더 적용 (클릭재킹·MIME 스니핑·정보 유출 1차 방어)
  async headers() {
    return [
      // 포스터·로고 같은 그림: 손님 폰에 하루 보관 → 그날 다시 와도 다시 안 받는다.
      //   하루가 지나면 "일단 옛 그림을 바로 보여주고(=안 느림), 뒤에서 몰래 새로 받아둔다"
      //   (stale-while-revalidate). 그래서 포스터를 같은 이름으로 갈아끼워도 **하루 안에** 반영된다.
      //   ⚠️ 여기서 max-age 를 1년으로 박으면 빨라지긴 하지만, 포스터를 바꿔도 이미 방문한
      //      손님 폰에는 **1년 내내 옛 포스터**가 남는다. 그래서 일부러 하루로 잡았다.
      //   ※ /_next/image 로 자동 변환된 그림도 이 원본의 값을 그대로 물려받으므로 같이 해결된다.
      {
        source: "/images/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=2592000",
          },
        ],
      },
      // 글꼴: 그림보다 훨씬 안 바뀌므로 30일. 바꿀 일이 생기면 파일 이름을 바꾸면 즉시 반영된다.
      {
        source: "/fonts/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=2592000, stale-while-revalidate=31536000",
          },
        ],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "geolocation=(), camera=(), microphone=()" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
