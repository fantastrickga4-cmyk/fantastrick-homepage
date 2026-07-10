"use client";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { THEMES, TIME_SLOTS, DEPOSIT_PER_PERSON, STORES } from "@/lib/data";
import { formatDate, formatPhone } from "@/lib/util";

type Cfg = { depositPerPerson: number; timeSlots: string[]; disabledThemes: string[] };

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

// 상시 표시되는 인라인 월 달력 (클릭 팝업 없이 항상 떠 있음)
function Calendar({ value, onChange }: { value: string; onChange: (d: string) => void }) {
  const now = new Date();
  const [view, setView] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const todayS = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  const firstDow = new Date(view.y, view.m, 1).getDay();
  const days = new Date(view.y, view.m + 1, 0).getDate();
  const atMin = view.y < now.getFullYear() || (view.y === now.getFullYear() && view.m <= now.getMonth());

  function move(delta: number) {
    let y = view.y;
    let m = view.m + delta;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    setView({ y, m });
  }

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i += 1) cells.push(null);
  for (let d = 1; d <= days; d += 1) cells.push(d);
  const dows = ["일", "월", "화", "수", "목", "금", "토"];

  return (
    <div className="rcal">
      <div className="rcal-head">
        <button type="button" className="rcal-nav" onClick={() => move(-1)} disabled={atMin} aria-label="이전 달">‹</button>
        <b>{view.y}년 {view.m + 1}월</b>
        <button type="button" className="rcal-nav" onClick={() => move(1)} aria-label="다음 달">›</button>
      </div>
      <div className="rcal-grid">
        {dows.map((d, i) => (
          <div key={d} className={"rcal-dow" + (i === 0 ? " sun" : i === 6 ? " sat" : "")}>{d}</div>
        ))}
        {cells.map((d, i) => {
          if (d === null) return <div key={`e${i}`} className="rcal-cell empty" aria-hidden="true" />;
          const ds = `${view.y}-${pad2(view.m + 1)}-${pad2(d)}`;
          const past = ds < todayS;
          const dow = new Date(view.y, view.m, d).getDay();
          return (
            <button
              key={ds}
              type="button"
              className={"rcal-cell" + (value === ds ? " on" : "") + (ds === todayS ? " today" : "") + (dow === 0 ? " sun" : dow === 6 ? " sat" : "")}
              disabled={past}
              aria-pressed={value === ds}
              aria-label={`${view.m + 1}월 ${d}일`}
              onClick={() => onChange(ds)}
            >
              {d}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ReserveInner() {
  const params = useSearchParams();
  const preset = params.get("theme") || "";

  const [themeId, setThemeId] = useState(preset && THEMES.some((t) => t.id === preset) ? preset : "");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [people, setPeople] = useState(2);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const [cfg, setCfg] = useState<Cfg>({ depositPerPerson: DEPOSIT_PER_PERSON, timeSlots: TIME_SLOTS, disabledThemes: [] });
  const [blocked, setBlocked] = useState<string[]>([]);
  const [dayClosed, setDayClosed] = useState(false);

  const availableThemes = useMemo(() => THEMES.filter((t) => !cfg.disabledThemes.includes(t.id)), [cfg.disabledThemes]);
  const theme = useMemo(() => THEMES.find((t) => t.id === themeId), [themeId]);
  const store = useMemo(() => STORES.find((s) => s.id === theme?.store), [theme]);
  const deposit = cfg.depositPerPerson * people;

  useEffect(() => {
    if (preset && THEMES.some((t) => t.id === preset)) setThemeId(preset);
  }, [preset]);

  // 관리자 설정 불러오기 (예약금·시간대·숨김테마)
  useEffect(() => {
    fetch("/api/config").then((r) => r.json()).then((c) => { if (c?.timeSlots) setCfg(c); }).catch(() => {});
  }, []);

  // 테마·날짜 선택 시 마감(차단/예약된) 시간 조회
  useEffect(() => {
    if (!themeId || !date) { setBlocked([]); setDayClosed(false); return; }
    fetch(`/api/slots?theme=${themeId}&date=${date}`)
      .then((r) => r.json())
      .then((d) => { setBlocked(d.blocked || []); setDayClosed(!!d.dayClosed); if (d.blocked?.includes(time)) setTime(""); })
      .catch(() => {});
  }, [themeId, date]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit() {
    setErr("");
    if (!themeId) return setErr("테마를 선택해 주세요.");
    if (!date) return setErr("날짜를 선택해 주세요.");
    if (!time) return setErr("시간을 선택해 주세요.");
    if (!name.trim()) return setErr("예약자 이름을 입력해 주세요.");
    if (!phone.trim()) return setErr("전화번호를 입력해 주세요.");
    setLoading(true);
    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ themeId, date, time, people, name, phone }),
      });
      const j = await res.json();
      if (!res.ok) {
        setErr(j.error || "예약에 실패했습니다.");
      } else {
        setDone(true);
      }
    } catch {
      setErr("네트워크 오류가 발생했습니다. 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="formwrap">
        <div className="page-top" />
        <div className="card">
          <div className="notice ok">✅ 예약 신청이 접수되었습니다!</div>
          <div className="res-summary">
            <div className="r"><span>테마</span><b>{theme?.name}</b></div>
            <div className="r"><span>매장</span><b>{store?.name}</b></div>
            <div className="r"><span>일시</span><b>{formatDate(date)} {time}</b></div>
            <div className="r"><span>인원</span><b>{people}명</b></div>
            <div className="r"><span>예약자</span><b>{name} ({formatPhone(phone)})</b></div>
            <div className="r"><span>예약금</span><b>{deposit.toLocaleString()}원</b></div>
          </div>
          <div className="notice info" style={{ marginTop: 16 }}>
            예약금 결제·확정 안내 문자는 곧 제공될 예정입니다. 예약 확인·취소는{" "}
            <Link href="/reservation" style={{ color: "var(--cyan)", fontWeight: 700 }}>예약 조회</Link> 에서
            전화번호로 하실 수 있어요.
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
            <Link href="/reservation" className="btn primary">예약 조회·취소</Link>
            <Link href="/" className="btn ghost">홈으로</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="formwrap">
      <div className="page-top" />
      <h2 className="title" style={{ marginBottom: 4 }}>테마 예약</h2>
      <p className="lead" style={{ marginBottom: 22 }}>원하는 테마와 시간을 골라 예약하세요. (회원가입 없이 전화번호로 예약)</p>

      <div className="card">
        {/* 테마 선택 */}
        <div className="field">
          <label>테마 선택</label>
          <div className="optrow">
            {availableThemes.map((t) => (
              <button
                key={t.id}
                type="button"
                className={"opt" + (themeId === t.id ? " on" : "")}
                aria-pressed={themeId === t.id}
                onClick={() => setThemeId(t.id)}
              >
                {t.name}
                <span style={{ display: "block", fontSize: 11, color: "var(--muted)", marginTop: 3 }}>{t.storeTag}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 날짜 — 상시 인라인 달력 */}
        <div className="field">
          <label>날짜</label>
          <Calendar value={date} onChange={setDate} />
          {date && <div className="rcal-sel">선택한 날짜: <b>{formatDate(date)}</b></div>}
        </div>

        {/* 인원 */}
        <div className="field">
          <label>인원</label>
          <select value={people} onChange={(e) => setPeople(Number(e.target.value))}>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <option key={n} value={n}>{n}명</option>
            ))}
          </select>
        </div>

        {/* 시간 */}
        <div className="field">
          <label>시간</label>
          {dayClosed ? (
            <div className="notice warn">선택하신 날짜는 예약을 받지 않습니다. 다른 날짜를 선택해 주세요.</div>
          ) : (
            <div className="optrow">
              {cfg.timeSlots.map((tm) => {
                const isBlocked = blocked.includes(tm);
                return (
                  <button
                    key={tm}
                    type="button"
                    className={"opt" + (time === tm ? " on" : "") + (isBlocked ? " soon" : "")}
                    aria-pressed={time === tm}
                    disabled={isBlocked}
                    style={{ minWidth: 64, flex: "0 0 auto" }}
                    onClick={() => { if (!isBlocked) setTime(tm); }}
                    title={isBlocked ? "마감" : ""}
                  >
                    {tm}{isBlocked ? " 🚫" : ""}
                  </button>
                );
              })}
            </div>
          )}
          <div className="hint">※ 🚫 표시는 마감(예약 불가)된 시간입니다.</div>
        </div>

        {/* 예약자 정보 */}
        <div className="grid2">
          <div className="field">
            <label>예약자 이름</label>
            <input type="text" value={name} placeholder="홍길동" onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label>전화번호</label>
            <input type="tel" value={phone} placeholder="010-1234-5678" onChange={(e) => setPhone(e.target.value)} />
          </div>
        </div>

        <div className="notice info">
          예약금 <b>{deposit.toLocaleString()}원</b> ({people}명 × {cfg.depositPerPerson.toLocaleString()}원) ·
          결제 연결은 준비 중이며, 지금은 예약 신청만 접수됩니다.
        </div>

        {err && <div className="msg-err">⚠️ {err}</div>}

        <button className="btn primary" style={{ width: "100%", justifyContent: "center", marginTop: 6 }} onClick={submit} disabled={loading}>
          {loading ? "접수 중…" : "예약 신청하기"}
        </button>
      </div>

      <p style={{ marginTop: 16, textAlign: "center" }}>
        <Link href="/reservation" style={{ color: "var(--muted)" }}>이미 예약하셨나요? 예약 조회·취소 →</Link>
      </p>
    </div>
  );
}

export default function ReservePage() {
  return (
    <Suspense fallback={<div className="formwrap"><div className="page-top" /></div>}>
      <ReserveInner />
    </Suspense>
  );
}
