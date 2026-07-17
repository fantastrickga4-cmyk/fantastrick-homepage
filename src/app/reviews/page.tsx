"use client";
import { useEffect, useState } from "react";
import { THEMES } from "@/lib/data";
import { formatDate } from "@/lib/util";

type Review = {
  id: string;
  theme_id: string;
  theme_name: string;
  name: string;
  phone: string;
  rating: number;
  body: string;
  source?: string | null;
  created_at: string;
};

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
          ★
        </span>
      ))}
    </span>
  );
}

export default function ReviewsPage() {
  const [filter, setFilter] = useState("all");
  const [reviews, setReviews] = useState<Review[] | null>(null);
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

  async function load(f = filter) {
    setReviews(null);
    try {
      const res = await fetch(`/api/reviews?theme=${f}`);
      const j = await res.json();
      if (res.ok) setReviews(j.reviews);
      else setReviews([]);
    } catch {
      setReviews([]);
    }
  }

  useEffect(() => {
    load("all");
  }, []);

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
        load(filter);
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
        <h2 className="title" style={{ margin: 0 }}>플레이 후기</h2>
        <button className="btn primary sm" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "닫기" : "후기 쓰기"}
        </button>
      </div>
      <p className="lead" style={{ margin: "6px 0 14px" }}>실제 플레이하신 분들의 생생한 후기예요.</p>

      {/* 작성 폼 */}
      {showForm && (
        <div className="card" style={{ marginBottom: 22 }}>
          {ok && <div className="notice ok">✅ 후기가 접수됐어요. 관리자 확인 후 게시됩니다. 감사합니다!</div>}
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
          {err && <div className="msg-err">⚠️ {err}</div>}
          <button className="btn primary" style={{ width: "100%", justifyContent: "center", marginTop: 6 }} onClick={submit} disabled={loading}>
            {loading ? "등록 중…" : "후기 등록"}
          </button>
        </div>
      )}

      {/* 필터 */}
      <div className="filters">
        <button className={"chip" + (filter === "all" ? " on" : "")} onClick={() => { setFilter("all"); load("all"); }}>전체</button>
        {THEMES.map((t) => (
          <button key={t.id} className={"chip" + (filter === t.id ? " on" : "")} onClick={() => { setFilter(t.id); load(t.id); }}>
            {t.name}
          </button>
        ))}
      </div>

      {/* 목록 */}
      {reviews === null ? (
        <div className="notice info">불러오는 중…</div>
      ) : reviews.length === 0 ? (
        <div className="notice info">아직 등록된 후기가 없어요. 첫 후기를 남겨보세요!</div>
      ) : (
        <div className="rev-list">
          {reviews.map((r) => (
            <div key={r.id} className="rev">
              <div className="rev-theme">{r.theme_name}{r.source && r.source !== "자체" ? <span style={{ marginLeft: 8, fontSize: 11, color: "var(--faint)", fontWeight: 600 }}>· {r.source}</span> : null}</div>
              <div className="rev-h">
                <span className="who">{r.name} <span style={{ color: "var(--faint)", fontWeight: 400, fontSize: 12 }}>{r.phone}</span></span>
                <span className="rev-stars">{"★".repeat(r.rating)}<span style={{ color: "var(--faint)" }}>{"★".repeat(5 - r.rating)}</span></span>
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
