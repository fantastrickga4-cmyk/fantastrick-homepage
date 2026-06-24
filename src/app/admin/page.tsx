"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { STORES, THEMES, TIME_SLOTS } from "@/lib/data";
import { formatDate, formatPhone } from "@/lib/util";

type Reservation = {
  id: string; store_id: string; theme_id: string; theme_name: string;
  date: string; time: string; people: number; name: string; phone: string;
  deposit: number; deposit_paid: boolean; status: string;
  refund_bank: string | null; refund_account: string | null; refund_holder: string | null;
  refund_rate: number | null; refunded: boolean; memo: string | null; source: string;
  created_at: string; confirmed_at: string | null; cancelled_at: string | null;
};
type Stats = {
  total: number; byStatus: Record<string, number>; todayCount: number; depositPaidSum: number;
  themes: { name: string; count: number }[]; activeTotal: number;
};

const ST_LABEL: Record<string, string> = { pending: "대기", confirmed: "확정", cancelled: "취소", noshow: "노쇼" };

export default function AdminPage() {
  const [phase, setPhase] = useState<"checking" | "login" | "in">("checking");
  const [pw, setPw] = useState("");
  const [loginErr, setLoginErr] = useState("");

  const [list, setList] = useState<Reservation[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  // 필터
  const [fStatus, setFStatus] = useState("all");
  const [fStore, setFStore] = useState("all");
  const [fTheme, setFTheme] = useState("all");
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");
  const [q, setQ] = useState("");

  const prevPending = useRef<number | null>(null);
  const [newAlert, setNewAlert] = useState(0);

  const load = useCallback(async (silent = false) => {
    const params = new URLSearchParams();
    if (fStatus !== "all") params.set("status", fStatus);
    if (fStore !== "all") params.set("store", fStore);
    if (fTheme !== "all") params.set("theme", fTheme);
    if (fFrom) params.set("from", fFrom);
    if (fTo) params.set("to", fTo);
    if (q.trim()) params.set("q", q.trim());
    const res = await fetch(`/api/admin/reservations?${params.toString()}`);
    if (res.status === 401) { setPhase("login"); return; }
    const j = await res.json();
    if (res.ok) {
      setList(j.reservations || []);
      setStats(j.stats || null);
      setPhase("in");
      // 새 예약 알림(폴링)
      const pendingNow = j.stats?.byStatus?.pending ?? 0;
      if (silent && prevPending.current !== null && pendingNow > prevPending.current) {
        setNewAlert((n) => n + (pendingNow - prevPending.current!));
      }
      prevPending.current = pendingNow;
    }
  }, [fStatus, fStore, fTheme, fFrom, fTo, q]);

  useEffect(() => { load(); }, [fStatus, fStore, fTheme, fFrom, fTo]); // eslint-disable-line react-hooks/exhaustive-deps

  // 30초마다 자동 새로고침(새 예약 감지)
  useEffect(() => {
    if (phase !== "in") return;
    const t = setInterval(() => load(true), 30000);
    return () => clearInterval(t);
  }, [phase, load]);

  async function doLogin() {
    setLoginErr("");
    const res = await fetch("/api/admin/login", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: pw }),
    });
    if (res.ok) { setPw(""); load(); }
    else { const j = await res.json(); setLoginErr(j.error || "로그인 실패"); }
  }
  async function logout() { await fetch("/api/admin/logout", { method: "POST" }); setPhase("login"); }

  async function patch(id: string, body: Record<string, unknown>) {
    const res = await fetch("/api/admin/reservations", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...body }),
    });
    if (res.ok) load(true);
    else { const j = await res.json(); alert(j.error || "처리 실패"); }
  }

  // ----- 로그인 화면 -----
  if (phase === "checking") return <div className="admin-wrap"><p style={{ color: "var(--muted)" }}>불러오는 중…</p></div>;
  if (phase === "login") {
    return (
      <div className="admin-login">
        <h2 className="title" style={{ fontSize: 24 }}>판타스트릭 관리자</h2>
        <p className="lead" style={{ margin: "8px auto 22px" }}>관리자 비밀번호를 입력하세요.</p>
        <div className="card" style={{ textAlign: "left" }}>
          <div className="field">
            <label>비밀번호</label>
            <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doLogin()} autoFocus />
          </div>
          {loginErr && <div className="msg-err">⚠️ {loginErr}</div>}
          <button className="btn primary" style={{ width: "100%", justifyContent: "center", marginTop: 6 }} onClick={doLogin}>로그인</button>
        </div>
      </div>
    );
  }

  // ----- 대시보드 -----
  return (
    <div className="admin-wrap">
      <div className="admin-top">
        <h2>📋 예약 관리</h2>
        {newAlert > 0 && (
          <button className="btn primary sm" onClick={() => { setNewAlert(0); setFStatus("pending"); }}>
            🔔 새 예약 {newAlert}건
          </button>
        )}
        <div className="sp" />
        <button className="btn ghost sm" onClick={() => load()}>새로고침</button>
        <button className="btn primary sm" onClick={() => setShowAdd(true)}>+ 수동 예약 등록</button>
        <button className="btn sm" onClick={logout}>로그아웃</button>
      </div>

      {/* 통계 */}
      {stats && (
        <>
          <div className="stat-row">
            <div className="stat"><b>{stats.todayCount}</b><span>오늘 예약</span></div>
            <div className="stat amber"><b>{stats.byStatus.pending || 0}</b><span>확정 대기</span></div>
            <div className="stat green"><b>{stats.byStatus.confirmed || 0}</b><span>확정</span></div>
            <div className="stat red"><b>{stats.byStatus.cancelled || 0}</b><span>취소</span></div>
            <div className="stat"><b>{(stats.depositPaidSum || 0).toLocaleString()}</b><span>입금확인 합계(원)</span></div>
          </div>
          {stats.themes.length > 0 && (
            <div className="admin-card">
              <div style={{ fontWeight: 800, marginBottom: 10, fontSize: 14 }}>📊 테마별 인기 (취소 제외)</div>
              <div className="theme-pop">
                {stats.themes.map((t) => (
                  <div key={t.name} className="tp">
                    <span style={{ minWidth: 92 }}>{t.name}</span>
                    <div className="bar"><i style={{ width: (stats.activeTotal ? (t.count / stats.activeTotal) * 100 : 0) + "%" }} /></div>
                    <span style={{ minWidth: 70, textAlign: "right", color: "var(--muted)" }}>{t.count}건 ({stats.activeTotal ? Math.round((t.count / stats.activeTotal) * 100) : 0}%)</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* 필터 */}
      <div className="admin-tools">
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
          <option value="all">상태 전체</option>
          <option value="pending">대기</option>
          <option value="confirmed">확정</option>
          <option value="cancelled">취소</option>
          <option value="noshow">노쇼</option>
        </select>
        <select value={fStore} onChange={(e) => setFStore(e.target.value)}>
          <option value="all">매장 전체</option>
          {STORES.map((s) => <option key={s.id} value={s.id}>{s.tag}</option>)}
        </select>
        <select value={fTheme} onChange={(e) => setFTheme(e.target.value)}>
          <option value="all">테마 전체</option>
          {THEMES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <input type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} title="시작일" />
        <span style={{ color: "var(--faint)" }}>~</span>
        <input type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} title="종료일" />
        <input type="search" placeholder="이름/전화 검색" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} />
        <button className="btn sm" onClick={() => load()}>검색</button>
      </div>

      {/* 목록 */}
      <div style={{ marginBottom: 10, fontSize: 13, color: "var(--muted)" }}>총 {list.length}건</div>
      {list.length === 0 ? (
        <div className="notice info">조건에 맞는 예약이 없습니다.</div>
      ) : (
        list.map((r) => (
          <div key={r.id} className={"rrow" + (openId === r.id ? " open" : "")}>
            <div className="head" onClick={() => setOpenId(openId === r.id ? null : r.id)}>
              <span className="when">{formatDate(r.date)} {r.time}</span>
              <span className="tname">{r.theme_name}</span>
              <span className="who">{r.name} · {formatPhone(r.phone)} · {r.people}명</span>
              {r.source === "phone" && <span className="src-tag">전화</span>}
              <span className={`dep ${r.deposit_paid ? "paid" : ""}`}>{r.deposit_paid ? "입금완료" : "미입금"}</span>
              <span className={`badge-st st-${r.status}`}>{ST_LABEL[r.status] || r.status}</span>
            </div>
            <div className="detail">
              <div className="res-summary" style={{ margin: 0 }}>
                <div className="r"><span>예약금</span><b>{r.deposit.toLocaleString()}원</b></div>
                <div className="r"><span>접수</span><b>{r.created_at?.replace("T", " ").slice(0, 16)}</b></div>
                {r.confirmed_at && <div className="r"><span>확정</span><b>{r.confirmed_at.replace("T", " ").slice(0, 16)}</b></div>}
              </div>

              {/* 취소건: 환불 정보 */}
              {r.status === "cancelled" && (
                <div className="refbox">
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>💸 환불 정보 (환불율 {r.refund_rate ?? "-"}%)</div>
                  <div className="r"><span>은행</span><b>{r.refund_bank || "-"}</b></div>
                  <div className="r"><span>계좌</span><b>{r.refund_account || "-"}</b></div>
                  <div className="r"><span>예금주</span><b>{r.refund_holder || "-"}</b></div>
                  <div className="r"><span>환불 금액(예상)</span><b>{Math.round((r.deposit * (r.refund_rate ?? 0)) / 100).toLocaleString()}원</b></div>
                  <div className="act-row">
                    <button className={"btn sm " + (r.refunded ? "ghost" : "primary")} onClick={() => patch(r.id, { refunded: !r.refunded })}>
                      {r.refunded ? "✓ 환불완료됨 (취소)" : "환불 완료 처리"}
                    </button>
                  </div>
                </div>
              )}

              {/* 메모 */}
              <div className="field" style={{ marginTop: 12, marginBottom: 8 }}>
                <label>메모</label>
                <textarea rows={2} defaultValue={r.memo || ""} id={`memo-${r.id}`} placeholder="관리자 메모" />
              </div>

              {/* 액션 */}
              <div className="act-row">
                <button className="btn sm" onClick={() => { const v = (document.getElementById(`memo-${r.id}`) as HTMLTextAreaElement).value; patch(r.id, { memo: v }); }}>메모 저장</button>
                <button className={"btn sm " + (r.deposit_paid ? "ghost" : "primary")} onClick={() => patch(r.id, { deposit_paid: !r.deposit_paid })}>
                  {r.deposit_paid ? "입금 취소" : "입금 확인"}
                </button>
                {r.status !== "confirmed" && r.status !== "cancelled" && (
                  <button className="btn sm green" style={{ background: "var(--green)", color: "#062" }} onClick={() => patch(r.id, { status: "confirmed" })}>예약 확정</button>
                )}
                {r.status !== "noshow" && r.status !== "cancelled" && (
                  <button className="btn sm" onClick={() => patch(r.id, { status: "noshow" })}>노쇼 처리</button>
                )}
                {r.status !== "cancelled" && (
                  <button className="btn sm danger" onClick={() => { if (confirm("이 예약을 취소 처리할까요?")) patch(r.id, { status: "cancelled" }); }}>취소 처리</button>
                )}
                {r.status === "cancelled" && (
                  <button className="btn sm ghost" onClick={() => patch(r.id, { status: "pending" })}>취소 되돌리기(대기)</button>
                )}
              </div>
            </div>
          </div>
        ))
      )}

      {showAdd && <ManualAdd onClose={() => setShowAdd(false)} onDone={() => { setShowAdd(false); load(); }} />}
    </div>
  );
}

function ManualAdd({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [themeId, setThemeId] = useState(THEMES[0].id);
  const [date, setDate] = useState("");
  const [time, setTime] = useState(TIME_SLOTS[0]);
  const [people, setPeople] = useState(2);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [memo, setMemo] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setErr(""); setBusy(true);
    const res = await fetch("/api/admin/reservations", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ themeId, date, time, people, name, phone, memo }),
    });
    setBusy(false);
    if (res.ok) onDone();
    else { const j = await res.json(); setErr(j.error || "등록 실패"); }
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <button className="close-x" onClick={onClose}>✕</button>
        <h3>수동 예약 등록 (전화 예약)</h3>
        <div className="field"><label>테마</label>
          <select value={themeId} onChange={(e) => setThemeId(e.target.value)}>
            {THEMES.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.storeTag})</option>)}
          </select>
        </div>
        <div className="grid2">
          <div className="field"><label>날짜</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="field"><label>시간</label>
            <select value={time} onChange={(e) => setTime(e.target.value)}>{TIME_SLOTS.map((t) => <option key={t} value={t}>{t}</option>)}</select>
          </div>
        </div>
        <div className="grid2">
          <div className="field"><label>인원</label>
            <select value={people} onChange={(e) => setPeople(Number(e.target.value))}>{[1,2,3,4,5,6,7,8].map((n) => <option key={n} value={n}>{n}명</option>)}</select>
          </div>
          <div className="field"><label>이름</label><input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="홍길동" /></div>
        </div>
        <div className="field"><label>전화번호</label><input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="010-1234-5678" /></div>
        <div className="field"><label>메모 (선택)</label><input type="text" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="요청사항 등" /></div>
        {err && <div className="msg-err">⚠️ {err}</div>}
        <div className="modal-btns" style={{ marginTop: 14 }}>
          <button className="btn ghost" onClick={onClose}>닫기</button>
          <button className="btn primary" onClick={submit} disabled={busy}>{busy ? "등록 중…" : "등록"}</button>
        </div>
      </div>
    </div>
  );
}
