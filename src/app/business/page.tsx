"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import "./business.css";

/* 비즈니스(B2B) — 방탈출 매장에 파는 "테마 제어기 + 매장 운영 프로그램" 소개.
   2026-08-06: 회사 소개형(역량 3축·서비스·5단계·레퍼런스) → 제품 판매형으로 전면 교체.
   근거 = 사업설계 브리핑(2026-08-02) + 경쟁사(헬리드) 조사. 시안 원본은 docs/시안-제어시스템-B2B/.

   ⚠️ 카피 규칙 (에이전트 2종 조사 + 사장님 확인으로 굳힌 것 — 고칠 때 지킬 것)
     · 이모지 금지. 문장 속 대시(—) 금지. "A가 아니라 B입니다" 반복 금지.
     · 업계어: 장비(X) → 장치 / 블록(X) → 제어기·모듈 / 리셋(X) → 세팅.
     · 고장은 "작동을 안 한다"로 쓴다(죽었다·먹통 같은 은어는 사장님이 안 쓰신다).
     · 타임은 "찬다". 방마다 장치 수가 다르므로 "보통 몇 개" 같은 기준선 문장은 쓰지 않는다. */

const won = (n: number) => n.toLocaleString("ko-KR");
const onlyNum = (s: string) => Number(String(s).replace(/[^0-9]/g, "")) || 0;

export default function BusinessPage() {
  // 손실 계산기 — 사장님이 자기 매장 숫자를 넣어보는 곳. 우리가 금액을 단정하지 않는다.
  const [fee, setFee] = useState(60000);
  const [slots, setSlots] = useState(12);
  // 확장 도해 — 모듈을 붙였다 뗐다 하며 "장치를 몇 개까지 물리나"를 손으로 확인하게 한다.
  const [mods, setMods] = useState(2);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }),
      { threshold: 0.14 }
    );
    document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const lost = fee * slots;
  const devices = 32 + mods * 32;

  return (
    <div className="bizsys">
      {/* HERO */}
      <section className="bz-hero">
        <div className="scan" />
        <div className="wrap">
          <div className="kicker">테마 제어기 · 매장 운영 프로그램</div>
          <h1>제조사가 아니라,<br />방탈출 매장입니다.</h1>
          <p className="sub">
            강남에서 3곳, 11년째 하고 있습니다. 우리 매장에서 쓰던 제어기랑 운영 프로그램을
            그대로 넣어드립니다. 따로 만들어드리는 게 아니라 같은 걸 쓰시는 겁니다.
          </p>
          <div className="bz-cta">
            <a className="btn primary" href="#cta">도입 문의하기</a>
            <Link href="/" className="btn ghost">테마 보러 가기</Link>
          </div>
          <div className="strip">
            <div><b>11년째</b><span>직접 운영 중</span></div>
            <div><b>강남 3곳</b><span>직영</span></div>
            <div><b>장치 128개</b><span>한 대로</span></div>
          </div>
        </div>
      </section>

      <div className="wrap">
        {/* 손실 */}
        <section className="bz-sec">
          <div className="kicker reveal">장치값보다 큰 돈</div>
          <h2 className="reveal">장치 하나가 작동을 안 하면<br />그 방은 그날 못 씁니다.</h2>
          <p className="lead reveal">
            2시 타임 한 번 비면 그날 매출에서 그냥 빠져요. 내일 두 팀 받는다고 메워지는 것도 아니고요.
            주말에 타임이 다 차는 방일수록 손해가 큽니다.
            장치를 얼마에 샀느냐보다, 그 장치 때문에 몇 타임을 못 받았느냐가 큽니다.
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

        {/* 확장 */}
        <section className="bz-sec">
          <div className="kicker reveal">방 늘릴 때</div>
          <h2 className="reveal">쓰던 건 안 뜯습니다.</h2>
          <p className="lead reveal">
            자물쇠, 전자석, 센서, 연출 조명. 방에 붙는 건 하나씩 다 셉니다.
            제어기 한 대에 32개까지 물려요. 방마다 들어가는 개수가 다 다르니, 보러 가서 같이 세어봅니다.
          </p>

          <figure className="reveal">
            <p className="ftitle">모자라면 모듈을 답니다</p>
            <div className="blocks">
              <div className="blk main"><b>제어기</b><span>장치 32개</span></div>
              {Array.from({ length: mods }, (_, i) => (
                <span key={i} className="blkpair">
                  <span className="plus">+</span>
                  <span className="blk"><b>모듈</b><span>+32개</span></span>
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
            <figcaption>모듈 하나 달면 32개씩 늘어납니다. 제어기는 처음 한 번만 사시면 되고요.</figcaption>
          </figure>

          <figure className="reveal" style={{ marginTop: 14 }}>
            <p className="ftitle">방 늘려갈 때 드는 돈</p>
            <div className="step-chart">
              <svg viewBox="0 0 620 200" role="img" aria-label="장치 수에 따른 누적 비용 계단 그래프. 32개 399만원에서 시작해 32개 늘 때마다 120만원씩 올라 128개에서 759만원.">
                <line className="gl" x1="46" y1="20" x2="600" y2="20" />
                <line className="gl" x1="46" y1="95" x2="600" y2="95" />
                <line className="gl" x1="46" y1="170" x2="600" y2="170" />
                <text className="axl" x="0" y="24">800만</text>
                <text className="axl" x="0" y="99">400만</text>
                <text className="axl" x="0" y="174">0</text>
                <polyline
                  fill="none" stroke="#3585ea" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round"
                  points="60,95.2 190,95.2 190,72.7 320,72.7 320,50.2 450,50.2 450,27.7 580,27.7"
                />
                <circle className="dot" cx="60" cy="95.2" r="5" />
                <circle className="dot" cx="190" cy="72.7" r="5" />
                <circle className="dot" cx="320" cy="50.2" r="5" />
                <circle className="dot" cx="450" cy="27.7" r="5" />
                <text className="dlab" x="60" y="83" textAnchor="middle">399만</text>
                <text className="dlab" x="190" y="60" textAnchor="middle">519만</text>
                <text className="dlab" x="320" y="38" textAnchor="middle">639만</text>
                <text className="dlab" x="450" y="15" textAnchor="middle">759만</text>
                <text className="axl" x="60" y="190" textAnchor="middle">장치 32개</text>
                <text className="axl" x="190" y="190" textAnchor="middle">64개</text>
                <text className="axl" x="320" y="190" textAnchor="middle">96개</text>
                <text className="axl" x="450" y="190" textAnchor="middle">128개</text>
              </svg>
            </div>
            <figcaption>모듈 하나에 120만원입니다. 제어기를 다시 사야 하는 구조라면,
              방 늘릴 때마다 처음 냈던 금액이 또 나갑니다.</figcaption>
          </figure>
        </section>

        {/* 등급 */}
        <section className="bz-sec">
          <div className="kicker reveal">등급</div>
          <h2 className="reveal">방 몇 개짜리세요?</h2>
          <div className="tiers">
            <div className="tier reveal">
              <h3>소형</h3>
              <div className="devbar"><i style={{ width: "18%" }} /></div>
              <div className="devn">장치 <b>23개</b>까지</div>
              <div className="price"><s>250만</s>199만</div>
              <div className="vat">VAT 별도</div>
              <p>방 한 칸으로 시작하시는 분들. 23개에서 더는 안 늘어납니다. 나중에 표준으로 올리실 때
                쓰시던 제어기는 값을 쳐드려요.</p>
            </div>
            <div className="tier hot reveal">
              <span className="badge">많이 선택</span>
              <h3>표준</h3>
              <div className="devbar"><i style={{ width: "25%" }} /></div>
              <div className="devn">장치 <b>32개</b>부터</div>
              <div className="price"><s>450만</s>399만</div>
              <div className="vat">VAT 별도, 모듈 추가 120만</div>
              <p>새로 여는 매장은 대부분 이걸로 갑니다. 모듈만 달면 계속 붙습니다. 위로 끝이 없어요.</p>
            </div>
            <div className="tier reveal">
              <h3>턴키</h3>
              <div className="devbar"><i style={{ width: "100%" }} /></div>
              <div className="devn">장치 <b>128개</b>까지</div>
              <div className="price"><s>1,290만</s>1,190만</div>
              <div className="vat">VAT 별도</div>
              <p>시나리오부터 연출, 장치 설계, 시공, GM 교육까지 우리가 합니다.
                사장님은 오픈 날짜만 잡으시면 됩니다.</p>
            </div>
          </div>
          <p className="note reveal">설치 80만원 별도, 3일 기준. 보증은 보드와 모듈 1년, 부품 6개월.</p>
        </section>

        {/* 비교 */}
        <section className="bz-sec">
          <div className="kicker reveal">비교</div>
          <h2 className="reveal">견적서에는 안 적히는 것들</h2>
          <div className="cmp reveal">
            <div className="h">&nbsp;</div><div className="h">보통 방식</div><div className="h usc">판타스트릭</div>

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

        {/* 운영 프로그램 */}
        <section className="bz-sec">
          <div className="kicker reveal">같이 들어가는 것</div>
          <h2 className="reveal">사장님이 엑셀로<br />하고 계신 것들</h2>
          <div className="ops">
            <div className="op reveal"><b>출퇴근, 근무표</b><span>폰으로 찍습니다. 대타 바꾸는 것도 앱에서 하고요.</span></div>
            <div className="op reveal"><b>급여, 매출 장부</b><span>찍힌 근태가 그대로 급여로 넘어갑니다. 옮겨 적을 일이 없습니다.</span></div>
            <div className="op reveal"><b>예약, 홈페이지</b><span>타임표부터 예약금, 환불 규정까지 한 화면에서 봅니다.</span></div>
            <div className="op reveal"><b>쿠폰</b><span>발행하고 나면 누가 언제 썼는지 남습니다.</span></div>
          </div>
          <p className="lead reveal" style={{ margin: "20px 0 0" }}>지금 우리 매장 3곳에서 쓰고 있는 그대로입니다.</p>
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
          </div>
        </section>

        {/* 문의 */}
        <section className="bz-sec" id="cta">
          <div className="ctabox reveal">
            <div className="kicker">CONTACT</div>
            <h2>한번 보러 가겠습니다.</h2>
            <p className="lead center">지금 쓰시는 게 있어도 괜찮습니다. 안 뜯고 볼 수 있는 것부터 봅니다.
              방 몇 개인지, 장치가 몇 개 붙어 있는지, 고장 나면 지금 어떻게 하시는지. 그 정도만 보면 됩니다.</p>
            <form className="bzform" onSubmit={(e) => { e.preventDefault(); setSent(true); }}>
              <div><label htmlFor="bz-store">매장명</label><input id="bz-store" placeholder="○○이스케이프" /></div>
              <div><label htmlFor="bz-tel">연락처</label><input id="bz-tel" placeholder="010-0000-0000" /></div>
              <div><label htmlFor="bz-rooms">방 개수</label><input id="bz-rooms" placeholder="3" /></div>
              <div><label htmlFor="bz-area">지역</label><input id="bz-area" placeholder="서울 강남" /></div>
              <div className="full">
                <button type="submit" className="btn primary" style={{ width: "100%" }}>도입 문의하기</button>
              </div>
            </form>
            <div className="micro">
              {sent
                ? <>문의 접수 기능은 연결 중입니다. 지금은 <b>fantastrick@fantastrick.co.kr</b> 로 메일 주시면 바로 답 드립니다.</>
                : <>보고 나서 안 하셔도 됩니다.<br />연락은 한 번만 드립니다.</>}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
