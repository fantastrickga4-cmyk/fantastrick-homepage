"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

// 공통 헤더 — 스크롤하면 배경이 생기는 시네마틱 헤더
export default function Header() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={scrolled ? "scrolled" : ""}>
      <div className="hdr-in">
        <Link href="/" className="brand" aria-label="FANTASTRICK 홈">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="logo-img" src="/images/logo-white.png" alt="FANTASTRICK" />
        </Link>
        <nav className="main">
          <Link href="/#about">소개</Link>
          <Link href="/#themes">테마</Link>
          <Link href="/#stores">매장</Link>
          <Link href="/reviews">리뷰</Link>
          <Link href="/#business">비즈니스</Link>
        </nav>
        <div className="hdr-cta">
          <Link href="/reservation" className="btn ghost sm">예약 조회·취소</Link>
          <Link href="/reserve" className="btn primary sm">예약하기</Link>
        </div>
        <button
          className="menu-btn"
          onClick={() => document.querySelector("nav.main")?.scrollIntoView()}
          aria-label="메뉴"
        >
          ☰
        </button>
      </div>
    </header>
  );
}
