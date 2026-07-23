"use client";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { STORES, THEMES, SOON_THEMES, type Theme } from "@/lib/data";
import { IconStar } from "@/components/Icon";
import HeroWeb from "@/components/HeroWeb";

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
  // draggable=false — 포스터를 잡아끌 때 브라우저가 링크를 끌고 다니는 유령 이미지를 띄우지 않게.
  // (전에는 CSS 로 카드 자체를 pointer-events:none 처리했는데, 그러면 클릭이 아예 안 먹었다)
  return (
    <Link className="tcard" data-cat={t.cat} href={`/rooms/${t.id}`} draggable={false}>
      <div className="thumb">
        {/* ⚠️ CSS 배경(backgroundImage)으로 넣으면 next/image 최적화를 통째로 건너뛴다.
            예전엔 그렇게 해서 poster-ldc.png 1MB 원본이 그대로 내려갔음(화면엔 266px로 보이는데).
            <Image fill> 로 넣으면 화면 크기에 맞게 줄이고 WebP 로 바꿔서 보냄 → 4장 합계 2,014KB → 187KB.
            (예전에 배경으로 바꾼 이유였던 '호버 확대가 카드 밖으로 삐져나옴'은 .tcard{overflow:clip} 으로 이미 해결됨) */}
        <Image
          src={t.poster}
          alt={`${t.name} 포스터`}
          fill
          sizes="(max-width:520px) 82vw, (max-width:980px) 45vw, 280px"
          className="thumb-img"
        />
        <span className="tcase">TITLE {String(no).padStart(2, "0")}</span>
        {t.murder && <span className="tmurder">머더룸</span>}
        <div className="tt">
          <span className="tstore">{t.storeTag}</span>
          <h3>{t.name}</h3>
          <span className="tmeta">
            {t.minutes}분 · <Locks n={t.difficulty} /> · {t.genres[0]}
          </span>
        </div>
      </div>
    </Link>
  );
}

// 테마 갤러리 — cantor8 "Product Suite" 식: 카드가 위아래로 엇갈려 가로로 늘어서고,
// 세로 스크롤(휠)에 따라 좌로 흐른다. 데스크톱=핀 고정 가로스크롤 / 모바일·모션최소=네이티브 가로 스와이프.
function ThemeGallery({ themes, soon }: { themes: Theme[]; soon: Theme[] }) {
  const secRef = useRef<HTMLElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sec = secRef.current, pin = pinRef.current, track = trackRef.current;
    if (!sec || !pin || !track) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // 데스크톱 + 모션 허용일 때만 핀 고정 가로스크롤. 아니면 네이티브 가로 스와이프.
    const pinned = () => window.matchMedia("(min-width: 861px)").matches && !reduce;
    let travel = 0, startX = 0, cardW = 320, vw = 0;
    const GAP = 26;

    const onScroll = () => {
      if (travel <= 0) return;
      // 섹션이 화면 맨 위에 닿는 순간(top=0)부터, travel px 만큼 세로로 스크롤하는 동안
      // 트랙을 startX(첫 카드 오른쪽 끝) → startX-travel(마지막 카드 오른쪽 끝) 로 좌로 민다.
      const top = sec.getBoundingClientRect().top;
      const p = Math.min(1, Math.max(0, -top / travel));
      const tx = startX - p * travel;
      track.style.transform = `translate3d(${tx.toFixed(1)}px,0,0)`;
      // 카드마다 '화면상 x 위치'에 따라 개별 스케일 + 상하 물결(cantor8 실측 재현):
      //  · 스케일: 오른쪽 진입(cx≈1.22*vw)=0.72배 → 좌측 26% 지점에서 1.0배, 더 왼쪽은 1.0 유지. 한 장씩 커진다.
      //  · 물결: 상하 위치를 cx 의 sine 으로 → 흐르면서 연속으로 출렁(고정 엇갈림 아님).
      const fullX = vw * 0.26, rightX = vw * 1.22, minS = 0.72;
      const amp = 46, period = (cardW + GAP) * 2.1;
      const kids = track.children;
      for (let i = 0; i < kids.length; i++) {
        const el = kids[i] as HTMLElement;
        const cx = tx + i * (cardW + GAP) + cardW / 2; // 카드 중심의 화면 x
        let s = 1 - (1 - minS) * (cx - fullX) / (rightX - fullX);
        s = Math.max(minS, Math.min(1, s));
        const ty = amp * Math.sin((cx / period) * Math.PI * 2);
        el.style.transform = `translateY(${ty.toFixed(1)}px) scale(${s.toFixed(3)})`;
      }
    };
    const measure = () => {
      if (!pinned()) {
        sec.style.height = "";
        track.style.transform = "";
        for (const el of Array.from(track.children)) (el as HTMLElement).style.transform = "";
        travel = 0;
        return;
      }
      vw = pin.clientWidth;
      const first = track.querySelector<HTMLElement>(".tcard");
      cardW = first ? first.offsetWidth : 320;
      const trackW = track.scrollWidth;
      startX = vw - cardW - 24;             // 첫 카드가 오른쪽 끝에서 시작
      const endX = vw - trackW - 24;        // 마지막 카드가 오른쪽 끝에 왔을 때(음수)
      travel = Math.max(0, startX - endX);  // = 트랙 전체 - 카드 한 장(모든 카드가 우→좌로 지나감)
      sec.style.height = `${window.innerHeight + travel}px`;
      onScroll();
    };

    measure();
    const reMeasure = setTimeout(measure, 500); // 포스터 이미지 로딩 후 폭 재측정
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      clearTimeout(reMeasure);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", measure);
    };
  }, [themes, soon]);

  return (
    <section className="tgal" id="themes" ref={secRef}>
      <div className="tgal-pin" ref={pinRef}>
        <div className="wrap">
          <div className="shead reveal">
            <h2 className="title">테마 · Themes</h2>
            <p className="lead">직영으로 만든 방탈출·머더룸 — 스크롤하면 옆으로 넘어갑니다.</p>
          </div>
        </div>
        <div className="tgal-viewport">
          <div className="tgal-track" ref={trackRef}>
            {themes.map((t, i) => (
              <ThemeCard key={t.id} t={t} no={i + 1} />
            ))}
            {soon.map((t, i) => (
              <SoonRailCard key={t.id} t={t} no={themes.length + i + 1} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}


// 준비중 테마 — 이제 아래 슬림 스트립이 아니라 캐러셀 안에 같이 들어간다(클릭 불가).
// 포스터 이미지가 아직 없어서(data.ts 의 poster:"") 자리표시 카드로 그린다.
function SoonRailCard({ t, no }: { t: Theme; no: number }) {
  return (
    <div className="tcard soon" data-cat={t.cat}>
      <div className="thumb" role="img" aria-label={`${t.name} — 준비중`}>
        <span className="tcase">TITLE {String(no).padStart(2, "0")}</span>
        <span className="tsoon">COMING SOON</span>
        <div className="tt">
          <span className="tstore">{t.storeTag}</span>
          <h3>{t.name}</h3>
          <span className="tmeta">{(t.soonGenres && t.soonGenres[0]) || t.genres[0]}</span>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  // 실제 승인 후기 (마운트 시 로드)
  const [reviews, setReviews] = useState<HomeReview[] | null>(null);
  useEffect(() => {
    fetch("/api/reviews").then((r) => r.json()).then((j) => setReviews(j.reviews || [])).catch(() => setReviews([]));
  }, []);
  const revAvg = reviews && reviews.length ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1) : null;
  const topReviews = (reviews || []).slice().sort((a, b) => b.rating - a.rating).slice(0, 3);

  // 스크롤 등장 애니메이션
  // 🔴 deps 에 reviews 가 반드시 있어야 한다.
  //    .js .reveal 은 기본이 opacity:0 이고, 화면에 들어올 때 .in 이 붙어야 보인다.
  //    전에는 deps 가 [] 라 **마운트 순간에 있던 요소만** 관찰했는데, 후기 인용 카드
  //    (.rev-quote.reveal)는 /api/reviews 응답이 온 뒤에 새로 생기는 노드라 관찰 대상에서
  //    빠졌다 → .in 이 영영 안 붙어 **투명한 채로 남는다**.
  //    지금은 승인 후기가 0건이라 안 보이지만, 사장님이 첫 후기를 승인하는 순간
  //    홈에 빈 카드 3장이 뜬다. (2026-07-17 2차 RPA 점검에서 발견 — 잠복 상태로 잡음)
  //    reviews 가 바뀌면 다시 훑어서 새로 생긴 카드도 관찰한다(이미 .in 인 건 건드릴 게 없음).
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
    document.querySelectorAll(".reveal:not(.in)").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [reviews]);

  // (2026-07-16) 옛 히어로 패럴랙스 코드 60줄 삭제 — heroBgRef 가 화면 어느 요소에도 안 붙어 있어
  // 첫 줄에서 항상 return 되던 죽은 코드였음(0% 동작). 지금 히어로가 움직이는 건 배경 그라디언트(htMesh 30s)와
  // 스크롤 이별 연출(globals.css .ht-stack) 이고, 둘 다 CSS 라 JS 가 필요 없음.

  return (
    <div className="home-dark">
      {/* HERO — 타이포(FANTASY + TRICK = FANTASTRICK) */}
      <section className="hero-t" id="home">
        {/* 배경 3겹 — 무대 조명 · 설계도 모눈 · 그레인 질감 (globals.css 설명 참고) */}
        <div className="ht-mesh" aria-hidden="true" />
        <div className="ht-grid" aria-hidden="true" />
        <div className="ht-web" aria-hidden="true"><HeroWeb /></div>
        <div className="ht-ghost" aria-hidden="true">FANTASTRICK</div>
        <div className="ht-noise" aria-hidden="true" />
        {/* 세로 구분선 — 마스코트 무대와 가운데 콘텐츠를 구분(데스크톱) */}
        <div className="ht-divider ht-div-l" aria-hidden="true" />
        <div className="ht-divider ht-div-r" aria-hidden="true" />
        {/* 마스코트 — 판타(파랑, 왼쪽)·트리키(빨강, 오른쪽) + 머리 위 말풍선 이름표.
            바깥(.ht-mascot)=스크롤 시 페이드아웃, 안쪽(.ht-mascot-in)=등장+플로팅 */}
        <div className="ht-mascot ht-m-fanta" aria-hidden="true">
          <div className="ht-mascot-in">
            <span className="ht-name ht-name-blue">판타</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/mascot-fanta.png" alt="" />
          </div>
        </div>
        <div className="ht-mascot ht-m-tricky" aria-hidden="true">
          <div className="ht-mascot-in">
            <span className="ht-name ht-name-red">트리키</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/mascot-tricky.png" alt="" />
          </div>
        </div>
        <div className="ht-stack">
          <div className="ht-eyebrow">PREMIUM ESCAPE ROOM</div>
          <div className="ht-slogan">
            <span>상상을</span>
            <span>기술로써</span>
            <span>현실에 구현한다.</span>
          </div>
          <h1 className="ht-wm">
            <span className="ht-w ht-fantasy">FANTAS<span className="ht-y">Y</span></span>
            <span className="ht-plus">+</span>
            <span className="ht-w ht-trick">TRICK</span>
            <span className="ht-shine" aria-hidden="true">FANTASTRICK</span>
          </h1>
          <div className="ht-rule" aria-hidden="true" />
          <div className="cta">
            <Link href="/reserve" className="btn primary">테마 예약하기 →</Link>
            <Link href="/business" className="btn gold-ghost">외주·컨설팅 문의</Link>
          </div>
        </div>
        <div className="scrollcue">SCROLL ↓</div>
      </section>

      {/* 테마 — cantor8식 위아래 엇갈림 가로스크롤 갤러리 */}
      <ThemeGallery themes={THEMES} soon={SOON_THEMES} />

      {/* REVIEWS — 별점 요약 + 대표 후기 발췌 */}
      <section className="block" id="reviews">
        <div className="wrap">
          <div className="shead reveal">
            <h2 className="title">후기 · Reviews</h2>
          </div>
          <div className="rev-summary reveal rv-left">
            <div className="rs-score">
              <span className="score">{revAvg ?? "—"}</span>
              <span className="of">/ 5.0</span>
              <div className="s-stars" aria-hidden="true">{Array.from({ length: 5 }, (_, i) => <IconStar key={i} />)}</div>
            </div>
            <div className="rs-meta">
              <div className="s-src">
                {/* 아직 불러오는 중일 때 "첫 후기를 기다리고 있어요"라고 하면 후기가 없다고 단정하는 셈이다.
                    바로 아래 목록은 "불러오는 중…"이라고 말하고 있어서 서로 모순이었다. */}
                {reviews === null
                  ? "후기를 불러오는 중…"
                  : revAvg
                    ? `플레이어 후기 · ${reviews.length}건`
                    : "첫 후기를 기다리고 있어요"}
              </div>
            </div>
          </div>
          {topReviews.length > 0 ? (
            <>
              <div className="rev-grid">
                {topReviews.map((r, i) => (
                  <div key={r.id} className="rev-quote reveal" style={{ "--i": i } as CSSProperties}>
                    <div className="rq-mark" aria-hidden="true">“</div>
                    <div className="rq-stars" aria-label={`별점 ${r.rating}점`}>{Array.from({ length: r.rating }, (_, i) => <IconStar key={i} />)}</div>
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
              <h2 className="title">제작 · Production</h2>
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
            <h2 className="title">오시는 길 · Location</h2>
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
    </div>
  );
}
