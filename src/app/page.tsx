"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { STORES, THEMES, SOON_THEMES, type Theme } from "@/lib/data";

const FILTERS = [
  { f: "all", label: "전체" },
  { f: "s1", label: "1호점" },
  { f: "s2", label: "2호점" },
  { f: "s3", label: "3호점 · TGC" },
  { f: "murder", label: "머더룸" },
];

function Locks({ n }: { n: number }) {
  return (
    <span className="diff">
      {[1, 2, 3, 4, 5].map((i) => (
        <i key={i} className={i <= n ? "lock on" : "lock"} />
      ))}
    </span>
  );
}

function ThemeCard({ t }: { t: Theme }) {
  if (t.soon) {
    return (
      <div className="tcard soon" data-cat={t.cat}>
        <div className="thumb ph">
          <span className="phtxt">COMING SOON</span>
          <div className="badge">
            {t.genres.map((g) => (
              <span key={g} className="genre">{g}</span>
            ))}
          </div>
          <div className="store-tag">{t.storeTag}</div>
          <div className="tt"><h3>{t.name}</h3></div>
        </div>
        <div className="meta">
          <span className="sp">새 테마 · 공개 예정</span>
          <span className="go">준비중</span>
        </div>
      </div>
    );
  }
  return (
    <Link className="tcard" data-cat={t.cat} href={`/reserve?theme=${t.id}`}>
      <div
        className="thumb"
        style={{ backgroundImage: `url(${t.poster})` }}
        role="img"
        aria-label={`${t.name} 포스터`}
      >
        <div className="badge">
          {t.murder && <span className="murder">머더룸</span>}
          {t.genres.map((g) => (
            <span key={g} className="genre">{g}</span>
          ))}
        </div>
        <div className="store-tag">{t.storeTag}</div>
        <div className="tt"><h3>{t.name}</h3></div>
      </div>
      <div className="meta">
        <span className="sp">
          <b>{t.minutes}분</b> · <Locks n={t.difficulty} />
        </span>
        <span className="go">예약 →</span>
      </div>
    </Link>
  );
}

export default function Home() {
  const [filter, setFilter] = useState("all");
  const trackRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const allThemes: Theme[] = [...THEMES, ...SOON_THEMES];

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

  // 캐러셀 하단 바 갱신 + 마우스 드래그
  useEffect(() => {
    const track = trackRef.current;
    const bar = barRef.current;
    const thumb = thumbRef.current;
    if (!track) return;

    const updBar = () => {
      if (!bar || !thumb) return;
      const max = track.scrollWidth - track.clientWidth;
      if (max <= 2) {
        bar.classList.add("hidden");
        return;
      }
      bar.classList.remove("hidden");
      const ratio = track.clientWidth / track.scrollWidth;
      thumb.style.width = ratio * 100 + "%";
      thumb.style.left = (track.scrollLeft / max) * (100 - ratio * 100) + "%";
    };

    let down = false, sx = 0, sl = 0, moved = false;
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      down = true; moved = false; sx = e.clientX; sl = track.scrollLeft;
      track.classList.add("dragging");
    };
    const onMove = (e: PointerEvent) => {
      if (!down) return;
      const dx = e.clientX - sx;
      if (Math.abs(dx) > 5) moved = true;
      track.scrollLeft = sl - dx;
    };
    const stop = () => { down = false; track.classList.remove("dragging"); };
    const onClickCapture = (e: Event) => { if (moved) e.preventDefault(); };

    track.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    track.addEventListener("click", onClickCapture, true);
    track.addEventListener("scroll", updBar, { passive: true });
    window.addEventListener("resize", updBar);
    updBar();

    return () => {
      track.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      track.removeEventListener("click", onClickCapture, true);
      track.removeEventListener("scroll", updBar);
      window.removeEventListener("resize", updBar);
    };
  }, [filter]);

  const visible = (t: Theme) => {
    if (filter === "all") return true;
    return (t.cat || "").split(" ").includes(filter);
  };

  return (
    <>
      {/* HERO */}
      <section className="hero" id="home">
        <div className="bg">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/permanence-1.jpg" alt="" />
        </div>
        <div className="wrap">
          <div className="eyebrow">강남 · 11년차 이머시브 방탈출 &amp; 머더룸</div>
          <h1>
            일상이 멈추고,
            <br />
            <span className="accent">이야기가 시작된다</span>
          </h1>
          <p className="sub">
            계단을 내려오는 순간, 당신은 사건의 한가운데에 섭니다.
            <br />
            판타스트릭은 직접 만든 공간·장치·이야기로 한 편의 사건을 선사합니다.
          </p>
          <div className="cta">
            <Link href="/reserve" className="btn primary">테마 예약하기 →</Link>
            <Link href="/business" className="btn gold-ghost">외주·컨설팅 문의</Link>
          </div>
          <div className="meta">
            <div><b>11년</b>이머시브 운영</div>
            <div><b>3곳</b>강남 직영 매장</div>
            <div><b>4종</b>대표 테마</div>
          </div>
        </div>
        <div className="scrollcue">SCROLL ↓</div>
      </section>

      {/* ABOUT */}
      <section className="block" id="about">
        <div className="wrap about-grid">
          <div className="reveal">
            <div className="eyebrow">ABOUT · 우리는 누구인가</div>
            <h2 className="title">
              환상(Fantasy)을 기술(Trick)로
              <br />현실에 옮깁니다
            </h2>
            <p className="lead">
              판타스트릭은 환상과 공감을 기술로 현실화하는 이머시브 콘텐츠 브랜드입니다. 게임 속으로
              들어가는 듯한 공간 연출과 높은 장치 밀도로, 플레이가 끝난 뒤에도 이야기가 한 겹 더 이어집니다.
            </p>
            <div className="pillars" style={{ marginTop: 24 }}>
              <div className="pillar"><div className="pn">◎</div><div><h4>몰입 연출</h4><p>계단을 내려오면 일상이 멈추는, 공간 전체가 무대인 이머시브 설계.</p></div></div>
              <div className="pillar"><div className="pn">⚙</div><div><h4>높은 장치 밀도</h4><p>직접 제작한 잠금·연출·센서 장치로 몰입을 만들어냅니다.</p></div></div>
              <div className="pillar"><div className="pn">✦</div><div><h4>히든페이지</h4><p>엔딩 후에도 이어지는 숨은 이야기 — 다시 찾고 싶은 이유.</p></div></div>
            </div>
            <div className="worldtags">
              <span>세계관 <b>Tricky Game Center</b></span>
              <span>캐릭터 <b>Fanta</b></span>
              <span>캐릭터 <b>Tricky</b></span>
              <span>머더룸 <b>당신이 직접 해결하는 사건</b></span>
            </div>
          </div>
          <div className="about-visual reveal">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/permanence-poster.jpg" alt="시간의 영속성 포스터" />
            <div className="stamp"><b>SINCE 2015</b><span>강남에서 11년, 이머시브 한길</span></div>
          </div>
        </div>
      </section>

      {/* THEMES */}
      <section className="block alt" id="themes">
        <div className="wrap">
          <div className="shead reveal">
            <div className="eyebrow">INTERACTIVE CONTENTS</div>
            <h2 className="title">인터랙티브 콘텐츠</h2>
            <p className="lead" style={{ color: "#d3d9ec", maxWidth: 760 }}>
              대부분의 콘텐츠는 당신을 객석에 둡니다. 하지만{" "}
              <b style={{ color: "#fff", fontWeight: 700 }}>인터랙티브 콘텐츠는, 당신을 무대 위에 세웁니다.</b>
              <br />
              정해진 결말을 지켜보는 대신 당신의 선택과 행동이 이야기를 직접 이끌어가고 결정합니다.
              <br />
              방탈출과 오프라인 머더미스터리, 이머시브 공연까지 — 형태는 달라도 본질은 하나입니다.
              <br />
              콘텐츠 안으로 걸어 들어가, 직접 이야기의 주인공이 되는 것.
            </p>
            <p className="lead" style={{ marginTop: 16, borderLeft: "2px solid var(--cyan)", paddingLeft: 16, color: "#eef1f8", maxWidth: 730 }}>
              판타스트릭은 그 순간을 스토리·공간·장치로 구현합니다.{" "}
              <b style={{ color: "#fff", fontWeight: 700 }}>판타스트릭이 준비한 콘텐츠의 문을 열어보세요.</b>
            </p>
          </div>
          <div className="filters reveal">
            {FILTERS.map((c) => (
              <button
                key={c.f}
                className={"chip" + (filter === c.f ? " on" : "")}
                onClick={() => {
                  setFilter(c.f);
                  if (trackRef.current) trackRef.current.scrollLeft = 0;
                }}
              >
                {c.label}
              </button>
            ))}
          </div>
          <div className="theme-carousel reveal">
            <div className="theme-track" ref={trackRef}>
              {allThemes.filter(visible).map((t) => (
                <ThemeCard key={t.id} t={t} />
              ))}
            </div>
            <div className="car-bar" ref={barRef}><div className="car-thumb" ref={thumbRef} /></div>
          </div>
        </div>
      </section>

      {/* STORES */}
      <section className="block" id="stores">
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
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="store-map-img" src="/images/stores-map.png" alt="판타스트릭 매장 위치 지도 — TGC·1호점·2호점" />
            </a>
          </div>
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
            <div className="cap reveal"><div className="ci">✎</div><div className="en">Contents</div><h4>콘텐츠 제작</h4><p>테마·시나리오·연출 기획부터 운영 설계까지. 방탈출·머더미스터리·브랜드 체험 콘텐츠 턴키 제작.</p></div>
            <div className="cap reveal"><div className="ci">▦</div><div className="en">Space</div><h4>공간 디자인</h4><p>세트·인테리어·동선 설계. 이야기에 맞춘 몰입형 공간을 직접 시공·연출합니다.</p></div>
            <div className="cap reveal"><div className="ci">⚙</div><div className="en">Tech / Device</div><h4>기술 · 장치</h4><p>잠금/해제 장치, 조명·음향·기믹 제어, 센서 트리거 등 이머시브 장치를 제작·납품·판매합니다.</p></div>
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

      {/* RESERVE BAND */}
      <section className="reserve" id="reserve">
        <div className="bg">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/permanence-2.jpg" alt="" />
        </div>
        <div className="wrap">
          <div className="eyebrow">RESERVATION</div>
          <h2>오늘 하루를, 잠시 두고 오세요</h2>
          <p>원하는 매장과 테마를 골라 시간을 예약하세요. 강남역·신논현역 도보권.</p>
          <Link href="/reserve" className="btn primary" style={{ fontSize: 16, padding: "16px 30px" }}>
            테마 예약하러 가기 →
          </Link>
        </div>
      </section>

      <Link href="/reserve" className="btn primary float">예약하기</Link>
    </>
  );
}
