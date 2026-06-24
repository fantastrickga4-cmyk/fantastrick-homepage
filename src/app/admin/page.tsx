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
const TABS = [
  { k: "res", label: "예약 관리" }, { k: "cal", label: "캘린더" }, { k: "slot", label: "시간대" },
  { k: "set", label: "설정" }, { k: "sms", label: "문자" },
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
            <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doLogin()} autoFocus />
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
      {tab === "set" && <SettingsTab />}
      {tab === "sms" && <SmsTab />}
    </div>
  );
}

/* ============ 예약 관리 탭 ============ */
function ReservationsTab() {
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

  return (
    <>
      <div className="admin-top" style={{ marginBottom: 14 }}>
        {newAlert > 0 && <button className="btn primary sm" onClick={() => { setNewAlert(0); setFStatus("pending"); }}>🔔 새 예약 {newAlert}건</button>}
        <div className="sp" />
        <button className="btn ghost sm" onClick={() => load()}>새로고침</button>
        <button className="btn primary sm" onClick={() => setShowAdd(true)}>+ 수동 예약 등록</button>
      </div>
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

function ManualAdd({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [themeId, setThemeId] = useState(THEMES[0].id); const [date, setDate] = useState(""); const [time, setTime] = useState(TIME_SLOTS[0]);
  const [people, setPeople] = useState(2); const [name, setName] = useState(""); const [phone, setPhone] = useState(""); const [memo, setMemo] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
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
          <div className="field"><label>시간</label><select value={time} onChange={(e) => setTime(e.target.value)}>{TIME_SLOTS.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
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

/* ============ 설정 탭 ============ */
function SettingsTab() {
  const [deposit, setDeposit] = useState(0); const [slots, setSlots] = useState<string[]>([]); const [disabled, setDisabled] = useState<string[]>([]);
  const [slotInput, setSlotInput] = useState(""); const [msg, setMsg] = useState(""); const [loaded, setLoaded] = useState(false);
  useEffect(() => { fetch("/api/admin/settings").then((r) => r.json()).then((c) => { setDeposit(c.depositPerPerson); setSlots(c.timeSlots); setDisabled(c.disabledThemes || []); setLoaded(true); }); }, []);
  async function save() {
    setMsg("");
    const res = await fetch("/api/admin/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ depositPerPerson: deposit, timeSlots: slots, disabledThemes: disabled }) });
    setMsg(res.ok ? "저장되었습니다 ✅" : "저장 실패");
  }
  if (!loaded) return <p style={{ color: "var(--muted)" }}>불러오는 중…</p>;
  return (
    <div className="admin-card" style={{ maxWidth: 560 }}>
      <div className="field"><label>1인당 예약금 (원)</label><input type="number" value={deposit} onChange={(e) => setDeposit(Number(e.target.value))} /></div>
      <div className="field">
        <label>예약 가능 시간대</label>
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
        <label>예약 받을 테마 (체크 해제 시 예약 화면에서 숨김)</label>
        {THEMES.map((t) => (
          <label key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 400, padding: "4px 0" }}>
            <input type="checkbox" checked={!disabled.includes(t.id)} onChange={(e) => { if (e.target.checked) setDisabled(disabled.filter((x) => x !== t.id)); else setDisabled([...disabled, t.id]); }} style={{ width: "auto" }} />
            {t.name} <span style={{ color: "var(--faint)", fontSize: 12 }}>({t.storeTag})</span>
          </label>
        ))}
      </div>
      {msg && <div className="notice ok">{msg}</div>}
      <button className="btn primary" style={{ width: "100%", justifyContent: "center", marginTop: 6 }} onClick={save}>설정 저장</button>
    </div>
  );
}

/* ============ 문자 탭 ============ */
type SmsLog = { id: string; phone: string; body: string; type: string; status: string; error: string | null; created_at: string };
function SmsTab() {
  const [tpls, setTpls] = useState<Record<string, string>>({ confirm: "", cancel: "", reminder: "" });
  const [log, setLog] = useState<SmsLog[]>([]); const [aligo, setAligo] = useState(false); const [msg, setMsg] = useState(""); const [loaded, setLoaded] = useState(false);
  const load = () => fetch("/api/admin/sms").then((r) => r.json()).then((j) => { setTpls(j.templates); setLog(j.log || []); setAligo(j.aligoReady); setLoaded(true); });
  useEffect(() => { load(); }, []);
  async function saveTpl(type: string) {
    setMsg("");
    const res = await fetch("/api/admin/sms", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, body: tpls[type] }) });
    setMsg(res.ok ? `${LABEL[type]} 저장됨 ✅` : "저장 실패");
  }
  const LABEL: Record<string, string> = { confirm: "예약확정 문자", cancel: "취소 문자", reminder: "방문 리마인더" };
  if (!loaded) return <p style={{ color: "var(--muted)" }}>불러오는 중…</p>;
  return (
    <div>
      <div className={"notice " + (aligo ? "ok" : "warn")} style={{ marginBottom: 16 }}>
        {aligo ? "✅ 알리고 문자 연동됨 — 확정/취소 시 자동 발송됩니다." : "⚠️ 알리고(문자 서비스) 키가 아직 없어요. 지금은 발송 내역만 기록되고 실제 문자는 나가지 않아요. (가입 후 ALIGO 키 등록 시 자동 발송)"}
      </div>
      {(["confirm", "cancel", "reminder"] as const).map((type) => (
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
