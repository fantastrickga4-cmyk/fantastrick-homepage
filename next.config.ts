import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 정적 이미지는 public/ 아래에서 직접 서빙 (외부 도메인 없음)
  reactStrictMode: true,
  // 상위 폴더(D:\test3)의 다른 lockfile 을 루트로 잘못 잡지 않도록 이 프로젝트로 고정
  outputFileTracingRoot: import.meta.dirname,
  // 모든 경로에 기본 보안 헤더 적용 (클릭재킹·MIME 스니핑·정보 유출 1차 방어)
  async headers() {
    return [
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
