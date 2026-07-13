"use client";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState, type CSSProperties } from "react";
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
  return (
    <Link className="tcard" data-cat={t.cat} href={`/reserve?theme=${t.id}`}>
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

  // 실제 승인 후기 + 외부 리뷰 링크 (마운트 시 로드)
  const [reviews, setReviews] = useState<HomeReview[] | null>(null);
  const [ext, setExt] = useState<{ naverUrl: string; googleUrl: string; extRating: number; extCount: number } | null>(null);
  useEffect(() => {
    fetch("/api/reviews").then((r) => r.json()).then((j) => setReviews(j.reviews || [])).catch(() => setReviews([]));
    fetch("/api/config").then((r) => r.json()).then((c) => setExt({ naverUrl: c.naverUrl || "", googleUrl: c.googleUrl || "", extRating: c.extRating || 0, extCount: c.extCount || 0 })).catch(() => {});
  }, []);
  const revAvg = reviews && reviews.length ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1) : null;
  const topReviews = (reviews || []).slice().sort((a, b) => b.rating - a.rating).slice(0, 4);

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
        <div className="ht-mesh" aria-hidden="true" />
        <div className="ht-ghost" aria-hidden="true">FANTASTRICK</div>
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
            <h2 className="title">당신을 무대 위에 세우는 이야기</h2>
            <p className="lead">방탈출 · 머더미스터리 · 이머시브 — 지금 문이 열린 콘텐츠.</p>
          </div>
          <div className="theme-grid reveal">
            {THEMES.map((t, i) => (
              <ThemeCard key={t.id} t={t} no={i + 1} />
            ))}
          </div>
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
            <div className="eyebrow">REVIEWS · 플레이 후기</div>
            <h2 className="title">직접 겪은 사람들의 이야기</h2>
            <p className="lead">실제 플레이하신 분들이 남긴 생생한 후기입니다. 전화번호로 예약한 분만 작성할 수 있어요.</p>
          </div>
          <div className="rev-summary reveal">
            <div>
              <span className="score">{revAvg ?? (ext?.extRating ? ext.extRating.toFixed(1) : "—")}</span> <span className="of">/ 5.0</span>
              <div className="s-stars" aria-hidden="true">★★★★★</div>
              <div className="s-meta">
                {revAvg
                  ? `플레이어 후기 평점 · 후기 ${reviews!.length}건`
                  : ext?.extRating
                    ? `외부 리뷰 평점${ext.extCount ? ` · ${ext.extCount}건` : ""}`
                    : "첫 후기를 기다리고 있어요"}
              </div>
            </div>
            <div className="sp" />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {ext?.naverUrl && <a href={ext.naverUrl} target="_blank" rel="noopener" className="btn ghost sm">네이버 플레이스 리뷰 →</a>}
              {ext?.googleUrl && <a href={ext.googleUrl} target="_blank" rel="noopener" className="btn ghost sm">구글 리뷰 →</a>}
              <Link href="/reviews" className="btn ghost sm">전체 후기 보기 →</Link>
            </div>
          </div>
          {topReviews.length > 0 ? (
            <div className="rev-grid">
              {topReviews.map((r, i) => (
                <div key={r.id} className="rev-quote reveal" style={{ "--i": i } as CSSProperties}>
                  <div className="rq-stars" aria-label={`별점 ${r.rating}점`}>
                    {"★".repeat(r.rating)}<span style={{ color: "var(--faint)" }}>{"★".repeat(5 - r.rating)}</span>
                  </div>
                  <div className="rq-theme">{r.theme_name}{r.source && r.source !== "자체" ? ` · ${r.source}` : ""}</div>
                  <div className="rq-body">“{r.body}”</div>
                  <div className="rq-who">— {r.name}</div>
                </div>
              ))}
            </div>
          ) : reviews === null ? (
            <div className="notice info reveal">후기를 불러오는 중…</div>
          ) : (
            <div className="rev-empty reveal" style={{ textAlign: "center", padding: "36px 20px", border: "1px dashed var(--line)", borderRadius: 14 }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>아직 등록된 후기가 없어요</div>
              <p style={{ color: "var(--muted)", margin: "0 0 16px" }}>첫 후기를 기다리고 있어요. 플레이 후 소중한 후기를 남겨주세요.</p>
              <Link href="/reviews" className="btn primary sm">후기 남기기 →</Link>
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
              <h2 className="title">우리는, 직접 만듭니다</h2>
              <p className="lead">
                11년간 직영 매장을 운영하며 쌓은 콘텐츠·공간·장치 역량을 외부 프로젝트에도 제공합니다. 브랜드
                공간, 체험형 콘텐츠, 이머시브 장치가 필요하다면 처음부터 끝까지 함께합니다.
              </p>
            </div>
            <Link href="/business" className="btn gold">비즈니스 페이지 보기 →</Link>
          </div>
          <div className="cap3">
            <div className="cap reveal" style={{ "--i": 0 } as CSSProperties}><div className="ci">✎</div><div className="en">Contents</div><h4>콘텐츠 제작</h4><p>테마·시나리오·연출 기획부터 운영 설계까지. 방탈출·머더미스터리·브랜드 체험 콘텐츠 턴키 제작.</p></div>
            <div className="cap reveal" style={{ "--i": 1 } as CSSProperties}><div className="ci">▦</div><div className="en">Space</div><h4>공간 디자인</h4><p>세트·인테리어·동선 설계. 이야기에 맞춘 몰입형 공간을 직접 시공·연출합니다.</p></div>
            <div className="cap reveal" style={{ "--i": 2 } as CSSProperties}><div className="ci">⚙</div><div className="en">Tech / Device</div><h4>기술 · 장치</h4><p>잠금/해제 장치, 조명·음향·기믹 제어, 센서 트리거 등 이머시브 장치를 제작·납품·판매합니다.</p></div>
          </div>
          <div className="biz-cta reveal">
            <div className="bt">
              <h4>컨설팅 · 외주 제작 · 장치 도입이 필요하세요?</h4>
              <p>역량·서비스·진행 방식·레퍼런스·문의를 비즈니스 전용 페이지에 정리해 두었습니다. (직영 매장 3곳·테마 4종이 곧 포트폴리오입니다.)</p>
            </div>
            <Link href="/business" className="btn gold">비즈니스(B2B) 페이지로 →</Link>
            <a href="mailto:fantastrick@fantastrick.co.kr" className="btn gold-ghost">fantastrick@fantastrick.co.kr</a>
          </div>
        </div>
      </section>

      {/* STORES (오시는 길) — 마지막 */}
      <section className="block alt" id="stores">
        <div className="wrap">
          <div className="shead reveal">
            <div className="eyebrow">STORES · 오시는 길</div>
            <h2 className="title">강남 직영 3곳</h2>
            <p className="lead">강남역·신논현역 도보권. 모든 매장은 인접해 있어 단체 이용도 가능합니다.</p>
          </div>
          <div className="stores-layout reveal">
            <div className="stores-left">
              {STORES.map((s) => (
                <div key={s.id} className={"store" + (s.tgc ? " tgc" : "")}>
                  <div className="store-head"><span className="tag">{s.tag}</span><h3>{s.name}</h3></div>
                  <div className="addr">{s.addr}</div>
                  <div className="hours">{s.hours}</div>
                  <div className="themes">테마 · <b>{s.themes}</b></div>
                </div>
              ))}
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
            </a>
          </div>
        </div>
      </section>

      <Link href="/reserve" className="btn primary float">예약하기</Link>
    </>
  );
}
