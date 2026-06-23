import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 정적 이미지는 public/ 아래에서 직접 서빙 (외부 도메인 없음)
  reactStrictMode: true,
  // 상위 폴더(D:\test3)의 다른 lockfile 을 루트로 잘못 잡지 않도록 이 프로젝트로 고정
  outputFileTracingRoot: import.meta.dirname,
};

export default nextConfig;
