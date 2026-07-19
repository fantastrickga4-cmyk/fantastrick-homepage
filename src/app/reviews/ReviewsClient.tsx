"use client";
import { useMemo, useState } from "react";
import { THEMES } from "@/lib/data";
import { formatDate } from "@/lib/util";
import type { Review } from "./types";
import { IconStar, IconCheck, IconWarn } from "@/components/Icon";

function Stars({ n, onPick }: { n: number; onPick?: (v: number) => void }) {
  return (
    <span className="stars">
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={"star" + (i <= n ? " on" : "")}
          onClick={onPick ? () => onPick(i) : undefined}
          style={{ cursor: onPick ? "pointer" : "default" }}
        >
          <IconStar />
        </span>
      ))}
    </span>
  );
}

// 후기 목록은 **서버가 미리 그려서** initialReviews 로 넘겨준다(화면 튐 방지 — page.tsx 설명 참고).
// 그래서 여기서는 처음에 불러오지 않고, 후기를 새로 쓴 뒤에만 다시 불러온다.
export default function ReviewsClient({ initialReviews }: { initialReviews: Review[] }) {
  const [filter, setFilter] = useState("all");
  const [reviews, setReviews] = useState<Review[]>(initialReviews);
  const [showForm, setShowForm] = useState(false);

  // 작성 폼 상태
  const [themeId, setThemeId] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState(false);
  const [loading, setLoading] = useState(false);

  // 테마 고르기는 **이미 받아둔 목록에서 걸러내기만** 한다.
  //   전에는 칩을 누를 때마다 서버에 다시 물어봐서 (1) 목록이 잠깐 사라졌다 나타나며 화면이 튀고
  //   (2) 느린 인터넷에선 몇 초씩 기다렸다. 지금은 누르는 즉시 바뀐다.
  const shown = useMemo(
    () => (filter === "all" ? reviews : reviews.filter((r) => r.theme_id === filter)),
    [reviews, filter],
  );

  async function reload() {
    try {
      const res = await fetch("/api/reviews?theme=all");
      const j = await res.json();
      if (res.ok) setReviews(j.reviews);
    } catch {
      /* 실패해도 이미 보이는 목록은 그대로 둔다 */
    }
  }

  async function submit() {
    setErr(""); setOk(false);
    if (!themeId) return setErr("테마를 선택해 주세요.");
    if (!name.trim()) return setErr("이름(닉네임)을 입력해 주세요.");
    if (!phone.trim()) return setErr("전화번호를 입력해 주세요.");
    if (rating < 1) return setErr("별점을 선택해 주세요.");
    if (body.trim().length < 5) return setErr("후기를 5자 이상 입력해 주세요.");
    setLoading(true);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ themeId, name, phone, rating, body }),
      });
      const j = await res.json();
      if (!res.ok) { setErr(j.error || "등록에 실패했습니다."); }
      else {
        setOk(true);
        setName(""); setPhone(""); setRating(0); setBody(""); setThemeId("");
        reload();
        setTimeout(() => setShowForm(false), 2600);
      }
    } catch {
      setErr("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="formwrap" style={{ maxWidth: 680 }}>
      <div className="page-top" />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <h1 className="title" style={{ margin: 0 }}>플레이 후기</h1>
        <button className="btn primary sm" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "닫기" : "후기 쓰기"}
        </button>
      </div>
      <p className="lead" style={{ margin: "6px 0 14px" }}>실제 플레이하신 분들의 생생한 후기예요.</p>

      {/* 작성 폼 */}
      {showForm && (
        <div className="card" style={{ marginBottom: 22 }}>
          {ok && <div className="notice ok"><IconCheck /> 후기가 접수됐어요. 관리자 확인 후 게시됩니다. 감사합니다!</div>}
          <div className="field">
            <label htmlFor="rw-theme">테마</label>
            <select id="rw-theme" value={themeId} onChange={(e) => setThemeId(e.target.value)}>
              <option value="">테마 선택</option>
              {THEMES.map((t) => (
                <option key={t.id} value={t.id}>{t.name} ({t.storeTag})</option>
              ))}
            </select>
          </div>
          <div className="grid2">
            <div className="field">
              <label htmlFor="rw-name">이름 / 닉네임</label>
              <input id="rw-name" type="text" value={name} placeholder="홍길동" onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="rw-phone">전화번호 (예약 확인용)</label>
              <input id="rw-phone" type="tel" value={phone} placeholder="010-1234-5678" onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label>별점</label>
            <Stars n={rating} onPick={setRating} />
          </div>
          <div className="field">
            <label htmlFor="rw-body">후기</label>
            <textarea id="rw-body" rows={4} value={body} placeholder="플레이 경험을 들려주세요 (5자 이상)" onChange={(e) => setBody(e.target.value)} />
          </div>
          <div className="hint" style={{ marginBottom: 12 }}>
            ※ 해당 전화번호로 그 테마를 예약한 기록이 있어야 후기를 남길 수 있어요. 작성한 후기는 <b>관리자 확인 후 게시</b>됩니다. 전화번호는 가운데 자리를 가려 표시됩니다.
          </div>
          {err && <div className="msg-err"><IconWarn /> {err}</div>}
          <button className="btn primary" style={{ width: "100%", justifyContent: "center", marginTop: 6 }} onClick={submit} disabled={loading}>
            {loading ? "등록 중…" : "후기 등록"}
          </button>
        </div>
      )}

      {/* 필터 — aria-pressed 로 "지금 이게 눌린 상태"를 화면낭독기에도 알린다(색만으로 알리지 않기) */}
      <div className="filters">
        <button
          className={"chip" + (filter === "all" ? " on" : "")}
          aria-pressed={filter === "all"}
          onClick={() => setFilter("all")}
        >
          전체
        </button>
        {THEMES.map((t) => (
          <button
            key={t.id}
            className={"chip" + (filter === t.id ? " on" : "")}
            aria-pressed={filter === t.id}
            onClick={() => setFilter(t.id)}
          >
            {t.name}
          </button>
        ))}
      </div>

      {/* 목록 */}
      {shown.length === 0 ? (
        <div className="notice info">
          {reviews.length === 0
            ? "아직 등록된 후기가 없어요. 첫 후기를 남겨보세요!"
            : "이 테마의 후기는 아직 없어요."}
        </div>
      ) : (
        <div className="rev-list">
          {shown.map((r) => (
            <div key={r.id} className="rev">
              <div className="rev-theme">{r.theme_name}{r.source && r.source !== "자체" ? <span style={{ marginLeft: 8, fontSize: 11, color: "var(--faint)", fontWeight: 600 }}>· {r.source}</span> : null}</div>
              <div className="rev-h">
                <span className="who">{r.name} <span style={{ color: "var(--faint)", fontWeight: 400, fontSize: 12 }}>{r.phone}</span></span>
                <span className="rev-stars" aria-label={`5점 만점에 ${r.rating}점`}>
                  <span aria-hidden="true">
                    {Array.from({ length: r.rating }, (_, i) => <IconStar key={i} />)}
                    <span style={{ color: "var(--faint)" }}>{Array.from({ length: 5 - r.rating }, (_, i) => <IconStar key={i} />)}</span>
                  </span>
                </span>
              </div>
              <div className="rev-body">{r.body}</div>
              <div className="date" style={{ fontSize: 12, color: "var(--faint)", marginTop: 8 }}>{formatDate(r.created_at.slice(0, 10))}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
