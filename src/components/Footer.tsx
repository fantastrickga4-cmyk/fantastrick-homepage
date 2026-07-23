"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Footer() {
  const pathname = usePathname();
  if (pathname?.startsWith("/admin")) return null;
  // 홈은 다크 테마라 푸터도 이어지는 딥블루로(다른 페이지는 기존 밝은 푸터 유지)
  return (
    <footer className={pathname === "/" ? "foot-dark" : undefined}>
      <div className="wrap">
        <div className="foot-grid">
          <div>
            <div className="brand" style={{ marginBottom: 12 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="logo-img" src="/images/logo-blue.png" alt="FANTASTRICK" style={{ height: 30 }} />
            </div>
            <p className="slogan-foot">일상이 멈추고, 이야기가 시작된다</p>
            <p style={{ margin: "8px 0 0" }}>
              강남 11년차 이머시브 방탈출 &amp; 머더룸 브랜드
              <br />판타스트릭 (Fantasy + Trick)
            </p>
          </div>
          <div>
            <h5>바로가기</h5>
            <ul>
              <li><Link href="/#themes">인터랙티브 콘텐츠</Link></li>
              <li><Link href="/reviews">리뷰</Link></li>
              <li><Link href="/business">비즈니스(B2B)</Link></li>
              <li><Link href="/#stores">오시는 길</Link></li>
            </ul>
          </div>
          <div>
            <h5>문의 · 예약</h5>
            <ul>
              <li>예약 · <Link href="/reserve">홈페이지에서 예약</Link></li>
              <li>예약 조회·취소 · <Link href="/reservation">바로가기</Link></li>
              <li>비즈니스 · <a href="mailto:fantastrick@fantastrick.co.kr">fantastrick@fantastrick.co.kr</a></li>
              <li>1호점 · 강남대로79길 39, B1</li>
              <li>2호점 · 사평대로 353, B1</li>
              <li>TGC · 강남대로83길 34, B1</li>
            </ul>
          </div>
        </div>
        <div className="foot-bottom">
          <span>
            © 2026 FANTASTRICK. All rights reserved.
            <Link href="/admin" className="foot-admin">관리자</Link>
          </span>
          <span className="slogan-foot">일상이 멈추고, 이야기가 시작된다</span>
        </div>
      </div>
    </footer>
  );
}
