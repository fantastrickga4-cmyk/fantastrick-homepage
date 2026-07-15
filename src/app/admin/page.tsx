"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { STORES, THEMES, TIME_SLOTS, DOW_LABELS, slotsForThemeDate, type StoreSlots, type SlotSchedule } from "@/lib/data";
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
  total: number; byStatus: Record<string, number>; pendingUnpaid: number; todayCount: number; depositPaidSum: number;
  weekCount: number; monthConfirmedDeposit: number;
  themes: { name: string; count: number }[]; activeTotal: number;
};
const ST_LABEL: Record<string, string> = { pending: "대기", confirmed: "확정", cancelled: "취소", noshow: "노쇼" };
const TABS = [
  { k: "res", label: "예약 관리" }, { k: "cal", label: "캘린더" }, { k: "slot", label: "시간대" },
  { k: "rev", label: "리뷰" }, { k: "set", label: "설정" }, { k: "sms", label: "문자" },
];

export default function AdminPage() {
  const [phase, setPhase] = useState<"checking" | "login" | "in">("checking");
  const [id, setId] = useState(""); const [pw, setPw] = useState(""); const [loginErr, setLoginErr] = useState("");
  const [tab, setTab] = useState("res");

  async function check() {
    const res = await fetch("/api/admin/reservations?status=__probe__");
    if (res.status === 401) setPhase("login"); else setPhase("in");
  }
  useEffect(() => { check(); }, []);

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
          <a key={t.k} className={tab === t.k ? "on" : ""} style={{ cursor: "pointer" }} onClick={() => setTab(t.k)}>{t.label}</a>
        ))}
      </div>
      {tab === "res" && <ReservationsTab />}
      {tab === "cal" && <CalendarTab />}
      {tab === "slot" && <SlotsTab />}
      {tab === "rev" && <ReviewsAdminTab />}
      {tab === "set" && <SettingsTab />}
      {tab === "sms" && <SmsTab />}
    </div>
  );
}

/* ============ 예약 관리 탭 ============
   기존 fantastrick.co.kr(Booked) 관리자와 같은 흐름:
   달력에서 날짜 클릭 → 테마 탭(건수 배지) → 그 날 시간대별 손님 목록.
   기존 목록·검색·입금대기 큐는 "목록·검색" 보기로 유지.                        */
function ReservationsTab() {
  const [view, setView] = useState<"day" | "list">("day");
  return (
    <>
      <div className="viewtoggle">
        <button className={view === "day" ? "on" : ""} onClick={() => setView("day")}>📅 날짜별 보기</button>
        <button className={view === "list" ? "on" : ""} onClick={() => setView("list")}>📋 목록·검색</button>
      </div>
      {view === "day" ? <DayView /> : <ListView />}
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
  const [fDeposit, setFDeposit] = useState("all"); // all | unpaid (입금대기만)
  const prevPending = useRef<number | null>(null); const [newAlert, setNewAlert] = useState(0);

  const load = useCallback(async (silent = false) => {
    const p = new URLSearchParams();
    if (fStatus !== "all") p.set("status", fStatus);
    if (fStore !== "all") p.set("store", fStore);
    if (fTheme !== "all") p.set("theme", fTheme);
    if (fDeposit === "unpaid") p.set("deposit", "unpaid");
    if (fFrom) p.set("from", fFrom); if (fTo) p.set("to", fTo); if (q.trim()) p.set("q", q.trim());
    const res = await fetch(`/api/admin/reservations?${p.toString()}`);
    if (!res.ok) return;
    const j = await res.json();
    setList(j.reservations || []); setStats(j.stats || null);
    const pendingNow = j.stats?.byStatus?.pending ?? 0;
    if (silent && prevPending.current !== null && pendingNow > prevPending.current) setNewAlert((n) => n + (pendingNow - prevPending.current!));
    prevPending.current = pendingNow;
  }, [fStatus, fStore, fTheme, fDeposit, fFrom, fTo, q]);

  useEffect(() => { load(); }, [fStatus, fStore, fTheme, fDeposit, fFrom, fTo]); // eslint-disable-line react-hooks/exhaustive-deps
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
        {newAlert > 0 && <button className="btn primary sm" onClick={() => { setNewAlert(0); setFStatus("pending"); }}>🔔 새 예약 {newAlert}건</button>}
        {stats && stats.pendingUnpaid > 0 && (
          <button className={"btn sm " + (fDeposit === "unpaid" ? "primary" : "")} style={fDeposit === "unpaid" ? undefined : { background: "var(--amber)", color: "#5a3d00", borderColor: "var(--amber)" }} onClick={() => { setNewAlert(0); if (fDeposit === "unpaid") { setFDeposit("all"); setFStatus("all"); } else { setFStatus("pending"); setFDeposit("unpaid"); } }}>
            💰 입금대기 {stats.pendingUnpaid}건{fDeposit === "unpaid" ? " ✕" : ""}
          </button>
        )}
        <div className="sp" />
        <button className="btn ghost sm" onClick={() => load()}>새로고침</button>
        <button className="btn ghost sm" onClick={exportCsv}>⬇ CSV 내보내기</button>
        <button className="btn primary sm" onClick={() => setShowAdd(true)}>+ 수동 예약 등록</button>
      </div>
      {stats && (
        <>
          <div className="stat-row dash4">
            <div className="stat"><b>{stats.todayCount}</b><span>오늘 예약</span></div>
            <div className="stat amber"><b>{stats.byStatus.pending || 0}</b><span>확정 대기(미입금)</span></div>
            <div className="stat"><b>{stats.weekCount}</b><span>이번 주 예약(월~일)</span></div>
            <div className="stat green"><b>{(stats.monthConfirmedDeposit || 0).toLocaleString()}</b><span>이번 달 확정 예약금(원)</span></div>
          </div>
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
            {r.status === "cancelled" && (
              <div className="refbox">
                <div style={{ fontWeight: 800, marginBottom: 6 }}>💸 환불 정보 (환불율 {r.refund_rate ?? "-"}%)</div>
                <div className="r"><span>은행</span><b>{r.refund_bank || "-"}</b></div>
                <div className="r"><span>계좌</span><b>{r.refund_account || "-"}</b></div>
                <div className="r"><span>예금주</span><b>{r.refund_holder || "-"}</b></div>
                <div className="r"><span>환불 금액(예상)</span><b>{Math.round((r.deposit * (r.refund_rate ?? 0)) / 100).toLocaleString()}원</b></div>
                <div className="act-row"><button className={"btn sm " + (r.refunded ? "ghost" : "primary")} onClick={() => patch(r.id, { refunded: !r.refunded })}>{r.refunded ? "✓ 환불완료됨 (취소)" : "환불 완료 처리"}</button></div>
              </div>
            )}
            <div className="field" style={{ marginTop: 12, marginBottom: 8 }}>
              <label>메모</label><textarea rows={2} defaultValue={r.memo || ""} id={`memo-${r.id}`} placeholder="관리자 메모" />
            </div>
            <div className="act-row">
              <button className="btn sm" onClick={() => patch(r.id, { memo: (document.getElementById(`memo-${r.id}`) as HTMLTextAreaElement).value })}>메모 저장</button>
              <button className={"btn sm " + (r.deposit_paid ? "ghost" : "primary")} onClick={() => patch(r.id, { deposit_paid: !r.deposit_paid })}>{r.deposit_paid ? "입금 취소" : "입금 확인"}</button>
              {r.status !== "confirmed" && r.status !== "cancelled" && <button className="btn sm" style={{ background: "var(--green)", color: "#062", borderColor: "var(--green)" }} onClick={() => patch(r.id, { status: "confirmed" })}>예약 확정</button>}
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
  timeSlots: string[]; disabledThemes: string[];
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
                      <span className="s-state full">예약 있음</span>
                      <button className="s-guest" onClick={() => setDetail(r)} title="눌러서 상세·처리">
                        ✏️ {r.name} {formatPhone(r.phone)} · {r.people}명
                      </button>
                      {r.source === "phone" && <span className="src-tag">전화</span>}
                      <span className={`dep ${r.deposit_paid ? "paid" : ""}`}>{r.deposit_paid ? "입금완료" : "미입금"}</span>
                      <span className={`badge-st st-${r.status}`}>{ST_LABEL[r.status] || r.status}</span>
                    </>
                  ) : bk ? (
                    <>
                      <span className="s-state closed">🚫 마감됨{bk.reason ? ` · ${bk.reason}` : ""}</span>
                      <span className="sp" />
                      <button className="btn sm ghost" onClick={() => unblock(bk.id)}>열기</button>
                    </>
                  ) : (
                    <>
                      <span className="s-state open">예약 없음</span>
                      {offSchedule && <span className="src-tag">시간표 밖</span>}
                      <span className="sp" />
                      <button className="btn sm ghost" onClick={() => block(time)}>마감</button>
                      <button className="btn sm primary" onClick={() => setAdd({ themeId: theme.id, date: pick, time })}>+ 예약 넣기</button>
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

/* 예약 1건 상세·처리 (날짜별 보기에서 손님 이름 클릭 시) */
function ResDetail({ r, onClose, onDone }: { r: Reservation; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [memo, setMemo] = useState(r.memo || "");
  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    const res = await fetch("/api/admin/reservations", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: r.id, ...body }),
    });
    setBusy(false);
    if (res.ok) onDone(); else { const j = await res.json(); alert(j.error || "처리 실패"); }
  }
  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <button className="close-x" onClick={onClose}>✕</button>
        <h3>{r.theme_name} · {formatDate(r.date)} {r.time}</h3>
        <div className="res-summary">
          <div className="r"><span>이름</span><b>{r.name}</b></div>
          <div className="r"><span>전화</span><b>{formatPhone(r.phone)}</b></div>
          <div className="r"><span>인원</span><b>{r.people}명</b></div>
          <div className="r"><span>예약금</span><b>{r.deposit.toLocaleString()}원 {r.deposit_paid ? "(입금완료)" : "(미입금)"}</b></div>
          <div className="r"><span>상태</span><b>{ST_LABEL[r.status] || r.status}</b></div>
          <div className="r"><span>접수</span><b>{r.created_at?.replace("T", " ").slice(0, 16)}</b></div>
        </div>
        <div className="field" style={{ marginTop: 12 }}>
          <label>메모</label><textarea rows={2} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="관리자 메모" />
        </div>
        <div className="act-row">
          <button className="btn sm" disabled={busy} onClick={() => patch({ memo })}>메모 저장</button>
          <button className={"btn sm " + (r.deposit_paid ? "ghost" : "primary")} disabled={busy} onClick={() => patch({ deposit_paid: !r.deposit_paid })}>{r.deposit_paid ? "입금 취소" : "입금 확인"}</button>
          {r.status !== "confirmed" && r.status !== "cancelled" && <button className="btn sm" style={{ background: "var(--green)", color: "#062", borderColor: "var(--green)" }} disabled={busy} onClick={() => patch({ status: "confirmed" })}>예약 확정</button>}
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

/* ============ 캘린더 탭 ============ */
function CalendarTab() {
  const [ym, setYm] = useState(() => { const d = new Date(Date.now() + 9 * 3600 * 1000); return { y: d.getUTCFullYear(), m: d.getUTCMonth() }; });
  const [rows, setRows] = useState<Reservation[]>([]);
  const [pick, setPick] = useState<string | null>(null);

  useEffect(() => {
    const first = `${ym.y}-${String(ym.m + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(ym.y, ym.m + 1, 0).getDate();
    const last = `${ym.y}-${String(ym.m + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    fetch(`/api/admin/reservations?from=${first}&to=${last}`).then((r) => r.json()).then((j) => setRows(j.reservations || [])).catch(() => {});
    setPick(null);
  }, [ym]);

  const byDay: Record<string, Reservation[]> = {};
  for (const r of rows) if (r.status !== "cancelled") (byDay[r.date] = byDay[r.date] || []).push(r);

  const firstDow = new Date(ym.y, ym.m, 1).getDay();
  const days = new Date(ym.y, ym.m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(firstDow).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const dstr = (d: number) => `${ym.y}-${String(ym.m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const prev = () => setYm((s) => s.m === 0 ? { y: s.y - 1, m: 11 } : { y: s.y, m: s.m - 1 });
  const next = () => setYm((s) => s.m === 11 ? { y: s.y + 1, m: 0 } : { y: s.y, m: s.m + 1 });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
        <button className="btn sm" onClick={prev}>◀</button>
        <b style={{ fontSize: 17 }}>{ym.y}년 {ym.m + 1}월</b>
        <button className="btn sm" onClick={next}>▶</button>
      </div>
      <div className="cal-grid">
        {["일", "월", "화", "수", "목", "금", "토"].map((w) => <div key={w} className="cal-dow">{w}</div>)}
        {cells.map((d, i) => d === null ? <div key={i} /> : (
          <div key={i} className={"cal-cell" + (pick === dstr(d) ? " pick" : "")} onClick={() => setPick(dstr(d))}>
            <span className="cal-d">{d}</span>
            {byDay[dstr(d)] && <span className="cal-n">{byDay[dstr(d)].length}건</span>}
          </div>
        ))}
      </div>
      {pick && (
        <div className="admin-card" style={{ marginTop: 16 }}>
          <b>{formatDate(pick)} 예약 {(byDay[pick] || []).length}건</b>
          <div style={{ marginTop: 10 }}>
            {(byDay[pick] || []).length === 0 ? <span style={{ color: "var(--muted)" }}>예약 없음</span> :
              (byDay[pick] || []).sort((a, b) => a.time.localeCompare(b.time)).map((r) => (
                <div key={r.id} style={{ display: "flex", gap: 10, padding: "6px 0", borderTop: "1px solid var(--line)", fontSize: 13 }}>
                  <b style={{ minWidth: 48 }}>{r.time}</b><span style={{ color: "var(--cyan)", minWidth: 90 }}>{r.theme_name}</span>
                  <span style={{ color: "var(--muted)" }}>{r.name} · {r.people}명</span>
                  <span className={`badge-st st-${r.status}`} style={{ marginLeft: "auto" }}>{ST_LABEL[r.status]}</span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ============ 시간대(차단) 탭 ============ */
type Block = { id: string; store_id: string | null; theme_id: string | null; date: string; time: string | null; reason: string | null };
function SlotsTab() {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [date, setDate] = useState(""); const [time, setTime] = useState(""); const [themeId, setThemeId] = useState(""); const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const load = () => fetch("/api/admin/slots").then((r) => r.json()).then((j) => setBlocks(j.blocks || [])).catch(() => {});
  useEffect(() => { load(); }, []);
  async function add() {
    setErr(""); if (!date) return setErr("날짜를 선택해 주세요.");
    const res = await fetch("/api/admin/slots", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date, time: time || null, themeId: themeId || null, reason }) });
    if (res.ok) { setDate(""); setTime(""); setThemeId(""); setReason(""); load(); } else { const j = await res.json(); setErr(j.error || "추가 실패"); }
  }
  async function del(id: string) { if (!confirm("이 차단을 해제(열기)할까요?")) return; const res = await fetch(`/api/admin/slots?id=${id}`, { method: "DELETE" }); if (res.ok) load(); }
  return (
    <div>
      <div className="admin-card">
        <b>🚫 예약 마감(시간대 닫기) 추가</b>
        <p className="hint" style={{ margin: "4px 0 12px" }}>시간을 비우면 그 날짜 <b>전체 휴무</b>, 테마를 비우면 <b>전 테마</b> 마감이에요.</p>
        <div className="admin-tools" style={{ marginBottom: 0 }}>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <select value={time} onChange={(e) => setTime(e.target.value)}><option value="">시간 전체(휴무)</option>{TIME_SLOTS.map((t) => <option key={t} value={t}>{t}</option>)}</select>
          <select value={themeId} onChange={(e) => setThemeId(e.target.value)}><option value="">전 테마</option>{THEMES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
          <input type="text" placeholder="사유(선택)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <button className="btn primary sm" onClick={add}>마감 추가</button>
        </div>
        {err && <div className="msg-err">⚠️ {err}</div>}
      </div>
      <div style={{ marginTop: 8 }}>
        {blocks.length === 0 ? <div className="notice info">닫아둔 시간대가 없습니다.</div> : blocks.map((b) => (
          <div key={b.id} className="rrow"><div className="head" style={{ cursor: "default" }}>
            <span className="when">{formatDate(b.date)}</span>
            <span className="tname">{b.time || "하루 전체 휴무"}</span>
            <span className="who">{b.theme_id ? (THEMES.find((t) => t.id === b.theme_id)?.name || b.theme_id) : "전 테마"}{b.reason ? ` · ${b.reason}` : ""}</span>
            <button className="btn sm ghost" style={{ marginLeft: "auto" }} onClick={() => del(b.id)}>열기(해제)</button>
          </div></div>
        ))}
      </div>
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
              <span className="rev-stars" style={{ color: "var(--gold, #e9b949)" }}>{"★".repeat(r.rating)}<span style={{ color: "var(--faint)" }}>{"★".repeat(5 - r.rating)}</span></span>
              <span className="who">{r.name}{r.phone ? ` · ${formatPhone(r.phone)}` : ""}</span>
              {r.source && <span className="src-tag">{r.source}</span>}
              <span className={`badge-st st-${r.status === "approved" ? "confirmed" : r.status === "rejected" ? "cancelled" : "pending"}`}>{REV_ST_LABEL[r.status] || r.status}</span>
            </div>
            <div className="detail">
              <div className="rev-body" style={{ whiteSpace: "pre-wrap", margin: "4px 0 10px", color: "var(--text)" }}>{r.body}</div>
              <div style={{ fontSize: 12, color: "var(--faint)", marginBottom: 10 }}>{r.created_at?.replace("T", " ").slice(0, 16)}</div>
              <div className="act-row">
                {r.status === "pending" && <>
                  <button className="btn sm" style={{ background: "var(--green)", color: "#062", borderColor: "var(--green)" }} onClick={() => act("moderate", { id: r.id, status: "approved" })}>승인(게시)</button>
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
  const [slots, setSlots] = useState<string[]>([]); const [disabled, setDisabled] = useState<string[]>([]);
  const [slotInput, setSlotInput] = useState(""); const [msg, setMsg] = useState(""); const [loaded, setLoaded] = useState(false);
  const [naverUrl, setNaverUrl] = useState(""); const [googleUrl, setGoogleUrl] = useState("");
  const [extRating, setExtRating] = useState(""); const [extCount, setExtCount] = useState("");
  const [storeSlots, setStoreSlots] = useState<Record<string, StoreSlots>>({});
  useEffect(() => { fetch("/api/admin/settings").then((r) => r.json()).then((c) => {
    setSlots(c.timeSlots); setDisabled(c.disabledThemes || []);
    setStoreSlots(c.storeSlots && typeof c.storeSlots === "object" ? c.storeSlots : {});
    setNaverUrl(c.naverUrl || ""); setGoogleUrl(c.googleUrl || "");
    setExtRating(c.extRating ? String(c.extRating) : ""); setExtCount(c.extCount ? String(c.extCount) : "");
    setLoaded(true);
  }); }, []);
  async function save() {
    setMsg("");
    const res = await fetch("/api/admin/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      timeSlots: slots, disabledThemes: disabled, storeSlots,
      naverUrl, googleUrl, extRating: Number(extRating) || 0, extCount: Number(extCount) || 0,
    }) });
    if (res.ok) setMsg("저장되었습니다 ✅"); else { const j = await res.json(); setMsg(j.error || "저장 실패"); }
  }
  if (!loaded) return <p style={{ color: "var(--muted)" }}>불러오는 중…</p>;
  return (
    <div className="admin-card" style={{ maxWidth: 560 }}>
      <div className="field">
        <label>테마별 예약금 (읽기 전용)</label>
        <div style={{ border: "1px solid var(--line)", borderRadius: 9, overflow: "hidden" }}>
          {THEMES.map((t, i) => (
            <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 12px", fontSize: 13.5, borderTop: i ? "1px solid var(--line)" : "none" }}>
              <span>{t.name} <span style={{ color: "var(--faint)", fontSize: 12 }}>({t.storeTag})</span></span>
              <b style={{ fontFeatureSettings: '"tnum"' }}>{t.deposit.toLocaleString()}원</b>
            </div>
          ))}
        </div>
        <div className="hint">예약금은 테마별로 코드에서 관리됩니다. (변경은 개발자에게 요청)</div>
      </div>
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
      <div className="field">
        <label>예약 받을 테마 (체크 해제 시 예약 화면에서 숨김)</label>
        {THEMES.map((t) => (
          <label key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 400, padding: "4px 0" }}>
            <input type="checkbox" checked={!disabled.includes(t.id)} onChange={(e) => { if (e.target.checked) setDisabled(disabled.filter((x) => x !== t.id)); else setDisabled([...disabled, t.id]); }} style={{ width: "auto" }} />
            {t.name} <span style={{ color: "var(--faint)", fontSize: 12 }}>({t.storeTag})</span>
          </label>
        ))}
      </div>
      <div className="field">
        <label>외부 리뷰 링크 (홈·후기 페이지에 버튼으로 노출)</label>
        <input type="url" value={naverUrl} onChange={(e) => setNaverUrl(e.target.value)} placeholder="네이버 플레이스 리뷰 URL (https://…)" style={{ marginBottom: 8 }} />
        <input type="url" value={googleUrl} onChange={(e) => setGoogleUrl(e.target.value)} placeholder="구글 리뷰 URL (https://…)" />
        <div className="hint">URL을 비우면 해당 버튼은 노출되지 않아요.</div>
      </div>
      <div className="field">
        <label>외부 표시 평점·리뷰수 (선택 · 뱃지로 노출)</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input type="number" step="0.1" min="0" max="5" value={extRating} onChange={(e) => setExtRating(e.target.value)} placeholder="평점 (예 4.9)" style={{ flex: 1 }} />
          <input type="number" min="0" value={extCount} onChange={(e) => setExtCount(e.target.value)} placeholder="리뷰수 (예 320)" style={{ flex: 1 }} />
        </div>
        <div className="hint">0이거나 비우면 뱃지를 숨겨요.</div>
      </div>
      {msg && <div className="notice ok">{msg}</div>}
      <button className="btn primary" style={{ width: "100%", justifyContent: "center", marginTop: 6 }} onClick={save}>설정 저장</button>
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
                        <b style={{ minWidth: 18, paddingTop: 7, color: dow === 0 ? "var(--red, #e05561)" : dow === 6 ? "var(--brand, #3b7bf0)" : "var(--text)" }}>{label}</b>
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
function SmsTab() {
  const [tpls, setTpls] = useState<Record<string, string>>({ confirm: "", cancel: "", admin_cancel: "", reminder: "" });
  const [log, setLog] = useState<SmsLog[]>([]); const [aligo, setAligo] = useState(false); const [kakao, setKakao] = useState(false); const [msg, setMsg] = useState(""); const [loaded, setLoaded] = useState(false);
  const load = () => fetch("/api/admin/sms").then((r) => r.json()).then((j) => { setTpls(j.templates); setLog(j.log || []); setAligo(j.aligoReady); setKakao(!!j.kakaoReady); setLoaded(true); });
  useEffect(() => { load(); }, []);
  async function saveTpl(type: string) {
    setMsg("");
    const res = await fetch("/api/admin/sms", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, body: tpls[type] }) });
    setMsg(res.ok ? `${LABEL[type]} 저장됨 ✅` : "저장 실패");
  }
  const LABEL: Record<string, string> = { confirm: "예약확정 문자 (입금 없이 확정 시)", cancel: "취소 문자 (손님이 직접 취소)", admin_cancel: "관리자 취소 안내 문자", reminder: "방문 리마인더" };
  if (!loaded) return <p style={{ color: "var(--muted)" }}>불러오는 중…</p>;
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
        💰 <b>입금확정 문자</b>와 <b>예약대기(계좌안내) 문자</b>는 테마마다 문구가 달라서(사자의 서는 인스타·길안내가 더 붙어요)
        여기서 편집하지 않고 기존 사이트 문구를 그대로 사용합니다.
      </div>
      {(["confirm", "cancel", "admin_cancel", "reminder"] as const).map((type) => (
        <div key={type} className="admin-card">
          <b>{LABEL[type]}</b>
          <p className="hint" style={{ margin: "3px 0 8px" }}>치환: {"{이름} {테마} {날짜} {시간} {인원} {환불율}"}</p>
          <textarea rows={3} value={tpls[type]} onChange={(e) => setTpls({ ...tpls, [type]: e.target.value })} style={{ width: "100%", background: "var(--bg2)", border: "1px solid var(--line)", borderRadius: 9, color: "var(--text)", padding: 10, fontFamily: "inherit", fontSize: 13.5 }} />
          <button className="btn sm primary" style={{ marginTop: 8 }} onClick={() => saveTpl(type)}>저장</button>
        </div>
      ))}
      {msg && <div className="notice ok">{msg}</div>}
      <div className="admin-card">
        <b>📨 최근 발송 내역 (50건)</b>
        <div style={{ marginTop: 8 }}>
          {log.length === 0 ? <span style={{ color: "var(--muted)" }}>내역 없음</span> : log.map((l) => (
            <div key={l.id} style={{ padding: "7px 0", borderTop: "1px solid var(--line)", fontSize: 12.5 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <span style={{ color: l.status === "sent" ? "var(--green)" : l.status === "failed" ? "var(--danger)" : "var(--faint)", fontWeight: 700, minWidth: 54 }}>
                  {l.status === "sent" ? "발송" : l.status === "failed" ? "실패" : "미발송"}
                </span>
                <span style={{ minWidth: 34, fontSize: 11, fontWeight: 700, color: l.channel === "alimtalk" ? "#3c1e1e" : "var(--faint)", background: l.channel === "alimtalk" ? "#fee500" : "var(--bg2)", borderRadius: 5, padding: "1px 6px", alignSelf: "center" }}>
                  {l.channel === "alimtalk" ? "카톡" : "문자"}
                </span>
                <span style={{ minWidth: 110 }}>{formatPhone(l.phone)}</span>
                <span style={{ color: "var(--faint)" }}>{l.created_at?.replace("T", " ").slice(5, 16)}</span>
              </div>
              <div style={{ color: "var(--muted)", whiteSpace: "pre-wrap", marginTop: 2 }}>{l.body}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
