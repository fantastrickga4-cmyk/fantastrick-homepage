"use client";
import Link from "next/link";
import Image from "next/image";
import { Fragment, useEffect, useRef, useState } from "react";
import { THEMES } from "@/lib/data";
import "./business.css";

/* 비즈니스(B2B) — 방탈출 매장 사장님·창업 준비자용.
   파는 것: ①통째로 만들기(턴키) ②제어기·장치(마스터·슬레이브) ③매장 운영 프로그램.
   브랜드·기관 협업은 보는 사람이 아예 다르므로 /business/collab 로 나눠 뒀다(2026-08-06).

   ⚠️ 카피 규칙 (에이전트 2종 조사 + 사장님 확인으로 굳힌 것 — 고칠 때 지킬 것)
     · 이모지 금지. 문장 속 대시(—) 금지. "A가 아니라 B입니다" 반복 금지.
     · 업계어: 장비(X) → 장치 / 블록(X) → 제어기·모듈 / 리셋(X) → 세팅.
     · 고장은 "작동을 안 한다"로 쓴다(죽었다·먹통 같은 은어는 사장님이 안 쓰신다).
     · 타임은 "찬다". 방마다 장치 수가 다르므로 "보통 몇 개" 같은 기준선 문장은 쓰지 않는다.
     · 금액은 쓰지 않는다(사장님 지시 2026-08-06). 값은 보러 가서 말한다.
     · 근거 못 대는 우량 표시("많이 선택", "업계 1위") 금지. */

const won = (n: number) => n.toLocaleString("ko-KR");
const onlyNum = (s: string) => Number(String(s).replace(/[^0-9]/g, "")) || 0;

const SCOPES = [
  { id: "turnkey", label: "통째로 만들기", sub: "기획부터 시공까지" },
  { id: "device", label: "제어기 · 장치", sub: "방에 들어가는 것" },
  { id: "software", label: "매장 운영 프로그램", sub: "사무실에서 쓰는 것" },
];

const KINDS = ["통째로 시공", "제어기 도입", "운영 프로그램", "그 밖에"];

/* 근무표 도해용 데이터.
   ⚠️ 실제 근무표가 아니다. 사람 이름·매장명·금액을 넣지 않는다 — 진짜 화면 캡처로 오인되면 안 된다. */
const SW_DAYS = ["월", "화", "수", "목", "금", "토", "일"];
const SW_BOARD = [
  { who: "GM 1", d: ["12-20", "12-20", "", "12-20", "12-20", "16-22", ""] },
  { who: "GM 2", d: ["", "16-22", "12-20", "16-22", "", "12-20", "12-20"] },
  { who: "GM 3", d: ["16-22", "", "16-22", "", "16-22", "대타", "16-22"] },
];

/* 지금 보는 범위 끝에서 나머지 둘로 넘어가는 줄.
   탭으로 나누면 "고른 것만 보고 나머지는 있는 줄도 모른다"가 늘 따라온다(NN/g).
   맨 아래에 다음 칸을 깔아두면 위로 되돌아가 탭을 누르지 않아도 이어서 보게 된다. */
function NextUp({ here, pick }: { here: string; pick: (id: string) => void }) {
  const rest = SCOPES.filter((s) => s.id !== here);
  return (
    <div className="nextup reveal">
      <span className="nu-lab">이어서 보기</span>
      <div className="nu-btns">
        {rest.map((s) => (
          <button key={s.id} type="button" onClick={() => pick(s.id)}>
            <b>{s.label}</b><span>{s.sub}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function BusinessPage() {
  // 손실 계산기 — 사장님이 자기 매장 숫자를 넣어보는 곳. 우리가 금액을 단정하지 않는다.
  const [fee, setFee] = useState(60000);
  const [slots, setSlots] = useState(12);
  // 확장 도해 — 모듈을 붙였다 뗐다 하며 "장치를 몇 개까지 물리나"를 손으로 확인하게 한다.
  const [mods, setMods] = useState(2);
  /* 지금 펼쳐 놓은 범위. 누르면 그 자리로 이동하는 게 아니라 **내용만 바뀐다**(사장님 지시 2026-08-06).
     한 페이지에 셋을 다 이어 붙였더니 12,000px 이 넘어서, 긴 것 자체가 문제였다.

     ⚠️ 대신 "안 고른 것은 영영 안 본다"는 탭의 고질병을 두 가지로 막는다(NN/g 지적).
        ① 각 범위 맨 아래에 나머지 둘로 넘어가는 [이어서 보기] 줄
        ② 비교표·사후관리·경쟁사 우려·자주 묻는 것·문의는 **범위와 상관없이 늘 아래에 있다**
        (셋 다 상품과 무관하게 궁금한 것들이라 어느 범위를 보든 눈에 들어와야 한다) */
  const [here, setHere] = useState("turnkey");
  // 문의
  const [form, setForm] = useState({ storeName: "", phone: "", rooms: "", area: "" });
  const [kind, setKind] = useState(KINDS[0]);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [formErr, setFormErr] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const switching = useRef(false);

  /* 스크롤 등장.
     ⚠️ here 를 의존성에 반드시 넣을 것 — 범위를 바꾸면 화면에 새 요소가 붙는데,
        처음 한 번만 관찰하면 그 요소들은 opacity:0 인 채로 영영 안 보인다. */
  useEffect(() => {
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }),
      { threshold: 0.14 }
    );
    document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [here]);

  // 주소에 #device·#software 가 붙어 오면 그 범위로 연다 (다른 곳에서 링크 걸 수 있게)
  useEffect(() => {
    const h = window.location.hash.replace("#", "");
    if (SCOPES.some((s) => s.id === h)) setHere(h);
  }, []);

  const lost = fee * slots;
  const devices = 32 + mods * 32;

  /* 범위 바꾸기 — 내용을 갈아끼우고 **그 범위의 맨 처음으로 올려보낸다.**
     아래쪽 내용을 보다가 탭을 눌렀는데 그 자리에 그대로 있으면, 화면만 바뀌고
     지금 어디를 보는 건지 알 수 없다.

     ⚠️ 기준을 선택 줄(.scope)로 잡으면 안 된다 — sticky 라 스크롤을 내리면 화면 위에 붙어 있어서
        `rect.top + scrollY` 가 항상 "지금 스크롤 위치"로 나온다(= 이동이 0px). 실제로 그래서 안 움직였다.
        그래서 **바뀐 범위의 첫 섹션**을 기준으로 잡고, 고정 헤더(67) + 선택 줄 높이만큼 뺀다. */
  function pick(id: string) {
    /* 연타 잠금. 세 화면이 카본 검정 ↔ 크림 ↔ 흰색이라 빠르게 눌러대면 화면 전체 밝기가
       초당 몇 번씩 뒤집힌다. 빛에 예민한 분에게 위험한 깜빡임이라 잠깐 막는다. */
    if (id === here || switching.current) return;
    switching.current = true;
    window.setTimeout(() => { switching.current = false; }, 260);

    setHere(id);
    history.replaceState(null, "", id === "turnkey" ? " " : `#${id}`);
    // 새 내용이 화면에 붙은 다음에 재야 위치가 맞는다
    requestAnimationFrame(() => {
      const sec = document.getElementById(id);
      if (!sec) return;
      /* 고르는 자리가 sticky 일 때만 그 높이를 뺀다. 지금은 sticky 가 아니라서
         빼면 그 장(章) 높이만큼 위로 튄다. 나중에 다시 sticky 로 바꿔도 알아서 맞는다. */
      const bar = document.getElementById("scopebar");
      const barH = bar && getComputedStyle(bar).position === "sticky" ? bar.getBoundingClientRect().height : 0;
      const y = sec.getBoundingClientRect().top + window.scrollY - 68 - barH;
      /* ⚠️ scrollTo 의 behavior:"smooth" 는 CSS 로 안 꺼진다(명시 옵션이 CSS 를 이긴다).
         모션을 줄이겠다고 설정한 손님에게는 여기서 직접 꺼야 한다. */
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({ top: Math.max(0, y), behavior: reduce ? "auto" : "smooth" });
    });
  }

  async function sendInquiry(e: React.FormEvent) {
    e.preventDefault();
    if (sending) return;
    setFormErr("");
    if (!form.storeName.trim()) { setFormErr("매장명을 입력해 주세요."); return; }
    if (form.phone.replace(/[^0-9]/g, "").length < 9) { setFormErr("연락처를 확인해 주세요."); return; }
    setSending(true);
    try {
      const res = await fetch("/api/business/inquiry", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, kind }),
      });
      if (res.ok) setSent(true);
      else {
        const j = await res.json().catch(() => ({}));
        setFormErr(j.error || "보내지 못했습니다. 잠시 후 다시 시도해 주세요.");
      }
    } catch {
      setFormErr("보내지 못했습니다. 인터넷 연결을 확인해 주세요.");
    }
    setSending(false);
  }

  return (
    <div className="bizsys" ref={wrapRef}>
      {/* HERO */}
      <section className="bz-hero">
        <div className="scan" />
        <div className="wrap">
          {/* 🔴 히어로는 중립이어야 한다.
              전에는 "방을 통째로 만듭니다"였는데, 그건 ①턴키만의 문장이라 페이지 전체가
              "턴키 시공사 소개"로 규정됐다. 그러면 아래 선택은 셋 중 고르는 자리가 아니라
              "턴키를 보는 방법 세 가지"로 읽힌다. 그 문장은 턴키 표제로 옮겼다. */}
          <div className="kicker">방탈출 제작 · 제어기 · 매장 운영</div>
          <h1>방을 만드는 일부터<br />방을 돌리는 일까지.</h1>
          <p className="sub">
            방탈출을 통째로 짓는 일, 방 안 장치를 돌리는 제어기, 매장을 굴리는 프로그램.
            강남에서 3곳, 11년째 직접 운영하면서 하나씩 만든 것들입니다.
          </p>
          <div className="bz-cta">
            <a className="btn primary" href="#cta">한번 보러 오세요</a>
            <a className="btn ghost" href="#turnkey">무엇을 하는지 보기</a>
          </div>
          <div className="strip">
            <div><b>11년째</b><span>직접 운영 중</span></div>
            <div><b>강남 3곳</b><span>직영</span></div>
            <div><b>한 팀</b><span>기획 · 시공 · 장치</span></div>
          </div>
        </div>
      </section>

      {/* 고민 질문 — 범위와 상관없이 항상. 금액이나 스펙을 먼저 들이대면 방어가 걸린다 */}
      <div className="wrap">
        <section className="bz-sec">
          <div className="kicker reveal">이런 걸 물어보십니다</div>
          <h2 className="reveal">혹시 이런 적 있으십니까.</h2>
          <div className="asks">
            <div className="ask reveal">방 하나 새로 여는데 어디부터 맡겨야 할지 모르겠다</div>
            <div className="ask reveal">장치가 작동을 안 하는데 어디로 전화해야 할지 헷갈린다</div>
            <div className="ask reveal">방 늘릴 때마다 제어기부터 다시 사야 한다고 들었다</div>
            <div className="ask reveal">예약이랑 근무표를 아직 엑셀이랑 단톡으로 하고 있다</div>
          </div>
        </section>
      </div>

      {/* ══════════ 고르는 장(章) ══════════
          🔴 두 번 "강조가 안 된다"는 지적을 받은 자리다. 원인은 크기가 아니라 **격(格)** 이었다.
             얇은 sticky 띠는 화면 언어상 "도구 막대(필터·정렬)"라, 아무리 색을 칠해도
             상품을 고르는 자리로 안 읽힌다. 그래서 띠를 버리고 한 장을 통째로 줬다.
               · 물음을 15px 라벨에서 **h2(최대 46px)** 로 올렸다. 이 페이지에서 제일 중요한
                 갈림길이 소제목보다 작은 글자였던 게 진짜 문제였다.
               · 안 고른 카드도 보이게 했다. 전에는 테두리 알파 .16 이라 유령이었고,
                 대조군이 없으면 "고른 상태"도 안 읽힌다.
               · 폰에서 세로로 쌓는다. 가로로 두면 132px×3+간격 = 412px 이 필요한데
                 375px 폰의 가용 폭은 331px 이라 **03이 화면 밖으로 잘려 있었다.** */}
      <div className={`scopepick on-${here}`} id="scopebar">
        <div className="wrap">
          <div className="sp-head">
            <div className="kicker">어디까지</div>
            <h2 id="scope-q">맡기시겠습니까</h2>
          </div>
          <div className="sp-cards" aria-labelledby="scope-q">
            {SCOPES.map((s, i) => (
              <button
                key={s.id} type="button" aria-pressed={here === s.id}
                className={`sp-${s.id}${here === s.id ? " on" : ""}`} onClick={() => pick(s.id)}
              >
                <i>{String(i + 1).padStart(2, "0")}</i>
                <b>{s.label}</b><span>{s.sub}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ══════════ ① 통째로 만들기 ══════════
          패널마다 배경·글씨체·색을 통째로 바꾼다(사장님 선택 2026-08-06: T2 종이 도면).
          ⚠️ 껍데기가 .wrap **바깥**에 있어야 배경이 화면 끝까지 칠해진다.
             안에 두면 밝은 배경이 가운데 카드처럼 떠 보인다. */}
      {here === "turnkey" && <div className="pn-turnkey">
        {/* 바뀌었다는 신호. key 를 주면 범위를 바꿀 때마다 새로 마운트되어 한 번만 지나간다 */}
        <span className="pn-sweep" key={here} aria-hidden="true" />
        <div className="wrap">
        {/* 범위 표제 — 여기서부터 이 화면이 시작한다는 선언. 히어로에 있던 문장을 이리로 옮겼다. */}
        <header className="pn-head">
          <i>01</i>
          <h2>방을 통째로 만듭니다.</h2>
          <p>기획부터 시공까지</p>
        </header>
        <section className="bz-sec" id="turnkey">
          <h2 className="reveal">이야기부터 배선까지<br />한 팀이 합니다.</h2>
          {/* 도면 모티프 — 장식이다. 읽을 정보가 아니라 "이 회사는 도면을 그린다"는 신호.
              스크린리더에서는 완전히 뺀다(정보가 아니라 신호라 읽으면 소음이 된다). */}
          <svg className="pn-plan" viewBox="0 0 320 240" aria-hidden="true" focusable="false">
            <g className="pl-thin">
              <path d="M24 22 H296" /><path d="M24 16 V28 M296 16 V28" />
              <path d="M24 28 V44 M296 28 V44" />
            </g>
            <g className="pl-wall">
              <path d="M24 44 H296 V214 H24 Z" />
              <path d="M172 44 V138 M172 176 V214" />
            </g>
            <g className="pl-thin">
              <path d="M172 138 V176" />
              <path className="pl-arc" d="M172 176 A38 38 0 0 0 210 138" />
              <path className="pl-wire" d="M56 190 H120 V96 H150" />
              <path className="pl-wire" d="M204 190 H262 V96 H236" />
            </g>
            <g className="pl-dev">
              <rect x="46" y="182" width="12" height="12" rx="2" />
              <rect x="144" y="90" width="12" height="12" rx="2" />
              <rect x="230" y="90" width="12" height="12" rx="2" />
              <rect x="256" y="182" width="12" height="12" rx="2" />
            </g>
          </svg>
          <p className="lead reveal">
            대부분은 이야기, 인테리어, 장치를 각각 다른 데 맡깁니다. 저희는 세 가지를 다 합니다.
            방탈출을 11년 하면서 필요해서 하나씩 갖춘 것들입니다.
          </p>

          <div className="trio">
            <div className="tri reveal">
              <div className="en">Contents</div>
              <h3>이야기 · 문제</h3>
              <p>세계관을 짜고 방 안에서 손님이 무엇을 하게 할지 설계합니다.</p>
              <ul>
                <li>시나리오 · 세계관</li>
                <li>문제 · 장치 게임 설계</li>
                <li>연출 · 사운드 디렉팅</li>
                <li>운영 매뉴얼 · GM 교육</li>
              </ul>
            </div>
            <div className="tri reveal">
              <div className="en">Space</div>
              <h3>공간 · 인테리어</h3>
              <p>도면을 그리고 벽을 세우고 마감까지 합니다.</p>
              <ul>
                <li>평면 · 동선 설계</li>
                <li>세트 제작 · 인테리어 시공</li>
                <li>조명 · 음향 설치</li>
                <li>전기 배선</li>
              </ul>
            </div>
            <div className="tri reveal">
              <div className="en">Device</div>
              <h3>장치 · 제어</h3>
              <p>장치를 만들어 붙이고, 그걸 돌리는 제어기까지 저희가 만듭니다.</p>
              <ul>
                <li>잠금 장치(전자석 · 기계식)</li>
                <li>센서 · 트리거</li>
                <li>연출 제어(조명 · 음향 · 영상)</li>
                <li>마스터 · 슬레이브 제어기</li>
              </ul>
            </div>
          </div>

          {/* 전화할 곳이 몇 군데냐 — 비교표 한 줄로 묻기엔 아까운 차별점이라 도해로 올렸다 */}
          <div className="who2 reveal" style={{ marginTop: 22 }}>
            <div className="them">
              <h4>보통은</h4>
              <div className="cnt">전화할 곳 다섯 군데</div>
              <ul>
                <li>시나리오 작가</li><li>인테리어</li><li>전기</li><li>장치 제작</li><li>시공</li>
              </ul>
            </div>
            <div className="us">
              <h4>저희는</h4>
              <div className="cnt">전화할 곳 한 군데</div>
              <ul>
                <li>기획</li><li>인테리어</li><li>전기</li><li>장치</li><li>시공</li>
              </ul>
            </div>
          </div>

          {/* 공정 5단계 */}
          <h3 className="reveal pn-h3">진행은 이렇게 합니다</h3>
          <div className="rail reveal" style={{ marginTop: 18 }}>
            <div><b>보러 감</b><span>현장 보고 방 개수·장치 세기</span><i>자체 인력</i></div>
            <div><b>기획 · 시나리오</b><span>이야기와 문제 설계</span><i>자체 인력</i></div>
            <div><b>설계 · 인테리어</b><span>도면, 세트, 마감</span><i>자체 인력</i></div>
            <div><b>전기 · 장치</b><span>배선, 장치 제작, 제어기</span><i>자체 인력</i></div>
            <div><b>시공 · 오픈</b><span>현장 셋업, GM 교육</span><i>자체 인력</i></div>
          </div>

          {/* 우리가 만든 방들 */}
          <h3 className="reveal pn-h3">저희가 만들어 저희가 돌리고 있는 방들</h3>
          <p className="lead reveal" style={{ margin: "10px 0 18px" }}>
            남의 매장에 넣어드리기 전에 저희 매장에서 먼저 씁니다. 아래 넷 다 저희 손으로 만들어 지금도 손님을 받고 있습니다.
          </p>
          <div className="works">
            {THEMES.map((t) => (
              <div className="work reveal" key={t.id}>
                {/* 대장 행이라 썸네일은 56px. 포스터는 증거일 뿐 주인공이 아니다 —
                    손님용 자산이라 B2B 화면에서 키우면 톤이 무너진다. */}
                <div className="th">
                  <Image src={t.poster} alt={t.name} width={56} height={75} sizes="56px" />
                </div>
                <div>
                  <h4>{t.name}</h4>
                  <div className="kv">{t.storeTag} · {t.genres.join(" · ")} · {t.minutes}분</div>
                  <div className="tags">
                    <span>기획</span><span>공간</span><span>배선</span><span>장치</span><span>제어</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="note reveal">값은 방 크기랑 하시려는 연출에 따라 달라서 보고 나서 말씀드립니다.</p>
        </section>
        <NextUp here={here} pick={pick} />
      </div></div>}

      {/* ══════════ ② 제어기 · 장치 ══════════ (D6 카본 · 시안) */}
      {here === "device" && <div className="pn-device">
        <span className="pn-sweep" key={here} aria-hidden="true" />
        <div className="wrap">
        <header className="pn-head">
          <i>02</i>
          <h2>마스터 · 슬레이브 제어기</h2>
          <p>방에 들어가는 것</p>
        </header>
        <section className="bz-sec" id="device">
          <div className="kicker reveal">장치값보다 큰 돈</div>
          <h2 className="reveal">장치 하나가 작동을 안 하면<br />그 방은 그날 못 씁니다.</h2>
          <p className="lead reveal">
            2시 타임 한 번 비면 그날 매출에서 그냥 빠져요. 내일 두 팀 받는다고 메워지는 것도 아니고요.
            주말에 타임이 다 차는 방일수록 손해가 큽니다.
          </p>

          <figure className="reveal">
            <p className="ftitle">우리 매장으로 계산해보기</p>
            <div className="calcrow">
              <span>타임 요금</span>
              <input
                inputMode="numeric" aria-label="타임 요금"
                value={fee ? won(fee) : ""}
                onChange={(e) => setFee(onlyNum(e.target.value))}
              />
              <span>원</span>
              <span style={{ marginLeft: 6 }}>하루</span>
              <input
                inputMode="numeric" aria-label="하루 타임 수"
                value={slots ? String(slots) : ""}
                onChange={(e) => setSlots(Math.min(24, onlyNum(e.target.value)))}
              />
              <span>타임</span>
            </div>
            <div className="daylab">평소 하루</div>
            <div className="slots">
              {Array.from({ length: slots }, (_, i) => <div className="slot" key={i} />)}
            </div>
            <div className="daylab bad" style={{ marginTop: 16 }}>장치가 작동을 안 한 날</div>
            <div className="slots">
              {Array.from({ length: slots }, (_, i) => <div className="slot dead" key={i} />)}
            </div>
            <div className="lossline">
              <span className="losslab">빠지는 금액</span>
              <span className="bignum">{won(lost)}원</span>
            </div>
            <figcaption>칸 하나가 타임 하나입니다. 빈 칸은 그날 못 받은 타임이고요.</figcaption>
          </figure>
        </section>

        {/* 새 제어기 — 이 패널의 주인공. .pn-stage 는 여기 하나에만 붙인다(릴리즈 태그·조명) */}
        <section className="bz-sec pn-stage">
          <div className="kicker reveal">새로 만든 것</div>
          <h2 className="reveal">마스터 · 슬레이브 제어기</h2>
          <p className="lead reveal">
            마스터 한 대가 장치 32개를 맡습니다. 모자라면 슬레이브 모듈을 답니다.
            저희가 만들어 저희 매장에 넣고 쓰는 물건입니다.
          </p>

          <div className="pcbstage reveal">
            <span className="newbadge">NEW</span>
            <svg className="pcb" viewBox="0 0 660 300" role="img"
              aria-label="마스터 제어기 한 대에 슬레이브 모듈이 이어진 구조 도해. 마스터가 장치 32개를 맡고 모듈을 달 때마다 32개씩 늘어납니다.">
              <defs>
                <pattern id="pcbgrid" width="14" height="14" patternUnits="userSpaceOnUse">
                  <path d="M14 0H0V14" fill="none" stroke="#8fb6ff" strokeOpacity=".08" strokeWidth="1" />
                </pattern>
                <linearGradient id="busfade" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0" stopColor="#6ea8ff" stopOpacity=".95" />
                  <stop offset="1" stopColor="#6ea8ff" stopOpacity=".25" />
                </linearGradient>
                {/* 치수선 화살촉 — auto-start-reverse 로 양끝에 같은 marker 를 쓴다 */}
                <marker id="pnArw" markerWidth="7" markerHeight="7" refX="6.5" refY="3.5"
                  orient="auto-start-reverse" markerUnits="userSpaceOnUse">
                  <path d="M0 0 L7 3.5 L0 7 Z" fill="#8fb6ff" fillOpacity=".72" />
                </marker>
              </defs>

              {/* 도면 눈금자 — 보드가 '측정된 물건'으로 읽히게 한다. 장식이 아니라 척도. */}
              <g className="pn-rule" aria-hidden="true">
                <line x1="16" y1="30" x2="266" y2="30" />
                {Array.from({ length: 19 }, (_, i) => (
                  <line key={`rt${i}`} x1={16 + i * 14} y1="30" x2={16 + i * 14} y2={i % 5 === 0 ? 21 : 25} />
                ))}
                <line x1="8" y1="40" x2="8" y2="240" />
                {Array.from({ length: 15 }, (_, i) => (
                  <line key={`rl${i}`} x1="8" y1={40 + i * 14} x2={i % 5 === 0 ? 0 : 4} y2={40 + i * 14} />
                ))}
              </g>

              {/* 마스터 */}
              <rect className="pn-master" x="16" y="40" width="250" height="200" rx="12"
                fill="url(#pcbgrid)" stroke="#6ea8ff" strokeOpacity=".72" strokeWidth="1.5" />
              {/* 마운팅 홀 — 클래스로 색을 잡아둔다(패널 스킨이 바뀌면 CSS 한 줄로 따라간다) */}
              <circle className="hole" cx="34" cy="58" r="4" fill="none" stroke="#8fb6ff" strokeOpacity=".5" />
              <circle className="hole" cx="248" cy="58" r="4" fill="none" stroke="#8fb6ff" strokeOpacity=".5" />
              <circle className="hole" cx="34" cy="222" r="4" fill="none" stroke="#8fb6ff" strokeOpacity=".5" />
              <circle className="hole" cx="248" cy="222" r="4" fill="none" stroke="#8fb6ff" strokeOpacity=".5" />
              <text className="silk-brand" x="52" y="78">FANTASTRICK</text>
              <text className="silk-model" x="52" y="103">마스터</text>
              <text className="silk-role" x="52" y="122">MASTER</text>
              <rect className="mcu" x="52" y="140" width="58" height="58" rx="4"
                fill="#8fb6ff" fillOpacity=".14" stroke="#8fb6ff" strokeOpacity=".7" />
              <text className="silk-tiny" x="81" y="173" textAnchor="middle">MCU</text>
              {/* 치수선 — 32칸의 폭을 실제로 잰다. 여기 쓰는 숫자는 사양표에 있는 32 뿐이다.
                  없는 치수(mm)를 지어내면 스펙 화면에서 그건 거짓말이 된다. */}
              <g className="pn-dim">
                <line x1="130" y1="140" x2="130" y2="123" />
                <line x1="252" y1="140" x2="252" y2="123" />
                <line x1="130" y1="128" x2="252" y2="128" markerStart="url(#pnArw)" markerEnd="url(#pnArw)" />
              </g>
              <text className="pn-dimtxt" x="191" y="118" textAnchor="middle">32</text>
              {/* 행 좌표 — 8열 × 4행 = 32. "32개"가 세어지는 숫자가 된다. */}
              <g className="pn-coord" aria-hidden="true">
                {["A", "B", "C", "D"].map((c, i) => (
                  <text key={c} x="124" y={151 + i * 16} textAnchor="end">{c}</text>
                ))}
              </g>
              {/* 출력 32칸 — 따로 묶어둔다. 마스터·슬레이브 판(fill=격자무늬)과 색 규칙이 달라서다. */}
              <g className="ports">
                {Array.from({ length: 32 }, (_, i) => (
                  <rect key={i} x={130 + (i % 8) * 16} y={142 + Math.floor(i / 8) * 16}
                    width="10" height="10" rx="2"
                    fill="#6ea8ff" fillOpacity=".22" stroke="#6ea8ff" strokeOpacity=".7" />
                ))}
              </g>
              <text className="silk-tiny" x="130" y="224">장치 32개</text>
              {/* 상태 표시 — 이 제품이 '스스로 보고 있다'는 유일한 시각 신호. 딱 하나만 둔다. */}
              <circle className="pn-led-ring" cx="232" cy="100" r="5" />
              <circle className="pn-led" cx="232" cy="100" r="5" />

              {/* 확장 버스 + 슬레이브 */}
              <path d="M266 140 H660" stroke="url(#busfade)" strokeWidth="2" fill="none" />
              <path className="pulse" d="M266 140 H660" strokeWidth="2.6" fill="none" />
              {[0, 1, 2].map((i) => (
                <g className="pn-slave" key={i} opacity={1 - i * 0.26}>
                  <rect x={300 + i * 118} y="96" width="98" height="88" rx="9"
                    fill="url(#pcbgrid)" stroke="#6ea8ff" strokeOpacity=".65" strokeWidth="1.2"
                    strokeDasharray={i === 2 ? "5 5" : "0"} />
                  <text className="silk-model sm" x={349 + i * 118} y="132" textAnchor="middle">슬레이브</text>
                  <text className="silk-tiny" x={349 + i * 118} y="152" textAnchor="middle">+32개</text>
                </g>
              ))}
            </svg>
          </div>

          <div className="spec reveal">
            <div><dt>마스터 한 대</dt><span className="dots" /><dd>장치 32개</dd></div>
            <div><dt>모듈 하나 달 때마다</dt><span className="dots" /><dd>32개씩</dd></div>
            <div><dt>한 대로 늘릴 수 있는 데까지</dt><span className="dots" /><dd>128개</dd></div>
            <div><dt>상태 감시</dt><span className="dots" /><dd>장치마다 응답 확인</dd></div>
            <div><dt>부품</dt><span className="dots" /><dd>시중에서 구할 수 있는 것</dd></div>
            <div><dt>보증</dt><span className="dots" /><dd>보드 · 모듈 1년, 부품 6개월</dd></div>
          </div>

          <figure className="reveal" style={{ marginTop: 26 }}>
            <p className="ftitle">모자라면 모듈을 답니다</p>
            <div className="blocks">
              <div className="blk main"><b>마스터</b><span>장치 32개</span></div>
              {Array.from({ length: mods }, (_, i) => (
                <span key={i} className="blkpair">
                  <span className="plus">+</span>
                  <span className="blk"><b>슬레이브</b><span>+32개</span></span>
                </span>
              ))}
              <span className="blkpair">
                <span className="plus">+</span>
                <span className="blk ghost"><b>…</b><span>계속</span></span>
              </span>
            </div>
            <div className="steprow">
              <div className="stepper">
                <button type="button" onClick={() => setMods((m) => Math.max(0, m - 1))} aria-label="모듈 빼기">&#8722;</button>
                <span className="v">모듈 <b>{mods}</b>개</span>
                <button type="button" onClick={() => setMods((m) => Math.min(6, m + 1))} aria-label="모듈 추가">+</button>
              </div>
              <div>
                <span className="bignum sm">{devices}</span>
                <span className="devsuf">개까지 물립니다</span>
              </div>
            </div>
            <figcaption>모듈 하나 달면 32개씩 늘어납니다. 마스터는 처음 한 번만 사시면 되고요.</figcaption>
          </figure>

          {/* 방 늘릴 때 드는 돈 — 금액을 쓰지 않는다. 기울기 차이로만 읽게 한다. */}
          <figure className="reveal" style={{ marginTop: 14 }}>
            <p className="ftitle">방을 늘려갈 때</p>
            <div className="step-chart">
              <svg viewBox="0 0 620 200" role="img"
                aria-label="방을 늘릴 때 드는 돈 비교. 제어기를 다시 사는 구조는 늘릴 때마다 처음 금액이 다시 들어 가파르게 올라가고, 모듈만 더하는 구조는 완만하게 올라갑니다.">
                <line className="gl" x1="46" y1="20" x2="600" y2="20" />
                <line className="gl" x1="46" y1="95" x2="600" y2="95" />
                <line className="gl" x1="46" y1="170" x2="600" y2="170" />
                <text className="axl" x="0" y="26">드는</text>
                <text className="axl" x="0" y="38">돈</text>
                <polyline fill="none" stroke="#8ea0c4" strokeWidth="2.5" strokeDasharray="7 5"
                  strokeLinejoin="round" strokeLinecap="round"
                  points="60,158 190,158 190,112 320,112 320,66 450,66 450,24 580,24" />
                <text className="dlab" x="516" y="17" textAnchor="middle" fill="#8ea0c4">제어기를 다시</text>
                <polyline fill="none" stroke="#3585ea" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round"
                  points="60,158 190,158 190,143 320,143 320,128 450,128 450,113 580,113" />
                <circle className="dot" cx="60" cy="158" r="5" />
                <circle className="dot" cx="190" cy="143" r="5" />
                <circle className="dot" cx="320" cy="128" r="5" />
                <circle className="dot" cx="450" cy="113" r="5" />
                <text className="dlab" x="516" y="106" textAnchor="middle">모듈만 추가</text>
                <text className="axl" x="60" y="190" textAnchor="middle">장치 32개</text>
                <text className="axl" x="190" y="190" textAnchor="middle">64개</text>
                <text className="axl" x="320" y="190" textAnchor="middle">96개</text>
                <text className="axl" x="450" y="190" textAnchor="middle">128개</text>
              </svg>
            </div>
            <figcaption>제어기를 다시 사야 하는 구조라면 방을 늘릴 때마다 처음 냈던 금액이 또 나갑니다.
              모듈만 더하면 되는 구조는 처음 한 번으로 끝납니다.</figcaption>
          </figure>

          {/* 구성 — 금액 없음 */}
          <h3 className="reveal" style={{ margin: "44px 0 0", fontSize: 17, fontWeight: 800 }}>방 몇 개짜리세요?</h3>
          {/* ⚠️ gridTemplateColumns 를 인라인으로 두면 미디어쿼리를 이겨서 360px 폰에서도 2열로 남는다
                 (카드 폭 111px → "장치 23개까지"가 세 줄로 접힘). CSS 로 옮겼다. */}
          <div className="tiers" style={{ marginTop: 16 }}>
            <div className="tier reveal">
              <h3>소형</h3>
              <div className="devbar"><i style={{ width: "18%" }} /></div>
              <div className="devn">장치 <b>23개</b>까지</div>
              <p>방 한 칸으로 시작하시는 분들. 23개에서 더는 안 늘어납니다. 나중에 표준으로 올리실 때
                쓰시던 제어기는 값을 쳐드려요.</p>
            </div>
            <div className="tier hot reveal">
              <h3>표준</h3>
              <div className="devbar"><i style={{ width: "25%" }} /></div>
              <div className="devn">장치 <b>32개</b>부터</div>
              <p>새로 여는 매장은 대부분 이걸로 갑니다. 모듈만 달면 계속 붙습니다. 위로 끝이 없어요.</p>
            </div>
          </div>
          <p className="note reveal">설치는 3일 기준입니다. 금액은 방 개수와 장치 수에 따라 달라서 보러 가서 말씀드립니다.</p>
        </section>

        {/* 누가 먼저 아느냐 */}
        <section className="bz-sec">
          <div className="kicker reveal">누가 먼저 아느냐</div>
          <h2 className="reveal">손님이 인터폰 누르기 전에<br />아셔야 합니다.</h2>

          <figure className="reveal">
            <p className="ftitle">누가 먼저 아느냐에 따라 손해가 갈립니다</p>
            <div className="bars">
              <div className="bar">
                <div className="lab">손님이 먼저</div>
                <div className="track">
                  <div className="fill bad"><b>12만원</b>게임 중에 문 열고 들어가야 합니다. 후기까지 갑니다.</div>
                </div>
              </div>
              <div className="bar">
                <div className="lab">GM이 먼저</div>
                <div className="track">
                  <div className="fill warn"><b>6만원</b>그 타임 닫고 전화 돌립니다.</div>
                </div>
              </div>
              <div className="bar">
                <div className="lab">우리가 먼저</div>
                <div className="track"><div className="fill z"><b>0원</b>오픈 전에 고쳐놓습니다.</div></div>
              </div>
            </div>
            <figcaption>
              <p>제어기가 장치 상태를 스스로 봅니다. 응답 없는 게 생기면 사장님 폰으로 알림이 갑니다.
                &quot;3번 방 전자석 응답 없음&quot; 이런 식으로요.</p>
              <p>다 잡히지는 않습니다. 손님이 뜯어버린 소품, 끊어진 배선, 정전은 이걸로 안 걸려요.
                그건 여전히 사람이 봐야 합니다.</p>
            </figcaption>
          </figure>
        </section>
        <NextUp here={here} pick={pick} />
      </div></div>}

      {/* ══════════ ③ 매장 운영 프로그램 ══════════ (S1 밝은 SaaS) */}
      {here === "software" && <div className="pn-software">
        <span className="pn-sweep" key={here} aria-hidden="true" />
        <div className="wrap">
        <header className="pn-head">
          <i>03</i>
          <h2>매장 운영 프로그램</h2>
          <p>사무실에서 쓰는 것</p>
        </header>
        <section className="bz-sec" id="software">
          <h2 className="reveal">사장님이 엑셀로<br />하고 계신 것들</h2>
          <p className="lead reveal">방 안 장치를 돌리는 게 제어기라면, 이건 사무실에서 하는 일입니다.
            근무표 짜고, 시급 계산하고, 예약 받고, 쿠폰 챙기는 것.</p>

          <div className="swtable reveal">
            <div className="h">&nbsp;</div><div className="h">지금 이렇게 하고 계실 겁니다</div><div className="h usc">바뀌는 것</div>

            <div className="rowlab">출퇴근 · 근무표</div>
            <div className="t mut">출퇴근은 단톡에 카톡으로, 근무표는 엑셀 짜서 사진으로 올림</div>
            <div className="usc t">폰으로 찍습니다. 대타도 서로 신청하고 승인합니다.</div>

            <div className="rowlab">급여 · 매출 장부</div>
            <div className="t mut">말일에 시급 계산기 두드림</div>
            <div className="usc t">찍힌 근태가 그대로 급여로 넘어갑니다. 매출까지 한 화면에서.</div>

            <div className="rowlab">예약 · 홈페이지</div>
            <div className="t mut">외부 플랫폼 수수료, 손 안 대는 홈페이지</div>
            <div className="usc t">자체 예약, 취소, 환불 규정까지. 홈페이지도 같이 갑니다.</div>

            <div className="rowlab">쿠폰</div>
            <div className="t mut">종이 쿠폰, 누가 썼는지 모름</div>
            <div className="usc t">발행하고 나면 누가 언제 썼는지 남습니다.</div>
          </div>

          {/* 근무표 도해 — 소프트웨어에서 제일 알아보기 쉬운 화면 하나를 CSS 격자로 그린다.
              🔴 캡처로 오인되지 않게: 파란 점선 테두리 + "그림으로 옮긴 화면" 태그 +
                 사람 이름·매장명·금액 없음 + 아이콘·아바타·브라우저 크롬 없음. */}
          <figure className="swmock reveal" style={{ marginTop: 26 }}>
            <p className="ftitle">근무표는 이렇게 생겼습니다</p>
            <span className="mocktag">그림으로 옮긴 화면</span>
            <div className="board" role="img"
              aria-label="한 주 근무표 도해입니다. 가로는 월요일부터 일요일, 세로는 근무자 세 명이고 칸마다 근무 시간이 들어갑니다. 비는 자리는 대타 신청 칸으로 남습니다.">
              <span className="bh" aria-hidden="true" />
              {SW_DAYS.map((d) => <span className="bh" key={d} aria-hidden="true">{d}</span>)}
              {SW_BOARD.map((r) => (
                <Fragment key={r.who}>
                  <span className="bn" aria-hidden="true">{r.who}</span>
                  {r.d.map((v, i) => (
                    <span key={i} aria-hidden="true"
                      className={"bc" + (v === "대타" ? " sub" : v ? " on" : "")}>{v}</span>
                  ))}
                </Fragment>
              ))}
            </div>
            <figcaption>칸을 눌러 짜고, 비는 자리는 대타로 넘깁니다.
              실제 화면을 찍은 것이 아니라 모양만 옮겨 그린 그림입니다.</figcaption>
          </figure>

          <p className="lead reveal" style={{ margin: "22px 0 0" }}>
            전부 저희 매장 3곳에서 지금 이 순간 돌아가고 있는 것들입니다. 보여드리려고 만든 게 아닙니다.
          </p>

          <h3 className="reveal" style={{ margin: "44px 0 0", fontSize: 17, fontWeight: 800 }}>예약금 들어온 걸 사람이 안 봐도 됩니다</h3>
          <p className="lead reveal" style={{ margin: "10px 0 18px" }}>
            예약금이 입금되면 그 예약이 알아서 확정으로 넘어갑니다. 이름과 금액이 맞는 건만 자동으로 처리하고,
            애매한 건 사장님한테 남깁니다.
          </p>
          {/* 처리 내역 도해. ⚠️ 실제 로그가 아니다. 사람 이름·계좌·금액을 넣지 않는다.
              흐름도가 아니라 줄로 그린 이유: 흐름도는 성공 경로만 그리게 되는데,
              줄이면 "자동으로 안 되는 것"까지 같은 형식으로 나란히 놓을 수 있다. */}
          <figure className="swmock reveal" style={{ marginBottom: 18 }}>
            <p className="ftitle">이런 순서로 지나갑니다</p>
            <span className="mocktag">그림으로 옮긴 화면</span>
            <ol className="swlog" aria-label="입금 자동확인 처리 순서">
              <li><span className="lt">09:41</span><span className="lm">입금 알림 도착</span><span className="lc">받음</span></li>
              <li><span className="lt">09:41</span><span className="lm">이름과 금액 대조</span><span className="lc">일치</span></li>
              <li><span className="lt">09:41</span><span className="lm">예약 확정</span><span className="lc">자동</span></li>
              <li><span className="lt">09:41</span><span className="lm">손님에게 확정 문자</span><span className="lc">보냄</span></li>
              <li className="hold"><span className="lt">09:52</span><span className="lm">이름이 다르게 들어온 건</span><span className="lc">사장님 확인</span></li>
            </ol>
            <figcaption>맞는 건만 자동으로 넘어가고, 애매한 건 마지막 줄처럼 남습니다.
              실제 화면을 찍은 것이 아니라 모양만 옮겨 그린 그림입니다.</figcaption>
          </figure>

          <div className="ops">
            <div className="op reveal"><b>손으로 대조하던 일</b><span>통장 열어서 이름 맞춰보고, 관리자 들어가서 확정 누르고.</span></div>
            <div className="op reveal"><b>지금</b><span>입금 알림이 오면 맞는 예약을 찾아 확정까지 갑니다. 손님한테 확정 문자도 나갑니다.</span></div>
          </div>
          <p className="note reveal">제어기를 넣으시면 운영 프로그램이 함께 들어갑니다.
            프로그램만 따로 쓰고 싶으시면 그것도 상담해 드립니다.</p>
        </section>
        <NextUp here={here} pick={pick} />
      </div></div>}

      {/* ══════════ 여기서부터는 어느 범위를 보든 항상 나온다 ══════════ */}
      <div className="wrap">
        {/* 비교 */}
        <section className="bz-sec">
          <div className="kicker reveal">비교</div>
          <h2 className="reveal">견적서에는 안 적히는 것들</h2>
          <div className="cmp reveal">
            <div className="h">&nbsp;</div><div className="h">보통 방식</div><div className="h usc">판타스트릭</div>

            <div className="rowlab">기획부터 시공까지 어디까지 한 팀인가</div>
            <div><span className="mk n">&times;</span><span className="t mut">따로따로 맡김</span></div>
            <div className="usc"><span className="mk y">&#10003;</span><span className="t">한 팀이 끝까지</span></div>

            <div className="rowlab">방을 늘리고 싶을 때</div>
            <div><span className="mk n">&times;</span><span className="t mut">제어기를 다시</span></div>
            <div className="usc"><span className="mk y">&#10003;</span><span className="t">모듈만 추가</span></div>

            <div className="rowlab">작동을 안 하는 걸 어떻게 아는가</div>
            <div><span className="mk n">&times;</span><span className="t mut">사람이 발견</span></div>
            <div className="usc"><span className="mk y">&#10003;</span><span className="t">24시간 자동 알림</span></div>

            <div className="rowlab">작동을 안 할 때 전화할 곳</div>
            <div><span className="mk n">&times;</span><span className="t mut">시공사, 제작사, 부품사</span></div>
            <div className="usc"><span className="mk y">&#10003;</span><span className="t">만든 사람이 직접 받습니다</span></div>

            <div className="rowlab">부품 단종되면</div>
            <div><span className="mk n">&times;</span><span className="t mut">그 업체만 만드는 기판</span></div>
            <div className="usc"><span className="mk y">&#10003;</span><span className="t">시중에서 구할 수 있는 부품</span></div>

            <div className="rowlab">매장 운영 프로그램</div>
            <div><span className="mk n">&times;</span><span className="t mut">없음</span></div>
            <div className="usc"><span className="mk y">&#10003;</span><span className="t">출퇴근, 급여, 예약, 쿠폰</span></div>

            <div className="rowlab">만든 데가 방탈출을 하는가</div>
            <div><span className="mk n">&times;</span><span className="t mut">아니오</span></div>
            <div className="usc"><span className="mk y">&#10003;</span><span className="t">강남 3곳, 11년째</span></div>
          </div>
          <p className="disc reveal">업계에서 일반적으로 쓰이는 방식과의 구조 차이를 정리한 것입니다.
            특정 업체를 지칭하지 않으며 제품에 따라 사양은 다를 수 있습니다.</p>
        </section>

        {/* 사후 관리 — 상품과 상관없이 궁금한 것이라 범위 밖에 둔다 */}
        <section className="bz-sec">
          <div className="kicker reveal">사후 관리</div>
          <h2 className="reveal">전화 한 통이면 끝납니다.</h2>
          <p className="lead reveal">어디에 전화해야 하는지 고민하실 일이 없습니다. 만든 사람이 받습니다.</p>
          <div className="trust">
            <div className="reveal"><b>24시간 고장 감시</b><span>장치가 응답을 안 하면 저희가 먼저 알고 연락드립니다.</span></div>
            <div className="reveal"><b>원격으로 되는 건 원격으로</b><span>방문 없이 처리되는 건 그 자리에서 끝냅니다.</span></div>
            <div className="reveal"><b>장치 AS 도 직접</b><span>우리가 만든 장치라 다른 데로 돌리지 않습니다.</span></div>
            <div className="reveal"><b>프로그램 손보는 것도</b><span>쓰시다가 불편한 곳은 고쳐서 올립니다.</span></div>
          </div>
        </section>

        {/* 먼저 말씀드립니다 */}
        <section className="bz-sec">
          <div className="kicker reveal">먼저 말씀드립니다</div>
          <h2 className="reveal">경쟁사한테 사는 거 아니냐,<br />하실 겁니다.</h2>
          <p className="lead reveal">맞습니다. 저희도 강남에서 방탈출을 합니다. 그래서 말로 하지 않고 계약서에 넣습니다.</p>
          <div className="trust">
            <div className="reveal"><b>시나리오는 안 가져갑니다</b><span>고객사 시나리오랑 문제 구조는 우리 매장 어디에도 안 씁니다.</span></div>
            <div className="reveal"><b>매장 이름 안 밝힙니다</b><span>원하시면 납품 사례에서 빼드립니다.</span></div>
            <div className="reveal"><b>데이터는 따로 둡니다</b><span>매장 예약이랑 매출이 우리 쪽 데이터와 섞이지 않습니다.</span></div>
            <div className="reveal"><b>제어기만 사셔도 됩니다</b><span>운영 프로그램 없이 장치만 가져가셔도 상관없습니다.</span></div>
          </div>
        </section>

        {/* FAQ */}
        <section className="bz-sec">
          <div className="kicker reveal">자주 묻는 것</div>
          <h2 className="reveal">이런 걸 물어보십니다.</h2>
          <div className="reveal">
            <details>
              <summary>지금 매장에 있는 장치, 안 뜯고 그대로 쓸 수 있나요?</summary>
              <div className="b">쓰시던 전자석이랑 센서, 조명은 대부분 선만 옮기면 됩니다.
                뭘 살릴 수 있는지는 보러 가서 그 자리에 알려드립니다.</div>
            </details>
            <details>
              <summary>공사하는 동안 매장 닫아야 하나요?</summary>
              <div className="b">3일 기준입니다. 방 한 칸씩 나눠 하면 매장 전체를 닫지 않아도 됩니다.
                예약 적은 요일에 맞춰 잡습니다.</div>
            </details>
            <details>
              <summary>장치가 작동을 안 하면 얼마나 빨리 오시나요?</summary>
              <div className="b">장치가 응답을 안 하면 저희가 먼저 알고 연락드립니다.
                원격으로 되는 건 방문 없이 처리하고요. 그리고 전화 받는 사람이 그 제어기를 만든 사람입니다.</div>
            </details>
            <details>
              <summary>방 하나만 새로 만들 수도 있나요?</summary>
              <div className="b">됩니다. 방 한 칸만 하시는 분들도 있고, 매장 전체를 맡기시는 분들도 있습니다.
                지금 쓰시는 것 중 살릴 게 있으면 살립니다.</div>
            </details>
            <details>
              <summary>제어기만 사고 나머지는 저희가 해도 되나요?</summary>
              <div className="b">됩니다. 제어기만 가져가셔도 되고, 운영 프로그램만 쓰셔도 됩니다.
                어디까지 맡기실지는 보고 나서 같이 정합니다.</div>
            </details>
          </div>
        </section>

        {/* 문의 */}
        <section className="bz-sec" id="cta">
          <div className="ctabox reveal">
            <div className="kicker" style={{ justifyContent: "center" }}>CONTACT</div>
            <h2>한번 보러 가겠습니다.</h2>
            <p className="lead center">지금 쓰시는 게 있어도 괜찮습니다. 안 뜯고 볼 수 있는 것부터 봅니다.
              방 몇 개인지, 장치가 몇 개 붙어 있는지, 고장 나면 지금 어떻게 하시는지. 그 정도만 보면 됩니다.</p>
            {sent ? (
              <div className="bzdone">
                <b>문의 잘 받았습니다.</b>
                <p>영업일 기준 하루 안에 전화 드립니다. 급하시면 <b>fantastrick@fantastrick.co.kr</b> 로도 연락 주세요.</p>
              </div>
            ) : (
              <>
                <div className="kinds" style={{ justifyContent: "center", margin: "22px 0 4px" }}>
                  {KINDS.map((k) => (
                    <button key={k} type="button" className={kind === k ? "on" : ""} onClick={() => setKind(k)}>{k}</button>
                  ))}
                </div>
                <form className="bzform" onSubmit={sendInquiry}>
                  <div>
                    <label htmlFor="bz-store">매장명</label>
                    <input id="bz-store" maxLength={60} placeholder="○○이스케이프" autoComplete="organization"
                      value={form.storeName} onChange={(e) => setForm({ ...form, storeName: e.target.value })} />
                  </div>
                  <div>
                    <label htmlFor="bz-tel">연락처</label>
                    <input id="bz-tel" inputMode="tel" maxLength={20} placeholder="010-0000-0000" autoComplete="tel"
                      value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                  </div>
                  <div>
                    <label htmlFor="bz-rooms">방 개수</label>
                    <input id="bz-rooms" inputMode="numeric" maxLength={4} placeholder="3"
                      value={form.rooms} onChange={(e) => setForm({ ...form, rooms: e.target.value })} />
                  </div>
                  <div>
                    <label htmlFor="bz-area">지역</label>
                    <input id="bz-area" maxLength={40} placeholder="서울 강남"
                      value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} />
                  </div>
                  <div className="full">
                    <button type="submit" className="btn primary" style={{ width: "100%" }} disabled={sending}>
                      {sending ? "보내는 중…" : "한번 보러 와 달라고 하기"}
                    </button>
                  </div>
                </form>
                {formErr && <div className="bzerr">{formErr}</div>}
                <div className="micro">보고 나서 안 하셔도 됩니다.<br />연락은 한 번만 드립니다.</div>
              </>
            )}
          </div>

          <div className="crossline reveal" style={{ marginTop: 22 }}>
            <p>브랜드 팝업이나 기업 교육처럼 방탈출 매장이 아닌 곳에 만드는 일도 합니다.</p>
            <Link href="/business/collab">협업 이야기 보기 →</Link>
          </div>
        </section>
      </div>
    </div>
  );
}
