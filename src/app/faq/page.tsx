import Link from "next/link";
import type { Metadata } from "next";
import { THEMES } from "@/lib/data";
import { THEME_CONTENT, BOOKING_INFO } from "@/lib/theme-content";
import { getConfig, depositOf } from "@/lib/settings";

// 자주 묻는 질문.
// ⚠️ 내용은 지어내지 않았다 — 전부 실제 운영 규정에서 가져온 것:
//    테마 페이지(가격·주의사항·오시는 길) / 예약 문자 문구 / 환불 규정 / 예약 오픈 규칙.
//    (기존 사이트에도 FAQ 메뉴가 있었지만 내용이 비어 있어 가져올 게 없었음)

export const metadata: Metadata = {
  title: "자주 묻는 질문 — 판타스트릭",
  description: "이용 금액·예약금·환불·주차·인원·복장 등 판타스트릭 방탈출 이용 전 궁금한 점.",
};

const won = (n: number) => n.toLocaleString() + "원";

export default async function FaqPage() {
  const cfg = await getConfig();
  const lead = cfg.minLeadMinutes;

  return (
    <div className="formwrap" style={{ maxWidth: 760 }}>
      <div className="page-top" />
      <h1 className="title" style={{ margin: 0 }}>자주 묻는 질문</h1>
      <p className="lead" style={{ margin: "6px 0 22px" }}>예약 전에 많이 물어보시는 것들을 모았어요.</p>

      {/* 가격 */}
      <h3 className="faq-h">💰 가격 · 결제</h3>

      <details className="faq" open>
        <summary>이용 금액이 얼마인가요?</summary>
        <div className="faq-b">
          <p>테마마다 다르고, 인원에 따라서도 달라져요.</p>
          {THEMES.map((t) => {
            const c = THEME_CONTENT[t.id];
            if (!c) return null;
            return (
              <div key={t.id} className="faq-price">
                <b>{t.name} <span className="faq-tag">{t.storeTag}</span></b>
                <div>
                  {c.pricing.rows.map((r) => (
                    <span key={r.label} className="faq-row">
                      {r.label} <b>{won(r.won)}{c.pricing.kind === "perPerson" ? " / 인" : ""}</b>
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
          <p className="faq-note">테마별 자세한 안내는 <Link href="/rooms/firstfoundbride" className="tlink">테마 페이지</Link>에서 보실 수 있어요.</p>
        </div>
      </details>

      <details className="faq">
        <summary>예약금은 얼마고, 나머지는 언제 내나요?</summary>
        <div className="faq-b">
          <p>예약할 때 <b>예약금만 계좌이체</b>로 먼저 넣어주시고, <b>남은 금액은 방문하셔서 매장에서 결제</b>하시면 됩니다.</p>
          <ul>
            {THEMES.map((t) => (
              <li key={t.id}>
                <b>{t.name}</b> — 예약금 {won(depositOf(cfg, t.id, t.deposit))}
                {THEME_CONTENT[t.id]?.pricing.kind === "fixed" && t.id === "time" ? " (이 금액이 전부, 매장 결제 없음)" : ""}
              </li>
            ))}
          </ul>
        </div>
      </details>

      <details className="faq">
        <summary>예약금은 어디로 입금하나요?</summary>
        <div className="faq-b">
          <p><b>{BOOKING_INFO.account}</b></p>
          <p>예약자 이름과 <b>같은 이름</b>으로 입금해 주셔야 확인이 됩니다. 다른 이름(가족·친구 등)으로 넣으셨다면 매장에 알려주세요.</p>
        </div>
      </details>

      <details className="faq">
        <summary>입금은 언제까지 해야 하나요?</summary>
        <div className="faq-b">
          {/* 2026-07-17 사장님 지시로 '자정 이후 예약은 다음날 오전 10시까지' ·
              '확인 문자는 10시부터 순차 발송' 안내를 내렸다. 규칙 자체(expire.ts 의 오전 10시 반 유예)는
              그대로라, 새벽 손님은 안내를 못 봐도 실제로는 여전히 봐주고 있다. */}
          <p>예약 접수 후 <b>30분 이내</b>에 입금해 주세요. 확인이 안 되면 예약이 자동으로 취소됩니다.</p>
        </div>
      </details>

      {/* 예약 */}
      <h3 className="faq-h">📅 예약 · 취소</h3>

      <details className="faq">
        <summary>예약은 언제부터 할 수 있나요?</summary>
        <div className="faq-b">
          <p>예약은 <b>이용일 일주일 전 저녁 9시</b>에 열립니다. 그 전에는 달력에 자물쇠(🔒)로 표시돼요.</p>
          {lead > 0 && <p>또한 <b>시작 {lead}분 전부터는</b> 온라인 예약이 닫힙니다. 임박한 시간은 매장으로 전화 주세요.</p>}
        </div>
      </details>

      <details className="faq">
        <summary>취소하면 환불되나요?</summary>
        <div className="faq-b">
          <ul>
            {BOOKING_INFO.refund.map((l, i) => <li key={i}>{l}</li>)}
          </ul>
          <p><Link href="/reservation" className="tlink">예약 조회·취소</Link> 에서 직접 취소하실 수 있고, 그때 <b>환불 받으실 계좌</b>를 함께 남겨주세요.</p>
        </div>
      </details>

      <details className="faq">
        <summary>예약을 확인하거나 바꾸고 싶어요.</summary>
        <div className="faq-b">
          <p><Link href="/reservation" className="tlink">예약 조회·취소</Link> 에서 <b>이름 · 전화번호 · 예약 시 정한 비밀번호 4자리</b>로 확인하실 수 있어요.</p>
          <p>날짜나 시간을 바꾸고 싶으시면 <b>매장으로 전화</b> 주세요. 취소하지 않고 옮겨드립니다.</p>
        </div>
      </details>

      <details className="faq">
        <summary>늦으면 어떻게 되나요?</summary>
        <div className="faq-b">
          <p>정시 입장을 위해 <b>예약시간 10분 전</b>에 도착해 주세요.</p>
          <p>지각 시 <b>플레이 시간이 차감</b>되며, <b>15분 이상 지각</b>하시면 테마 특성상 이용이 불가할 수 있습니다. 이 경우 당일 취소로 처리되어 <b>예약금 환불이 어렵습니다.</b></p>
        </div>
      </details>

      {/* 이용 */}
      <h3 className="faq-h">🎭 이용 안내</h3>

      <details className="faq">
        <summary>몇 명까지 할 수 있나요?</summary>
        <div className="faq-b">
          <ul>
            {THEMES.map((t) => (
              <li key={t.id}><b>{t.name}</b> — {THEME_CONTENT[t.id]?.players}</li>
            ))}
          </ul>
          <p className="faq-note">테마마다 추천 인원이 달라요. 각 <Link href="/rooms/bookofduat" className="tlink">테마 페이지</Link>의 주의사항을 확인해 주세요.</p>
        </div>
      </details>

      <details className="faq">
        <summary>술을 마시고 가도 되나요?</summary>
        <div className="faq-b">
          {/* 2026-07-17: 전에는 "(사자의 서 · 락다운시티 · 시간의 영속성)" 이라고 3테마만 적어서
              태초의 신부는 음주 후 이용이 가능한 것처럼 읽혔다. 지금은 4테마 모두 같은 규칙이라
              테마 이름을 아예 뺐다 — 목록을 두면 테마가 늘 때마다 여기도 고쳐야 하고, 또 빠뜨린다. */}
          <p><b>안 됩니다.</b> 안전을 위해 음주 시 테마 이용이 불가합니다. (전 테마 공통)</p>
        </div>
      </details>

      <details className="faq">
        <summary>옷은 어떻게 입고 가면 되나요?</summary>
        <div className="faq-b">
          <p><b>편한 복장</b>을 권장합니다. 테마에 따라 <b>바지 착용</b>을 권해드려요.</p>
          <p>테마 내부에서 생긴 <b>의류·신발 오염은 보상이 어렵습니다.</b> 아끼는 옷은 피해주세요.</p>
        </div>
      </details>

      {/* 오시는 길 */}
      <h3 className="faq-h">🚇 오시는 길</h3>

      <details className="faq">
        <summary>주차 되나요?</summary>
        <div className="faq-b">
          <ul>
            {BOOKING_INFO.parking.map((l, i) => <li key={i}>{l}</li>)}
          </ul>
        </div>
      </details>

      <details className="faq">
        <summary>어떻게 찾아가나요?</summary>
        <div className="faq-b">
          <p><b>{BOOKING_INFO.subway}</b></p>
          <p>매장이 <b>세 곳</b>이고 테마마다 위치가 다릅니다. 예약하신 테마의 매장을 꼭 확인해 주세요.</p>
          <ul>
            <li><b>1호점</b> 강남대로79길 39, B1 — 태초의 신부</li>
            <li><b>2호점</b> 사평대로 353, B1 — 사자의 서</li>
            <li><b>3호점 TGC</b> 강남대로83길 34, B1 — 락다운시티 · 시간의 영속성</li>
          </ul>
        </div>
      </details>

      <div className="notice info" style={{ marginTop: 26 }}>
        찾으시는 답이 없나요? 예약하신 테마의 <b>매장으로 전화</b> 주시면 안내해 드릴게요.
        비즈니스·외주 문의는 <Link href="/business" className="tlink">비즈니스 페이지</Link>를 봐주세요.
      </div>
    </div>
  );
}
