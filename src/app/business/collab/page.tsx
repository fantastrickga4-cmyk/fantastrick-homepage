"use client";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { THEMES } from "@/lib/data";
import "../business.css";

/* 협업(B2B) — 브랜드·기관 담당자용. /business 와 보는 사람이 아예 다르다.
     · 방탈출 사장님: 본인이 결재한다. 값과 고장 대응을 먼저 본다.
     · 브랜드 담당자: 품의를 올려야 한다. 범위·기간·회사 실체를 먼저 본다.
   두 사람의 불안이 정반대라 한 페이지로는 둘 다 못 잡는다(2026-08-06 분석).

   ⚠️ 없는 실적을 쓰지 않는다. 우리가 댈 수 있는 것은 "직영 3곳을 11년 굴려온 것"뿐이다.
      대기업 로고를 흉내 내면 빈자리가 그대로 보인다. 카피 규칙은 /business 와 같다. */

const KINDS = ["브랜드 팝업", "기업 교육", "공공·전시", "그 밖에"];

export default function CollabPage() {
  const [form, setForm] = useState({ storeName: "", phone: "", rooms: "", area: "" });
  const [kind, setKind] = useState(KINDS[0]);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [formErr, setFormErr] = useState("");

  useEffect(() => {
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }),
      { threshold: 0.14 }
    );
    document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (sending) return;
    setFormErr("");
    if (!form.storeName.trim()) { setFormErr("회사나 기관 이름을 적어주세요."); return; }
    if (form.phone.replace(/[^0-9]/g, "").length < 9) { setFormErr("연락처를 확인해 주세요."); return; }
    setSending(true);
    try {
      const res = await fetch("/api/business/inquiry", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, kind: `협업 · ${kind}` }),
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
    <div className="bizsys">
      <section className="bz-hero">
        <div className="scan" />
        <div className="wrap">
          <div className="kicker">협업 · 브랜드 · 기관</div>
          <h1>방탈출을 팝업에,<br />교육에, 전시에.</h1>
          <p className="sub">
            사람을 앉혀 놓고 설명하는 대신, 직접 움직이고 풀게 만드는 방식입니다.
            강남에서 방탈출 3곳을 11년째 직접 만들고 운영하면서 다듬어 온 것입니다.
          </p>
          <div className="bz-cta">
            <a className="btn primary" href="#cta">협업 문의하기</a>
            <a className="btn ghost" href="#what">무엇을 하는지 보기</a>
          </div>
          <div className="strip">
            <div><b>11년째</b><span>직접 운영 중</span></div>
            <div><b>강남 3곳</b><span>직영</span></div>
            <div><b>한 팀</b><span>기획 · 시공 · 장치</span></div>
          </div>
        </div>
      </section>

      <div className="wrap">
        <section className="bz-sec">
          <div className="kicker reveal">이런 이야기를 듣습니다</div>
          <h2 className="reveal">혹시 이런 적 있으십니까.</h2>
          <div className="asks">
            <div className="ask reveal">예산은 다 썼는데 사람들이 사진만 찍고 돌아갔다</div>
            <div className="ask reveal">전하려던 메시지가 어디까지 남았는지 모르겠다</div>
            <div className="ask reveal">기획, 시공, 장치를 각각 다른 데 맡기다 일정이 밀렸다</div>
            <div className="ask reveal">교육을 했는데 다음 날이면 아무도 기억을 못 한다</div>
          </div>
        </section>

        <section className="bz-sec" id="what">
          <div className="kicker reveal">할 수 있는 것</div>
          <h2 className="reveal">이야기부터 배선까지<br />한 팀이 합니다.</h2>
          <p className="lead reveal">
            기획하는 사람과 만드는 사람이 같은 회사에 있습니다. 도면이 바뀌면 장치도 그 자리에서 같이 바뀝니다.
          </p>
          <div className="trio">
            <div className="tri reveal">
              <div className="en">Contents</div>
              <h3>이야기 · 문제</h3>
              <p>전하려는 메시지를 사람이 직접 풀어야 하는 형태로 바꿉니다.</p>
              <ul>
                <li>세계관 · 시나리오</li>
                <li>문제 · 미션 설계</li>
                <li>연출 · 사운드</li>
                <li>진행 매뉴얼 · 운영 교육</li>
              </ul>
            </div>
            <div className="tri reveal">
              <div className="en">Space</div>
              <h3>공간 · 시공</h3>
              <p>도면부터 마감까지, 현장에 실제로 세우는 일까지 합니다.</p>
              <ul>
                <li>평면 · 동선 설계</li>
                <li>세트 제작 · 인테리어</li>
                <li>조명 · 음향</li>
                <li>전기 배선</li>
              </ul>
            </div>
            <div className="tri reveal">
              <div className="en">Device</div>
              <h3>장치 · 제어</h3>
              <p>손대면 반응하는 장치를 만들고, 그걸 돌리는 제어기까지 자체 제작합니다.</p>
              <ul>
                <li>잠금 장치 · 기믹</li>
                <li>센서 · 트리거</li>
                <li>영상 · 조명 연출 제어</li>
                <li>마스터 · 슬레이브 제어기</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="bz-sec">
          <div className="kicker reveal">진행</div>
          <h2 className="reveal">이렇게 진행합니다.</h2>
          <div className="rail reveal" style={{ marginTop: 26 }}>
            <div><b>미팅</b><span>목적, 예산, 기간 확인</span><i>자체 인력</i></div>
            <div><b>기획</b><span>콘셉트와 시나리오 제안</span><i>자체 인력</i></div>
            <div><b>설계 · 견적</b><span>도면, 장치 목록, 일정</span><i>자체 인력</i></div>
            <div><b>제작 · 시공</b><span>세트, 장치, 배선, 설치</span><i>자체 인력</i></div>
            <div><b>운영 · 철수</b><span>진행 교육, 현장 지원</span><i>자체 인력</i></div>
          </div>
          <p className="note reveal">기간과 금액은 하시려는 규모에 따라 달라서 미팅에서 말씀드립니다.</p>
        </section>

        <section className="bz-sec">
          <div className="kicker reveal">만든 것</div>
          <h2 className="reveal">저희가 만들어<br />저희가 돌리고 있습니다.</h2>
          <p className="lead reveal">
            납품하고 끝난 것이 아니라, 매일 손님을 받으면서 고쳐온 방들입니다.
            무엇이 닳고 무엇이 자주 작동을 안 하는지 저희가 직접 겪습니다.
          </p>
          <div className="works">
            {THEMES.map((t) => (
              <div className="work reveal" key={t.id}>
                <div className="th">
                  <Image src={t.poster} alt={t.name} width={78} height={104} sizes="78px" />
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
        </section>

        <section className="bz-sec">
          <div className="kicker reveal">왜 저희인가</div>
          <h2 className="reveal">만들어만 보고 끝난<br />회사가 아닙니다.</h2>
          <div className="trust">
            <div className="reveal"><b>매일 운영합니다</b><span>강남 3곳에서 11년째 직접 손님을 받습니다. 주소도 공개돼 있습니다.</span></div>
            <div className="reveal"><b>하청을 안 씁니다</b><span>기획·시공·장치가 한 회사 안에 있어 중간에 말이 새지 않습니다.</span></div>
            <div className="reveal"><b>고장 나는 걸 압니다</b><span>어디가 먼저 닳는지 겪어봐서 처음부터 그걸 감안해 만듭니다.</span></div>
            <div className="reveal"><b>끝나고도 받습니다</b><span>설치하고 사라지지 않습니다. 전화 받는 사람이 만든 사람입니다.</span></div>
          </div>
        </section>

        <section className="bz-sec" id="cta">
          <div className="ctabox reveal">
            <div className="kicker" style={{ justifyContent: "center" }}>CONTACT</div>
            <h2>어떤 걸 하시려는지 알려주세요.</h2>
            <p className="lead center">아직 정해진 게 없어도 괜찮습니다. 목적이랑 대략의 시기만 알려주시면
              어떤 형태가 맞을지부터 같이 봅니다.</p>
            {sent ? (
              <div className="bzdone">
                <b>문의 잘 받았습니다.</b>
                <p>영업일 기준 하루 안에 연락드립니다. 급하시면 <b>fantastrick@fantastrick.co.kr</b> 로도 보내주세요.</p>
              </div>
            ) : (
              <>
                <div className="kinds" style={{ justifyContent: "center", margin: "22px 0 4px" }}>
                  {KINDS.map((k) => (
                    <button key={k} type="button" className={kind === k ? "on" : ""} onClick={() => setKind(k)}>{k}</button>
                  ))}
                </div>
                <form className="bzform" onSubmit={send}>
                  <div>
                    <label htmlFor="cb-org">회사 · 기관</label>
                    <input id="cb-org" maxLength={60} placeholder="○○○" autoComplete="organization"
                      value={form.storeName} onChange={(e) => setForm({ ...form, storeName: e.target.value })} />
                  </div>
                  <div>
                    <label htmlFor="cb-tel">연락처</label>
                    <input id="cb-tel" inputMode="tel" maxLength={20} placeholder="010-0000-0000" autoComplete="tel"
                      value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                  </div>
                  <div>
                    <label htmlFor="cb-when">시기</label>
                    <input id="cb-when" maxLength={40} placeholder="10월 중"
                      value={form.rooms} onChange={(e) => setForm({ ...form, rooms: e.target.value })} />
                  </div>
                  <div>
                    <label htmlFor="cb-place">장소</label>
                    <input id="cb-place" maxLength={40} placeholder="서울 성수"
                      value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} />
                  </div>
                  <div className="full">
                    <button type="submit" className="btn primary" style={{ width: "100%" }} disabled={sending}>
                      {sending ? "보내는 중…" : "협업 문의하기"}
                    </button>
                  </div>
                </form>
                {formErr && <div className="bzerr">{formErr}</div>}
                <div className="micro">보내주시면 한 번만 연락드립니다.</div>
              </>
            )}
          </div>

          <div className="crossline reveal" style={{ marginTop: 22 }}>
            <p>방탈출 매장을 하시거나 열려고 하신다면 이쪽입니다.</p>
            <Link href="/business">제어기 · 시공 이야기 보기 →</Link>
          </div>
        </section>
      </div>
    </div>
  );
}
