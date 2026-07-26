"use client";
import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

// 이벤트 게시판 — 인스타 포토카드 느낌.
// 그리드에는 "옵저버 제도" 카드 1개 + "리뷰 이벤트" 카드 1개.
// 옵저버 카드를 누르면 팝업 안에서 테마 포스터 4장을 ‹ › 로 하나씩 넘겨봐요.
type Theme = { theme: string; store: string; poster: string; roomId: string; rule: string; notes: string[] };

// 이벤트 진행 상태 배지 — 상시진행 또는 마감날짜(예: "~08.31 마감")
type Schedule = { type: "always" } | { type: "until"; date: string };
function StatusBadge({ schedule }: { schedule: Schedule }) {
  if (schedule.type === "always") {
    return (
      <span className="ev-status">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M17 2l4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14" />
          <path d="M7 22l-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" />
        </svg>
        상시 진행
      </span>
    );
  }
  return (
    <span className="ev-status ev-status-until">
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
      </svg>
      {schedule.date} 마감
    </span>
  );
}

const OBSERVER_THEMES: Theme[] = [
  {
    theme: "태초의 신부", store: "1호점", roomId: "firstfoundbride", poster: "/images/poster-bride.jpg",
    rule: "신규 2인과 함께 오면 옵저버 인원 무료 플레이",
    notes: ["주말·공휴일에는 적용되지 않아요.", "옵저버는 같이 플레이해도 되고 관전만 해도 괜찮습니다."],
  },
  {
    theme: "사자의 서", store: "2호점", roomId: "bookofduat", poster: "/images/poster-duat.png",
    rule: "신규 2인과 함께 오면 옵저버 인원 무료 플레이",
    notes: ["주말·공휴일에는 적용되지 않아요.", "옵저버는 같이 플레이해도 되고 관전만 해도 괜찮습니다."],
  },
  {
    theme: "락다운시티", store: "3호점 · TGC", roomId: "ldc", poster: "/images/poster-ldc.png",
    rule: "인원과 상관없이 무조건 3인 가격 (4인·5인이 와도 3인 가격)",
    notes: ["주말·공휴일에도 적용돼요.", "옵저버는 같이 플레이해도 되고 관전만 해도 괜찮습니다."],
  },
  {
    theme: "시간의 영속성", store: "3호점 · TGC", roomId: "time", poster: "/images/poster-time.jpg",
    rule: "신규 3인과 함께 오면 본인은 무료 입장",
    notes: ["주말·공휴일에도 적용돼요.", "다른 사람의 추리 플레이를 옆에서 관전할 수 있어요."],
  },
];

const REVIEW = {
  title: "리뷰 이벤트", badge: "진행 중", mascot: "/images/mascot-tricky-v4.png",
  summary: "후기 남기고 테마 5,000원 할인 + 굿즈 받아가세요!",
  body: [
    { h: "이런 이벤트예요", items: [
      "테마를 플레이하고 블로그·네이버 카페에 리뷰를 남기면, 테마 5,000원 할인과 굿즈를 드립니다!",
    ] },
    { h: "참여 방법", items: [
      "테마 플레이 후 블로그 또는 네이버 카페에 리뷰 작성",
      "리뷰는 10줄 이상 + 블로그 주소 첨부",
      "작성한 리뷰 링크를 인스타그램 DM으로 보내주기",
      "DM에 혜택 받으실 분의 성함·연락처를 함께 남겨주세요",
    ] },
    { h: "혜택 · 유의", items: [
      "테마 5,000원 할인 + 굿즈 제공 (전 지점 원하는 테마 사용 가능, 굿즈는 TGC점 테마 키링 중 택 1)",
      "실제 플레이하신 후기만 인정됩니다.",
    ] },
  ],
  cta: { label: "예약하기 →", href: "/reserve" },
};

const BIRTHDAY = {
  title: "생일 이벤트", badge: "진행 중", image: "/images/event-birthday.png",
  summary: "생일 달엔 전 테마 5,000원 할인 쿠폰을 문자로 보내드려요!",
  body: [
    { h: "이런 이벤트예요", items: [
      "테마 이용 시 작성한 동의서에 마케팅 수신 동의를 하신 분께, 생일이 있는 달에 쓸 수 있는 쿠폰을 그 달 1일에 문자로 보내드립니다!",
    ] },
    { h: "쿠폰 혜택", items: [
      "판타스트릭 전 테마 5,000원 할인 쿠폰 (원하는 테마에 사용 가능)",
    ] },
    { h: "사용 기한 · 유의", items: [
      "쿠폰은 생일 해당 월 1일부터 그 달 마지막 날까지 사용할 수 있어요.",
      "테마 이용 시 동의서의 마케팅 수신 동의에 체크하셔야 발송됩니다.",
    ] },
  ],
  cta: { label: "예약하기 →", href: "/reserve" },
};

export default function EventsPage() {
  const [open, setOpen] = useState<null | "observer" | "review" | "birthday">(null);
  const [sub, setSub] = useState(0); // 옵저버 팝업 안에서 몇 번째 테마인지
  const go = useCallback((d: number) => setSub((i) => (i + d + OBSERVER_THEMES.length) % OBSERVER_THEMES.length), []);

  const openObserver = () => { setSub(0); setOpen("observer"); };
  const close = () => setOpen(null);

  const touchX = useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => { touchX.current = e.touches[0].clientX; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
    touchX.current = null;
  };

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (open === "observer" && e.key === "ArrowLeft") go(-1);
      else if (open === "observer" && e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [open, go]);

  const t = OBSERVER_THEMES[sub];

  return (
    <section className="block" id="events" style={{ borderTop: "none" }}>
      <div className="wrap">
        <div className="shead">
          <h1 className="title">이벤트 · Events</h1>
          <p className="lead">판타스트릭에서 진행 중인 이벤트입니다.</p>
        </div>

        <div className="ev-grid">
          {/* 옵저버 제도 카드 — 누르면 팝업 안에서 테마 4장을 넘겨봄 */}
          <button type="button" className="ev-card" onClick={openObserver} aria-label="옵저버 제도 자세히 보기">
            <div className="ev-thumb ev-collage">
              <span className="ev-collage-grid">
                {OBSERVER_THEMES.map((th) => (
                  <span className="ev-cell" key={th.roomId}>
                    <Image src={th.poster} alt="" fill sizes="130px" className="ev-poster" />
                  </span>
                ))}
              </span>
              <span className="ev-shade" />
              <span className="ev-badge">옵저버 제도</span>
              <span className="ev-sub">OBSERVER</span>
              <span className="ev-thumb-title">옵저버 제도</span>
              <span className="ev-thumb-store">테마 4</span>
            </div>
            <div className="ev-cap">
              <div className="ev-cap-top">
                <span className="ev-tag">#옵저버제도</span>
                <StatusBadge schedule={{ type: "always" }} />
              </div>
              <p className="ev-summary">테마별 옵저버 혜택을 카드로 넘겨 확인하세요</p>
              <span className="ev-more">자세히 보기 →</span>
            </div>
          </button>

          {/* 리뷰 이벤트 카드 */}
          <button type="button" className="ev-card" onClick={() => setOpen("review")} aria-label="리뷰 이벤트 자세히 보기">
            <div className="ev-thumb">
              <Image src="/images/review-event.png" alt="리뷰 이벤트 — 테마 5,000원 할인 + 굿즈" fill sizes="(max-width:560px) 46vw, 260px" className="ev-poster" />
              <span className="ev-badge">{REVIEW.badge}</span>
            </div>
            <div className="ev-cap">
              <div className="ev-cap-top">
                <span className="ev-tag">#리뷰이벤트</span>
                <StatusBadge schedule={{ type: "always" }} />
              </div>
              <p className="ev-summary">{REVIEW.summary}</p>
              <span className="ev-more">자세히 보기 →</span>
            </div>
          </button>

          {/* 생일 이벤트 카드 */}
          <button type="button" className="ev-card" onClick={() => setOpen("birthday")} aria-label="생일 이벤트 자세히 보기">
            <div className="ev-thumb">
              <Image src={BIRTHDAY.image} alt="생일 이벤트" fill sizes="(max-width:560px) 46vw, 260px" className="ev-poster" />
              <span className="ev-shade" />
              <span className="ev-badge">{BIRTHDAY.badge}</span>
              <span className="ev-sub">BIRTHDAY</span>
              <span className="ev-thumb-title">생일 이벤트</span>
            </div>
            <div className="ev-cap">
              <div className="ev-cap-top">
                <span className="ev-tag">#생일이벤트</span>
                <StatusBadge schedule={{ type: "always" }} />
              </div>
              <p className="ev-summary">{BIRTHDAY.summary}</p>
              <span className="ev-more">자세히 보기 →</span>
            </div>
          </button>
        </div>
      </div>

      {/* 옵저버 팝업 — 안에서 테마 4장을 넘겨봄 */}
      {open === "observer" && (
        <div className="ev-modal-overlay" onClick={close} role="dialog" aria-modal="true" aria-label="옵저버 제도">
          <button className="ev-nav prev" onClick={(e) => { e.stopPropagation(); go(-1); }} aria-label="이전 테마">‹</button>
          <div className="ev-modal" onClick={(e) => e.stopPropagation()} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
            <button className="ev-modal-x" onClick={close} aria-label="닫기">✕</button>
            <div className="ev-modal-head ev-poster-head">
              <Image src={t.poster} alt="" fill sizes="560px" className="ev-poster" />
              <div className="ev-poster-overlay">
                <span className="ev-badge">옵저버 · {t.store}</span>
                <h2>{t.theme}</h2>
              </div>
            </div>
            <div className="ev-modal-body">
              <p className="ev-modal-lead">{t.rule}</p>
              <div className="ev-sec">
                <h3>유의사항</h3>
                <ul>{t.notes.map((n, j) => <li key={j}>{n}</li>)}</ul>
              </div>
              <div className="ev-modal-cta">
                <Link href={`/rooms/${t.roomId}`} className="btn primary" onClick={close}>이 테마 보기 →</Link>
              </div>
              <div className="ev-dots">
                {OBSERVER_THEMES.map((th, j) => (
                  <button key={th.roomId} className={"ev-dot" + (j === sub ? " on" : "")}
                    onClick={(e) => { e.stopPropagation(); setSub(j); }} aria-label={`${th.theme} 보기`} />
                ))}
              </div>
              <div className="ev-modal-count">{sub + 1} / {OBSERVER_THEMES.length}</div>
            </div>
          </div>
          <button className="ev-nav next" onClick={(e) => { e.stopPropagation(); go(1); }} aria-label="다음 테마">›</button>
        </div>
      )}

      {/* 리뷰 이벤트 팝업 */}
      {open === "review" && (
        <div className="ev-modal-overlay" onClick={close} role="dialog" aria-modal="true" aria-label={REVIEW.title}>
          <div className="ev-modal" onClick={(e) => e.stopPropagation()}>
            <button className="ev-modal-x" onClick={close} aria-label="닫기">✕</button>
            <Image src="/images/review-event.png" alt="리뷰 이벤트 — 테마 5,000원 할인 + 굿즈" width={1080} height={1080} sizes="560px" className="ev-modal-poster" />
            <div className="ev-modal-body">
              <p className="ev-modal-lead">{REVIEW.summary}</p>
              {REVIEW.body.map((sec, j) => (
                <div key={j} className="ev-sec">
                  <h3>{sec.h}</h3>
                  <ul>{sec.items.map((it, k) => <li key={k}>{it}</li>)}</ul>
                </div>
              ))}
              <div className="ev-modal-cta">
                <Link href={REVIEW.cta.href} className="btn primary" onClick={close}>{REVIEW.cta.label}</Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 생일 이벤트 팝업 */}
      {open === "birthday" && (
        <div className="ev-modal-overlay" onClick={close} role="dialog" aria-modal="true" aria-label={BIRTHDAY.title}>
          <div className="ev-modal" onClick={(e) => e.stopPropagation()}>
            <button className="ev-modal-x" onClick={close} aria-label="닫기">✕</button>
            <Image src={BIRTHDAY.image} alt="생일 이벤트" width={1080} height={1080} sizes="560px" className="ev-modal-poster" />
            <div className="ev-modal-body">
              <p className="ev-modal-lead">{BIRTHDAY.summary}</p>
              {BIRTHDAY.body.map((sec, j) => (
                <div key={j} className="ev-sec">
                  <h3>{sec.h}</h3>
                  <ul>{sec.items.map((it, k) => <li key={k}>{it}</li>)}</ul>
                </div>
              ))}
              <div className="ev-modal-cta">
                <Link href={BIRTHDAY.cta.href} className="btn primary" onClick={close}>{BIRTHDAY.cta.label}</Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
