"use client";
import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { STORES, THEMES, SOON_THEMES, type Theme } from "@/lib/data";

// 홈 노출용 후기 타입 (승인된 실제 후기를 API에서 가져옴)
type HomeReview = {
  id: string; theme_name: string; name: string; rating: number; body: string; source?: string | null;
};

function Locks({ n }: { n: number }) {
  return (
    <span className="diff">
      {[1, 2, 3, 4, 5].map((i) => (
        <i key={i} className={i <= n ? "lock on" : "lock"} />
      ))}
    </span>
  );
}

// 활성 테마 카드 — 세로 포스터 갤러리(기본 포스터+이름+CASE, 호버 시 매장·시간·난이도·대표장르)
function ThemeCard({ t, no }: { t: Theme; no: number }) {
  // 카드 → 테마 상세(가격·시놉시스·주의사항). 예전엔 예약폼으로 바로 보내서
  // 손님이 가격도 스토리도 모른 채 예약부터 하게 됐음
  return (
    <Link className="tcard" data-cat={t.cat} href={`/rooms/${t.id}`}>
      <div
        className="thumb"
        style={{ backgroundImage: `url(${t.poster})` }}
        role="img"
        aria-label={`${t.name} 포스터`}
      >
        <span className="tcase">CASE No.{String(no).padStart(2, "0")}</span>
        {t.murder && <span className="tmurder">머더룸</span>}
        <div className="tt">
          <span className="store">{t.storeTag}</span>
          <h3>{t.name}</h3>
          <span className="tmeta">
            {t.minutes}분 · <Locks n={t.difficulty} /> · {t.genres[0]}
          </span>
        </div>
      </div>
    </Link>
  );
}

// 테마 가로 슬라이드(캐러셀) — PC·모바일 동일 구성. 모바일은 터치 스와이프, PC는 화살표.
function ThemeCarousel({ themes }: { themes: Theme[] }) {
  const railRef = useRef<HTMLDivElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const update = useCallback(() => {
    const el = railRef.current;
    if (!el) return;
    setCanPrev(el.scrollLeft > 8);
    setCanNext(el.scrollLeft < el.scrollWidth - el.clientWidth - 8);
  }, []);

  useEffect(() => {
    const el = railRef.current;
    if (!el) return;
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => { el.removeEventListener("scroll", update); window.removeEventListener("resize", update); };
  }, [update]);

  const move = (dir: number) => {
    const el = railRef.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>(".tcard");
    const step = card ? card.offsetWidth + 20 : el.clientWidth * 0.8;
    el.scrollBy({ left: dir * step, behavior: "smooth" });
  };

  return (
    <div className="theme-carousel reveal rv-focus">
      <button type="button" className="tc-arrow prev" aria-label="이전 테마" disabled={!canPrev} onClick={() => move(-1)}>‹</button>
      <div className="theme-rail" ref={railRef}>
        {themes.map((t, i) => (
          <ThemeCard key={t.id} t={t} no={i + 1} />
        ))}
      </div>
      <button type="button" className="tc-arrow next" aria-label="다음 테마" disabled={!canNext} onClick={() => move(1)}>›</button>
    </div>
  );
}

// 준비중 테마 — 하단 슬림 스트립(클릭 불가)
function SoonCard({ t }: { t: Theme }) {
  return (
    <div className="scard" data-cat={t.cat}>
      <span className="stag">COMING SOON</span>
      <span className="sname">{t.name}</span>
      {t.soonGenres && t.soonGenres[0] && <span className="sgen">{t.soonGenres[0]}</span>}
    </div>
  );
}

export default function Home() {
  const heroBgRef = useRef<HTMLDivElement>(null);

  // 실제 승인 후기 (마운트 시 로드)
  const [reviews, setReviews] = useState<HomeReview[] | null>(null);
  useEffect(() => {
    fetch("/api/reviews").then((r) => r.json()).then((j) => setReviews(j.reviews || [])).catch(() => setReviews([]));
  }, []);
  const revAvg = reviews && reviews.length ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1) : null;
  const topReviews = (reviews || []).slice().sort((a, b) => b.rating - a.rating).slice(0, 3);

  // 스크롤 등장 애니메이션
  useEffect(() => {
    const io = new IntersectionObserver(
      (es) =>
        es.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        }),
      { threshold: 0.14 }
    );
    document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  // 히어로 패럴랙스: 스크롤(세로 시차) + 마우스 이동(입체 깊이감). 모션 최소화/터치 시 비활성
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const bg = heroBgRef.current;
    if (!bg) return;

    const AMP = 16;                 // 마우스 이동 최대 진폭(px)
    const fine = window.matchMedia("(pointer: fine)").matches;
    let sy = 0;                     // 스크롤 오프셋
    let tmx = 0, tmy = 0;           // 목표 마우스 오프셋
    let mx = 0, my = 0;             // 현재(부드럽게 따라감)
    let raf = 0;

    const apply = () => {
      bg.style.transform = `translate3d(${mx.toFixed(2)}px, ${(sy + my).toFixed(2)}px, 0)`;
    };
    const loop = () => {
      mx += (tmx - mx) * 0.08;
      my += (tmy - my) * 0.08;
      apply();
      if (Math.abs(tmx - mx) > 0.08 || Math.abs(tmy - my) > 0.08) {
        raf = requestAnimationFrame(loop);
      } else { mx = tmx; my = tmy; apply(); raf = 0; }
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };

    const onScroll = () => { sy = Math.min(window.scrollY, 900) * 0.18; apply(); };
    const onMove = (e: PointerEvent) => {
      const nx = e.clientX / window.innerWidth - 0.5;
      const ny = e.clientY / window.innerHeight - 0.5;
      tmx = -nx * AMP * 2;         // 마우스 반대로 이동 → 깊이감
      tmy = -ny * AMP * 2;
      kick();
    };
    const onLeave = () => { tmx = 0; tmy = 0; kick(); };

    window.addEventListener("scroll", onScroll, { passive: true });
    if (fine) {
      window.addEventListener("pointermove", onMove, { passive: true });
      document.addEventListener("mouseleave", onLeave);
    }
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("mouseleave", onLeave);
      cancelAnimationFrame(raf);
    };
  }, []);


  return (
    <>
      {/* HERO — 타이포(FANTASY + TRICK = FANTASTRICK) */}
      <section className="hero-t" id="home">
        {/* 배경 3겹 — 무대 조명 · 설계도 모눈 · 그레인 질감 (globals.css 설명 참고) */}
        <div className="ht-mesh" aria-hidden="true" />
        <div className="ht-grid" aria-hidden="true" />
        <div className="ht-ghost" aria-hidden="true">FANTASTRICK</div>
        <div className="ht-noise" aria-hidden="true" />
        <div className="ht-stack">
          <div className="ht-eyebrow">PREMIUM ESCAPE ROOM</div>
          <div className="ht-slogan">
            <span>환상을</span>
            <span>기술로써</span>
            <span>현실에 구현한다.</span>
          </div>
          <div className="ht-wm">
            <span className="ht-w ht-fantasy">FANTAS<span className="ht-y">Y</span></span>
            <span className="ht-plus">+</span>
            <span className="ht-w ht-trick">TRICK</span>
            <span className="ht-shine" aria-hidden="true">FANTASTRICK</span>
          </div>
          <div className="ht-rule" aria-hidden="true" />
          <div className="cta">
            <Link href="/reserve" className="btn primary">테마 예약하기 →</Link>
            <Link href="/business" className="btn gold-ghost">외주·컨설팅 문의</Link>
          </div>
        </div>
        <div className="scrollcue">SCROLL ↓</div>
      </section>

      {/* 인터랙티브 콘텐츠 */}
      <section className="block alt" id="themes">
        <div className="wrap">
          <div className="shead reveal">
            <div className="eyebrow">INTERACTIVE CONTENTS</div>
            <h2 className="title">당신이 만들어가는 이야기</h2>
            <p className="lead">테마 목록</p>
          </div>
          <ThemeCarousel themes={THEMES} />
          {SOON_THEMES.length > 0 && (
            <div className="soon-strip reveal">
              <span className="soon-label">준비중 콘텐츠</span>
              <div className="soon-row">
                {SOON_THEMES.map((t) => (
                  <SoonCard key={t.id} t={t} />
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* REVIEWS — 별점 요약 + 대표 후기 발췌 */}
      <section className="block" id="reviews">
        <div className="wrap">
          <div className="shead reveal">
            <div className="eyebrow">REVIEWS</div>
            <h2 className="title">다녀간 이들이 남긴 이야기</h2>
          </div>
          <div className="rev-summary reveal rv-left">
            <div className="rs-score">
              <span className="score">{revAvg ?? "—"}</span>
              <span className="of">/ 5.0</span>
              <div className="s-stars" aria-hidden="true">★★★★★</div>
            </div>
            <div className="rs-meta">
              <div className="s-src">
                {revAvg ? `플레이어 후기 · ${reviews!.length}건` : "첫 후기를 기다리고 있어요"}
              </div>
            </div>
          </div>
          {topReviews.length > 0 ? (
            <>
              <div className="rev-grid">
                {topReviews.map((r, i) => (
                  <div key={r.id} className="rev-quote reveal" style={{ "--i": i } as CSSProperties}>
                    <div className="rq-mark" aria-hidden="true">“</div>
                    <div className="rq-stars" aria-label={`별점 ${r.rating}점`}>{"★".repeat(r.rating)}</div>
                    <p className="rq-body">{r.body}</p>
                    <div className="rq-foot">
                      <span className="rq-theme">{r.theme_name}</span>
                      <span className="rq-who">{r.name?.[0] ?? "익"}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="rev-more"><Link href="/reviews" className="tlink">전체 후기 →</Link></div>
            </>
          ) : reviews === null ? (
            <div className="notice info reveal">후기를 불러오는 중…</div>
          ) : (
            <div className="rev-empty reveal">
              <p>첫 후기의 주인공이 되어주세요.</p>
              <Link href="/reviews" className="btn primary sm">플레이하고 후기 남기기 →</Link>
            </div>
          )}
        </div>
      </section>

      {/* BUSINESS / B2B */}
      <section className="block biz" id="business">
        <div className="wrap">
          <div className="biz-head reveal">
            <div>
              <div className="eyebrow gold">BUSINESS · B2B</div>
              <h2 className="title">짓고, 만들고, 움직이게 합니다</h2>
              <p className="lead">11년 직영으로 검증한 콘텐츠·공간·장치 제작.</p>
            </div>
            <Link href="/business" className="btn gold">제작 역량 보기 →</Link>
          </div>
          <div className="cap3">
            <div className="cap reveal" style={{ "--i": 0 } as CSSProperties}><span className="cno">01</span><div className="en">Contents</div><h4>콘텐츠 제작</h4><span className="ckw">시나리오 · 연출 · 운영 설계</span></div>
            <div className="cap reveal" style={{ "--i": 1 } as CSSProperties}><span className="cno">02</span><div className="en">Space</div><h4>공간 디자인</h4><span className="ckw">세트 · 인테리어 · 동선 시공</span></div>
            <div className="cap reveal" style={{ "--i": 2 } as CSSProperties}><span className="cno">03</span><div className="en">Tech / Device</div><h4>기술 · 장치</h4><span className="ckw">잠금장치 · 조명·음향 · 센서 기믹</span></div>
          </div>
          <div className="biz-cta reveal">
            <div className="bt-actions">
              <Link href="/business" className="btn gold">비즈니스 문의 →</Link>
              <a href="mailto:fantastrick@fantastrick.co.kr" className="btn gold-ghost">이메일</a>
            </div>
          </div>
        </div>
      </section>

      {/* STORES (오시는 길) — 마지막 */}
      <section className="block alt" id="stores">
        <div className="wrap">
          <div className="shead reveal">
            <div className="eyebrow">STORES · 오시는 길</div>
            <h2 className="title">강남에서 만나는 세 개의 무대</h2>
            <p className="lead">강남역·신논현역 사이 — 세 매장 모두 걸어서 오갈 수 있습니다.</p>
          </div>
          <div className="stores-layout reveal rv-right">
            <div className="stores-left">
              {STORES.map((s) => (
                <div key={s.id} className={"store" + (s.tgc ? " tgc" : "")}>
                  <div className="store-head"><span className="tag">{s.tag}</span><h3>{s.name}</h3></div>
                  <div className="store-meta">테마 · <b>{s.themes}</b></div>
                  <div className="store-addr">{s.addr}{s.phone && <> · <a href={`tel:${s.phone.replace(/-/g, "")}`} className="store-tel">{s.phone}</a></>}</div>
                </div>
              ))}
              <p className="stores-note">매장별 운영시간은 예약 시 안내드립니다.</p>
            </div>
            <a
              className="stores-right"
              href="https://www.google.com/maps/d/viewer?mid=1_BzwJnCB42RENrmvTm-HNCyFHwm8zCA"
              target="_blank"
              rel="noopener"
              title="구글 지도에서 크게 보기"
            >
              <Image
                className="store-map-img"
                src="/images/stores-map.png"
                alt="판타스트릭 매장 위치 지도 — TGC·1호점·2호점"
                fill
                sizes="(max-width:760px) 100vw, 620px"
              />
              <span className="map-cap">세 매장 모두 도보권</span>
            </a>
          </div>
        </div>
      </section>

      <Link href="/reserve" className="btn primary float">예약하기</Link>
    </>
  );
}
