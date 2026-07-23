import Link from "next/link";
import Image from "next/image";
import { IconMask, IconStar, IconGear, IconPencil } from "@/components/Icon";
import RevealOnScroll from "@/components/RevealOnScroll";

// 회사 소개 페이지 — 서버 컴포넌트.
// 카피는 확정본을 그대로 사용(브랜드 스토리·철학·핵심 가치·직영 제작·매장·마스코트).
// 스크롤 등장 연출은 RevealOnScroll(클라이언트)이 .reveal 요소에 .in 을 붙여 처리한다.

// 핵심 가치 4개 — 제목 + 설명.
const VALUES = [
  { k: "몰입", d: "문을 여는 순간부터 나올 때까지, 현실을 잊게 합니다. 우리는 '방'이 아니라 '세계'를 만듭니다." },
  { k: "디테일", d: "디테일이 몰입을 만든다고 믿습니다. 세트·마감·장치 하나까지 직접 만들어, 진짜에 가장 가깝게." },
  { k: "직영 제작", d: "콘텐츠·공간·장치를 외주에 맡기지 않습니다. 한 팀이 처음부터 끝까지 책임지기에 완성도가 흔들리지 않습니다." },
  { k: "이야기", d: "좋은 트릭은 좋은 이야기 위에서 살아납니다. 퍼즐을 푸는 게 아니라, 이야기의 주인공이 되게 합니다." },
];

// 숫자로 보는 판타스트릭 — 검증된 것만(연도·연차는 넣지 않음).
const STATS = [
  { n: "3", l: "강남 직영 매장 (모두 도보권)" },
  { n: "6", l: "자체 제작 테마 (준비중 포함)" },
  { n: "3", l: "인하우스 제작 축 (콘텐츠·공간·장치)" },
  { n: "4.4★", l: "대표 테마 플레이어 평점", note: "잼핏 163건 기준" },
];

// 매장 3곳 — 연도 없이 사실만.
const STORES = [
  { tag: "1호점", addr: "강남대로79길 39, B1", themes: "「태초의 신부」" },
  { tag: "2호점", addr: "사평대로 353, B1", themes: "「사자의 서」" },
  { tag: "TGC", addr: "강남대로83길 34, B1", themes: "「락다운시티」·「시간의 영속성(머더룸)」" },
];

export default function AboutPage() {
  return (
    <>
      <RevealOnScroll />

      {/* HERO */}
      <section className="about-hero">
        <div className="ah-mesh" aria-hidden="true" />
        <div className="ah-grid" aria-hidden="true" />
        <div className="wrap ah-in">
          <div className="eyebrow">PREMIUM ESCAPE ROOM</div>
          <h1 className="ah-title">상상을 기술로써 현실에 구현한다.</h1>
          <p className="ah-sub">
            Fantasy와 Trick 사이. 판타스트릭은 이야기를 공간과 장치로 지어 올려,
            문을 여는 순간 당신을 다른 세계에 세웁니다.
          </p>
          <div className="ah-cta">
            <Link href="/reserve" className="btn primary">테마 예약하기 →</Link>
            <Link href="/business" className="btn gold-ghost">제작·컨설팅 문의</Link>
          </div>
        </div>
      </section>

      {/* 브랜드 스토리 */}
      <section className="block">
        <div className="wrap about-story">
          <div className="as-head reveal rv-left">
            <div className="eyebrow">BRAND STORY</div>
            <h2 className="title">판타스트릭이라는 이름</h2>
            <p className="as-formula">Fantasy(상상) + Trick(장치) = <b>FANTASTRICK</b></p>
          </div>
          <div className="as-body reveal rv-right">
            <p>아무리 근사한 상상도, 눈앞에 실제로 펼쳐지지 않으면 이야기로 끝납니다.</p>
            <p>
              판타스트릭은 그 사이를 잇는 브랜드입니다. 머릿속의 판타지를 정교한 트릭 — 공간, 장치, 연출 — 으로 구현해,
              손님이 &lsquo;보는 이야기&rsquo;가 아니라 &lsquo;직접 사는 이야기&rsquo;로 만듭니다.
            </p>
            <p className="as-punch">문을 열면, 상상은 더 이상 상상이 아닙니다.</p>
          </div>
        </div>
      </section>

      {/* 우리가 추구하는 것 — 철학 */}
      <section className="block alt">
        <div className="wrap about-philo reveal">
          <div className="eyebrow">PHILOSOPHY</div>
          <h2 className="title">진짜라고 느껴질 때까지</h2>
          <p className="ap-lead">
            우리의 기준은 단 하나입니다. &ldquo;이 공간이 진짜처럼 느껴지는가.&rdquo;
          </p>
          <p>
            벽 하나, 조명 하나, 손끝에 닿는 장치 하나까지 — 몰입을 깨는 요소는 남기지 않습니다.
          </p>
          <p>
            화려함이 아니라 완결된 세계를 짓는 것. 그래서 판타스트릭의 방은, 나온 뒤에도 오래 남습니다.
          </p>
        </div>
      </section>

      {/* 핵심 가치 — 4개 카드 */}
      <section className="block">
        <div className="wrap">
          <div className="shead reveal">
            <div className="eyebrow">CORE VALUES</div>
            <h2 className="title">우리가 지키는 네 가지</h2>
          </div>
          <div className="about-values">
            {VALUES.map((v, i) => (
              <div key={v.k} className="av reveal" style={{ "--i": i } as React.CSSProperties}>
                <span className="av-no">{String(i + 1).padStart(2, "0")}</span>
                <h3>{v.k}</h3>
                <p>{v.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 핵심 역량 — 직영 제작 3축 */}
      <section className="block alt">
        <div className="wrap">
          <div className="shead reveal">
            <div className="eyebrow gold">IN-HOUSE PRODUCTION</div>
            <h2 className="title">기획부터 장치까지, 한 팀에서</h2>
            <p className="lead">콘텐츠 · 공간 · 기술을 따로 외주 주지 않는 인하우스 제작.</p>
            <p className="lead" style={{ marginTop: 10 }}>
              대부분의 방탈출은 이야기·인테리어·장치를 각각 다른 업체에 맡깁니다.
              판타스트릭은 세 가지를 모두 직접 합니다. 그래서 이음새가 없고, 몰입이 끊기지 않습니다.
            </p>
          </div>
          <div className="cap3">
            <div className="cap reveal" style={{ "--i": 0 } as React.CSSProperties}>
              <div className="ci"><IconPencil /></div>
              <div className="en">Contents</div>
              <h3>콘텐츠</h3>
              <p>세계관·시나리오·퍼즐 설계, 연출·사운드 디렉팅</p>
            </div>
            <div className="cap reveal" style={{ "--i": 1 } as React.CSSProperties}>
              <div className="ci"><IconMask /></div>
              <div className="en">Space</div>
              <h3>공간</h3>
              <p>컨셉·세트 디자인, 인테리어 시공·마감, 동선·조명 설계</p>
            </div>
            <div className="cap reveal" style={{ "--i": 2 } as React.CSSProperties}>
              <div className="ci"><IconGear /></div>
              <div className="en">Tech · Device</div>
              <h3>기술·장치</h3>
              <p>RFID·전자석·기계식 잠금, 조명·음향·영상 제어, 센서 트리거, 통합 제어</p>
            </div>
          </div>
          <div className="about-more">
            <Link href="/business" className="tlink">제작·B2B 자세히 보기 →</Link>
          </div>
        </div>
      </section>

      {/* 숫자로 보는 판타스트릭 */}
      <section className="block">
        <div className="wrap">
          <div className="shead reveal">
            <div className="eyebrow">BY THE NUMBERS</div>
            <h2 className="title">숫자로 보는 판타스트릭</h2>
          </div>
          <div className="about-stats">
            {STATS.map((s, i) => (
              <div key={s.l} className="ast reveal" style={{ "--i": i } as React.CSSProperties}>
                <b>{s.n}</b>
                <span>{s.l}</span>
                {s.note && <em>{s.note}</em>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 매장 3곳 */}
      <section className="block alt">
        <div className="wrap">
          <div className="shead reveal">
            <div className="eyebrow">STORES</div>
            <h2 className="title">강남, 세 개의 세계</h2>
            <p className="lead">강남역·신논현역 사이 — 세 매장 모두 걸어서 오갈 수 있습니다.</p>
          </div>
          <div className="about-stores">
            {STORES.map((s, i) => (
              <div key={s.tag} className="ast-store reveal" style={{ "--i": i } as React.CSSProperties}>
                <span className="tag">{s.tag}</span>
                <div className="ast-addr">{s.addr}</div>
                <div className="ast-theme">{s.themes}</div>
              </div>
            ))}
          </div>
          <div className="about-more">
            <Link href="/#stores" className="tlink">오시는 길 →</Link>
          </div>
        </div>
      </section>

      {/* 마스코트 */}
      <section className="block">
        <div className="wrap">
          <div className="shead reveal" style={{ textAlign: "center" }}>
            <div className="eyebrow">MASCOTS</div>
            <h2 className="title">판타 &amp; 트리키</h2>
          </div>
          <div className="about-mascot reveal">
            <figure className="am-fig am-fanta">
              <Image src="/images/mascot-fanta.png" alt="판타 — 상상을 담은 흰 판다 마스코트" width={697} height={900} sizes="(max-width:600px) 42vw, 280px" />
              <figcaption>판타 · Fantasy</figcaption>
            </figure>
            <p className="am-text">
              상상을 담은 <b className="am-b-blue">판타</b>(흰 판다)와 장치를 다루는 <b className="am-b-red">트리키</b>(레서판다).
              두 마스코트는 판타스트릭의 두 얼굴 — Fantasy와 Trick을 그대로 닮았습니다.
            </p>
            <figure className="am-fig am-tricky">
              <Image src="/images/mascot-tricky.png" alt="트리키 — 장치를 다루는 빨간 레서판다 마스코트" width={657} height={877} sizes="(max-width:600px) 42vw, 280px" />
              <figcaption>트리키 · Trick</figcaption>
            </figure>
          </div>
        </div>
      </section>

      {/* 마무리 CTA */}
      <section className="block alt">
        <div className="wrap about-final reveal">
          <div className="af-star" aria-hidden="true"><IconStar /></div>
          <h2 className="title">문을 열 준비가 되셨나요?</h2>
          <p>
            상상을 현실로 만드는 가장 확실한 방법은, 직접 그 안에 들어가 보는 것입니다.
            강남에서, 판타스트릭이 지은 세계가 당신을 기다립니다.
          </p>
          <div className="af-cta">
            <Link href="/reserve" className="btn primary">테마 예약하기 →</Link>
            <Link href="/business" className="btn gold-ghost">제작·컨설팅 문의</Link>
          </div>
        </div>
      </section>
    </>
  );
}
