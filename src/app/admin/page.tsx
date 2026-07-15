"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { STORES, THEMES, TIME_SLOTS, DOW_LABELS, slotsForThemeDate, type StoreSlots, type SlotSchedule } from "@/lib/data";
import { isRefundPending, refundAmount } from "@/lib/money";
import { EXPIRE_MINUTES, GRACE_UNTIL_HOUR } from "@/lib/expire";
import { formatDate, formatPhone } from "@/lib/util";

type Reservation = {
  id: string; store_id: string; theme_id: string; theme_name: string;
  date: string; time: string; people: number; name: string; phone: string;
  deposit: number; deposit_paid: boolean; deposit_payer: string | null; status: string;
  refund_bank: string | null; refund_account: string | null; refund_holder: string | null;
  refund_rate: number | null; refunded: boolean; memo: string | null; source: string;
  created_at: string; confirmed_at: string | null; cancelled_at: string | null;
  paid_at: string | null; refunded_at: string | null; // 돈이 실제로 오간 시각
};
type Stats = {
  total: number; byStatus: Record<string, number>; pendingUnpaid: number; todayCount: number; depositPaidSum: number;
  weekCount: number; monthConfirmedDeposit: number;
  pendingUnpaidSum: number; refundPending: number; refundPendingSum: number; // 입금·환불 탭용
  themes: { name: string; count: number }[]; activeTotal: number;
};
const ST_LABEL: Record<string, string> = { pending: "대기", confirmed: "확정", cancelled: "취소", noshow: "노쇼" };

/* 전화번호 — 폰에서 누르면 바로 전화/문자.
   글자로만 두면 번호를 눈으로 읽고 손으로 다시 찍어야 하고, 오타 나면 엉뚱한 사람에게 걸림. */
function Phone({ v }: { v: string }) {
  if (!v) return null;
  const raw = v.replace(/[^0-9]/g, "");
  return (
    <span className="ph">
      <a href={`tel:${raw}`} title="전화 걸기">{formatPhone(v)}</a>
      <a href={`sms:${raw}`} className="ph-sms" title="문자 보내기" aria-label="문자 보내기">💬</a>
    </span>
  );
}
// 로그인하면 "오늘 뭐 해야 하지"부터. 매일 하는 일(예약·돈)이 앞, 가끔 하는 일은 뒤.
const TABS = [
  { k: "home", label: "오늘" }, { k: "res", label: "예약" }, { k: "money", label: "입금·환불" },
  { k: "cont", label: "리뷰·공지" }, { k: "set", label: "설정" },
];

export default function AdminPage() {
  const [phase, setPhase] = useState<"checking" | "login" | "in">("checking");
  const [id, setId] = useState(""); const [pw, setPw] = useState(""); const [loginErr, setLoginErr] = useState("");
  const [tab, setTab] = useState("home");

  async function check() {
    const res = await fetch("/api/admin/reservations?status=__probe__");
    if (res.status === 401) setPhase("login"); else setPhase("in");
  }
  useEffect(() => { check(); }, []);

  // 입금·환불 탭 뱃지 — 다른 탭을 보고 있어도 "돈으로 처리할 일"이 몇 건인지 보이게.
  // status=__count__ 는 매칭 0건이라 목록은 비지만 stats 는 전체 기준이라 정확하다(__probe__ 와 같은 수법).
  const [todo, setTodo] = useState(0);
  useEffect(() => {
    if (phase !== "in") return;
    const f = () => fetch("/api/admin/reservations?status=__count__")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j?.stats) setTodo((j.stats.pendingUnpaid || 0) + (j.stats.refundPending || 0)); })
      .catch(() => {});
    f();
    const t = setInterval(f, 30000);
    return () => clearInterval(t);
  }, [phase]);

  async function doLogin() {
    setLoginErr("");
    const res = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, password: pw }) });
    if (res.ok) { setId(""); setPw(""); setPhase("in"); } else { const j = await res.json(); setLoginErr(j.error || "로그인 실패"); }
  }
  async function logout() { await fetch("/api/admin/logout", { method: "POST" }); setPhase("login"); }

  if (phase === "checking") return <div className="admin-wrap"><p style={{ color: "var(--muted)" }}>불러오는 중…</p></div>;
  if (phase === "login") {
    return (
      <div className="admin-login">
        <h2 className="title" style={{ fontSize: 24 }}>판타스트릭 관리자</h2>
        <p className="lead" style={{ margin: "8px auto 22px" }}>관리자 아이디와 비밀번호를 입력하세요.</p>
        <div className="card" style={{ textAlign: "left" }}>
          <div className="field"><label>아이디</label>
            <input type="text" value={id} onChange={(e) => setId(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doLogin()} placeholder="fantastrick" autoComplete="username" autoFocus />
          </div>
          <div className="field"><label>비밀번호</label>
            <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doLogin()} autoComplete="current-password" />
          </div>
          {loginErr && <div className="msg-err">⚠️ {loginErr}</div>}
          <button className="btn primary" style={{ width: "100%", justifyContent: "center", marginTop: 6 }} onClick={doLogin}>로그인</button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-wrap">
      <div className="admin-top">
        <h2>🎭 판타스트릭 관리자</h2>
        <div className="sp" />
        <button className="btn sm" onClick={logout}>로그아웃</button>
      </div>
      <div className="subtab" style={{ marginBottom: 18 }}>
        {TABS.map((t) => (
          <a key={t.k} className={tab === t.k ? "on" : ""} style={{ cursor: "pointer" }} onClick={() => setTab(t.k)}>
            {t.label}
            {t.k === "money" && todo > 0 && <span className="vt-badge">{todo}</span>}
          </a>
        ))}
      </div>
      {tab === "home" && <HomeTab onGo={setTab} />}
      {tab === "res" && <ReservationsTab />}
      {tab === "money" && <MoneyTab />}
      {tab === "cont" && <ContentTab />}
      {tab === "set" && <SettingsHub />}
    </div>
  );
}

/* ============ 오늘 (관리자 홈) ============
   로그인하면 "오늘 뭐 해야 하지?"가 바로 보이게. 예전엔 7월 달력이 떠서
   날짜 누르고 → 테마 탭 4번 누르고 → 입금·환불 탭 또 눌러야 알 수 있었음.
   Checkfront "Daily Manifest" / FareHarbor Manifest 패턴. */
function HomeTab({ onGo }: { onGo: (tab: string) => void }) {
  const [rows, setRows] = useState<Reservation[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [, setNow] = useState(Date.now);
  const today = todayKst();

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/reservations?from=${today}&to=${today}`);
    if (res.ok) { const j = await res.json(); setRows(j.reservations || []); setStats(j.stats || null); }
  }, [today]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]); // 새 예약 자동 반영
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);

  if (!rows) return <p style={{ color: "var(--muted)" }}>불러오는 중…</p>;

  // 오늘 살아있는 예약을 시간순으로 (전 테마 한 화면 — 테마 탭 4번 안 눌러도 됨)
  const live = rows.filter((r) => r.status !== "cancelled").sort((a, b) => a.time.localeCompare(b.time));
  const nowHm = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(11, 16);
  const next = live.find((r) => r.time >= nowHm && r.status !== "noshow");
  const nPay = stats?.pendingUnpaid || 0;
  const nRef = stats?.refundPending || 0;
  const todo = nPay + nRef;

  return (
    <>
      <div className="admin-top" style={{ marginBottom: 14 }}>
        <h3 style={{ margin: 0, fontSize: 18 }}>{formatDate(today)} · 오늘 {live.length}팀</h3>
        <div className="sp" />
        <button className="btn ghost sm" onClick={load}>새로고침</button>
      </div>

      {/* 다음 손님 — 오늘 화면에서 제일 크게. "지금 뭘 준비해야 하나"의 답 */}
      {next ? (
        <div className="nextbox">
          <span className="nb-lab">다음 손님</span>
          <b className="nb-time">{next.time}</b>
          <span className="nb-who">{next.name} · {next.people}명</span>
          <span className="nb-theme">{next.theme_name}</span>
          <span className="sp" />
          <Phone v={next.phone} />
          <span className={`dep ${next.deposit_paid ? "paid" : ""}`}>{next.deposit_paid ? "입금완료" : "미입금"}</span>
        </div>
      ) : (
        <div className="notice ok" style={{ marginBottom: 14 }}>
          {live.length === 0 ? "오늘은 예약이 없어요." : "오늘 예약이 다 끝났어요. 수고하셨습니다!"}
        </div>
      )}

      {/* 돈으로 처리할 일 — 있을 때만 (0건이면 앰버가 거짓 경보가 됨) */}
      {todo > 0 && (
        <div className="notice warn" style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <b>💰 처리할 일 {todo}건</b>
          <span style={{ color: "var(--muted)", fontSize: 13.5 }}>
            {nPay > 0 && `입금 확인 ${nPay}건`}{nPay > 0 && nRef > 0 && " · "}{nRef > 0 && `환불 ${nRef}건`}
          </span>
          <span className="sp" />
          <button className="btn sm primary" onClick={() => onGo("money")}>처리하러 가기 →</button>
        </div>
      )}

      {stats && (
        <div className="stat-row sub3" style={{ marginBottom: 16 }}>
          <div className="stat"><b>{live.length}</b><span>오늘 예약</span></div>
          <div className="stat"><b>{live.filter((r) => r.deposit_paid).length}</b><span>입금완료</span></div>
          <div className="stat"><b>{stats.weekCount}</b><span>이번 주(월~일)</span></div>
        </div>
      )}

      <div className="admin-card">
        <div className="day-head">
          <b>오늘 예약</b>
          <span style={{ color: "var(--muted)", fontSize: 13 }}>전 매장·전 테마 시간순</span>
          <span className="sp" />
          <button className="btn sm ghost" onClick={() => onGo("res")}>날짜별 보기 →</button>
        </div>
        {live.length === 0 ? (
          <div className="notice info">오늘은 예약이 없습니다.</div>
        ) : live.map((r) => {
          const past = r.time < nowHm;
          return (
            <div key={r.id} className={"slotrow" + (past ? " blocked" : "")}>
              <span className="s-time">🕘 {r.time}</span>
              <span className="who"><b>{r.name}</b> · {r.people}명</span>
              <span className="tname">{r.theme_name} <span style={{ color: "var(--faint)", fontSize: 12 }}>{STORES.find((s) => s.id === r.store_id)?.tag || ""}</span></span>
              <Phone v={r.phone} />
              <span className="rt">
                {r.source === "phone" && <span className="src-tag">전화</span>}
                <span className={`dep ${r.deposit_paid ? "paid" : ""}`}>{r.deposit_paid ? "입금완료" : "미입금"}</span>
                <span className={`badge-st st-${r.status}`}>{ST_LABEL[r.status] || r.status}</span>
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ============ 예약 관리 탭 ============
   기본은 "날짜별" — 기존 fantastrick.co.kr(Booked) 관리자와 같은 흐름:
   달력에서 날짜 클릭 → 테마 탭(건수 배지) → 그 날 시간대별 손님 목록.
   "목록·검색"은 날짜를 모를 때 이름·전화로 찾고, 취소건을 보고 되돌리는 용도(날짜별엔 없는 기능).
   ※ "월 전체" 보기는 삭제함(2026-07-15) — 날짜별과 같은 달력인데 읽기 전용이라 손실 없음.  */
function ReservationsTab() {
  const [view, setView] = useState<"day" | "list">("day");
  return (
    <>
      <div className="viewtoggle">
        <button className={view === "day" ? "on" : ""} onClick={() => setView("day")}>📅 날짜별</button>
        <button className={view === "list" ? "on" : ""} onClick={() => setView("list")}>📋 목록·검색</button>
      </div>
      {view === "day" ? <DayView /> : <ListView />}
    </>
  );
}

/* 리뷰·공지 — 둘 다 "손님에게 보이는 것" 관리라 묶음 */
function ContentTab() {
  const [v, setV] = useState<"rev" | "notice">("rev");
  return (
    <>
      <div className="viewtoggle">
        <button className={v === "rev" ? "on" : ""} onClick={() => setV("rev")}>후기</button>
        <button className={v === "notice" ? "on" : ""} onClick={() => setV("notice")}>📢 팝업 공지</button>
      </div>
      {v === "rev" ? <ReviewsAdminTab /> : <NoticeTab />}
    </>
  );
}

/* 설정 — 예약 규칙·휴무·문자 문구. 전부 "가끔 바꾸는 것" */
function SettingsHub() {
  const [v, setV] = useState<"gen" | "block" | "sms">("gen");
  return (
    <>
      <div className="viewtoggle">
        <button className={v === "gen" ? "on" : ""} onClick={() => setV("gen")}>예약 규칙·시간표</button>
        <button className={v === "block" ? "on" : ""} onClick={() => setV("block")}>🚫 휴무·마감</button>
        <button className={v === "sms" ? "on" : ""} onClick={() => setV("sms")}>📨 문자 문구</button>
      </div>
      {v === "gen" ? <SettingsTab /> : v === "block" ? <SlotsTab /> : <SmsTab />}
    </>
  );
}

function ListView() {
  const [list, setList] = useState<Reservation[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [fStatus, setFStatus] = useState("all"); const [fStore, setFStore] = useState("all");
  const [fTheme, setFTheme] = useState("all"); const [fFrom, setFFrom] = useState(""); const [fTo, setFTo] = useState(""); const [q, setQ] = useState("");
  const prevPending = useRef<number | null>(null); const [newAlert, setNewAlert] = useState(0);

  const load = useCallback(async (silent = false) => {
    const p = new URLSearchParams();
    if (fStatus !== "all") p.set("status", fStatus);
    if (fStore !== "all") p.set("store", fStore);
    if (fTheme !== "all") p.set("theme", fTheme);
    if (fFrom) p.set("from", fFrom); if (fTo) p.set("to", fTo); if (q.trim()) p.set("q", q.trim());
    const res = await fetch(`/api/admin/reservations?${p.toString()}`);
    if (!res.ok) return;
    const j = await res.json();
    setList(j.reservations || []); setStats(j.stats || null);
    const pendingNow = j.stats?.byStatus?.pending ?? 0;
    if (silent && prevPending.current !== null && pendingNow > prevPending.current) setNewAlert((n) => n + (pendingNow - prevPending.current!));
    prevPending.current = pendingNow;
  }, [fStatus, fStore, fTheme, fFrom, fTo, q]);

  useEffect(() => { load(); }, [fStatus, fStore, fTheme, fFrom, fTo]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setInterval(() => load(true), 30000); return () => clearInterval(t); }, [load]);

  async function patch(id: string, body: Record<string, unknown>) {
    const res = await fetch("/api/admin/reservations", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...body }) });
    if (res.ok) load(true); else { const j = await res.json(); alert(j.error || "처리 실패"); }
  }

  // CSV 내보내기 (현재 목록) — 고객 비밀번호(pin)는 포함하지 않음
  function exportCsv() {
    if (list.length === 0) { alert("내보낼 예약이 없습니다."); return; }
    const cell = (v: unknown) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ["일시", "테마", "매장", "이름", "전화번호", "인원", "예약금", "상태", "신청일시"];
    const rows = list.map((r) => [
      `${r.date} ${r.time}`,
      r.theme_name,
      STORES.find((s) => s.id === r.store_id)?.tag || r.store_id,
      r.name,
      formatPhone(r.phone),
      `${r.people}명`,
      r.deposit,
      ST_LABEL[r.status] || r.status,
      r.created_at?.replace("T", " ").slice(0, 16) || "",
    ]);
    const csv = [header, ...rows].map((row) => row.map(cell).join(",")).join("\r\n");
    // UTF-8 BOM: 엑셀 한글 깨짐 방지
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `예약_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="admin-top" style={{ marginBottom: 14 }}>
        {/* 💰 입금대기 필터는 [입금·환불] 탭으로 옮김 — 돈 처리 입구는 한 곳 */}
        {newAlert > 0 && <button className="btn primary sm" onClick={() => { setNewAlert(0); setFStatus("pending"); }}>🔔 새 예약 {newAlert}건</button>}
        <div className="sp" />
        <button className="btn ghost sm" onClick={() => load()}>새로고침</button>
        <button className="btn ghost sm" onClick={exportCsv}>⬇ CSV 내보내기</button>
        <button className="btn primary sm" onClick={() => setShowAdd(true)}>+ 수동 예약 등록</button>
      </div>
      {stats && (
        <>
          {/* 건수 통계만. 돈 숫자(월 확정 예약금·입금확인 합계)는 [입금·환불] 탭으로 이사.
              색은 "내가 처리해야 하는 것"(앰버)에만 */}
          <div className="stat-row">
            <div className="stat"><b>{stats.todayCount}</b><span>오늘 예약</span></div>
            <div className="stat amber"><b>{stats.byStatus.pending || 0}</b><span>확정 대기(미입금)</span></div>
            <div className="stat"><b>{stats.weekCount}</b><span>이번 주 예약(월~일)</span></div>
            <div className="stat"><b>{stats.byStatus.confirmed || 0}</b><span>확정</span></div>
            <div className="stat"><b>{stats.byStatus.cancelled || 0}</b><span>취소</span></div>
          </div>
          {stats.themes.length > 0 && (
            <div className="admin-card">
              <div style={{ fontWeight: 800, marginBottom: 10, fontSize: 14 }}>📊 테마별 인기 (취소 제외)</div>
              <div className="theme-pop">
                {stats.themes.map((t) => (
                  <div key={t.name} className="tp">
                    <span style={{ minWidth: 92 }}>{t.name}</span>
                    <div className="bar"><i style={{ width: (stats.activeTotal ? (t.count / stats.activeTotal) * 100 : 0) + "%" }} /></div>
                    <span style={{ minWidth: 78, textAlign: "right", color: "var(--muted)" }}>{t.count}건 ({stats.activeTotal ? Math.round((t.count / stats.activeTotal) * 100) : 0}%)</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
      <div className="admin-tools">
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
          <option value="all">상태 전체</option><option value="pending">대기</option><option value="confirmed">확정</option><option value="cancelled">취소</option><option value="noshow">노쇼</option>
        </select>
        <select value={fStore} onChange={(e) => setFStore(e.target.value)}><option value="all">매장 전체</option>{STORES.map((s) => <option key={s.id} value={s.id}>{s.tag}</option>)}</select>
        <select value={fTheme} onChange={(e) => setFTheme(e.target.value)}><option value="all">테마 전체</option>{THEMES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
        <input type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} /><span style={{ color: "var(--faint)" }}>~</span>
        <input type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} />
        <input type="search" placeholder="이름/전화 검색" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} />
        <button className="btn sm" onClick={() => load()}>검색</button>
      </div>
      <div style={{ marginBottom: 10, fontSize: 13, color: "var(--muted)" }}>총 {list.length}건</div>
      {list.length === 0 ? <div className="notice info">조건에 맞는 예약이 없습니다.</div> : list.map((r) => (
        <div key={r.id} className={"rrow" + (openId === r.id ? " open" : "")}>
          <div className="head" onClick={() => setOpenId(openId === r.id ? null : r.id)}>
            <span className="when">{formatDate(r.date)} {r.time}</span>
            <span className="tname">{r.theme_name}</span>
            <span className="who">{r.name} · <Phone v={r.phone} /> · {r.people}명</span>
            <span className="rt">
              {r.source === "phone" && <span className="src-tag">전화</span>}
              <span className={`dep ${r.deposit_paid ? "paid" : ""}`}>{r.deposit_paid ? "입금완료" : "미입금"}</span>
              <span className={`badge-st st-${r.status}`}>{ST_LABEL[r.status] || r.status}</span>
            </span>
          </div>
          <div className="detail">
            <div className="res-summary" style={{ margin: 0 }}>
              <div className="r"><span>예약금</span><b>{r.deposit.toLocaleString()}원</b></div>
              <div className="r"><span>접수</span><b>{r.created_at?.replace("T", " ").slice(0, 16)}</b></div>
              {r.confirmed_at && <div className="r"><span>확정</span><b>{r.confirmed_at.replace("T", " ").slice(0, 16)}</b></div>}
            </div>
            {/* 환불 처리는 [입금·환불 › 환불 처리] 탭이 유일한 입구 — 여기선 상태만 알려준다
                (입구가 두 곳이면 "여기서 했나 저기서 했나" 혼동) */}
            {isRefundPending(r) && (
              <div className="refbox">
                💸 <b>환불 대기 {refundAmount(r).toLocaleString()}원</b> (환불율 {r.refund_rate}%) —
                <b> [입금·환불 › 환불 처리]</b> 탭에서 계좌 복사하고 보내주세요.
              </div>
            )}
            {r.status === "cancelled" && r.refunded && (
              <div className="refbox"><span style={{ color: "var(--muted)" }}>✓ 환불 완료된 예약이에요 ({refundAmount(r).toLocaleString()}원)</span></div>
            )}
            <div className="field" style={{ marginTop: 12, marginBottom: 8 }}>
              <label>메모</label><textarea rows={2} defaultValue={r.memo || ""} id={`memo-${r.id}`} placeholder="관리자 메모" />
            </div>
            <div className="act-row">
              <button className="btn sm" onClick={() => patch(r.id, { memo: (document.getElementById(`memo-${r.id}`) as HTMLTextAreaElement).value })}>메모 저장</button>
              <button className={"btn sm " + (r.deposit_paid ? "ghost" : "primary")} onClick={() => patch(r.id, { deposit_paid: !r.deposit_paid })}>{r.deposit_paid ? "입금 취소" : "입금 확인"}</button>
              {r.status !== "confirmed" && r.status !== "cancelled" && <button className="btn sm ok" onClick={() => patch(r.id, { status: "confirmed" })}>예약 확정</button>}
              {r.status !== "noshow" && r.status !== "cancelled" && <button className="btn sm" onClick={() => patch(r.id, { status: "noshow" })}>노쇼 처리</button>}
              {r.status !== "cancelled" && <button className="btn sm danger" onClick={() => { if (confirm("이 예약을 취소 처리할까요?")) patch(r.id, { status: "cancelled" }); }}>취소 처리</button>}
              {r.status === "cancelled" && <button className="btn sm ghost" onClick={() => patch(r.id, { status: "pending" })}>취소 되돌리기</button>}
            </div>
          </div>
        </div>
      ))}
      {showAdd && <ManualAdd onClose={() => setShowAdd(false)} onDone={() => { setShowAdd(false); load(); }} />}
    </>
  );
}

/* ---------- 날짜별 보기 (기존 Booked "예약확인" 이식) ---------- */
type AdminCfg = {
  timeSlots: string[];
  themeSlots?: Record<string, SlotSchedule>; storeSlots?: Record<string, StoreSlots>;
};
function todayKst() { return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10); }

function DayView() {
  const t0 = todayKst();
  const [ym, setYm] = useState(() => ({ y: Number(t0.slice(0, 4)), m: Number(t0.slice(5, 7)) - 1 }));
  const [pick, setPick] = useState(t0);
  const [rows, setRows] = useState<Reservation[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [cfg, setCfg] = useState<AdminCfg | null>(null);
  const [activeTheme, setActiveTheme] = useState(THEMES[0].id);
  const [detail, setDetail] = useState<Reservation | null>(null);
  const [add, setAdd] = useState<{ themeId: string; date: string; time: string } | null>(null);

  const loadMonth = useCallback(async () => {
    const mm = String(ym.m + 1).padStart(2, "0");
    const last = String(new Date(ym.y, ym.m + 1, 0).getDate()).padStart(2, "0");
    const res = await fetch(`/api/admin/reservations?from=${ym.y}-${mm}-01&to=${ym.y}-${mm}-${last}`);
    if (res.ok) { const j = await res.json(); setRows(j.reservations || []); }
  }, [ym]);
  const loadBlocks = useCallback(() => fetch("/api/admin/slots").then((r) => r.json()).then((j) => setBlocks(j.blocks || [])).catch(() => {}), []);
  useEffect(() => { loadMonth(); }, [loadMonth]);
  useEffect(() => { loadBlocks(); fetch("/api/admin/settings").then((r) => r.json()).then(setCfg).catch(() => {}); }, [loadBlocks]);
  useEffect(() => { const t = setInterval(loadMonth, 30000); return () => clearInterval(t); }, [loadMonth]); // 새 예약 자동 반영
  const reload = () => { loadMonth(); loadBlocks(); };

  // 취소 건은 칸을 차지하지 않음(그 시간은 다시 비어 있는 것)
  const live = rows.filter((r) => r.status !== "cancelled");
  const byDay: Record<string, Reservation[]> = {};
  for (const r of live) (byDay[r.date] = byDay[r.date] || []).push(r);
  const dayRows = byDay[pick] || [];

  const theme = THEMES.find((t) => t.id === activeTheme) || THEMES[0];
  const slots = cfg ? slotsForThemeDate(cfg.themeSlots, cfg.storeSlots, cfg.timeSlots, theme.id, theme.store, pick) : [];
  const themeRows = dayRows.filter((r) => r.theme_id === theme.id);
  // 시간표에 없는 시간에 잡힌 예약(옛 시간대·수동 등록)도 빠뜨리지 않고 함께 보여줌
  const allTimes = Array.from(new Set([...slots, ...themeRows.map((r) => r.time)])).sort();
  const blockFor = (time: string) =>
    blocks.find((b) => b.date === pick && (!b.theme_id || b.theme_id === theme.id) && (!b.time || b.time === time));

  async function unblock(id: string) {
    const res = await fetch(`/api/admin/slots?id=${id}`, { method: "DELETE" });
    if (res.ok) loadBlocks(); else alert("해제 실패");
  }
  async function block(time: string) {
    const res = await fetch("/api/admin/slots", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: pick, time, themeId: theme.id, reason: "관리자 마감" }),
    });
    if (res.ok) loadBlocks(); else alert("마감 실패");
  }

  const firstDow = new Date(ym.y, ym.m, 1).getDay();
  const days = new Date(ym.y, ym.m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(firstDow).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const dstr = (d: number) => `${ym.y}-${String(ym.m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12 }}>
        <button className="btn sm" onClick={() => setYm((s) => (s.m === 0 ? { y: s.y - 1, m: 11 } : { y: s.y, m: s.m - 1 }))}>◀</button>
        <b style={{ fontSize: 17 }}>{ym.y}년 {ym.m + 1}월</b>
        <button className="btn sm" onClick={() => setYm((s) => (s.m === 11 ? { y: s.y + 1, m: 0 } : { y: s.y, m: s.m + 1 }))}>▶</button>
        <div className="sp" />
        <button className="btn ghost sm" onClick={() => { setYm({ y: Number(t0.slice(0, 4)), m: Number(t0.slice(5, 7)) - 1 }); setPick(t0); }}>오늘</button>
        <button className="btn ghost sm" onClick={reload}>새로고침</button>
      </div>

      <div className="cal-grid day-cal">
        {DOW_LABELS.map((w) => <div key={w} className="cal-dow">{w}</div>)}
        {cells.map((d, i) => d === null ? <div key={i} /> : (
          <div key={i} className={"cal-cell" + (pick === dstr(d) ? " pick" : "") + (dstr(d) === t0 ? " today" : "")}
            onClick={() => setPick(dstr(d))}>
            <span className="cal-d">{d}</span>
            {byDay[dstr(d)] && <span className="cal-n">{byDay[dstr(d)].length}건</span>}
          </div>
        ))}
      </div>

      <div className="theme-tabs">
        {THEMES.map((t) => {
          const n = dayRows.filter((r) => r.theme_id === t.id).length;
          return (
            <button key={t.id} className={"tt-btn" + (activeTheme === t.id ? " on" : "")} onClick={() => setActiveTheme(t.id)}>
              {t.name}{n > 0 && <span className="tt-badge">{n}</span>}
            </button>
          );
        })}
      </div>

      <div className="admin-card" style={{ marginTop: 0 }}>
        <div className="day-head">
          <b>{theme.name}</b> <span style={{ color: "var(--muted)" }}>{formatDate(pick)} 예약</span>
          <span className="sp" />
          <span style={{ fontSize: 12.5, color: "var(--faint)" }}>{theme.storeTag} · {theme.minutes}분</span>
        </div>

        {!cfg ? <p style={{ color: "var(--muted)", fontSize: 13 }}>시간표 불러오는 중…</p>
          : allTimes.length === 0 ? <div className="notice info">이 날은 예약을 받지 않는 요일입니다. (시간표 없음)</div>
            : allTimes.map((time) => {
              const r = themeRows.find((x) => x.time === time);
              const bk = blockFor(time);
              const offSchedule = !slots.includes(time);
              // 시작시각만 표시 — 기존 사이트도 끝시각은 숨김(booked_hide_end_times=on)이고,
              // 저장된 끝시각 자체가 의미 없는 값(같은 시간표가 10분/60분으로 뒤섞여 저장돼 있음).
              // 테마 소요시간은 위 머리말에 한 번만 표시.
              return (
                <div key={time} className={"slotrow" + (r ? " taken" : "") + (bk && !r ? " blocked" : "")}>
                  <span className="s-time">🕘 {time}</span>
                  {r ? (
                    <>
                      <button className="s-guest" onClick={() => setDetail(r)} title="눌러서 상세·처리">
                        ✏️ {r.name} · {r.people}명
                      </button>
                      {/* 전화는 버튼 밖에 — 버튼 안에 링크를 넣을 수 없음 */}
                      <Phone v={r.phone} />
                      <span className="rt">
                        {r.source === "phone" && <span className="src-tag">전화</span>}
                        <span className={`dep ${r.deposit_paid ? "paid" : ""}`}>{r.deposit_paid ? "입금완료" : "미입금"}</span>
                        <span className={`badge-st st-${r.status}`}>{ST_LABEL[r.status] || r.status}</span>
                      </span>
                    </>
                  ) : bk ? (
                    <>
                      <span className="s-state closed">🚫 마감됨{bk.reason ? ` · ${bk.reason}` : ""}</span>
                      <span className="rt">
                        <button className="btn sm ghost" onClick={() => unblock(bk.id)}>열기</button>
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="s-state open">예약 없음</span>
                      {offSchedule && <span className="src-tag">시간표 밖</span>}
                      <span className="rt">
                        <button className="btn sm ghost" onClick={() => block(time)}>마감</button>
                        <button className="btn sm" onClick={() => setAdd({ themeId: theme.id, date: pick, time })}>+ 예약 넣기</button>
                      </span>
                    </>
                  )}
                </div>
              );
            })}
      </div>

      {detail && <ResDetail r={detail} onClose={() => setDetail(null)} onDone={() => { setDetail(null); reload(); }} />}
      {add && <ManualAdd preset={add} onClose={() => setAdd(null)} onDone={() => { setAdd(null); reload(); }} />}
    </div>
  );
}

/* 손님 카드 — 이 전화번호의 과거 이력 + 아직 안 한 테마 + 변경 이력.
   데이터는 이미 쌓이고 있는데 화면에서 안 쓰던 것을 꺼내 보여줌. */
function GuestHistory({ phone, currentId }: { phone: string; currentId: string }) {
  const [rows, setRows] = useState<Reservation[] | null>(null);
  const [logs, setLogs] = useState<{ id: string; action: string; detail: string | null; created_at: string }[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/reservations?q=${encodeURIComponent(phone)}`)
      .then((r) => r.json()).then((j) => setRows(j.reservations || [])).catch(() => setRows([]));
    fetch(`/api/admin/reservation-logs?id=${currentId}`)
      .then((r) => r.json()).then((j) => setLogs(j.logs || [])).catch(() => {});
  }, [phone, currentId]);

  if (!rows) return null;
  const me = rows.find((x) => x.id === currentId);
  const past = rows.filter((x) => x.id !== currentId);
  const visited = rows.filter((x) => x.status === "confirmed" || x.status === "noshow");
  const noshow = rows.filter((x) => x.status === "noshow").length;
  const doneThemes = new Set(visited.map((x) => x.theme_id));
  const notYet = THEMES.filter((t) => !doneThemes.has(t.id));
  const nth = visited.length + 1;

  // 이상한 예약 경고 — 1인 운영이라 실수를 잡아줄 사람이 없으니 화면이 잡는다.
  const warns: string[] = [];
  if (me) {
    // ① 같은 날 같은 시간에 다른 테마도 예약 → 몸이 두 개가 아닌 이상 못 옴
    const clash = past.filter((x) => x.status !== "cancelled" && x.date === me.date && x.time === me.time);
    if (clash.length) warns.push(`같은 날 ${me.time}에 ${clash.map((c) => c.theme_name).join("·")}도 예약돼 있어요 — 같은 시간에 두 테마는 못 해요`);
    // ② 같은 날 여러 건 (가능은 함 — 연달아 두 테마. 알려만 준다)
    const sameDay = past.filter((x) => x.status !== "cancelled" && x.date === me.date && x.time !== me.time);
    if (sameDay.length) warns.push(`같은 날 ${sameDay.length}건 더 있어요 (${sameDay.map((c) => `${c.time} ${c.theme_name}`).join(", ")})`);
    // ③ 상습 취소
    const cancels = past.filter((x) => x.status === "cancelled").length;
    if (cancels >= 3) warns.push(`이 번호로 취소가 ${cancels}번 있었어요`);
  }

  return (
    <div className="gcard">
      <div className="gc-top">
        <b>👤 손님 이력</b>
        {visited.length > 0 ? <span className="badge-st st-confirmed">{nth}번째 방문</span> : <span className="badge-st st-pending">첫 방문</span>}
        {noshow > 0 && <span className="badge-st st-noshow">⚠️ 노쇼 {noshow}회</span>}
        <span className="sp" />
        <button className="btn sm ghost" onClick={() => setOpen(!open)}>{open ? "접기 ▲" : `자세히 (예약 ${rows.length}건) ▼`}</button>
      </div>

      {warns.map((w, i) => (
        <div key={i} className="gc-warn">⚠️ {w}</div>
      ))}

      {notYet.length > 0 && visited.length > 0 && (
        <p className="hint" style={{ margin: "8px 0 0" }}>
          아직 안 한 테마: <b style={{ color: "var(--text)" }}>{notYet.map((t) => t.name).join(" · ")}</b> — 권해드릴 수 있어요
        </p>
      )}

      {open && (
        <div style={{ marginTop: 10 }}>
          {past.length > 0 && (
            <>
              <div className="gc-h">지난 예약 {past.length}건</div>
              {past.map((x) => (
                <div key={x.id} className="gc-row">
                  <span style={{ minWidth: 118 }}>{formatDate(x.date)} {x.time}</span>
                  <span style={{ color: "var(--cyan)", flex: 1 }}>{x.theme_name}</span>
                  <span className={`badge-st st-${x.status}`}>{ST_LABEL[x.status] || x.status}</span>
                </div>
              ))}
            </>
          )}
          <div className="gc-h" style={{ marginTop: past.length ? 12 : 0 }}>이 예약의 변경 이력</div>
          {logs.length === 0 ? (
            <p className="hint" style={{ margin: 0 }}>기록이 없어요. (이 기능이 생기기 전 예약이거나, 아직 변경이 없었어요)</p>
          ) : logs.map((l) => (
            <div key={l.id} className="gc-row">
              <span style={{ minWidth: 118, color: "var(--faint)" }}>{l.created_at.replace("T", " ").slice(5, 16)}</span>
              <b style={{ minWidth: 84 }}>{l.action}</b>
              <span style={{ color: "var(--muted)" }}>{l.detail || ""}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* 예약 1건 상세·처리 (날짜별 보기에서 손님 이름 클릭 시) */
function ResDetail({ r, onClose, onDone }: { r: Reservation; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [memo, setMemo] = useState(r.memo || "");
  const [move, setMove] = useState(false);
  const [mDate, setMDate] = useState(r.date);
  const [mTime, setMTime] = useState(r.time);
  const [mPeople, setMPeople] = useState(r.people);
  const [cfg, setCfg] = useState<AdminCfg | null>(null);
  // 모달이 열릴 때 미리 시간표를 받아둔다.
  // ("옮기기"를 누른 뒤 받으면, 로딩되기 전 잠깐 후보가 현재 시간 하나만 보여 "옮길 데가 없네?"로 오해함)
  useEffect(() => { fetch("/api/admin/settings").then((x) => x.json()).then(setCfg).catch(() => {}); }, []);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    const res = await fetch("/api/admin/reservations", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: r.id, ...body }),
    });
    setBusy(false);
    if (res.ok) onDone(); else { const j = await res.json(); alert(j.error || "처리 실패"); }
  }

  // 옮길 수 있는 시간 후보 = 그 테마·그 날짜의 시간표 (+ 지금 시간은 목록에 없어도 유지)
  const theme = THEMES.find((t) => t.id === r.theme_id);
  const moveSlots = (() => {
    const list = cfg && theme ? slotsForThemeDate(cfg.themeSlots, cfg.storeSlots, cfg.timeSlots, theme.id, theme.store, mDate) : [];
    return Array.from(new Set([...list, mTime])).filter(Boolean).sort();
  })();
  const changed = mDate !== r.date || mTime !== r.time || mPeople !== r.people;

  async function doMove() {
    if (!confirm(`${r.name}님 예약을 옮길까요?\n\n${formatDate(r.date)} ${r.time}${r.people !== mPeople ? ` (${r.people}명)` : ""}\n→ ${formatDate(mDate)} ${mTime}${r.people !== mPeople ? ` (${mPeople}명)` : ""}\n\n취소·재등록이 아니라 그대로 옮기는 거라 입금·환불 상태는 유지됩니다.`)) return;
    await patch({ date: mDate, time: mTime, people: mPeople });
  }
  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <button className="close-x" onClick={onClose}>✕</button>
        <h3>{r.theme_name} · {formatDate(r.date)} {r.time}</h3>
        <div className="res-summary">
          <div className="r"><span>이름</span><b>{r.name}</b></div>
          <div className="r"><span>전화</span><b><Phone v={r.phone} /></b></div>
          <div className="r"><span>인원</span><b>{r.people}명</b></div>
          <div className="r"><span>예약금</span><b>{r.deposit.toLocaleString()}원 {r.deposit_paid ? "(입금완료)" : "(미입금)"}</b></div>
          {r.deposit_payer && <div className="r"><span>입금자명</span><b>{r.deposit_payer}{r.deposit_payer !== r.name && <span style={{ color: "var(--amber)", fontWeight: 400, fontSize: 12 }}> · 예약자와 다름</span>}</b></div>}
          <div className="r"><span>상태</span><b>{ST_LABEL[r.status] || r.status}</b></div>
          <div className="r"><span>접수</span><b>{r.created_at?.replace("T", " ").slice(0, 16)}</b></div>
        </div>

        {/* 예약 옮기기 — "한 시간만 미뤄주세요"가 제일 흔한 요청인데 지금까진 취소→재등록뿐이었음 */}
        {r.status !== "cancelled" && (
          <div className="mvbox">
            {!move ? (
              <button className="btn sm ghost" onClick={() => setMove(true)}>🕘 시간·날짜 옮기기</button>
            ) : (
              <>
                <div className="gc-h">예약 옮기기 — 취소하지 않고 그대로 옮겨요 (입금·환불 상태 유지)</div>
                <div className="mv-row">
                  <input type="date" value={mDate} onChange={(e) => setMDate(e.target.value)} disabled={!cfg} />
                  {/* 시간표가 오기 전엔 못 고르게 — 후보가 현재 시간뿐인 걸 "옮길 데 없음"으로 오해하지 않게 */}
                  <select value={mTime} onChange={(e) => setMTime(e.target.value)} disabled={!cfg}>
                    {moveSlots.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <select value={mPeople} onChange={(e) => setMPeople(Number(e.target.value))} disabled={!cfg}>
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}명</option>)}
                  </select>
                  <button className="btn sm primary" disabled={busy || !changed || !cfg} onClick={doMove}>{busy ? "옮기는 중…" : "옮기기"}</button>
                  <button className="btn sm ghost" onClick={() => { setMove(false); setMDate(r.date); setMTime(r.time); setMPeople(r.people); }}>취소</button>
                </div>
                {!cfg ? <p className="hint" style={{ margin: "6px 0 0" }}>시간표 불러오는 중…</p>
                  : <p className="hint" style={{ margin: "6px 0 0" }}>{THEMES.find((t) => t.id === r.theme_id)?.name}의 <b>{formatDate(mDate)}</b> 시간표예요. 이미 찬 칸으로는 못 옮겨요.</p>}
              </>
            )}
          </div>
        )}

        <GuestHistory phone={r.phone} currentId={r.id} />

        <div className="field" style={{ marginTop: 12 }}>
          <label>메모</label><textarea rows={2} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="관리자 메모" />
        </div>
        <div className="act-row">
          <button className="btn sm" disabled={busy} onClick={() => patch({ memo })}>메모 저장</button>
          <button className={"btn sm " + (r.deposit_paid ? "ghost" : "primary")} disabled={busy} onClick={() => patch({ deposit_paid: !r.deposit_paid })}>{r.deposit_paid ? "입금 취소" : "입금 확인"}</button>
          {/* 지금 해야 할 일 하나만 파랗게 — 미입금이면 [입금 확인], 입금됐으면 [예약 확정] */}
          {r.status !== "confirmed" && r.status !== "cancelled" && <button className={"btn sm " + (r.deposit_paid ? "primary" : "ok")} disabled={busy} onClick={() => patch({ status: "confirmed" })}>예약 확정</button>}
          {r.status !== "noshow" && r.status !== "cancelled" && <button className="btn sm" disabled={busy} onClick={() => patch({ status: "noshow" })}>노쇼 처리</button>}
          {r.status !== "cancelled" && <button className="btn sm danger" disabled={busy} onClick={() => { if (confirm("이 예약을 취소 처리할까요?")) patch({ status: "cancelled" }); }}>취소 처리</button>}
          {r.status === "cancelled" && <button className="btn sm ghost" disabled={busy} onClick={() => patch({ status: "pending" })}>취소 되돌리기</button>}
        </div>
      </div>
    </div>
  );
}

function ManualAdd({ onClose, onDone, preset }: { onClose: () => void; onDone: () => void; preset?: { themeId: string; date: string; time: string } }) {
  const [themeId, setThemeId] = useState(preset?.themeId || THEMES[0].id); const [date, setDate] = useState(preset?.date || ""); const [time, setTime] = useState(preset?.time || TIME_SLOTS[0]);
  const [people, setPeople] = useState(2); const [name, setName] = useState(""); const [phone, setPhone] = useState(""); const [memo, setMemo] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const [cfg, setCfg] = useState<AdminCfg | null>(null);
  useEffect(() => { fetch("/api/admin/settings").then((r) => r.json()).then(setCfg).catch(() => {}); }, []);

  // 시간 후보 = 그 테마·그 날짜의 시간표 (+ 이미 고른 시간은 목록에 없어도 유지)
  const timeOptions = useMemo(() => {
    const th = THEMES.find((t) => t.id === themeId);
    const list = cfg && th ? slotsForThemeDate(cfg.themeSlots, cfg.storeSlots, cfg.timeSlots, th.id, th.store, date) : TIME_SLOTS;
    return Array.from(new Set([...list, ...(time ? [time] : [])])).sort();
  }, [cfg, themeId, date, time]);

  async function submit() {
    setErr(""); setBusy(true);
    const res = await fetch("/api/admin/reservations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ themeId, date, time, people, name, phone, memo }) });
    setBusy(false);
    if (res.ok) onDone(); else { const j = await res.json(); setErr(j.error || "등록 실패"); }
  }
  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <button className="close-x" onClick={onClose}>✕</button>
        <h3>수동 예약 등록 (전화 예약)</h3>
        <div className="field"><label>테마</label><select value={themeId} onChange={(e) => setThemeId(e.target.value)}>{THEMES.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.storeTag})</option>)}</select></div>
        <div className="grid2">
          <div className="field"><label>날짜</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="field"><label>시간</label><select value={time} onChange={(e) => setTime(e.target.value)}>{timeOptions.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
        </div>
        <div className="grid2">
          <div className="field"><label>인원</label><select value={people} onChange={(e) => setPeople(Number(e.target.value))}>{[1,2,3,4,5,6,7,8].map((n) => <option key={n} value={n}>{n}명</option>)}</select></div>
          <div className="field"><label>이름</label><input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="홍길동" /></div>
        </div>
        <div className="field"><label>전화번호</label><input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="010-1234-5678" /></div>
        <div className="field"><label>메모 (선택)</label><input type="text" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="요청사항 등" /></div>
        {err && <div className="msg-err">⚠️ {err}</div>}
        <div className="modal-btns" style={{ marginTop: 14 }}><button className="btn ghost" onClick={onClose}>닫기</button><button className="btn primary" onClick={submit} disabled={busy}>{busy ? "등록 중…" : "등록"}</button></div>
      </div>
    </div>
  );
}

/* ============ 시간대(차단) 탭 ============ */
type Block = { id: string; store_id: string | null; theme_id: string | null; date: string; time: string | null; reason: string | null };
function SlotsTab() {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [date, setDate] = useState(""); const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const load = () => fetch("/api/admin/slots").then((r) => r.json()).then((j) => setBlocks(j.blocks || [])).catch(() => {});
  useEffect(() => { load(); }, []);
  // 여기서는 "하루 전체 휴무"만 만든다.
  //   · 시간 하나씩 마감하는 건 [예약 › 날짜별]에서 그 칸의 "마감" 버튼으로 (중복이라 여기선 뺌)
  //   · 예전엔 여기서 시간을 고를 수 있었는데, 그 목록이 옛 전역 시간대라
  //     실제 테마 시간표(예: 사자의 서 12:30·13:40)와 안 맞아 아무 칸도 못 막는 상태였음
  async function add() {
    setErr(""); if (!date) return setErr("날짜를 선택해 주세요.");
    const res = await fetch("/api/admin/slots", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date, time: null, themeId: null, reason }) });
    if (res.ok) { setDate(""); setReason(""); load(); } else { const j = await res.json(); setErr(j.error || "추가 실패"); }
  }
  async function del(id: string) { if (!confirm("이 휴무·마감을 해제(열기)할까요?")) return; const res = await fetch(`/api/admin/slots?id=${id}`, { method: "DELETE" }); if (res.ok) load(); }
  return (
    <div>
      <div className="admin-card">
        <b>🚫 휴무일 추가</b>
        <p className="hint" style={{ margin: "4px 0 12px" }}>
          고른 날짜를 <b>하루 종일 · 전 테마</b> 예약을 안 받습니다. (임시휴무·전세 등)
          <br />시간 하나만 막고 싶으면 <b>[예약 › 날짜별]</b>에서 그 시간의 <b>마감</b> 버튼을 누르세요.
        </p>
        <div className="admin-tools" style={{ marginBottom: 0 }}>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <input type="text" placeholder="사유(선택) 예: 내부 공사" value={reason} onChange={(e) => setReason(e.target.value)} />
          <button className="btn sm" onClick={add}>휴무일 추가</button>
        </div>
        {err && <div className="msg-err">⚠️ {err}</div>}
      </div>
      {/* 날짜별 보기에서 만든 칸 단위 마감도 여기 다 보인다(어디서 막았는지 놓치지 않게) */}
      <div style={{ marginTop: 8 }}>
        <div className="hint" style={{ marginBottom: 8 }}>지금 닫아둔 날짜·시간 (날짜별 보기에서 마감한 것도 함께 보여요)</div>
        {blocks.length === 0 ? <div className="notice info">닫아둔 날짜·시간이 없습니다.</div> : blocks.map((b) => (
          <div key={b.id} className="rrow"><div className="head" style={{ cursor: "default" }}>
            <span className="when">{formatDate(b.date)}</span>
            <span className="tname">{b.time ? `${b.time} 마감` : "하루 전체 휴무"}</span>
            <span className="who">{b.theme_id ? (THEMES.find((t) => t.id === b.theme_id)?.name || b.theme_id) : "전 테마"}{b.reason ? ` · ${b.reason}` : ""}</span>
            <span className="rt"><button className="btn sm ghost" onClick={() => del(b.id)}>열기(해제)</button></span>
          </div></div>
        ))}
      </div>
    </div>
  );
}

/* ============ 입금·환불 탭 ============
   무통장입금 전용 화면. 카페24 "입금 전 관리" 패턴 — 해야 할 일은 큐(처리하면 사라짐),
   끝난 일은 뒤의 "입출금 내역"으로. 상단 집계는 포트원 결제내역 패턴(받은 돈/돌려준 돈/실수령).
   ⚠️ 결제는 전부 카카오뱅크 수동 이체. 여기 버튼은 "사장님이 손으로 한 일을 기록"하는 것. */
function MoneyTab() {
  const [v, setV] = useState<"pay" | "refund" | "ledger">("pay");
  const [stats, setStats] = useState<Stats | null>(null);
  const [tick, setTick] = useState(0); // 자식이 처리하면 올려서 집계 재조회

  const loadStats = useCallback(() => {
    fetch("/api/admin/reservations?status=__count__").then((r) => r.json())
      .then((j) => setStats(j.stats || null)).catch(() => {});
  }, []);
  useEffect(() => { loadStats(); }, [loadStats, tick]);
  useEffect(() => { const t = setInterval(loadStats, 30000); return () => clearInterval(t); }, [loadStats]);

  const nPay = stats?.pendingUnpaid || 0;
  const nRef = stats?.refundPending || 0;
  const done = () => setTick((n) => n + 1);

  return (
    <>
      <div className="notice info" style={{ marginBottom: 14 }}>
        💳 예약금은 <b>전부 무통장입금</b>이에요 (카카오뱅크 3333-09-7175706 승현수).
        여기 버튼은 <b>사장님이 은행앱에서 직접 하신 일을 기록</b>하는 거예요 — 돈이 자동으로 오가지 않습니다.
      </div>

      {stats && (
        <div className="stat-row dash4">
          {/* 색은 "내가 처리해야 함"(앰버)에만. 0건이면 앰버를 빼야 거짓 경보가 안 됨 */}
          <div className={"stat" + (nPay ? " amber" : "")}>
            <b>{nPay}</b><span>입금 대기 · {(stats.pendingUnpaidSum || 0).toLocaleString()}원</span>
          </div>
          <div className={"stat" + (nRef ? " amber" : "")}>
            <b>{nRef}</b><span>환불 대기 · {(stats.refundPendingSum || 0).toLocaleString()}원</span>
          </div>
          <div className="stat"><b>{(stats.monthConfirmedDeposit || 0).toLocaleString()}</b><span>이번 달 확정 예약금(원)</span></div>
          <div className="stat"><b>{(stats.depositPaidSum || 0).toLocaleString()}</b><span>입금확인 누적(원)</span></div>
        </div>
      )}

      <div className="viewtoggle">
        <button className={v === "pay" ? "on" : ""} onClick={() => setV("pay")}>
          💰 입금 확인{nPay > 0 && <span className="vt-badge">{nPay}</span>}
        </button>
        <button className={v === "refund" ? "on" : ""} onClick={() => setV("refund")}>
          💸 환불 처리{nRef > 0 && <span className="vt-badge">{nRef}</span>}
        </button>
        <button className={v === "ledger" ? "on" : ""} onClick={() => setV("ledger")}>📒 입출금 내역</button>
      </div>

      {v === "pay" ? <PayQueue onDone={done} /> : v === "refund" ? <RefundQueue onDone={done} /> : <Ledger />}
    </>
  );
}

/* 💰 입금 확인 — 30분 지나면 자동취소(expire.ts)라 사실상 "지금 이 순간" 화면.
   그래서 ①남은 시간 카운트다운 ②30초 폴링 ③이름+금액을 나란히(은행앱 대사) 가 전부. */
function PayQueue({ onDone }: { onDone: () => void }) {
  const [list, setList] = useState<Reservation[]>([]);
  const [expired, setExpired] = useState<Reservation[]>([]);
  const [openExp, setOpenExp] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [payer, setPayer] = useState<Record<string, string>>({}); // 예약id → 통장에 찍힌 이름
  const [, setNow] = useState(Date.now); // 카운트다운 1초마다 리렌더

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([
      fetch("/api/admin/reservations?status=pending&deposit=unpaid"),
      fetch("/api/admin/reservations?status=cancelled"),
    ]);
    if (a.ok) setList(((await a.json()).reservations || []) as Reservation[]);
    if (b.ok) {
      const rows = ((await b.json()).reservations || []) as Reservation[];
      // 시간초과 자동취소는 expire.ts 가 남기는 메모로 판별 (전용 칼럼이 없어 이 방법뿐)
      const today = todayKst();
      setExpired(rows.filter((r) => (r.memo || "").includes("자동 취소") && r.cancelled_at?.slice(0, 10) === today));
    }
    setLoaded(true);
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  // 남은 시간 — 자정 이후 접수 건은 그날 오전 10시 30분까지 봐주므로(expire.ts) 그 기준으로 센다.
  // 안 그러면 새벽 예약이 "0분 남음"으로 보이는데 실제로는 안 취소돼 화면이 거짓말을 한다.
  function remainInfo(createdAt: string): { min: number; grace: boolean } {
    const c = new Date(createdAt).getTime();
    const normal = c + EXPIRE_MINUTES * 60000;
    // 접수 시각이 KST 자정~오전10시 사이인가?
    const kst = new Date(c + 9 * 3600 * 1000);
    const isMidnightBooking = kst.getUTCHours() < GRACE_UNTIL_HOUR;
    let deadline = normal;
    if (isMidnightBooking) {
      const g = new Date(c + 9 * 3600 * 1000);
      g.setUTCHours(GRACE_UNTIL_HOUR, EXPIRE_MINUTES, 0, 0); // 그날 10:30 (KST)
      const graceMs = g.getTime() - 9 * 3600 * 1000;
      deadline = Math.max(normal, graceMs);
    }
    return { min: Math.max(0, Math.ceil((deadline - Date.now()) / 60000)), grace: isMidnightBooking && deadline > normal };
  }

  async function confirmPay(r: Reservation) {
    const p = (payer[r.id] || "").trim();
    const who = p && p !== r.name ? `\n입금자명: ${p} (예약자와 다름)` : "";
    if (!confirm(`${r.name}님 ${r.deposit.toLocaleString()}원 입금을 확인하셨나요?${who}\n\n확정 처리되고 손님에게 입금확정 문자가 나갑니다.`)) return;
    setBusy(r.id);
    const res = await fetch("/api/admin/reservations", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: r.id, deposit_paid: true, ...(p ? { deposit_payer: p } : {}) }),
    });
    setBusy(null);
    if (res.ok) { load(); onDone(); } else alert((await res.json()).error || "처리 실패");
  }

  if (!loaded) return <p style={{ color: "var(--muted)" }}>불러오는 중…</p>;

  return (
    <>
      <div className="admin-top" style={{ marginBottom: 12 }}>
        <span style={{ fontSize: 13, color: "var(--muted)" }}>
          카카오뱅크 앱에서 <b>입금자 이름·금액</b>을 보고 아래와 맞춰 보세요. 30초마다 자동 새로고침돼요.
        </span>
        <div className="sp" />
        <button className="btn ghost sm" onClick={load}>새로고침</button>
      </div>

      {list.length === 0 ? (
        <div className="notice ok">✅ 입금 대기 없음 — 다 처리하셨어요.</div>
      ) : list.map((r) => {
        const { min: m, grace } = remainInfo(r.created_at);
        return (
          <div key={r.id} className="rrow">
            <div className="head" style={{ cursor: "default" }}>
              <span className={"when" + (m <= 5 ? " urgent" : "")}>
                ⏳ {m >= 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${m}분`} 남음
                {grace && <span className="src-tag" style={{ marginLeft: 6 }}>새벽 예약</span>}
              </span>
              {/* 이름 = 은행앱 입금자명과 맞추는 키라 굵게 */}
              <span className="who"><b>{r.name}</b> · <Phone v={r.phone} /></span>
              <span className="tname">{r.theme_name} · {formatDate(r.date)} {r.time} · {r.people}명</span>
              <span className="amt">{r.deposit.toLocaleString()}원</span>
              <span className="rt">
                {r.source === "phone" && <span className="src-tag">전화</span>}
                {/* 통장에 찍힌 이름이 예약자와 다를 때(친구·엄마·회사 이름) 적어둔다.
                    비워두면 예약자명으로 들어온 것으로 본다. */}
                <input
                  className="payer" type="text" placeholder="입금자명 (다를 때만)"
                  value={payer[r.id] ?? ""} onChange={(e) => setPayer({ ...payer, [r.id]: e.target.value })}
                  title="통장에 찍힌 이름이 예약자와 다르면 적어주세요"
                />
                <button className="btn sm primary" disabled={busy === r.id} onClick={() => confirmPay(r)}>
                  {busy === r.id ? "처리 중…" : "입금 확인"}
                </button>
              </span>
            </div>
          </div>
        );
      })}

      {/* 늦게 입금한 손님을 살리는 화면 — 자동취소 건도 봐야 매출이 안 샌다 */}
      {expired.length > 0 && (
        <div className={"rrow" + (openExp ? " open" : "")} style={{ marginTop: 16 }}>
          <div className="head" onClick={() => setOpenExp(!openExp)}>
            <span className="tname">⏱ 오늘 시간초과로 자동취소된 예약 {expired.length}건 {openExp ? "▲" : "▼"}</span>
            <span className="rt"><span className="badge-st st-cancelled">지난 일</span></span>
          </div>
          <div className="detail">
            <p className="hint" style={{ marginTop: 0 }}>
              손님이 늦게 입금했을 수도 있어요. 입금이 들어와 있으면 <b>[예약 › 목록·검색]</b>에서 찾아 <b>[취소 되돌리기]</b> 후 입금 확인하세요.
            </p>
            {expired.map((r) => (
              <div key={r.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "7px 0", borderTop: "1px solid var(--line)", fontSize: 13 }}>
                <span style={{ color: "var(--faint)", minWidth: 42 }}>{r.cancelled_at?.slice(11, 16)}</span>
                <b style={{ minWidth: 60 }}>{r.name}</b>
                <Phone v={r.phone} />
                <span style={{ color: "var(--cyan)" }}>{r.theme_name}</span>
                <span className="amt" style={{ marginLeft: "auto" }}>{r.deposit.toLocaleString()}원</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/* "3일 지남" — 환불을 며칠 묵혔는지가 클레임 위험도 */
function daysAgoLabel(iso: string | null) {
  if (!iso) return "-";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return d <= 0 ? "오늘 취소" : `${d}일 지남`;
}

/* 💸 환불 처리 — 행을 항상 펼쳐 둔다(.rrow.open). 계좌를 봐야 일이 시작되므로 클릭 1회를 없앰.
   사장님 동선: [계좌 복사] → 은행앱 이체 → [✓ N원 환불 완료]  */
function RefundQueue({ onDone }: { onDone: () => void }) {
  const [rows, setRows] = useState<Reservation[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/reservations?status=cancelled");
    if (res.ok) setRows(((await res.json()).reservations || []) as Reservation[]);
    setLoaded(true);
  }, []);
  useEffect(() => { load(); }, [load]);

  // 서버 통계와 같은 기준을 써야 뱃지 수와 목록 수가 어긋나지 않는다
  const todo = rows.filter(isRefundPending);
  const done = rows.filter((r) => r.refunded).slice(0, 20);

  async function copyAcct(r: Reservation) {
    const digits = (r.refund_account || "").replace(/[^0-9]/g, ""); // 은행앱 붙여넣기용
    try { await navigator.clipboard.writeText(digits); setCopied(r.id); setTimeout(() => setCopied(null), 2000); }
    catch { prompt("계좌번호를 복사하세요", digits); } // http·구형 브라우저 폴백
  }
  async function markRefunded(r: Reservation) {
    if (!confirm(`${r.refund_bank} ${r.refund_account}\n${r.refund_holder}님께 ${refundAmount(r).toLocaleString()}원\n\n보내셨나요? 환불 완료로 기록합니다.`)) return;
    setBusy(r.id);
    const res = await fetch("/api/admin/reservations", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: r.id, refunded: true }),
    });
    setBusy(null);
    if (res.ok) { load(); onDone(); } else alert((await res.json()).error || "처리 실패");
  }

  if (!loaded) return <p style={{ color: "var(--muted)" }}>불러오는 중…</p>;

  return (
    <>
      <div className="admin-top" style={{ marginBottom: 12 }}>
        <span style={{ fontSize: 13, color: "var(--muted)" }}>
          <b>계좌 복사 → 은행앱에서 이체 → 완료 누르기</b> 순서예요. 완료를 눌러도 돈이 자동으로 나가진 않아요.
        </span>
        <div className="sp" />
        <button className="btn ghost sm" onClick={load}>새로고침</button>
      </div>

      {todo.length === 0 ? (
        <div className="notice ok">✅ 보내드릴 환불 없음 — 다 처리하셨어요.</div>
      ) : todo.map((r) => (
        <div key={r.id} className="rrow open">
          <div className="head" style={{ cursor: "default" }}>
            <span className="when">{daysAgoLabel(r.cancelled_at)}</span>
            <span className="who"><b>{r.refund_holder || r.name}</b> · <Phone v={r.phone} /></span>
            <span className="tname">{r.theme_name} · {formatDate(r.date)} {r.time}</span>
            <span className="amt">{refundAmount(r).toLocaleString()}원</span>
            <span className="rt"><span className="badge-st st-pending">환불 {r.refund_rate}%</span></span>
          </div>
          <div className="detail">
            {/* 은행·계좌·예금주를 한 줄에 — 눈이 위아래로 안 움직이게 */}
            <div className="acct">
              <span className="bank">{r.refund_bank || "은행 없음"}</span>
              <b>{r.refund_account || "-"}</b>
              <span style={{ color: "var(--muted)" }}>예금주 {r.refund_holder || "-"}</span>
              <span className="sp" />
              <button className="btn sm ghost" onClick={() => copyAcct(r)}>
                {copied === r.id ? "복사됨 ✓" : "📋 계좌 복사"}
              </button>
            </div>
            <p className="hint" style={{ margin: "2px 0 0" }}>
              예약금 {r.deposit.toLocaleString()}원 × 환불율 {r.refund_rate}% = <b style={{ color: "var(--text)" }}>{refundAmount(r).toLocaleString()}원</b>
              {" · "}취소 {r.cancelled_at?.replace("T", " ").slice(0, 16)}
              {r.refund_holder && r.refund_holder !== r.name && <> · ⚠️ 예금주가 예약자({r.name})와 달라요</>}
            </p>
            <div className="act-row">
              {/* 금액을 버튼 라벨에 박아 오송금 방지 */}
              <button className="btn sm primary" disabled={busy === r.id} onClick={() => markRefunded(r)}>
                {busy === r.id ? "처리 중…" : `✓ ${refundAmount(r).toLocaleString()}원 환불 완료`}
              </button>
            </div>
          </div>
        </div>
      ))}

      {done.length > 0 && (
        <>
          <div className="card-h" style={{ marginTop: 22 }}>최근 환불 완료 {done.length}건</div>
          {done.map((r) => (
            <div key={r.id} className="rrow">
              <div className="head" style={{ cursor: "default" }}>
                <span className="when" style={{ color: "var(--faint)" }}>{formatDate(r.date)}</span>
                <span className="who">{r.refund_holder || r.name}</span>
                <span className="tname">{r.theme_name}</span>
                <span className="amt">{refundAmount(r).toLocaleString()}원</span>
                <span className="rt">
                  <span className="badge-st st-confirmed">환불완료</span>
                  <button className="btn sm ghost" onClick={async () => {
                    if (!confirm("환불 완료를 취소할까요? (잘못 눌렀을 때만)")) return;
                    await fetch("/api/admin/reservations", {
                      method: "PATCH", headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ id: r.id, refunded: false }),
                    });
                    load(); onDone();
                  }}>되돌리기</button>
                </span>
              </div>
            </div>
          ))}
        </>
      )}
    </>
  );
}

/* 📒 입출금 내역 — 포트원 결제내역의 상단 집계(받은 돈/돌려준 돈/실수령) 패턴.
   ✅ 이제 "돈이 오간 날" 기준(paid_at·refunded_at). 예약일 기준이던 한계를 해소.
   한 예약이 7월 입금 + 8월 환불이면 두 달에 나뉘어 각각 잡힌다(= 통장과 맞음). */
type Tx = { id: string; at: string; kind: "in" | "out"; amount: number; r: Reservation };

function Ledger() {
  const t0 = todayKst();
  const [from, setFrom] = useState(t0.slice(0, 8) + "01");
  const [to, setTo] = useState(t0);
  const [kind, setKind] = useState<"all" | "in" | "out">("all");
  const [rows, setRows] = useState<Reservation[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    setLoaded(false);
    const res = await fetch(`/api/admin/reservations?basis=money&from=${from}&to=${to}`);
    if (res.ok) setRows(((await res.json()).reservations || []) as Reservation[]);
    setLoaded(true);
  }, [from, to]);
  useEffect(() => { load(); }, [load]);

  // 예약 1건이 거래 2건(입금·환불)을 만들 수 있다 → 거래 단위로 펼친다
  const inRange = (iso: string | null | undefined) => !!iso && iso.slice(0, 10) >= from && iso.slice(0, 10) <= to;
  const txs: Tx[] = [];
  for (const r of rows) {
    if (r.paid_at && inRange(r.paid_at)) txs.push({ id: r.id + ":in", at: r.paid_at, kind: "in", amount: r.deposit, r });
    if (r.refunded && r.refunded_at && inRange(r.refunded_at)) txs.push({ id: r.id + ":out", at: r.refunded_at, kind: "out", amount: refundAmount(r), r });
  }
  txs.sort((a, b) => b.at.localeCompare(a.at));
  const view = txs.filter((t) => (kind === "all" ? true : t.kind === kind));
  const inSum = txs.filter((t) => t.kind === "in").reduce((s, t) => s + t.amount, 0);
  const outSum = txs.filter((t) => t.kind === "out").reduce((s, t) => s + t.amount, 0);

  function exportCsv() {
    if (view.length === 0) { alert("내보낼 내역이 없습니다."); return; }
    const cell = (v: unknown) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    // 계좌·전화는 넣지 않음(개인정보)
    const header = ["돈 오간 날", "구분", "금액", "이름", "테마", "예약일", "예약시간"];
    const body = view.map((t) => [
      t.at.replace("T", " ").slice(0, 16), t.kind === "in" ? "입금" : "환불",
      t.kind === "in" ? t.amount : -t.amount, t.r.name, t.r.theme_name, t.r.date, t.r.time,
    ]);
    const csv = [header, ...body].map((row) => row.map(cell).join(",")).join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `입출금_${from}_${to}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="admin-tools">
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <span style={{ color: "var(--faint)" }}>~</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <select value={kind} onChange={(e) => setKind(e.target.value as "all" | "in" | "out")}>
          <option value="all">전체</option><option value="in">입금만</option><option value="out">환불만</option>
        </select>
        <button className="btn sm" onClick={load}>조회</button>
        <div className="sp" />
        <button className="btn ghost sm" onClick={exportCsv}>⬇ CSV 내보내기</button>
      </div>

      <div className="stat-row sub3">
        <div className="stat"><b>{inSum.toLocaleString()}</b><span>받은 예약금(원)</span></div>
        <div className="stat"><b>{outSum.toLocaleString()}</b><span>돌려준 금액(원)</span></div>
        <div className="stat"><b>{(inSum - outSum).toLocaleString()}</b><span>실수령(원)</span></div>
      </div>

      <p className="hint" style={{ marginTop: -6, marginBottom: 10 }}>
        <b>돈이 실제로 오간 날 기준</b>이에요 — 통장과 맞춰볼 수 있습니다. (예약 날짜가 아니라 입금·환불을 처리한 날)
      </p>

      {!loaded ? <p style={{ color: "var(--muted)" }}>불러오는 중…</p>
        : view.length === 0 ? <div className="notice info">이 기간엔 오간 돈이 없습니다.</div>
          : view.map((t) => (
            <div key={t.id} className="rrow">
              <div className="head" style={{ cursor: "default" }}>
                <span className="when">{t.at.replace("T", " ").slice(5, 16)}</span>
                <span className="who">{t.r.name}{t.r.deposit_payer && t.r.deposit_payer !== t.r.name ? ` (입금 ${t.r.deposit_payer})` : ""}</span>
                <span className="tname">{t.r.theme_name} · {formatDate(t.r.date)} {t.r.time}</span>
                <span className="amt" style={{ color: t.kind === "in" ? "#137a4c" : "var(--muted)" }}>
                  {t.kind === "in" ? "+" : "−"}{t.amount.toLocaleString()}원
                </span>
                <span className="rt">
                  {t.kind === "in"
                    ? <span className="badge-st st-confirmed">입금</span>
                    : <span className="badge-st st-cancelled">환불 {t.r.refund_rate}%</span>}
                </span>
              </div>
            </div>
          ))}
    </>
  );
}

/* ============ 팝업 공지 탭 (기존 modal-window 이식) ============ */
type NoticeCfg = {
  enabled: boolean; title: string; body: string; imageUrl: string; linkUrl: string;
  until: string; hideDays: number; updatedAt: string;
};
const EMPTY_NOTICE: NoticeCfg = { enabled: false, title: "", body: "", imageUrl: "", linkUrl: "", until: "", hideDays: 1, updatedAt: "" };

function NoticeTab() {
  const [n, setN] = useState<NoticeCfg>(EMPTY_NOTICE);
  const [loaded, setLoaded] = useState(false);
  const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    fetch("/api/admin/settings").then((r) => r.json())
      .then((c) => { if (c?.notice) setN({ ...EMPTY_NOTICE, ...c.notice }); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, []);

  async function save() {
    setMsg(""); setBusy(true);
    const res = await fetch("/api/admin/settings", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notice: n }),
    });
    setBusy(false);
    if (res.ok) { setMsg("저장했습니다 ✅ 손님 화면에 바로 반영돼요."); }
    else { const j = await res.json(); setMsg("⚠️ " + (j.error || "저장 실패")); }
  }

  const set = (k: keyof NoticeCfg, v: unknown) => setN((s) => ({ ...s, [k]: v }));
  if (!loaded) return <p style={{ color: "var(--muted)" }}>불러오는 중…</p>;

  return (
    <div>
      <div className="notice info" style={{ marginBottom: 14 }}>
        📢 홈페이지에 들어오면 뜨는 <b>공지 팝업</b>이에요. 켜면 <b>모든 페이지</b>에서 뜨고,
        손님이 <b>&quot;{n.hideDays === 1 ? "오늘 하루" : `${n.hideDays}일 동안`} 보지 않기&quot;</b>를 누르면 그동안 안 떠요.
        공지 내용을 고치면 안 보기를 눌렀던 손님에게도 <b>다시 뜹니다.</b>
      </div>

      <div className="admin-card">
        <label className="nt-switch">
          <input type="checkbox" checked={n.enabled} onChange={(e) => set("enabled", e.target.checked)} />
          {/* 이모지(⬜)가 가짜 체크박스로 보여 네모가 두 개처럼 읽혔음 → 상태는 배지로 */}
          <b>공지 팝업</b>
          <span className={"badge-st " + (n.enabled ? "st-confirmed" : "st-noshow")}>
            {n.enabled ? "손님에게 보임" : "안 보임"}
          </span>
        </label>

        <div className="field" style={{ marginTop: 14 }}>
          <label>제목</label>
          <input type="text" value={n.title} onChange={(e) => set("title", e.target.value)} placeholder="예) 12월 휴무 안내" maxLength={120} />
        </div>
        <div className="field">
          <label>내용 (줄바꿈 그대로 보여요)</label>
          <textarea rows={5} value={n.body} onChange={(e) => set("body", e.target.value)} placeholder="예) 12월 25일은 쉽니다." maxLength={2000} />
        </div>
        <div className="field">
          <label>이미지 주소 (선택) — 기존 사이트 팝업은 이미지 한 장이었어요</label>
          <input type="text" value={n.imageUrl} onChange={(e) => set("imageUrl", e.target.value)} placeholder="https://... 또는 /images/notice.png" />
          <p className="hint">이미지 파일을 <code>public/images/</code> 에 넣었다면 <code>/images/파일명.png</code> 처럼 적어요.</p>
        </div>
        <div className="grid2">
          <div className="field">
            <label>누르면 이동할 주소 (선택)</label>
            <input type="text" value={n.linkUrl} onChange={(e) => set("linkUrl", e.target.value)} placeholder="https://instagram.com/..." />
          </div>
          <div className="field">
            <label>이 날짜까지만 표시 (선택)</label>
            <input type="date" value={n.until} onChange={(e) => set("until", e.target.value)} />
          </div>
        </div>
        <div className="field" style={{ maxWidth: 260 }}>
          <label>&quot;보지 않기&quot; 기간</label>
          <select value={n.hideDays} onChange={(e) => set("hideDays", Number(e.target.value))}>
            <option value={1}>오늘 하루 (기존과 동일)</option>
            <option value={3}>3일</option>
            <option value={7}>7일</option>
            <option value={0}>안 보기 버튼 없음(매번 표시)</option>
          </select>
        </div>

        {msg && <div className={msg.startsWith("⚠️") ? "msg-err" : "notice ok"} style={{ marginTop: 4 }}>{msg}</div>}
        <div className="act-row">
          <button className="btn primary" onClick={save} disabled={busy}>{busy ? "저장 중…" : "저장"}</button>
          <button className="btn sm ghost" onClick={() => setPreview(true)}>👁 미리보기</button>
        </div>
      </div>

      {preview && (
        <div className="modal-overlay nt-overlay" onClick={(e) => { if (e.target === e.currentTarget) setPreview(false); }}>
          <div className="modal nt-modal">
            <button className="close-x" onClick={() => setPreview(false)}>✕</button>
            {n.imageUrl && <div className="nt-img">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={n.imageUrl} alt={n.title || "공지"} /></div>}
            {n.title && <h3 className="nt-title">{n.title}</h3>}
            {n.body && <p className="nt-body">{n.body}</p>}
            {!n.title && !n.body && !n.imageUrl && <p style={{ color: "var(--muted)" }}>내용이 비어 있어요.</p>}
            <div className="nt-foot">
              {n.hideDays > 0 && <button className="nt-hide">{n.hideDays === 1 ? "오늘 하루 보지 않기" : `${n.hideDays}일 동안 보지 않기`}</button>}
              <button className="btn sm" onClick={() => setPreview(false)}>닫기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============ 리뷰 탭 ============ */
type AdminReview = {
  id: string; theme_id: string; theme_name: string; name: string; phone: string;
  rating: number; body: string; source: string | null; status: string; created_at: string;
};
const REV_ST_LABEL: Record<string, string> = { pending: "대기", approved: "게시", rejected: "거부" };

function ReviewsAdminTab() {
  const [status, setStatus] = useState("pending");
  const [list, setList] = useState<AdminReview[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    setLoaded(false);
    const res = await fetch(`/api/admin/reviews?status=${status}`);
    if (res.ok) { const j = await res.json(); setList(j.reviews || []); }
    setLoaded(true);
  }, [status]);
  useEffect(() => { load(); }, [load]);

  async function act(action: string, extra: Record<string, unknown>) {
    const res = await fetch("/api/admin/reviews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...extra }) });
    if (res.ok) load(); else { const j = await res.json(); alert(j.error || "처리 실패"); }
  }

  return (
    <>
      <ReviewAdd onDone={load} />
      <div className="admin-tools">
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="pending">대기</option>
          <option value="approved">게시</option>
          <option value="all">전체</option>
        </select>
        <button className="btn sm" onClick={load}>새로고침</button>
      </div>
      <div style={{ marginBottom: 10, fontSize: 13, color: "var(--muted)" }}>총 {list.length}건</div>
      {!loaded ? <p style={{ color: "var(--muted)" }}>불러오는 중…</p> :
        list.length === 0 ? <div className="notice info">해당 상태의 후기가 없습니다.</div> :
        list.map((r) => (
          <div key={r.id} className="rrow open">
            <div className="head" style={{ cursor: "default" }}>
              <span className="tname">{r.theme_name}</span>
              {/* --gold 는 보라(--violet)라 관리자 별만 보라였음 → 손님 후기 화면과 같은 #e0930c 로 통일 */}
              <span className="rev-stars" style={{ color: "#e0930c" }}>{"★".repeat(r.rating)}<span style={{ color: "var(--faint)" }}>{"★".repeat(5 - r.rating)}</span></span>
              <span className="who">{r.name}{r.phone ? ` · ${formatPhone(r.phone)}` : ""}</span>
              {r.source && <span className="src-tag">{r.source}</span>}
              <span className={`badge-st st-${r.status === "approved" ? "confirmed" : r.status === "rejected" ? "cancelled" : "pending"}`}>{REV_ST_LABEL[r.status] || r.status}</span>
            </div>
            <div className="detail">
              <div className="rev-body" style={{ whiteSpace: "pre-wrap", margin: "4px 0 10px", color: "var(--text)" }}>{r.body}</div>
              <div style={{ fontSize: 12, color: "var(--faint)", marginBottom: 10 }}>{r.created_at?.replace("T", " ").slice(0, 16)}</div>
              <div className="act-row">
                {r.status === "pending" && <>
                  <button className="btn sm ok" onClick={() => act("moderate", { id: r.id, status: "approved" })}>승인(게시)</button>
                  <button className="btn sm" onClick={() => act("moderate", { id: r.id, status: "rejected" })}>거부</button>
                </>}
                {r.status === "approved" && <button className="btn sm ghost" onClick={() => act("moderate", { id: r.id, status: "pending" })}>게시 취소</button>}
                {r.status === "rejected" && <button className="btn sm ghost" onClick={() => act("moderate", { id: r.id, status: "approved" })}>다시 게시</button>}
                <button className="btn sm danger" onClick={() => { if (confirm("이 후기를 삭제할까요?")) act("delete", { id: r.id }); }}>삭제</button>
              </div>
            </div>
          </div>
        ))}
    </>
  );
}

function ReviewAdd({ onDone }: { onDone: () => void }) {
  const [themeId, setThemeId] = useState(THEMES[0].id);
  const [name, setName] = useState(""); const [rating, setRating] = useState(5);
  const [body, setBody] = useState(""); const [source, setSource] = useState("네이버");
  const [err, setErr] = useState(""); const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  async function submit() {
    setErr(""); setMsg(""); setBusy(true);
    const res = await fetch("/api/admin/reviews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "add", themeId, name, rating, body, source }) });
    setBusy(false);
    if (res.ok) { setName(""); setBody(""); setRating(5); setMsg("등록되었습니다 ✅ (즉시 게시)"); onDone(); }
    else { const j = await res.json(); setErr(j.error || "등록 실패"); }
  }
  return (
    <div className="admin-card">
      <b>➕ 외부 후기 직접 등록 (네이버·구글 등 · 즉시 게시)</b>
      <div className="admin-tools" style={{ marginTop: 12, marginBottom: 8 }}>
        <select value={themeId} onChange={(e) => setThemeId(e.target.value)}>{THEMES.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.storeTag})</option>)}</select>
        <input type="text" placeholder="닉네임" value={name} onChange={(e) => setName(e.target.value)} />
        <select value={rating} onChange={(e) => setRating(Number(e.target.value))}>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{"★".repeat(n)} ({n})</option>)}</select>
        <input type="text" placeholder="출처 (네이버/구글/직접)" value={source} onChange={(e) => setSource(e.target.value)} list="rev-src" />
        <datalist id="rev-src"><option value="네이버" /><option value="구글" /><option value="직접" /></datalist>
      </div>
      <textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="후기 본문 (5자 이상)" style={{ width: "100%", background: "var(--bg2)", border: "1px solid var(--line)", borderRadius: 9, color: "var(--text)", padding: 10, fontFamily: "inherit", fontSize: 13.5 }} />
      {err && <div className="msg-err" style={{ marginTop: 8 }}>⚠️ {err}</div>}
      {msg && <div className="notice ok" style={{ marginTop: 8 }}>{msg}</div>}
      <button className="btn primary sm" style={{ marginTop: 10 }} onClick={submit} disabled={busy}>{busy ? "등록 중…" : "등록(즉시 게시)"}</button>
    </div>
  );
}

/* ============ 설정 탭 ============ */
function SettingsTab() {
  const [slots, setSlots] = useState<string[]>([]);
  const [slotInput, setSlotInput] = useState(""); const [msg, setMsg] = useState(""); const [loaded, setLoaded] = useState(false);
  const [storeSlots, setStoreSlots] = useState<Record<string, StoreSlots>>({});
  const [leadMin, setLeadMin] = useState("10");
  const [deposits, setDeposits] = useState<Record<string, string>>({}); // 테마id → 예약금(문자열, 입력칸용)
  useEffect(() => { fetch("/api/admin/settings").then((r) => r.json()).then((c) => {
    setSlots(c.timeSlots);
    setStoreSlots(c.storeSlots && typeof c.storeSlots === "object" ? c.storeSlots : {});
    setLeadMin(String(c.minLeadMinutes ?? 10));
    // 저장된 값이 있으면 그것, 없으면 코드 기본값
    const d: Record<string, string> = {};
    THEMES.forEach((t) => { d[t.id] = String(c.themeDeposits?.[t.id] ?? t.deposit); });
    setDeposits(d);
    setLoaded(true);
  }); }, []);
  async function save() {
    setMsg("");
    // 코드 기본값과 같은 건 저장하지 않는다 → 나중에 기본값을 바꾸면 자동으로 따라감
    const themeDeposits: Record<string, number> = {};
    for (const t of THEMES) {
      const n = Number(deposits[t.id]);
      if (Number.isFinite(n) && n >= 0 && n !== t.deposit) themeDeposits[t.id] = Math.floor(n);
    }
    const res = await fetch("/api/admin/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      timeSlots: slots, storeSlots, minLeadMinutes: Number(leadMin) || 0, themeDeposits,
    }) });
    if (res.ok) setMsg("저장되었습니다 ✅"); else { const j = await res.json(); setMsg(j.error || "저장 실패"); }
  }
  if (!loaded) return <p style={{ color: "var(--muted)" }}>불러오는 중…</p>;
  return (
    <div className="set-grid">
      <div className="admin-card">
      <h3 className="card-h">예약 규칙</h3>
      <div className="field">
        <label>⏱ 예약 임박 차단</label>
        <select value={leadMin} onChange={(e) => setLeadMin(e.target.value)}>
          <option value="0">제한 없음 (지난 시간만 막음)</option>
          <option value="10">시작 10분 전부터 예약 불가</option>
          <option value="30">시작 30분 전부터 예약 불가</option>
          <option value="60">시작 1시간 전부터 예약 불가</option>
          <option value="120">시작 2시간 전부터 예약 불가</option>
        </select>
        <p className="hint">시작이 코앞인 방을 손님이 덜컥 예약하는 걸 막아요. <b>전화로 받는 예약(관리자 등록)은 이 제한을 받지 않습니다.</b></p>
      </div>
      <div className="field">
        <label>테마별 예약금</label>
        <div style={{ border: "1px solid var(--line)", borderRadius: 9, overflow: "hidden" }}>
          {THEMES.map((t, i) => {
            const v = deposits[t.id] ?? String(t.deposit);
            const changed = Number(v) !== t.deposit;
            return (
              <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "8px 12px", fontSize: 13.5, borderTop: i ? "1px solid var(--line)" : "none" }}>
                <span>{t.name} <span style={{ color: "var(--faint)", fontSize: 12 }}>({t.storeTag})</span></span>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {changed && <span className="tpl-src edited" title={`원래 ${t.deposit.toLocaleString()}원`}>✎ 바꿈</span>}
                  <input type="number" min="0" step="1000" value={v}
                    onChange={(e) => setDeposits({ ...deposits, [t.id]: e.target.value })}
                    style={{ width: 108, textAlign: "right", fontFeatureSettings: '"tnum"', fontWeight: 700 }} />
                  <span style={{ color: "var(--muted)" }}>원</span>
                </span>
              </div>
            );
          })}
        </div>
        <div className="hint">
          ⚠️ 예약금을 바꾸면 <b>[설정 › 문자 문구]의 예약대기 안내</b>에 적힌 금액도 같이 고쳐주세요 —
          안 그러면 손님이 <b>문자에 적힌 옛 금액</b>을 입금합니다. (문자 문구는 테마별로 따로예요)
        </div>
      </div>
      </div>

      <div className="admin-card">
      <h3 className="card-h">예약 시간표</h3>
      <div className="field">
        <label>기본 예약 시간대 <span style={{ color: "var(--faint)", fontWeight: 400, fontSize: 12 }}>(아래 매장별 설정이 없는 매장에 적용)</span></label>
        <div className="optrow" style={{ marginBottom: 8 }}>
          {slots.map((s) => <div key={s} className="opt on" style={{ minWidth: 64, flex: "0 0 auto" }} onClick={() => setSlots(slots.filter((x) => x !== s))}>{s} ✕</div>)}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input type="time" value={slotInput} onChange={(e) => setSlotInput(e.target.value)} style={{ flex: 1 }} />
          <button className="btn sm" onClick={() => { if (slotInput && !slots.includes(slotInput)) { setSlots([...slots, slotInput].sort()); setSlotInput(""); } }}>추가</button>
        </div>
        <div className="hint">시간을 클릭하면 삭제돼요.</div>
      </div>

      <div className="field">
        <label>매장별 · 요일별 예약 시간대 <span style={{ color: "var(--faint)", fontWeight: 400, fontSize: 12 }}>(선택 · 매장마다 다르게)</span></label>
        <div className="hint" style={{ marginTop: 0, marginBottom: 10 }}>매장을 켜면 그 매장은 기본 대신 아래 시간표를 써요. 특정 요일만 다르게(또는 휴무) 지정할 수 있어요. 예: 2호점 월~목 휴무.</div>
        <StoreSlotsEditor storeSlots={storeSlots} setStoreSlots={setStoreSlots} fallback={slots} />
      </div>
      </div>

      <div className="admin-card">
        <h3 className="card-h">💾 전체 백업</h3>
        <p className="hint" style={{ marginTop: 0 }}>
          예약·리뷰·설정·시간표·문자 문구·휴무를 <b>파일 하나로</b> 내려받아요.
          지금 쓰는 DB(무료 플랜)는 <b>실수로 지우면 되돌릴 방법이 없어서</b>, 가끔 받아두시면 안전해요.
          <br />⚠️ 손님 이름·전화가 들어있으니 아무 데나 올리지 마세요. (손님 비밀번호는 일부러 뺐어요)
        </p>
        <a className="btn sm" href="/api/admin/backup" download>⬇ 전체 백업 받기 (JSON)</a>
      </div>

      {/* 저장 버튼은 항상 손 닿는 곳에 (설정이 길어서 맨 아래까지 스크롤해야 했음) */}
      <div className="save-bar">
        {msg && <span className="notice ok" style={{ margin: 0, padding: "6px 10px" }}>{msg}</span>}
        <span className="rt"><button className="btn primary" onClick={save}>설정 저장</button></span>
      </div>
    </div>
  );
}

// 시간 칩 목록 편집 (추가/클릭삭제) — 재사용
function SlotChips({ list, onChange, emptyLabel }: { list: string[]; onChange: (v: string[]) => void; emptyLabel?: string }) {
  const [inp, setInp] = useState("");
  return (
    <div>
      <div className="optrow" style={{ marginBottom: 6 }}>
        {list.length === 0 ? <span style={{ color: "var(--faint)", fontSize: 12.5, alignSelf: "center" }}>{emptyLabel || "시간 없음"}</span> :
          list.map((s) => <div key={s} className="opt on" style={{ minWidth: 58, flex: "0 0 auto" }} onClick={() => onChange(list.filter((x) => x !== s))}>{s} ✕</div>)}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <input type="time" value={inp} onChange={(e) => setInp(e.target.value)} style={{ flex: 1, maxWidth: 150 }} />
        <button className="btn sm" onClick={() => { if (inp && !list.includes(inp)) { onChange([...list, inp].sort()); setInp(""); } }}>추가</button>
      </div>
    </div>
  );
}

// 매장별 · 요일별 시간대 편집기
function StoreSlotsEditor({ storeSlots, setStoreSlots, fallback }: { storeSlots: Record<string, StoreSlots>; setStoreSlots: (v: Record<string, StoreSlots>) => void; fallback: string[] }) {
  const upd = (storeId: string, next: StoreSlots | null) => {
    const copy = { ...storeSlots };
    if (next === null) delete copy[storeId]; else copy[storeId] = next;
    setStoreSlots(copy);
  };
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {STORES.map((store) => {
        const ss = storeSlots[store.id];
        const on = !!ss;
        return (
          <div key={store.id} className="admin-card" style={{ margin: 0, padding: "12px 14px" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700 }}>
              <input type="checkbox" checked={on} style={{ width: "auto" }}
                onChange={(e) => upd(store.id, e.target.checked ? { default: [...fallback], byDow: {} } : null)} />
              {store.tag} <span style={{ color: "var(--faint)", fontWeight: 400, fontSize: 12 }}>{store.name}</span>
            </label>
            {on && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--muted)", marginBottom: 5 }}>기본 시간대 <span style={{ fontWeight: 400, color: "var(--faint)" }}>(요일별 지정 안 한 날에 적용)</span></div>
                <SlotChips list={ss.default} onChange={(v) => upd(store.id, { ...ss, default: v })} emptyLabel="시간 없음 (지정 안 한 요일은 모두 휴무)" />
                <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--muted)", margin: "12px 0 5px" }}>요일별 지정</div>
                <div style={{ display: "grid", gap: 6 }}>
                  {DOW_LABELS.map((label, dow) => {
                    const key = String(dow);
                    const has = Object.prototype.hasOwnProperty.call(ss.byDow, key);
                    const mode = !has ? "default" : (ss.byDow[key].length === 0 ? "closed" : "custom");
                    const setMode = (m: string) => {
                      const byDow = { ...ss.byDow };
                      if (m === "default") delete byDow[key];
                      else if (m === "closed") byDow[key] = [];
                      else byDow[key] = ss.byDow[key]?.length ? ss.byDow[key] : [...ss.default];
                      upd(store.id, { ...ss, byDow });
                    };
                    return (
                      <div key={dow} style={{ display: "flex", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
                        {/* --red 는 정의된 적 없는 토큰이라 늘 브랜드 밖 폴백색이 떴음 → --blood 로 */}
                        <b style={{ minWidth: 18, paddingTop: 7, color: dow === 0 ? "var(--blood)" : dow === 6 ? "var(--brand)" : "var(--text)" }}>{label}</b>
                        <select value={mode} onChange={(e) => setMode(e.target.value)} style={{ width: "auto", minWidth: 90 }}>
                          <option value="default">기본 사용</option>
                          <option value="closed">휴무</option>
                          <option value="custom">직접 지정</option>
                        </select>
                        {mode === "custom" && (
                          <div style={{ flex: 1, minWidth: 210 }}>
                            <SlotChips list={ss.byDow[key]} onChange={(v) => upd(store.id, { ...ss, byDow: { ...ss.byDow, [key]: v } })} emptyLabel="시간 추가하기" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ============ 문자 탭 ============ */
type SmsLog = { id: string; phone: string; body: string; type: string; status: string; error: string | null; channel?: string | null; created_at: string };
type TplTheme = { id: string; name: string; body: string; saved: boolean };
type TplGroup = { type: string; label: string; perTheme: boolean; common: { body: string; saved: boolean } | null; themes: TplTheme[] };

function SmsTab() {
  const [groups, setGroups] = useState<TplGroup[]>([]);
  const [log, setLog] = useState<SmsLog[]>([]); const [aligo, setAligo] = useState(false); const [kakao, setKakao] = useState(false);
  const [msg, setMsg] = useState(""); const [loaded, setLoaded] = useState(false); const [err, setErr] = useState("");
  // 종류별로 지금 편집중인 테마 ("" = 모든 테마 공통)
  const [pickTheme, setPickTheme] = useState<Record<string, string>>({});
  const [logQ, setLogQ] = useState(""); const [onlyFailed, setOnlyFailed] = useState(false);
  const [resend, setResend] = useState<string | null>(null);

  const load = useCallback(() => {
    const p = new URLSearchParams();
    if (logQ.trim()) p.set("q", logQ.trim());
    if (onlyFailed) p.set("only", "failed");
    fetch("/api/admin/sms?" + p.toString()).then((r) => r.json()).then((j) => {
      if (j.error) { setErr(j.error); setLoaded(true); return; }
      setGroups(j.templates || []); setLog(j.log || []); setAligo(j.aligoReady); setKakao(!!j.kakaoReady); setLoaded(true);
    }).catch(() => setLoaded(true));
  }, [logQ, onlyFailed]);

  // 실패한 문자 다시 보내기 — 그때 나갔어야 할 문구 그대로
  async function resendSms(id: string) {
    setResend(id);
    const res = await fetch("/api/admin/sms", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }),
    });
    setResend(null);
    if (res.ok) { setMsg("다시 보냈어요 ✅"); load(); }
    else { const j = await res.json(); setMsg("⚠️ " + (j.error || "재발송 실패")); }
  }
  // 검색어는 Enter·[찾기] 눌렀을 때만 조회한다(타이핑마다 서버를 부르지 않게).
  // 체크박스는 누르는 즉시 반영.
  useEffect(() => { load(); }, [onlyFailed]); // eslint-disable-line react-hooks/exhaustive-deps

  // 화면에서 문구 고칠 때
  function edit(type: string, themeId: string, body: string) {
    setGroups((gs) => gs.map((g) => {
      if (g.type !== type) return g;
      if (!themeId) return { ...g, common: { ...(g.common ?? { saved: false }), body } };
      return { ...g, themes: g.themes.map((t) => (t.id === themeId ? { ...t, body } : t)) };
    }));
  }
  async function saveTpl(type: string, themeId: string, label: string) {
    setMsg("");
    const g = groups.find((x) => x.type === type)!;
    const body = themeId ? g.themes.find((t) => t.id === themeId)!.body : g.common?.body ?? "";
    const res = await fetch("/api/admin/sms", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, themeId, body }),
    });
    if (res.ok) { setMsg(`${label} 저장됨 ✅`); load(); }
    else { const j = await res.json(); setMsg("⚠️ " + (j.error || "저장 실패")); }
  }
  async function resetTpl(type: string, themeId: string, label: string) {
    if (!confirm(`${label} 문구를 기존 사이트 문구로 되돌릴까요?`)) return;
    const res = await fetch(`/api/admin/sms?type=${type}&themeId=${themeId}`, { method: "DELETE" });
    if (res.ok) { setMsg(`${label} 기존 문구로 되돌림 ↩️`); load(); } else setMsg("⚠️ 되돌리기 실패");
  }

  if (!loaded) return <p style={{ color: "var(--muted)" }}>불러오는 중…</p>;
  if (err) return <div className="msg-err">⚠️ {err}</div>;

  return (
    <div>
      <div className={"notice " + (kakao ? "ok" : aligo ? "ok" : "warn")} style={{ marginBottom: 16 }}>
        {kakao
          ? "✅ 카카오 알림톡 연동됨 — 확정/취소/리마인더가 카톡으로 발송됩니다. (카톡 실패 시 문자로 자동 대체)"
          : aligo
          ? "✅ 알리고 문자 연동됨 — 확정/취소 시 자동 발송됩니다. (알림톡 키 등록 시 카톡 우선 발송)"
          : "⚠️ 알리고/알림톡 키가 아직 없어요. 지금은 발송 내역만 기록되고 실제 발송은 안 나가요. (가입·키 등록 시 자동 발송)"}
      </div>
      <div className="notice info" style={{ marginBottom: 14 }}>
        📝 <b>테마별</b> 딱지가 붙은 문자는 <b>테마마다 문구가 따로</b>예요(기존 사이트와 동일).
        예약대기는 테마마다 예약금이 다르고(3만·2.5만·12만·6.3만), 입금확정은 사자의 서만 인스타·길안내가 더 붙어요.
        그래서 <b>테마를 고른 뒤 그 테마 문구만</b> 고칩니다. 한 번에 전부 바꾸는 기능은 일부러 없앴어요(예약금이 잘못 안내될 수 있어서).
        <br />아직 저장한 적 없는 문구는 <b>기존 사이트 문구</b>가 그대로 나갑니다.
      </div>

      {groups.map((g) => {
        // 테마별 종류는 공통 탭이 없으므로 항상 테마 하나가 선택돼 있다
        const cur = g.perTheme ? (pickTheme[g.type] || g.themes[0]?.id || "") : "";
        const curTheme = g.themes.find((t) => t.id === cur);
        const body = cur ? curTheme?.body ?? "" : g.common?.body ?? "";
        const saved = cur ? !!curTheme?.saved : !!g.common?.saved;
        const label = g.label + (cur ? ` · ${curTheme?.name}` : "");
        return (
          <div key={g.type} className="admin-card">
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <b>{g.label}</b>
              {g.perTheme && <span className="src-tag">테마별</span>}
              <span className="sp" />
              <span className={"tpl-src " + (saved ? "edited" : "")}>{saved ? "✎ 직접 수정함" : "기존 사이트 문구"}</span>
            </div>

            {g.perTheme && (
              <div className="theme-tabs" style={{ margin: "12px 0 10px" }}>
                {g.themes.map((t) => (
                  <button key={t.id} className={"tt-btn" + (cur === t.id ? " on" : "")} onClick={() => setPickTheme({ ...pickTheme, [g.type]: t.id })}>
                    {t.name}{t.saved && <span className="tt-badge">✎</span>}
                  </button>
                ))}
              </div>
            )}

            <p className="hint" style={{ margin: "3px 0 8px" }}>치환: {"{이름} {테마} {날짜} {시간} {인원} {환불율}"}</p>
            <textarea className="tpl-ta" rows={g.perTheme ? 10 : 6} value={body} onChange={(e) => edit(g.type, cur, e.target.value)} />
            <div className="act-row">
              {/* 저장 6개가 전부 파랬음 → 기본 버튼으로. 수정 여부는 위 .tpl-src 배지가 알려줌 */}
              <button className="btn sm" onClick={() => saveTpl(g.type, cur, label)}>저장</button>
              {saved && <button className="btn sm ghost" onClick={() => resetTpl(g.type, cur, label)}>↩️ 기존 문구로 되돌리기</button>}
              <span className="rt" style={{ fontSize: 12, color: "var(--faint)" }}>{body.length}자</span>
            </div>
          </div>
        );
      })}
      {msg && <div className={msg.startsWith("⚠️") ? "msg-err" : "notice ok"}>{msg}</div>}
      <div className="admin-card">
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <b>📨 발송 내역</b>
          <span className="sp" />
          {/* "저 문자 못 받았어요" 전화가 오면 이름·전화로 바로 찾는다 (예전엔 50건을 눈으로 훑어야 했음) */}
          <input type="search" className="payer" style={{ width: 150 }} placeholder="이름·전화 검색"
            value={logQ} onChange={(e) => setLogQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} />
          <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, fontWeight: 400, cursor: "pointer" }}>
            <input type="checkbox" checked={onlyFailed} onChange={(e) => setOnlyFailed(e.target.checked)} style={{ width: "auto", accentColor: "var(--brand)" }} />
            실패·미발송만
          </label>
          <button className="btn sm" onClick={() => load()}>찾기</button>
        </div>
        <div style={{ marginTop: 8 }}>
          {log.length === 0 ? <span style={{ color: "var(--muted)" }}>{logQ || onlyFailed ? "찾는 내역이 없어요." : "내역 없음"}</span> : log.map((l) => (
            <div key={l.id} style={{ padding: "7px 0", borderTop: "1px solid var(--line)", fontSize: 12.5 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ color: l.status === "sent" ? "#137a4c" : l.status === "failed" ? "var(--danger)" : "var(--faint)", fontWeight: 700, minWidth: 54 }}>
                  {l.status === "sent" ? "발송" : l.status === "failed" ? "실패" : "미발송"}
                </span>
                <span style={{ minWidth: 34, fontSize: 11, fontWeight: 700, color: l.channel === "alimtalk" ? "#3c1e1e" : "var(--faint)", background: l.channel === "alimtalk" ? "#fee500" : "var(--bg2)", borderRadius: 5, padding: "1px 6px" }}>
                  {l.channel === "alimtalk" ? "카톡" : "문자"}
                </span>
                <Phone v={l.phone} />
                <span style={{ color: "var(--faint)" }}>{l.created_at?.replace("T", " ").slice(5, 16)}</span>
                {l.status !== "sent" && (
                  <span className="rt">
                    <button className="btn sm ghost" disabled={resend === l.id} onClick={() => resendSms(l.id)}>
                      {resend === l.id ? "보내는 중…" : "↻ 다시 보내기"}
                    </button>
                  </span>
                )}
              </div>
              {l.error && <div style={{ color: "var(--danger)", marginTop: 2, fontSize: 11.5 }}>⚠️ {l.error}</div>}
              <div style={{ color: "var(--muted)", whiteSpace: "pre-wrap", marginTop: 2 }}>{l.body}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
