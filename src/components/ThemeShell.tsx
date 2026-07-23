"use client";
import { usePathname } from "next/navigation";

// 사이트 전체 다크(파란) 테마 래퍼. 관리자(/admin)만 기존 밝은 테마 유지.
// globals.css 의 .site-dark 가 색 토큰·배경·폰트를 다크로 바꾼다(홈에서 쓰던 것을 전 페이지로 확장).
export default function ThemeShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const dark = !pathname?.startsWith("/admin");
  return <div className={dark ? "site-dark" : undefined}>{children}</div>;
}
