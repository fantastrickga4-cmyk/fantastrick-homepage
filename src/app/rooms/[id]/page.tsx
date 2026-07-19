import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { THEMES, STORES, themeById } from "@/lib/data";
import { THEME_CONTENT, BOOKING_INFO, BIZ_INFO } from "@/lib/theme-content";
import { getConfig, depositOf } from "@/lib/settings";
import { IconLock } from "@/components/Icon";

// 테마 상세 — 기존 fantastrick.co.kr/rooms/{id}/ 를 옮긴 화면.
// 손님이 "고르고 결제하기 전에 알아야 할 것"(가격·인원·주의사항·오시는 길)이 여기 다 있어야 한다.

export function generateStaticParams() {
  return THEMES.map((t) => ({ id: t.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const t = themeById(id);
  if (!t) return { title: "테마를 찾을 수 없습니다 — 판타스트릭" };
  const c = THEME_CONTENT[id];
  return {
    title: `${t.name} — 판타스트릭 ${t.storeTag}`,
    description: c?.synopsis.join(" ").slice(0, 120) || `${t.name} · ${t.minutes}분 · ${c?.players ?? ""}`,
    openGraph: { title: `${t.name} — 판타스트릭`, images: t.poster ? [t.poster] : undefined },
  };
}

const won = (n: number) => n.toLocaleString() + "원";

export default async function RoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const theme = THEMES.find((t) => t.id === id);
  const content = THEME_CONTENT[id];
  if (!theme || !content) notFound();

  const store = STORES.find((s) => s.id === theme.store);
  // 예약금은 관리자가 바꿀 수 있으므로 설정에서 읽는다 (화면에 박아두면 바꿔도 안 바뀜)
  const cfg = await getConfig();
  const deposit = depositOf(cfg, theme.id, theme.deposit);
  const others = THEMES.filter((t) => t.id !== id);

  return (
    <div className="room">
      {/* 히어로 */}
      <section className="room-hero">
        {theme.poster && <Image src={theme.poster} alt="" fill priority className="rh-bg" sizes="100vw" />}
        <div className="rh-veil" />
        <div className="rh-in">
          <span className="eyebrow">{theme.storeTag}{theme.murder ? " · 머더룸" : ""}</span>
          <h1 className="title">{theme.name}</h1>
        </div>
      </section>

      <div className="room-wrap">
        {/* 한눈에 — 난이도·인원·시간 */}
        <div className="rm-spec">
          <div className="sp-i">
            <span className="sp-l">난이도</span>
            <b className="sp-v diff-locks" aria-label={`5단계 중 ${theme.difficulty}단계`}>
              {Array.from({ length: theme.difficulty }, (_, i) => <IconLock key={i} />)}
              <span className="sp-off">{Array.from({ length: Math.max(0, 5 - theme.difficulty) }, (_, i) => <IconLock key={i} />)}</span>
            </b>
          </div>
          <div className="sp-i"><span className="sp-l">인원</span><b className="sp-v">{content.players}</b></div>
          <div className="sp-i"><span className="sp-l">소요시간</span><b className="sp-v">{theme.minutes}분</b></div>
          <div className="sp-i"><span className="sp-l">장르</span><b className="sp-v" style={{ fontSize: 15 }}>{theme.genres.join(" · ")}</b></div>
        </div>

        {/* 시놉시스 + 포스터 */}
        <section className="rm-story">
          {theme.poster && (
            <div className="rm-poster">
              <Image src={theme.poster} alt={`${theme.name} 포스터`} width={300} height={424} sizes="(max-width:760px) 60vw, 300px" />
            </div>
          )}
          <div className="rm-syn">
            {content.synopsis.map((line, i) => <p key={i}>{line}</p>)}
            <ul className="rm-notices">
              {content.notices.map((n, i) => {
                // "머더룸 — 본문" 처럼 앞에 라벨이 붙은 줄은 라벨과 본문을 나눠 배치한다.
                // 그냥 한 줄로 두면 본문이 길어질 때 라벨 아래까지 파고들어 읽기 어렵다
                // (모바일에서 "…게임 테마입 / 니다. (방탈출 테마가…" 처럼 잘렸음).
                const sep = n.indexOf(" — ");
                if (sep === -1) return <li key={i}>※ {n}</li>;
                return (
                  <li key={i} className="rm-tag">
                    <span className="rm-tag-l">※ {n.slice(0, sep)} —</span>
                    <span className="rm-tag-b">{n.slice(sep + 3)}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {/* 이용 금액 — 손님이 제일 궁금한 것 */}
        <section className="rm-card">
          <h2 className="rm-h">이용 금액</h2>
          <table className="rm-price">
            <tbody>
              {content.pricing.rows.map((r) => (
                <tr key={r.label}>
                  <th>{r.label}</th>
                  <td>{won(r.won)}{content.pricing.kind === "perPerson" && <span className="per"> / 인</span>}</td>
                </tr>
              ))}
              <tr className="dep">
                <th>예약금</th>
                <td>{won(deposit)}<span className="per"> (계좌이체)</span></td>
              </tr>
            </tbody>
          </table>
          <p className="rm-note">{content.pricing.note}</p>
          <div className="rm-acct">
            <span>입금 계좌</span><b>{BOOKING_INFO.account}</b>
          </div>
          <Link href={`/reserve?theme=${theme.id}`} className="btn primary" style={{ marginTop: 16 }}>
            이 테마 예약하기 →
          </Link>
        </section>

        {/* 오시는 길 */}
        <section className="rm-card">
          <h2 className="rm-h">오시는 길</h2>
          <div className="rm-kv"><span>매장</span><b>{store?.name}</b></div>
          <div className="rm-kv"><span>주소</span><b>{store?.addr}</b></div>
          <div className="rm-kv"><span>전화</span><b><a href={`tel:${(store?.phone || "").replace(/[^0-9]/g, "")}`} className="tlink">{store?.phone}</a></b></div>
          <div className="rm-kv"><span>지하철</span><b>{BOOKING_INFO.subway}</b></div>
          <ul className="rm-list" style={{ marginTop: 10 }}>
            {BOOKING_INFO.parking.map((l, i) => <li key={i}>{l}</li>)}
          </ul>
        </section>

        {/* 다른 테마 */}
        <section>
          <h2 className="rm-h" style={{ marginBottom: 12 }}>다른 테마</h2>
          <div className="rm-others">
            {others.map((t) => (
              <Link key={t.id} href={`/rooms/${t.id}`} className="ro-card">
                {t.poster && <Image src={t.poster} alt="" width={220} height={300} sizes="220px" />}
                <div className="ro-in">
                  <span className="ro-tag">{t.storeTag}</span>
                  <b>{t.name}</b>
                  <span className="ro-meta">{THEME_CONTENT[t.id]?.players} · {t.minutes}분</span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* 사업자 정보 */}
        <section className="rm-biz">
          {Object.entries(BIZ_INFO).map(([k, v]) => (
            <span key={k}>{k} {v}</span>
          ))}
        </section>
      </div>
    </div>
  );
}
