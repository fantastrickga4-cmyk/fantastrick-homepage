"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { IconMenu, IconClose } from "@/components/Icon";

// 공통 헤더 — 스크롤하면 배경이 생기는 시네마틱 헤더 + 모바일 드로어 메뉴
const MENU = [
  { href: "/about", label: "소개" },
  { href: "/#themes", label: "콘텐츠" },
  { href: "/#reviews", label: "리뷰" },
  { href: "/faq", label: "자주 묻는 질문" },
  { href: "/#business", label: "비즈니스" },
  { href: "/#stores", label: "오시는길" },
];

export default function Header() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // 드로어 열림: body 스크롤 잠금 + ESC 닫기 + 첫 항목 포커스
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    firstLinkRef.current?.focus();
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (pathname?.startsWith("/admin")) return null;

  return (
    <header className={scrolled ? "scrolled" : ""}>
      <div className="hdr-in">
        <Link href="/" className="brand" aria-label="FANTASTRICK 홈">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="logo-img" src="/images/logo-blue.png" alt="FANTASTRICK" />
        </Link>
        <nav className="main">
          {MENU.map((m) => (
            <Link key={m.href} href={m.href}>{m.label}</Link>
          ))}
        </nav>
        <div className="hdr-cta">
          <Link href="/reservation" className="btn ghost sm">예약 조회·취소</Link>
          <Link href="/reserve" className="btn primary sm">예약하기</Link>
        </div>
        <button
          className="menu-btn"
          onClick={() => setOpen(true)}
          aria-label="메뉴 열기"
          aria-expanded={open}
          aria-controls="mobile-drawer"
        >
          <IconMenu />
        </button>
      </div>

      {/* 모바일 드로어 */}
      <div id="mobile-drawer" className={"drawer" + (open ? " open" : "")}>
        <div className="drawer-scrim" onClick={() => setOpen(false)} aria-hidden="true" />
        <div className="drawer-panel" role="dialog" aria-modal="true" aria-label="메뉴">
          <div className="drawer-head">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="logo-img" src="/images/logo-blue.png" alt="FANTASTRICK" />
            <button className="drawer-close" onClick={() => setOpen(false)} aria-label="메뉴 닫기"><IconClose /></button>
          </div>
          {MENU.map((m, i) => (
            <Link
              key={m.href}
              href={m.href}
              className="menu-link"
              ref={i === 0 ? firstLinkRef : undefined}
              onClick={() => setOpen(false)}
            >
              {m.label}
            </Link>
          ))}
          <div className="drawer-cta">
            <Link href="/reservation" className="btn ghost" onClick={() => setOpen(false)}>예약 조회·취소</Link>
            <Link href="/reserve" className="btn primary" onClick={() => setOpen(false)}>예약하기</Link>
          </div>
        </div>
      </div>
    </header>
  );
}
