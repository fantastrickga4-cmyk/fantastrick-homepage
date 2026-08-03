"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { STORES, THEMES, TIME_SLOTS, DOW_LABELS, slotsForThemeDate, type StoreSlots, type SlotSchedule } from "@/lib/data";
import { isRefundOwed, isRefundReady, refundAmount, cancelledBy, isAutoCancelled } from "@/lib/money";
import { isActiveSmsType } from "@/lib/sms-templates";
import { EXPIRE_MINUTES, GRACE_UNTIL_HOUR, DELETE_AFTER_DAYS } from "@/lib/expire";
import { formatDate, formatPhone, formatStamp, formatStampShort, formatStampTime, kstDateOf } from "@/lib/util";

type Reservation = {
  id: string; store_id: string; theme_id: string; theme_name: string;
  date: string; time: string; people: number; name: string; phone: string;
  deposit: number; deposit_paid: boolean; deposit_payer: string | null; status: string;
  refund_bank: string | null; refund_account: string | null; refund_holder: string | null;
  refund_rate: number | null; refunded: boolean; memo: string | null;
  admin_note: string | null; // 사장님이 손으로 쓰는 한 줄 메모 (memo 는 시스템 칸 — 섞지 말 것)
  auto_cancelled: boolean | null; // 30분 미입금으로 시스템이 취소한 건
  source: string;
  created_at: string; confirmed_at: string | null; cancelled_at: string | null;
  paid_at: string | null; refunded_at: string | null; // 돈이 실제로 오간 시각
  paid_source: string | null; // 입금확인을 처리한 주체: manual(사장님 버튼) / auto(자동매칭) / null(이 기능 전 기록)
};
type Stats = {
  total: number; byStatus: Record<string, number>; pendingUnpaid: number; todayCount: number; depositPaidSum: number;
  weekCount: number; monthConfirmedDeposit: number;
  pendingUnpaidSum: number; refundPending: number; refundPendingSum: number; // 입금·환불 탭용
  themes: { name: string; count: number }[]; activeTotal: number;
};
/* 달력에 색으로 표시할 테마 — 순서 = 태초의 신부 · 사자의 서 · 락다운시티 · 시간의 영속성.
   준비중(soon) 테마는 예약이 없으므로 뺀다. 색은 globals.css 의 .tn.t0~.t3 과 짝이다. */
const CAL_THEMES = THEMES.filter((t) => !t.soon);

const ST_LABEL: Record<string, string> = { pending: "대기", confirmed: "확정", cancelled: "취소", noshow: "노쇼" };

/* 전화번호 — 폰에서 누르면 바로 전화/문자.
   글자로만 두면 번호를 눈으로 읽고 손으로 다시 찍어야 하고, 오타 나면 엉뚱한 사람에게 걸림. */
function Phone({ v }: { v: string }) {
  if (!v) return null;
  const raw = v.replace(/[^0-9]/g, "");
  return (
    <span className="ph">
      <a href={`tel:${raw}`} title="전화 걸기">{formatPhone(v)}</a>
      <a href={`sms:${raw}`} className="ph-sms" title="문자 보내기" aria-label="문자 보내기"></a>
    </span>
  );
}
// 예약 탭이 기본 화면(사장님 지시 2026-07-30) — 로그인하면 바로 예약 목록부터.
const TABS = [
  { k: "res", label: "예약" }, { k: "money", label: "입금·환불" },
  { k: "cont", label: "리뷰·공지" }, { k: "set", label: "설정" },
];

export default function AdminPage() {
  const [phase, setPhase] = useState<"checking" | "login" | "in">("checking");
  const [pw, setPw] = useState(""); const [loginErr, setLoginErr] = useState("");
  const [tab, setTab] = useState("res");

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
    const res = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: pw }) });
    if (res.ok) { setPw(""); setPhase("in"); } else { const j = await res.json(); setLoginErr(j.error || "로그인 실패"); }
  }
  async function logout() { await fetch("/api/admin/logout", { method: "POST" }); setPhase("login"); }

  if (phase === "checking") return <div className="admin-wrap"><p style={{ color: "var(--muted)" }}>불러오는 중…</p></div>;
  if (phase === "login") {
    return (
      <div className="admin-login">
        <h2 className="title" style={{ fontSize: 24 }}>판타스트릭 관리자</h2>
        <p className="lead" style={{ margin: "8px auto 22px" }}>관리자 비밀번호를 입력하세요.</p>
        <div className="card" style={{ textAlign: "left" }}>
          <div className="field"><label>비밀번호</label>
            <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doLogin()} autoComplete="current-password" autoFocus />
          </div>
          {loginErr && <div className="msg-err">{loginErr}</div>}
          <button className="btn primary" style={{ width: "100%", justifyContent: "center", marginTop: 6 }} onClick={doLogin}>로그인</button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-wrap">
      <div className="admin-top">
        <h2>판타스트릭 관리자</h2>
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
      {tab === "res" && <ReservationsTab />}
      {tab === "money" && <MoneyTab />}
      {tab === "cont" && <ContentTab />}
      {tab === "set" && <SettingsHub />}
    </div>
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
        <button className={view === "day" ? "on" : ""} onClick={() => setView("day")}>날짜별</button>
        <button className={view === "list" ? "on" : ""} onClick={() => setView("list")}>목록·검색</button>
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
        <button className={v === "notice" ? "on" : ""} onClick={() => setV("notice")}>팝업 공지</button>
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
        <button className={v === "block" ? "on" : ""} onClick={() => setV("block")}>휴무·마감</button>
        <button className={v === "sms" ? "on" : ""} onClick={() => setV("sms")}>문자 문구</button>
      </div>
      {v === "gen" ? <SettingsTab /> : v === "block" ? <SlotsTab /> : <SmsTab />}
    </>
  );
}

/* 한 줄 메모 — 예약 행에서 펼치지 않고 바로 적는 관리자 메모 (사장님 지시 2026-07-30).
   Enter 또는 칸 밖 클릭이면 저장. 30초 자동 새로고침이 와도 입력 중엔 덮어쓰지 않는다. */
/* ✏️ 한 줄 메모 — **admin_note 칸에 쓴다. memo 가 아니다.**
   memo 는 시스템 칸이다: 기존 사이트에서 온 예약은 memo 통째로가 동기화 열쇠(#ID)라
   사람이 고치면 그 예약이 삭제·재생성되고, 30분 자동취소는 memo 를 덮어쓴다.
   그래서 사람 메모는 별도 칸으로 뺐다(2026-07-31). 덕분에 기존 사이트 예약에도 쓸 수 있다. */
function MemoLine({ id, note, onSaved }: { id: string; note?: string | null; onSaved: (m: string) => void }) {
  const [v, setV] = useState(note || "");
  const [focus, setFocus] = useState(false);
  const [st, setSt] = useState<"idle" | "saving" | "saved" | "err">("idle");
  // 30초 자동새로고침이 입력 중인 글자를 덮어쓰지 않게 — 포커스가 있으면 그대로 둔다.
  useEffect(() => { if (!focus) setV(note || ""); }, [note, focus]);
  async function save() {
    if (v.trim() === (note || "").trim()) return;
    setSt("saving");
    const res = await fetch("/api/admin/reservations", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, admin_note: v.trim() }),
    });
    if (res.ok) { setSt("saved"); onSaved(v.trim()); setTimeout(() => setSt("idle"), 1500); }
    else setSt("err");
  }
  return (
    <span className="memoline" onClick={(e) => e.stopPropagation()}>
            <input
        value={v} placeholder="한 줄 메모" maxLength={120}
        onChange={(e) => setV(e.target.value)}
        onFocus={() => setFocus(true)}
        onBlur={() => { setFocus(false); save(); }}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      />
      {st === "saving" && <em className="ml-st">저장 중…</em>}
      {st === "saved" && <em className="ml-st ok">저장됨</em>}
      {st === "err" && <em className="ml-st err">저장 실패 — 다시 시도</em>}
    </span>
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
      formatStamp(r.created_at),
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
        {newAlert > 0 && <button className="btn primary sm" onClick={() => { setNewAlert(0); setFStatus("pending"); }}>새 예약 {newAlert}건</button>}
        <div className="sp" />
        <button className="btn ghost sm" onClick={() => load()}>새로고침</button>
        <button className="btn ghost sm" onClick={exportCsv}>CSV 내보내기</button>
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
              <div style={{ fontWeight: 800, marginBottom: 10, fontSize: 14 }}>테마별 인기 (취소 제외)</div>
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
            {/* 메모는 admin_note(사람 칸)에 쓰므로 기존 사이트 예약에도 안전하다.
                동기화 열쇠는 memo 라 건드리지 않는다. 날짜별 화면과 같은 규칙. */}
            <MemoLine id={r.id} note={r.admin_note} onSaved={(m) => setList((l) => l.map((x) => (x.id === r.id ? { ...x, admin_note: m } : x)))} />
          </div>
          <div className="detail">
            <div className="res-summary" style={{ margin: 0 }}>
              <div className="r"><span>예약금</span><b>{r.deposit.toLocaleString()}원</b></div>
              <div className="r"><span>접수</span><b>{formatStamp(r.created_at)}</b></div>
              {r.confirmed_at && <div className="r"><span>확정</span><b>{formatStamp(r.confirmed_at)}</b></div>}
              {/* 돈·취소가 언제 일어났는지 — "언제 취소했냐"는 환불율(100/80/0%)의 근거라 시각까지 남긴다 */}
              {r.paid_at && (
                <div className="r">
                  <span>입금 확인</span>
                  <b>{formatStamp(r.paid_at)}
                    {r.paid_source && <span style={{ color: "var(--muted)", fontWeight: 400 }}> · {r.paid_source === "auto" ? <>자동매칭</> : <>사장님이 직접</>}</span>}
                  </b>
                </div>
              )}
              {r.cancelled_at && (
                <div className="r">
                  <span>취소</span>
                  <b>{formatStamp(r.cancelled_at)} <span style={{ color: "var(--muted)", fontWeight: 400 }}>· {cancelledBy(r)}</span></b>
                </div>
              )}
              {r.refunded_at && <div className="r"><span>환불 완료</span><b>{formatStamp(r.refunded_at)}</b></div>}
            </div>
            {/* 환불 처리는 [입금·환불 › 환불 처리] 탭이 유일한 입구 — 여기선 상태만 알려준다
                (입구가 두 곳이면 "여기서 했나 저기서 했나" 혼동) */}
            {isRefundOwed(r) && (
              <div className="refbox">
                <b>환불 대기 {refundAmount(r).toLocaleString()}원</b> (환불율 {r.refund_rate}%) —
                {isRefundReady(r)
                  ? <><b> [입금·환불 › 환불 처리]</b> 탭에서 계좌 복사하고 보내주세요.</>
                  : <><b> [입금·환불 › 환불 처리]</b> 탭에서 손님 계좌를 입력한 뒤 보내주세요. <span style={{ color: "var(--muted)" }}>(사장님이 취소한 건이라 계좌를 아직 몰라요)</span></>}
              </div>
            )}
            {r.status === "cancelled" && r.refunded && (
              <div className="refbox"><span style={{ color: "var(--muted)" }}>환불 완료된 예약이에요 ({refundAmount(r).toLocaleString()}원)</span></div>
            )}
            <div className="act-row">
              {/* 메모칸·[입금 취소] 제거 — 위 상세 팝업과 같은 이유(2026-07-31) */}
              {!r.deposit_paid && <button className="btn sm primary" onClick={() => patch(r.id, { deposit_paid: true })}>입금 확인</button>}
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
        <button className="btn sm" onClick={() => setYm((s) => (s.m === 0 ? { y: s.y - 1, m: 11 } : { y: s.y, m: s.m - 1 }))} aria-label="이전 달">‹</button>
        <b style={{ fontSize: 17 }}>{ym.y}년 {ym.m + 1}월</b>
        <button className="btn sm" onClick={() => setYm((s) => (s.m === 11 ? { y: s.y + 1, m: 0 } : { y: s.y, m: s.m + 1 }))} aria-label="다음 달">›</button>
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
            {/* 총 건수 대신 **테마별 건수를 색으로** 보여준다(2026-08-01 사장님 요청).
                합계만 있으면 "8건"이 한 테마에 몰린 건지 골고루인지 알 수 없어서,
                달력을 열어 날짜를 눌러봐야 했다. 0건인 테마는 칸이 좁아 생략하고
                색으로 어느 테마인지 알린다(아래 색 안내 참고). */}
            <span className="cal-tn">
              {CAL_THEMES.map((t, ti) => {
                const n = (byDay[dstr(d)] || []).filter((r) => r.theme_id === t.id).length;
                // 0 도 자리를 지킨다 — 빈칸으로 두면 네 자리가 밀려서 몇 번째 테마인지 헷갈린다.
                // 대신 0 은 흐리게 해서 실제 예약 숫자가 먼저 눈에 들어오게 한다.
                return <b key={t.id} className={`tn t${ti}${n ? "" : " zero"}`} title={`${t.name} ${n}건`}>{n}</b>;
              })}
            </span>
          </div>
        ))}
      </div>

      {/* 색 안내 — 색만 보고 테마를 알아야 하므로 달력 바로 아래 둔다 */}
      <div className="cal-legend">
        {CAL_THEMES.map((t, ti) => (
          <span key={t.id}><i className={`tn t${ti}`} />{t.name}</span>
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
                  <span className="s-time">{time}</span>
                  {r ? (
                    <>
                      <button className="s-guest" onClick={() => setDetail(r)} title="눌러서 상세·처리">
                        {r.name} · {r.people}명
                      </button>
                      {/* 전화는 버튼 밖에 — 버튼 안에 링크를 넣을 수 없음 */}
                      <Phone v={r.phone} />
                      {/* 이름·전화 다음 빈 자리에 메모를 한 줄로. 눌러서 바로 고친다.
                          예전엔 기존 사이트 예약에 숨겼지만, 이제 admin_note 라 안전하다. */}
                      <MemoLine id={r.id} note={r.admin_note} onSaved={(m) => setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, admin_note: m } : x)))} />
                      <span className="rt">
                        {r.source === "phone" && <span className="src-tag">전화</span>}
                        <span className={`dep ${r.deposit_paid ? "paid" : ""}`}>{r.deposit_paid ? "입금완료" : "미입금"}</span>
                        <span className={`badge-st st-${r.status}`}>{ST_LABEL[r.status] || r.status}</span>
                      </span>
                    </>
                  ) : bk ? (
                    <>
                      <span className="s-state closed">마감됨{bk.reason ? ` · ${bk.reason}` : ""}</span>
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
  // 🔴 '지금 보고 있는 예약'을 빼고 세야 한다.
  //    전에는 rows(현재 건 포함)로 세고 +1 을 해서, 예약이 1건뿐인 첫 방문 손님이
  //    "2번째 방문" 으로 떴다. 지금 예약한 테마도 '이미 해본 테마'로 잡혀서
  //    "아직 안 한 테마" 추천에서 빠졌다(아직 안 했는데). (2026-07-17 RPA 점검에서 발견)
  const visited = past.filter((x) => x.status === "confirmed" || x.status === "noshow");
  const noshow = past.filter((x) => x.status === "noshow").length;
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
        <b>손님 이력</b>
        {visited.length > 0 ? <span className="badge-st st-confirmed">{nth}번째 방문</span> : <span className="badge-st st-pending">첫 방문</span>}
        {noshow > 0 && <span className="badge-st st-noshow">노쇼 {noshow}회</span>}
        <span className="sp" />
        <button className="btn sm ghost" onClick={() => setOpen(!open)}>{open ? <>접기 </> : <>자세히 (예약 {rows.length}건) </>}</button>
      </div>

      {warns.map((w, i) => (
        <div key={i} className="gc-warn">{w}</div>
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
              <span style={{ minWidth: 118, color: "var(--faint)" }}>{formatStampShort(l.created_at)}</span>
              <b style={{ minWidth: 84 }}>{l.action}</b>
              <span style={{ color: "var(--muted)" }}>{l.detail || ""}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* 🔒 그 테마·그 날짜에 **고를 수 없는 시간**을 받아온다.
   예약이 찬 칸을 고를 수 있게 두면 [옮기기]를 눌러야 실패를 알게 되고,
   최악에는 한 칸에 두 팀이 들어간다. 아예 못 고르게 막고 이유를 글자로 보여준다. */
function useBusySlots(themeId: string | undefined, date: string) {
  const [busy, setBusy] = useState<{ taken: string[]; blocked: string[]; dayClosed: boolean }>({ taken: [], blocked: [], dayClosed: false });
  useEffect(() => {
    if (!themeId || !date) return;
    let alive = true;
    const q = "/api/slots?theme=" + encodeURIComponent(themeId) + "&date=" + encodeURIComponent(date);
    fetch(q).then((r) => r.json())
      .then((j) => { if (alive) setBusy({ taken: j.taken || [], blocked: j.blocked || [], dayClosed: !!j.dayClosed }); })
      .catch(() => {});
    return () => { alive = false; };
  }, [themeId, date]);
  return busy;
}

/** 시간 한 칸의 상태 — 고를 수 있나, 못 고른다면 뭐라고 적을까.
    keep = 지금 이 예약이 쓰고 있는 시간(자기 자신은 "예약있음"으로 막으면 안 된다). */
function slotState(t: string, busy: { taken: string[]; blocked: string[] }, keep?: string) {
  if (keep && t === keep) return { off: false, label: t };
  if (busy.taken.includes(t)) return { off: true, label: t + " — 예약있음" };
  if (busy.blocked.includes(t)) return { off: true, label: t + " — 마감" };
  return { off: false, label: t };
}

/* 예약 1건 상세·처리 (날짜별 보기에서 손님 이름 클릭 시) */
function ResDetail({ r, onClose, onDone }: { r: Reservation; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [move, setMove] = useState(false);
  const [mDate, setMDate] = useState(r.date);
  const [mTime, setMTime] = useState(r.time);
  const [mPeople, setMPeople] = useState(r.people);
  const [newPin, setNewPin] = useState<string | null>(null); // 재설정 직후 한 번만 보여준다
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

  // 🔑 예약 비밀번호 재설정 — 손님이 4자리를 잊었을 때.
  //   옛 번호를 보여주지 않는 이유: 같은 4자리를 다른 곳에서도 쓰는 손님이 있다.
  //   "찾아주기"가 아니라 "새로 정해주기"라 사고가 나도 피해가 작다.
  //   화면을 닫지 않는다(onDone 호출 안 함) — 새 번호를 손님에게 불러줘야 하므로.
  async function resetPin() {
    if (!confirm(`${r.name}님의 예약 비밀번호를 새로 만들까요?\n\n지금 번호는 없어지고 새 4자리가 만들어져요.\n손님에게 새 번호를 꼭 알려주세요.`)) return;
    setBusy(true);
    const res = await fetch("/api/admin/reservations", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: r.id, reset_pin: true }),
    });
    setBusy(false);
    if (!res.ok) { alert(((await res.json()) as { error?: string }).error || "처리 실패"); return; }
    setNewPin(((await res.json()) as { pin?: string }).pin || null);
  }

  // 옮길 수 있는 시간 후보 = 그 테마·그 날짜의 시간표 (+ 지금 시간은 목록에 없어도 유지)
  const theme = THEMES.find((t) => t.id === r.theme_id);
  const moveSlots = (() => {
    const list = cfg && theme ? slotsForThemeDate(cfg.themeSlots, cfg.storeSlots, cfg.timeSlots, theme.id, theme.store, mDate) : [];
    return Array.from(new Set([...list, mTime])).filter(Boolean).sort();
  })();
  // 같은 날 안에서 옮길 땐 지금 쓰고 있는 시간은 계속 고를 수 있어야 한다(자기 자신).
  const busySlots = useBusySlots(r.theme_id, mDate);
  const keepTime = mDate === r.date ? r.time : undefined;
  const mBlocked = slotState(mTime, busySlots, keepTime).off;
  const changed = mDate !== r.date || mTime !== r.time || mPeople !== r.people;

  async function doMove() {
    if (!confirm(`${r.name}님 예약을 옮길까요?\n\n${formatDate(r.date)} ${r.time}${r.people !== mPeople ? ` (${r.people}명)` : ""}\n→ ${formatDate(mDate)} ${mTime}${r.people !== mPeople ? ` (${mPeople}명)` : ""}\n\n취소·재등록이 아니라 그대로 옮기는 거라 입금·환불 상태는 유지됩니다.`)) return;
    await patch({ date: mDate, time: mTime, people: mPeople });
  }
  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <button className="close-x" onClick={onClose} aria-label="닫기">×</button>
        <h3>{r.theme_name} · {formatDate(r.date)} {r.time}</h3>
        <div className="res-summary">
          <div className="r"><span>이름</span><b>{r.name}</b></div>
          <div className="r"><span>전화</span><b><Phone v={r.phone} /></b></div>
          <div className="r"><span>인원</span><b>{r.people}명</b></div>
          <div className="r"><span>예약금</span><b>{r.deposit.toLocaleString()}원 {r.deposit_paid ? "(입금완료)" : "(미입금)"}</b></div>
          {r.deposit_payer && <div className="r"><span>입금자명</span><b>{r.deposit_payer}{r.deposit_payer !== r.name && <span style={{ color: "var(--amber)", fontWeight: 400, fontSize: 12 }}> · 예약자와 다름</span>}</b></div>}
          <div className="r"><span>상태</span><b>{ST_LABEL[r.status] || r.status}</b></div>
          <div className="r"><span>접수</span><b>{formatStamp(r.created_at)}</b></div>
        </div>

        {/* 예약 옮기기 — "한 시간만 미뤄주세요"가 제일 흔한 요청인데 지금까진 취소→재등록뿐이었음 */}
        {r.status !== "cancelled" && (
          <div className="mvbox">
            {!move ? (
              <button className="btn sm ghost" onClick={() => setMove(true)}>시간·날짜 옮기기</button>
            ) : (
              <>
                <div className="gc-h">예약 옮기기 — 취소하지 않고 그대로 옮겨요 (입금·환불 상태 유지)</div>
                <div className="mv-row">
                  <input type="date" value={mDate} onChange={(e) => setMDate(e.target.value)} disabled={!cfg} />
                  {/* 시간표가 오기 전엔 못 고르게 — 후보가 현재 시간뿐인 걸 "옮길 데 없음"으로 오해하지 않게 */}
                  <select value={mTime} onChange={(e) => setMTime(e.target.value)} disabled={!cfg}>
                    {moveSlots.map((t) => {
                      const st = slotState(t, busySlots, keepTime);
                      return <option key={t} value={t} disabled={st.off}>{st.label}</option>;
                    })}
                  </select>
                  <select value={mPeople} onChange={(e) => setMPeople(Number(e.target.value))} disabled={!cfg}>
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}명</option>)}
                  </select>
                  {/* 막힌 칸이 골라져 있으면 버튼도 안 눌린다 — 눌러보고 실패로 알게 되면 안 된다 */}
                  <button className="btn sm primary" disabled={busy || !changed || !cfg || mBlocked} onClick={doMove}>{busy ? "옮기는 중…" : "옮기기"}</button>
                  <button className="btn sm ghost" onClick={() => { setMove(false); setMDate(r.date); setMTime(r.time); setMPeople(r.people); }}>취소</button>
                </div>
                {!cfg ? <p className="hint" style={{ margin: "6px 0 0" }}>시간표 불러오는 중…</p>
                  : busySlots.dayClosed
                    ? <p className="hint" style={{ margin: "6px 0 0", color: "#b3261e" }}><b>{formatDate(mDate)}</b> 은 휴무·마감된 날이에요.</p>
                    : <p className="hint" style={{ margin: "6px 0 0" }}>{THEMES.find((t) => t.id === r.theme_id)?.name}의 <b>{formatDate(mDate)}</b> 시간표예요. <b>예약있음·마감</b>인 칸은 고를 수 없어요.</p>}
              </>
            )}
          </div>
        )}

        <GuestHistory phone={r.phone} currentId={r.id} />

        {/* 메모칸은 뺐다(2026-07-31). 여기 보이던 건 사람 메모가 아니라 **시스템 memo** 였고
            (기존 사이트 예약은 그 문자열이 동기화 열쇠 #ID 다) 저장하면 예약이 삭제·재생성된다.
            사장님 메모는 예약 줄의 한 줄 메모(admin_note)에서 쓴다. */}
        {newPin && (
          <div className="notice ok" style={{ marginBottom: 10 }}>
            새 비밀번호 <b style={{ fontSize: 20, letterSpacing: 3, fontFeatureSettings: '"tnum"' }}>{newPin}</b>
            {" — "}손님에게 알려주세요. 이 창을 닫으면 다시 볼 수 없어요.
          </div>
        )}
        <div className="act-row">
          {/* [입금 취소] 없앰 — 실제로 쓸 일이 없고, 잘못 눌리면 확정된 예약이 미입금으로 돌아간다. */}
          {!r.deposit_paid && <button className="btn sm primary" disabled={busy} onClick={() => patch({ deposit_paid: true })}>입금 확인</button>}
          <button className="btn sm ghost" disabled={busy} onClick={resetPin}>비밀번호 재설정</button>
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

  // 이미 찬·마감된 칸은 아예 못 고르게 (등록 눌러보고 실패로 알게 되면 안 된다)
  const busySlots = useBusySlots(themeId, date);
  const timeBlocked = slotState(time, busySlots).off;

  async function submit() {
    setErr(""); setBusy(true);
    const res = await fetch("/api/admin/reservations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ themeId, date, time, people, name, phone, memo }) });
    setBusy(false);
    if (res.ok) onDone(); else { const j = await res.json(); setErr(j.error || "등록 실패"); }
  }
  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <button className="close-x" onClick={onClose} aria-label="닫기">×</button>
        <h3>수동 예약 등록 (전화 예약)</h3>
        <div className="field"><label>테마</label><select value={themeId} onChange={(e) => setThemeId(e.target.value)}>{THEMES.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.storeTag})</option>)}</select></div>
        <div className="grid2">
          <div className="field"><label>날짜</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="field"><label>시간</label><select value={time} onChange={(e) => setTime(e.target.value)}>
            {timeOptions.map((t) => {
              const st = slotState(t, busySlots);
              return <option key={t} value={t} disabled={st.off}>{st.label}</option>;
            })}
          </select></div>
        </div>
        {busySlots.dayClosed
          ? <div className="msg-err">이 날짜는 휴무·마감입니다.</div>
          : timeBlocked && <div className="msg-err">이 시간은 이미 예약이 있거나 마감된 칸이라 등록할 수 없습니다. 다른 시간을 골라주세요.</div>}
        <div className="grid2">
          <div className="field"><label>인원</label><select value={people} onChange={(e) => setPeople(Number(e.target.value))}>{[1,2,3,4,5,6,7,8].map((n) => <option key={n} value={n}>{n}명</option>)}</select></div>
          <div className="field"><label>이름</label><input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="홍길동" /></div>
        </div>
        <div className="field"><label>전화번호</label><input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="010-1234-5678" /></div>
        <div className="field"><label>메모 (선택)</label><input type="text" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="요청사항 등" /></div>
        {err && <div className="msg-err">{err}</div>}
        <div className="modal-btns" style={{ marginTop: 14 }}><button className="btn ghost" onClick={onClose}>닫기</button><button className="btn primary" onClick={submit} disabled={busy || timeBlocked || busySlots.dayClosed}>{busy ? "등록 중…" : "등록"}</button></div>
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
        <b>휴무일 추가</b>
        <p className="hint" style={{ margin: "4px 0 12px" }}>
          고른 날짜를 <b>하루 종일 · 전 테마</b> 예약을 안 받습니다. (임시휴무·전세 등)
          <br />시간 하나만 막고 싶으면 <b>[예약 › 날짜별]</b>에서 그 시간의 <b>마감</b> 버튼을 누르세요.
        </p>
        <div className="admin-tools" style={{ marginBottom: 0 }}>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <input type="text" placeholder="사유(선택) 예: 내부 공사" value={reason} onChange={(e) => setReason(e.target.value)} />
          <button className="btn sm" onClick={add}>휴무일 추가</button>
        </div>
        {err && <div className="msg-err">{err}</div>}
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
  const [v, setV] = useState<"pay" | "autocancel" | "refund" | "ledger">("pay");
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
      {/* 설명 배너·금액 집계 카드는 뺐다(2026-07-31 사장님 지시).
          매일 보는 화면이라 안내문과 합계 숫자가 위를 다 차지하면 정작 처리할 줄이 밀린다.
          처리할 건수는 탭 배지(vt-badge)로 충분하다.
          ⚠️ 단 아래 신호등은 예외 — 이게 안 보여서 26시간을 놓쳤다(2026-08-03). 한 줄만 쓴다. */}
      <BankHealth />

      <div className="viewtoggle">
        <button className={v === "pay" ? "on" : ""} onClick={() => setV("pay")}>
          입금 확인{nPay > 0 && <span className="vt-badge">{nPay}</span>}
        </button>
        {/* 처리할 일은 아니지만 **손님이 물어볼 때** 바로 꺼내야 하는 화면이라 큐 사이에 둔다 */}
        <button className={v === "autocancel" ? "on" : ""} onClick={() => setV("autocancel")}>자동 취소</button>
        <button className={v === "refund" ? "on" : ""} onClick={() => setV("refund")}>
          환불 처리{nRef > 0 && <span className="vt-badge">{nRef}</span>}
        </button>
        <button className={v === "ledger" ? "on" : ""} onClick={() => setV("ledger")}>입출금 내역</button>
      </div>

      {v === "pay" ? <PayQueue onDone={done} />
        : v === "autocancel" ? <AutoCancelled />
          : v === "refund" ? <RefundQueue onDone={done} />
            : <Ledger />}
    </>
  );
}

/* 🚦 입금 감시 신호등 — "지금 입금이 들어오면 잡히나?" 를 한 줄로.

   왜 있나: 2026-08-02 10:17 ~ 08-03 12:26 약 26시간 동안 태블릿에 카카오톡이 화면에
   없어서 화면 감시가 글자를 하나도 못 읽었는데 **아무도 몰랐다.** 신호는 bank_diag 표에
   5분마다 쌓이고 있었지만 그걸 보는 화면이 없었다. 그래서 여기 한 줄로 띄운다.

   경로가 둘(화면 감시·알림 캡처)이고 서로 예비라서, **하나 멈춤(🟡)과 둘 다 멈춤(🔴)을
   반드시 구분한다.** 하나 멈췄다고 빨강을 켜면 빨강에 익숙해져 진짜 빨강을 무시하게 된다. */
type HealthSignal = { key: string; label: string; level: string; minsAgo: number | null; note: string };
type Health = {
  overall: { level: string; headline: string; detail: string };
  signals: HealthSignal[];
  lastDepositAt: string | null;
};

/** "3분" / "26시간" — 26시간을 "1560분"으로 쓰면 심각한지 감이 안 온다 */
function shortAgo(mins: number | null): string {
  if (mins === null) return "—";
  if (mins < 1) return "방금";
  if (mins < 60) return `${mins}분`;
  const h = Math.floor(mins / 60);
  return h < 48 ? `${h}시간` : `${Math.floor(h / 24)}일`;
}

function BankHealth() {
  const [h, setH] = useState<Health | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(() => {
    fetch("/api/admin/bank-health")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j?.overall) setH(j as Health); })
      .catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);
  // 하트비트가 5분 주기라 1분마다면 충분하다(더 자주 물어도 새 정보가 없다).
  useEffect(() => { const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);

  if (!h) return null;
  const lv = h.overall.level;
  // 정상일 땐 접어두고, 문제가 있으면 처음부터 펼친다 — 매일 보는 화면이라 평소엔 한 줄이어야 한다.
  const expanded = open || lv !== "ok";

  return (
    <div className={`bhealth lv-${lv}`}>
      <button className="bh-top" onClick={() => setOpen((v) => !v)} aria-expanded={expanded}>
        <span className="bh-dot" aria-hidden="true" />
        <span className="bh-head">{h.overall.headline}</span>
        <span className="bh-chips">
          {h.signals.map((s) => (
            <span key={s.key} className={`bh-chip lv-${s.level}`}>
              {s.label} <b>{shortAgo(s.minsAgo)}</b>
            </span>
          ))}
        </span>
        <span className="bh-caret">{expanded ? "▴" : "▾"}</span>
      </button>

      {expanded && (
        <div className="bh-body">
          <p className="bh-detail">{h.overall.detail}</p>
          <ul className="bh-list">
            {h.signals.map((s) => (
              <li key={s.key} className={`lv-${s.level}`}>
                <b>{s.label}</b> — {s.note}
              </li>
            ))}
          </ul>
          <p className="bh-foot">
            마지막으로 올라온 입금: {h.lastDepositAt ? formatStampShort(h.lastDepositAt) : "기록 없음"}
            {" · "}
            <span style={{ color: "var(--faint)" }}>신호는 태블릿이 5분마다 보냅니다</span>
          </p>
        </div>
      )}
    </div>
  );
}

/** 입금 마감 시각 — expire.ts 의 규칙 그대로.
    보통은 접수 + 30분, 자정~오전10시 접수는 그날 10:30(KST)까지 봐준다.
    ⚠️ 손님에게 말해야 하는 기준은 **이 마감 시각**이지, 시스템이 실제로 정리한 시각이 아니다. */
function payDeadline(createdAt: string): { at: number; grace: boolean } {
  const c = new Date(createdAt).getTime();
  const normal = c + EXPIRE_MINUTES * 60000;
  const kst = new Date(c + 9 * 3600 * 1000);
  const isMidnightBooking = kst.getUTCHours() < GRACE_UNTIL_HOUR;
  let at = normal;
  if (isMidnightBooking) {
    const g = new Date(c + 9 * 3600 * 1000);
    g.setUTCHours(GRACE_UNTIL_HOUR, EXPIRE_MINUTES, 0, 0);
    at = Math.max(normal, g.getTime() - 9 * 3600 * 1000);
  }
  return { at, grace: isMidnightBooking && at > normal };
}

/* 🚫 자동 취소된 예약 — **손님이 물어볼 때 꺼내 보는 화면.**
   "분명 예약했는데 왜 없어졌냐"는 전화가 오면, 지금까진 취소된 예약을 목록에서
   일일이 찾아야 했다. 여기 모아두고 **언제 접수해서 언제 취소됐는지**를 나란히 보여준다.
   (처리할 일이 아니라 확인용이라 버튼은 두지 않는다) */
function AutoCancelled() {
  const [rows, setRows] = useState<Reservation[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoaded(false);
    const res = await fetch("/api/admin/reservations?status=cancelled");
    if (res.ok) setRows(((await res.json()).reservations || []) as Reservation[]);
    setLoaded(true);
  }, []);
  useEffect(() => { load(); }, [load]);

  // 자동취소 표시는 auto_cancelled 칸(옛 기록은 memo 문자열). money.ts 와 같은 기준을 쓴다.
  const auto = rows
    .filter((r) => isAutoCancelled(r))
    .sort((a, b) => (b.cancelled_at || "").localeCompare(a.cancelled_at || ""));

  const key = q.replace(/\s|-/g, "").toLowerCase();
  const view = key
    ? auto.filter((r) => (r.name + r.phone.replace(/-/g, "")).toLowerCase().includes(key))
    : auto;

  return (
    <>

      <div className="admin-tools">
        <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름 또는 전화번호로 찾기" />
        <div className="sp" />
        <button className="btn ghost sm" onClick={load}>새로고침</button>
      </div>

      {!loaded ? <p style={{ color: "var(--muted)" }}>불러오는 중…</p>
        : view.length === 0 ? (
          <div className="notice info">
            {auto.length === 0 ? "자동 취소된 예약이 없습니다." : "찾는 예약이 없습니다."}
          </div>
        ) : (
          <>
            {view.map((r) => {
              const dl = payDeadline(r.created_at);
              return (
              <div key={r.id} className="rrow">
                <div className="head" style={{ cursor: "default" }}>
                  <span className="taken-at">{formatStampShort(r.created_at)} 접수</span>
                  <span className="when">
                    {formatStampShort(new Date(dl.at).toISOString())} 입금 마감
                    {dl.grace && <span className="src-tag" style={{ marginLeft: 6 }}>새벽 예약</span>}
                  </span>
                  <span className="taken-at">{formatStampShort(r.cancelled_at)} 정리됨</span>
                  <span className="who"><b>{r.name}</b> · <Phone v={r.phone} /></span>
                  <span className="tname">{r.theme_name} · {formatDate(r.date)} {r.time} · {r.people}명</span>
                  <span className="amt">{r.deposit.toLocaleString()}원</span>
                  <span className="rt">
                    {r.source === "phone" && <span className="src-tag">전화</span>}
                    <span className="badge-st st-cancelled">미입금 자동취소</span>
                  </span>
                  {r.admin_note && <MemoLine id={r.id} note={r.admin_note} onSaved={(m) => setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, admin_note: m } : x)))} />}
                </div>
              </div>
              );
            })}
            <p className="hint" style={{ marginTop: 10 }}>
              총 {view.length}건
            </p>
          </>
        )}
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
      setExpired(rows.filter((r) => (r.memo || "").includes("자동 취소") && kstDateOf(r.cancelled_at) === today));
    }
    setLoaded(true);
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  // 남은 시간 — 자정 이후 접수 건은 그날 오전 10시 30분까지 봐주므로(expire.ts) 그 기준으로 센다.
  // 안 그러면 새벽 예약이 "0분 남음"으로 보이는데 실제로는 안 취소돼 화면이 거짓말을 한다.
  function remainInfo(createdAt: string): { min: number; grace: boolean } {
    const { at, grace } = payDeadline(createdAt); // 규칙은 한 곳(payDeadline)에만 둔다
    return { min: Math.max(0, Math.ceil((at - Date.now()) / 60000)), grace };
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
        <div className="sp" />
        <button className="btn ghost sm" onClick={load}>새로고침</button>
      </div>

      {list.length === 0 ? (
        <div className="notice ok">입금 대기 없음 — 다 처리하셨어요.</div>
      ) : list.map((r) => {
        const { min: m, grace } = remainInfo(r.created_at);
        return (
          <div key={r.id} className="rrow">
            <div className="head" style={{ cursor: "default" }}>
              {/* 남은 시간만 있으면 "언제 신청한 건데 30분이 남았다는 거지?"를 알 수 없다.
                  접수 시각을 왼쪽에 같이 둔다 — 카운트다운의 기준점이 보여야 말이 된다.
                  (오른쪽 tname 의 날짜·시간은 '이용' 날짜라 서로 다른 값이다) */}
              <span className="taken-at">{formatStampShort(r.created_at)} 접수</span>
              <span className={"when" + (m <= 5 ? " urgent" : "")}>
                {m >= 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${m}분`} 남음
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
            <span className="tname">오늘 시간초과로 자동취소된 예약 {expired.length}건 {openExp ? "접기" : "펼치기"}</span>
            <span className="rt"><span className="badge-st st-cancelled">지난 일</span></span>
          </div>
          <div className="detail">
            {expired.map((r) => (
              <div key={r.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "7px 0", borderTop: "1px solid var(--line)", fontSize: 13 }}>
                <span style={{ color: "var(--faint)", minWidth: 42 }}>{formatStampTime(r.cancelled_at)}</span>
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

  // 서버 통계(isRefundOwed)와 같은 기준을 써야 뱃지 수와 목록 수가 어긋나지 않는다.
  //   · needAcct : 돈은 남았는데 손님 계좌를 모름 (사장님이 취소한 건) → 먼저 계좌 입력
  //   · todo     : 계좌까지 있어 바로 보낼 수 있음
  const owed = rows.filter(isRefundOwed);
  const needAcct = owed.filter((r) => !isRefundReady(r));
  const todo = owed.filter(isRefundReady);
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
        <div className="sp" />
        <button className="btn ghost sm" onClick={load}>새로고침</button>
      </div>

      {/* 🔴 사장님이 취소한 입금완료 건 — 돈은 돌려줘야 하는데 손님 계좌를 모른다.
          손님에게 계좌를 받아 여기서 입력하면, 아래 "바로 보낼 수 있음" 칸으로 내려간다. */}
      {needAcct.length > 0 && (
        <>
          <div className="notice warn" style={{ marginBottom: 10 }}>
            <b>계좌 입력 필요 {needAcct.length}건</b>
          </div>
          {needAcct.map((r) => (
            <NeedAcctRow key={r.id} r={r} onSaved={() => { load(); onDone(); }} />
          ))}
          <div className="card-h" style={{ marginTop: 22 }}>바로 보낼 수 있음</div>
        </>
      )}

      {todo.length === 0 ? (
        needAcct.length === 0 && (
          <div className="notice ok">보내드릴 환불 없음 — 다 처리하셨어요.</div>
        )
      ) : todo.map((r) => (
        <div key={r.id} className="rrow open">
          <div className="head" style={{ cursor: "default" }}>
            <span className="when">{daysAgoLabel(r.cancelled_at)}</span>
            <span className="who"><b>{r.refund_holder || r.name}</b> · <Phone v={r.phone} /></span>
            <span className="tname">{r.theme_name} · {formatDate(r.date)} {r.time}</span>
            <span className="rt"><span className="badge-st st-pending">환불 {r.refund_rate}%</span></span>
          </div>
          <div className="detail">
            {/* 사장님이 할 일은 하나 — **이 계좌로 이 금액을 보내는 것.**
                그래서 금액을 제일 크게, 바로 아래 계좌를 둔다. 나머지는 근거라 작게 내린다. */}
            <div className="refund-amt"><span>보낼 금액</span><b>{refundAmount(r).toLocaleString()}원</b></div>
            {/* 은행·계좌·예금주를 한 줄에 — 눈이 위아래로 안 움직이게 */}
            <div className="acct">
              <span className="bank">{r.refund_bank || "은행 없음"}</span>
              <b>{r.refund_account || "-"}</b>
              <span style={{ color: "var(--muted)" }}>예금주 {r.refund_holder || "-"}</span>
              <span className="sp" />
              <button className="btn sm ghost" onClick={() => copyAcct(r)}>
                {copied === r.id ? <>복사됨 </> : <>계좌 복사</>}
              </button>
            </div>
            {/* 근거·취소정보는 작게 아래로 — 손이 움직이는 건 금액과 계좌 두 가지뿐이다 */}
            <p className="refund-meta">
              예약금 {r.deposit.toLocaleString()}원 × {r.refund_rate}%
              {" · "}{formatStamp(r.cancelled_at)} {cancelledBy(r)}
            </p>
            {r.refund_holder && r.refund_holder !== r.name && (
              <p className="refund-warn">예금주({r.refund_holder})가 예약자({r.name})와 달라요 — 보내기 전 확인</p>
            )}
            <div className="act-row">
              {/* 금액을 버튼 라벨에 박아 오송금 방지 */}
              <button className="btn sm primary" disabled={busy === r.id} onClick={() => markRefunded(r)}>
                {busy === r.id ? "처리 중…" : <>{refundAmount(r).toLocaleString()}원 환불 완료</>}
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
                {/* 예약일이 아니라 '환불을 보낸 시각' — 통장 이체 기록과 맞춰보는 자리라 이게 맞다 */}
                <span className="when" style={{ color: "var(--faint)" }}>{formatStampShort(r.refunded_at)}</span>
                <span className="who">{r.refund_holder || r.name}</span>
                <span className="tname">{r.theme_name} · {formatDate(r.date)} {r.time}</span>
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

/* 🏦 계좌 입력 필요 한 줄 — 사장님이 취소한 입금완료 건.
   손님에게 계좌를 받아 은행·계좌번호·예금주를 넣고 저장하면 환불 큐로 올라간다. */
function NeedAcctRow({ r, onSaved }: { r: Reservation; onSaved: () => void }) {
  const [bank, setBank] = useState(r.refund_bank || "");
  const [acct, setAcct] = useState(r.refund_account || "");
  const [holder, setHolder] = useState(r.refund_holder || r.name); // 기본 예금주 = 예약자
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!bank.trim() || !acct.trim()) { alert("은행과 계좌번호를 입력해 주세요."); return; }
    setBusy(true);
    const res = await fetch("/api/admin/reservations", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: r.id, refund_bank: bank.trim(), refund_account: acct.trim(), refund_holder: holder.trim() || r.name }),
    });
    setBusy(false);
    if (res.ok) onSaved(); else alert((await res.json()).error || "저장 실패");
  }

  return (
    <div className="rrow open">
      <div className="head" style={{ cursor: "default" }}>
        <span className="when">{daysAgoLabel(r.cancelled_at)}</span>
        <span className="who"><b>{r.name}</b> · <Phone v={r.phone} /></span>
        <span className="tname">{r.theme_name} · {formatDate(r.date)} {r.time}</span>
        <span className="amt">{refundAmount(r).toLocaleString()}원</span>
        <span className="rt"><span className="badge-st st-pending">환불 {r.refund_rate}%</span></span>
      </div>
      <div className="detail">
        <p className="hint" style={{ margin: "0 0 8px" }}>
          예약금 {r.deposit.toLocaleString()}원 × 환불율 {r.refund_rate}% = <b style={{ color: "var(--text)" }}>{refundAmount(r).toLocaleString()}원</b>
          {" · "}취소 {formatStamp(r.cancelled_at)} ({cancelledBy(r)})
        </p>
        <div className="acct-form">
          <div className="field"><label>은행</label>
            <input value={bank} onChange={(e) => setBank(e.target.value)} placeholder="예: 카카오뱅크" maxLength={30} /></div>
          <div className="field"><label>계좌번호</label>
            <input value={acct} onChange={(e) => setAcct(e.target.value)} placeholder="숫자·하이픈" maxLength={40} inputMode="numeric" /></div>
          <div className="field"><label>예금주</label>
            <input value={holder} onChange={(e) => setHolder(e.target.value)} placeholder={r.name} maxLength={30} /></div>
        </div>
        <div className="act-row">
          <button className="btn sm primary" disabled={busy} onClick={save}>
            {busy ? "저장 중…" : <>계좌 저장 → 환불 처리로</>}
          </button>
        </div>
      </div>
    </div>
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
  // 같은 돈을 두 가지 눈으로 본다.
  //   bank = 통장에 들어온 돈 기준(카톡에서 읽은 것) → 놓친 입금이 보인다
  //   res  = 예약에 도장이 찍힌 기준 → 환불까지 포함한 정산 장부
  const [basis, setBasis] = useState<"bank" | "res">("bank");

  const load = useCallback(async () => {
    setLoaded(false);
    const res = await fetch(`/api/admin/reservations?basis=money&from=${from}&to=${to}`);
    if (res.ok) setRows(((await res.json()).reservations || []) as Reservation[]);
    setLoaded(true);
  }, [from, to]);
  useEffect(() => { load(); }, [load]);

  // 예약 1건이 거래 2건(입금·환불)을 만들 수 있다 → 거래 단위로 펼친다
  // 한국 날짜로 비교 — UTC 문자열을 그냥 자르면 새벽 0~9시 거래가 전날로 밀린다
  const inRange = (iso: string | null | undefined) => { const d = kstDateOf(iso); return !!d && d >= from && d <= to; };
  const txs: Tx[] = [];
  for (const r of rows) {
    if (r.paid_at && inRange(r.paid_at)) txs.push({ id: r.id + ":in", at: r.paid_at, kind: "in", amount: r.deposit, r });
    if (r.refunded && r.refunded_at && inRange(r.refunded_at)) txs.push({ id: r.id + ":out", at: r.refunded_at, kind: "out", amount: refundAmount(r), r });
  }
  txs.sort((a, b) => b.at.localeCompare(a.at));
  const view = txs.filter((t) => (kind === "all" ? true : t.kind === kind));

  function exportCsv() {
    if (view.length === 0) { alert("내보낼 내역이 없습니다."); return; }
    const cell = (v: unknown) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    // 계좌·전화는 넣지 않음(개인정보)
    const header = ["돈 오간 날(한국시각)", "구분", "처리", "금액", "이름", "테마", "예약일", "예약시간"];
    const body = view.map((t) => [
      formatStamp(t.at), t.kind === "in" ? "입금" : "환불",
      t.kind === "in" ? (t.r.paid_source === "auto" ? "자동매칭" : t.r.paid_source === "manual" ? "수동" : "") : "",
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
        <button className="btn sm" onClick={load}>조회</button>
        <div className="sp" />
        <div className="dcmp-seg">
          <button className={basis === "bank" ? "on" : ""} onClick={() => setBasis("bank")}>통장(카톡) 기준</button>
          <button className={basis === "res" ? "on" : ""} onClick={() => setBasis("res")}>예약 기준</button>
        </div>
      </div>

      {basis === "bank" ? <BankLedger from={from} to={to} /> : <>

      <div className="admin-tools">
        <select value={kind} onChange={(e) => setKind(e.target.value as "all" | "in" | "out")}>
          <option value="all">전체</option><option value="in">입금만</option><option value="out">환불만</option>
        </select>
        <div className="sp" />
        <button className="btn ghost sm" onClick={exportCsv}>CSV 내보내기</button>
      </div>

      {!loaded ? <p style={{ color: "var(--muted)" }}>불러오는 중…</p>
        : view.length === 0 ? <div className="notice info">이 기간엔 오간 돈이 없습니다.</div>
          : view.map((t) => (
            <div key={t.id} className="rrow">
              <div className="head" style={{ cursor: "default" }}>
                <span className="when">{formatStampShort(t.at)}</span>
                <span className="who">{t.r.name}{t.r.deposit_payer && t.r.deposit_payer !== t.r.name ? ` (입금 ${t.r.deposit_payer})` : ""}</span>
                <span className="tname">{t.r.theme_name} · {formatDate(t.r.date)} {t.r.time}</span>
                <span className="amt" style={{ color: t.kind === "in" ? "#137a4c" : "var(--muted)" }}>
                  {t.kind === "in" ? "+" : "−"}{t.amount.toLocaleString()}원
                </span>
                <span className="rt">
                  {/* 입금을 자동매칭이 잡았는지 사장님이 직접 눌렀는지 — 자동매칭 붙이기 전 기록은 표시 없음 */}
                  {t.kind === "in" && t.r.paid_source === "auto" && <span className="src-tag" title="자동매칭 프로그램이 처리">자동</span>}
                  {t.kind === "in" && t.r.paid_source === "manual" && <span className="src-tag" title="관리자 화면에서 입금 확인 버튼을 눌러 처리">수동</span>}
                  {t.kind === "in"
                    ? <span className="badge-st st-confirmed">입금</span>
                    : <span className="badge-st st-cancelled">환불 {t.r.refund_rate}%</span>}
                </span>
              </div>
            </div>
          ))}
      </>}
    </>
  );
}

/* 🏦 통장(카톡) 기준 내역 — 태블릿이 카카오톡에서 읽은 입금을 그대로 늘어놓고,
   그 옆에 "이 예약인 것 같다"를 붙여 대조한다.

   왜 필요한가: 예약 기준 목록만 있으면 **돈은 들어왔는데 예약을 못 찾은 입금**이
   화면 어디에도 안 나온다. 손님이 다른 이름으로 보내거나 금액을 잘못 넣으면
   사장님이 그 사실을 영영 모른 채 지나간다. */
type DepCand = {
  id: string; name: string; theme_name: string; date: string; time: string;
  deposit: number; status: string; deposit_paid: boolean; source: string | null; why: string;
};
type DepRow = {
  id: string; at: string; depositorName: string; amount: number; rawText: string;
  status: string; errorMessage: string | null; verdict: string;
  matched: DepCand | null; candidates: DepCand[];
};

/** why 문장의 **강조** 만 굵게. (설명이 길어 핵심이 안 보이면 읽히지 않는다) */
function Emph({ text }: { text: string }) {
  return <>{text.split("**").map((s, i) => (i % 2 ? <b key={i}>{s}</b> : <span key={i}>{s}</span>))}</>;
}

const V_LABEL: Record<string, { t: string; c: string }> = {
  ok: { t: "자동확정됨", c: "st-confirmed" },
  near: { t: "보류 — 확인 필요", c: "st-pending" },
  none: { t: "맞는 예약 없음", c: "st-pending" },
  dry_run: { t: "연습모드(실제 처리 안 함)", c: "st-pending" },
  failed: { t: "처리 실패", c: "st-cancelled" },
  parse_failed: { t: "문구를 못 읽음", c: "st-cancelled" },
};

function BankLedger({ from, to }: { from: string; to: string }) {
  const [rows, setRows] = useState<DepRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState("");
  const [onlyIssue, setOnlyIssue] = useState(false);

  const load = useCallback(async () => {
    setLoaded(false);
    const res = await fetch(`/api/admin/deposits?from=${from}&to=${to}`);
    if (res.ok) setRows(((await res.json()).deposits || []) as DepRow[]);
    setLoaded(true);
  }, [from, to]);
  useEffect(() => { load(); }, [load]);

  async function attach(depositId: string, reservationId: string, name: string) {
    if (!confirm(`이 입금을 "${name}" 예약의 입금으로 확인 처리할까요?\n예약이 확정되고 안내가 나갑니다.`)) return;
    setBusy(depositId);
    const res = await fetch("/api/admin/deposits", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ depositId, reservationId }),
    });
    setBusy("");
    if (!res.ok) { alert(((await res.json()) as { error?: string }).error || "처리하지 못했습니다."); return; }
    load();
  }

  const view = onlyIssue ? rows.filter((d) => d.verdict !== "ok") : rows;

  return (
    <>
      <div className="admin-tools">
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
          <input type="checkbox" checked={onlyIssue} onChange={(e) => setOnlyIssue(e.target.checked)} />
          손이 필요한 것만 보기
        </label>
        <div className="sp" />
        <button className="btn ghost sm" onClick={load}>새로고침</button>
      </div>

      {!loaded ? <p style={{ color: "var(--muted)" }}>불러오는 중…</p>
        : view.length === 0 ? (
          <div className="notice info">
            {rows.length === 0
              ? "이 기간엔 카톡에서 읽은 입금이 없습니다."
              : "손이 필요한 입금이 없습니다."}
          </div>
        ) : view.map((d) => {
          const v = V_LABEL[d.verdict] ?? { t: d.status, c: "st-pending" };
          return (
            <div key={d.id} className="dcmp">
              <div className="dcmp-bank">
                <div className="dcmp-h">통장 (카카오톡)</div>
                <div className="dcmp-amt">+{d.amount.toLocaleString()}원</div>
                <div className="dcmp-who">{d.depositorName}</div>
                <div className="dcmp-when">{formatStampShort(d.at)}</div>
                <details className="dcmp-raw">
                  <summary>읽은 문구 그대로</summary>
                  <pre>{d.rawText}</pre>
                </details>
              </div>

              <div className="dcmp-res">
                <div className="dcmp-h">
                  예약 <span className={`badge-st ${v.c}`}>{v.t}</span>
                </div>

                {d.matched ? (
                  <>
                    <div className="dcmp-who">{d.matched.name}</div>
                    <div className="dcmp-sub">
                      {d.matched.theme_name} · {formatDate(d.matched.date)} {d.matched.time} · 예약금 {d.matched.deposit.toLocaleString()}원
                    </div>
                    {d.verdict === "ok" && <p className="dcmp-why">이 예약의 입금으로 처리됐습니다.</p>}
                    {d.verdict === "failed" && <p className="dcmp-why err">예약은 찾았지만 처리 중 오류가 났습니다: {d.errorMessage}</p>}
                  </>
                ) : d.verdict === "parse_failed" ? (
                  <p className="dcmp-why err">
                    문구에서 이름·금액을 못 뽑았습니다. 위 &ldquo;읽은 문구&rdquo;를 보고 알려주시면 읽는 규칙을 고칠 수 있습니다.
                  </p>
                ) : d.candidates.length === 0 ? (
                  <p className="dcmp-why">
                    이 이름·금액에 맞는 예약이 없습니다. 예약 없이 보낸 돈이거나, 예약을 아직 안 넣었을 수 있어요.
                  </p>
                ) : (
                  <>
                    <p className="dcmp-why">이 예약 같은데, 아래 이유로 <b>자동확인을 보류</b>했습니다:</p>
                    {d.candidates.map((c) => (
                      <div key={c.id} className="dcmp-cand">
                        <div className="dcmp-who">{c.name}</div>
                        <div className="dcmp-sub">
                          {c.theme_name} · {formatDate(c.date)} {c.time} · 예약금 {c.deposit.toLocaleString()}원
                          {c.source === "wp-import" && <span className="src-tag" style={{ marginLeft: 6 }}>기존 사이트</span>}
                        </div>
                        <p className="dcmp-why"><Emph text={c.why} /></p>
                        {/* 누를 수 있는 건 "지금 입금을 기다리는 예약"뿐이다.
                            취소·노쇼·이미 입금된 건에 버튼을 열어두면 손이 미끄러져 눌린다. */}
                        {!c.deposit_paid && c.status === "pending" && (
                          <button className="btn sm" disabled={busy === d.id}
                            onClick={() => attach(d.id, c.id, c.name)}>
                            {busy === d.id ? "처리 중…" : "이 예약이 맞아요 — 입금확인"}
                          </button>
                        )}
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          );
        })}
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
        홈페이지에 들어오면 뜨는 <b>공지 팝업</b>이에요. 켜면 <b>모든 페이지</b>에서 뜨고,
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
          <button className="btn sm ghost" onClick={() => setPreview(true)}>미리보기</button>
        </div>
      </div>

      {preview && (
        <div className="modal-overlay nt-overlay" onClick={(e) => { if (e.target === e.currentTarget) setPreview(false); }}>
          <div className="modal nt-modal">
            <button className="close-x" onClick={() => setPreview(false)} aria-label="닫기">×</button>
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
              <span className="rev-stars" style={{ color: "#b06f00", fontWeight: 700 }}>{r.rating}/5</span>
              <span className="who">{r.name}{r.phone ? ` · ${formatPhone(r.phone)}` : ""}</span>
              {r.source && <span className="src-tag">{r.source}</span>}
              <span className={`badge-st st-${r.status === "approved" ? "confirmed" : r.status === "rejected" ? "cancelled" : "pending"}`}>{REV_ST_LABEL[r.status] || r.status}</span>
            </div>
            <div className="detail">
              <div className="rev-body" style={{ whiteSpace: "pre-wrap", margin: "4px 0 10px", color: "var(--text)" }}>{r.body}</div>
              <div style={{ fontSize: 12, color: "var(--faint)", marginBottom: 10 }}>{formatStamp(r.created_at)}</div>
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
      <b>외부 후기 직접 등록 (네이버·구글 등 · 즉시 게시)</b>
      <div className="admin-tools" style={{ marginTop: 12, marginBottom: 8 }}>
        <select value={themeId} onChange={(e) => setThemeId(e.target.value)}>{THEMES.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.storeTag})</option>)}</select>
        <input type="text" placeholder="닉네임" value={name} onChange={(e) => setName(e.target.value)} />
        <select value={rating} onChange={(e) => setRating(Number(e.target.value))}>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{"★".repeat(n)} ({n})</option>)}</select>
        <input type="text" placeholder="출처 (네이버/구글/직접)" value={source} onChange={(e) => setSource(e.target.value)} list="rev-src" />
        <datalist id="rev-src"><option value="네이버" /><option value="구글" /><option value="직접" /></datalist>
      </div>
      <textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="후기 본문 (5자 이상)" style={{ width: "100%", background: "var(--bg2)", border: "1px solid var(--line)", borderRadius: 9, color: "var(--text)", padding: 10, fontFamily: "inherit", fontSize: 13.5 }} />
      {err && <div className="msg-err" style={{ marginTop: 8 }}>{err}</div>}
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
  // 자동 백업 목록/실행
  const [backups, setBackups] = useState<{ name: string; size: number | null; created_at: string | null; url: string | null }[]>([]);
  const [bkMsg, setBkMsg] = useState(""); const [bkRunning, setBkRunning] = useState(false);
  const loadBackups = () => fetch("/api/admin/backups").then((r) => r.json()).then((j) => setBackups(j.backups || [])).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadBackups(); }, []);
  async function runBackup() {
    setBkRunning(true); setBkMsg("");
    try {
      const res = await fetch("/api/cron/backup", { method: "POST" });
      const j = await res.json();
      if (res.ok) { setBkMsg("백업 완료 ✅"); loadBackups(); } else setBkMsg(j.error || "백업 실패");
    } catch { setBkMsg("백업 실패"); }
    setBkRunning(false);
  }
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
        <label>예약 임박 차단</label>
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
                  {changed && <span className="tpl-src edited" title={`원래 ${t.deposit.toLocaleString()}원`}>바꿈</span>}
                  <input type="number" min="0" step="1000" value={v}
                    onChange={(e) => setDeposits({ ...deposits, [t.id]: e.target.value })}
                    style={{ width: 108, textAlign: "right", fontFeatureSettings: '"tnum"', fontWeight: 700 }} />
                  <span style={{ color: "var(--muted)" }}>원</span>
                </span>
              </div>
            );
          })}
        </div>
        {/* 예약대기 안내 문자를 없애면서(2026-08-03) 금액이 적힌 문자가 사라졌다.
            이제 손님이 보는 예약금 금액은 **예약 화면과 예약금 안내 팝업**이 여기 값을 바로 읽어 쓴다. */}
        <div className="hint">
          여기서 바꾼 예약금이 <b>예약 화면과 예약금 안내 팝업</b>에 바로 반영됩니다.
          (문자에는 예약금 금액이 들어가지 않아요 — 확정문자만 나갑니다)
        </div>
      </div>
      </div>

      <div className="admin-card">
      <h3 className="card-h">예약 시간표</h3>
      <div className="field">
        <label>기본 예약 시간대 <span style={{ color: "var(--faint)", fontWeight: 400, fontSize: 12 }}>(아래 매장별 설정이 없는 매장에 적용)</span></label>
        <div className="optrow" style={{ marginBottom: 8 }}>
          {slots.map((s) => <div key={s} className="opt on" style={{ minWidth: 64, flex: "0 0 auto" }} onClick={() => setSlots(slots.filter((x) => x !== s))}>{s} ×</div>)}
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
        <h3 className="card-h">전체 백업</h3>
        <p className="hint" style={{ marginTop: 0 }}>
          예약·리뷰·설정·시간표·문자 문구·휴무를 <b>파일 하나로</b> 내려받아요.
          지금 쓰는 DB(무료 플랜)는 <b>실수로 지우면 되돌릴 방법이 없어서</b>, 가끔 받아두시면 안전해요.
          <br />손님 이름·전화가 들어있으니 아무 데나 올리지 마세요. (손님 비밀번호는 일부러 뺐어요)
        </p>
        <a className="btn sm" href="/api/admin/backup" download>전체 백업 받기 (JSON)</a>

        {/* 자동 백업 (매주 월요일 · Supabase Storage 비공개 보관함) */}
        <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
          <h4 style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 800, display: "flex", alignItems: "center", gap: 6 }}>자동 백업 (매주 월요일)</h4>
          <p className="hint" style={{ marginTop: 0 }}>
            매주 자동으로 전체 백업을 만들어 <b>안전한 보관함</b>에 올려둬요(최근 12개 보관). 실수로 지워도 아래에서 받아 되돌릴 수 있어요.
          </p>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button className="btn ghost sm" onClick={runBackup} disabled={bkRunning}>{bkRunning ? "백업 중…" : "지금 백업 실행"}</button>
            {bkMsg && <span className="hint" style={{ margin: 0 }}>{bkMsg}</span>}
          </div>
          {backups.length > 0 ? (
            <ul style={{ listStyle: "none", padding: 0, margin: "12px 0 0", display: "flex", flexDirection: "column", gap: 6 }}>
              {backups.map((b) => (
                <li key={b.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, fontSize: 13, background: "var(--bg2)", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 12px" }}>
                  <span>{b.name.replace("backup_", "").replace(".json", "")}{b.size ? ` · ${Math.round(b.size / 1024)}KB` : ""}</span>
                  {b.url && <a className="tlink" href={b.url} download>받기</a>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="hint" style={{ marginTop: 10 }}>아직 자동 백업이 없어요. 첫 백업은 다음 월요일에 생기고, 지금 바로 만들려면 “지금 백업 실행”을 눌러주세요.</p>
          )}
        </div>
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
          list.map((s) => <div key={s} className="opt on" style={{ minWidth: 58, flex: "0 0 auto" }} onClick={() => onChange(list.filter((x) => x !== s))}>{s} ×</div>)}
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
  if (err) return <div className="msg-err">{err}</div>;

  return (
    <div>
      <div className={"notice " + (kakao ? "ok" : aligo ? "ok" : "warn")} style={{ marginBottom: 16 }}>
        {kakao
          ? "✅ 카카오 알림톡 연동됨 — 확정/취소 안내가 카톡으로 발송됩니다. (카톡 실패 시 문자로 자동 대체)"
          : aligo
          ? "✅ NHN Cloud 문자 연동됨 — 확정/취소 시 자동 발송됩니다. (알림톡 키 등록 시 카톡 우선 발송)"
          : "⚠️ NHN Cloud 문자/알림톡 키가 아직 없어요. 지금은 발송 내역만 기록되고 실제 발송은 안 나가요. (가입·키 등록 시 자동 발송)"}
      </div>
      <div className="notice info" style={{ marginBottom: 14 }}>
        <b>테마별</b> 딱지가 붙은 문자는 <b>테마마다 문구가 따로</b>예요(기존 사이트와 동일).
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
              <span className={"tpl-src " + (saved ? "edited" : "")}>{saved ? <>직접 수정함</> : "기존 사이트 문구"}</span>
            </div>

            {g.perTheme && (
              <div className="theme-tabs" style={{ margin: "12px 0 10px" }}>
                {g.themes.map((t) => (
                  <button key={t.id} className={"tt-btn" + (cur === t.id ? " on" : "")} onClick={() => setPickTheme({ ...pickTheme, [g.type]: t.id })}>
                    {t.name}{t.saved && <span className="tt-badge"></span>}
                  </button>
                ))}
              </div>
            )}

            <p className="hint" style={{ margin: "3px 0 8px" }}>치환: {"{이름} {테마} {날짜} {시간} {인원} {환불율}"}</p>
            <textarea className="tpl-ta" rows={g.perTheme ? 10 : 6} value={body} onChange={(e) => edit(g.type, cur, e.target.value)} />
            <div className="act-row">
              {/* 저장 6개가 전부 파랬음 → 기본 버튼으로. 수정 여부는 위 .tpl-src 배지가 알려줌 */}
              <button className="btn sm" onClick={() => saveTpl(g.type, cur, label)}>저장</button>
              {saved && <button className="btn sm ghost" onClick={() => resetTpl(g.type, cur, label)}>기존 문구로 되돌리기</button>}
              <span className="rt" style={{ fontSize: 12, color: "var(--faint)" }}>{body.length}자</span>
            </div>
          </div>
        );
      })}
      {msg && <div className={msg.startsWith("⚠️") ? "msg-err" : "notice ok"}>{msg}</div>}
      <div className="admin-card">
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <b>발송 내역</b>
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
                <span style={{ color: "var(--faint)" }}>{formatStampShort(l.created_at)}</span>
                {l.status !== "sent" && (
                  <span className="rt">
                    {isActiveSmsType(l.type) ? (
                      <button className="btn sm ghost" disabled={resend === l.id} onClick={() => resendSms(l.id)}>
                        {resend === l.id ? "보내는 중…" : <>다시 보내기</>}
                      </button>
                    ) : (
                      // 이제 안 쓰는 종류(방문 전날 자동안내)의 옛 기록 — 눌러도 안 나가므로 버튼을 안 보여준다.
                      <span style={{ color: "var(--faint)", fontSize: 11 }}>지금은 안 쓰는 안내</span>
                    )}
                  </span>
                )}
              </div>
              {l.error && <div style={{ color: "var(--danger)", marginTop: 2, fontSize: 11.5 }}>{l.error}</div>}
              <div style={{ color: "var(--muted)", whiteSpace: "pre-wrap", marginTop: 2 }}>{l.body}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
