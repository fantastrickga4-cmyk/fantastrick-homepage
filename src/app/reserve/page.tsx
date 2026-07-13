"use client";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { THEMES, TIME_SLOTS, STORES, slotsForStoreDate, type StoreSlots } from "@/lib/data";
import { formatDate, formatPhone, isValidPhone, reservationDateState } from "@/lib/util";

type Cfg = { timeSlots: string[]; disabledThemes: string[]; storeSlots?: Record<string, StoreSlots> };

// 선택한 이용일의 예약창 오픈일(이용일 - 7일) 을 "M월 D일" 로 반환
function openDateLabel(dateStr: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return "";
  const o = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) - 7);
  return `${o.getMonth() + 1}월 ${o.getDate()}일`;
}

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
          // 예약 오픈 규칙: 이용일 1주일 전 저녁 9시(21:00)에 오픈
          const openAt = new Date(view.y, view.m, d - 7, 21, 0, 0, 0);
          const notOpen = !past && now < openAt;
          const openHint = `${openAt.getMonth() + 1}월 ${openAt.getDate()}일 저녁 9시 오픈`;
          const dow = new Date(view.y, view.m, d).getDay();
          return (
            <button
              key={ds}
              type="button"
              className={
                "rcal-cell" +
                (value === ds ? " on" : "") +
                (ds === todayS ? " today" : "") +
                (past ? " past" : "") +
                (notOpen ? " locked" : "") +
                (dow === 0 ? " sun" : dow === 6 ? " sat" : "")
              }
              disabled={past}
              aria-pressed={value === ds}
              aria-label={notOpen ? `${view.m + 1}월 ${d}일 · ${openHint}` : `${view.m + 1}월 ${d}일`}
              title={notOpen ? openHint : undefined}
              onClick={() => { if (!past) onChange(ds); }}
            >
              <span className="rcal-d">{d}</span>
              {notOpen && <span className="rcal-lk" aria-hidden="true">🔒</span>}
            </button>
          );
        })}
      </div>
      <div className="rcal-legend">
        <span><span className="lk">🔒</span> 아직 예약 오픈 전</span>
        <span>예약은 이용일 <b>일주일 전 저녁 9시</b>에 열립니다</span>
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
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [showDeposit, setShowDeposit] = useState(false); // 접수 후 예약금 안내 팝업
  const [depositAck, setDepositAck] = useState(false);    // "확인했습니다" 체크 여부

  const [cfg, setCfg] = useState<Cfg>({ timeSlots: TIME_SLOTS, disabledThemes: [] });
  const [blocked, setBlocked] = useState<string[]>([]);
  const [dayClosed, setDayClosed] = useState(false);

  const availableThemes = useMemo(() => THEMES.filter((t) => !cfg.disabledThemes.includes(t.id)), [cfg.disabledThemes]);
  const theme = useMemo(() => THEMES.find((t) => t.id === themeId), [themeId]);
  const store = useMemo(() => STORES.find((s) => s.id === theme?.store), [theme]);
  const deposit = theme?.deposit ?? 0;

  // 선택한 날짜가 아직 예약 오픈 전인지 (오픈 전이면 시간·인원·신청 숨김)
  const notOpenSelected = useMemo(() => (date ? reservationDateState(date) === "not_open" : false), [date]);

  // 선택한 테마(매장)·날짜(요일)에 실제 예약 가능한 시간대
  const activeSlots = useMemo(
    () => slotsForStoreDate(cfg.storeSlots, cfg.timeSlots, theme?.store, date),
    [cfg.storeSlots, cfg.timeSlots, theme?.store, date],
  );
  // 그 요일은 아예 예약을 안 받는 매장(휴무) 인지
  const noSlotsDay = useMemo(() => !!(themeId && date && activeSlots.length === 0), [themeId, date, activeSlots]);

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
    if (notOpenSelected) return setErr("아직 예약 오픈 전인 날짜입니다. 다른 날짜를 선택해 주세요.");
    if (noSlotsDay) return setErr("선택한 날짜는 예약을 받지 않는 요일입니다. 다른 날짜를 선택해 주세요.");
    if (!time) return setErr("시간을 선택해 주세요.");
    if (!name.trim()) return setErr("예약자 이름을 입력해 주세요.");
    if (!phone.trim()) return setErr("전화번호를 입력해 주세요.");
    if (!isValidPhone(phone)) return setErr("전화번호 형식을 확인해 주세요. (예: 010-1234-5678)");
    if (!/^\d{4}$/.test(pin)) return setErr("비밀번호는 숫자 4자리로 입력해 주세요.");
    setLoading(true);
    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ themeId, date, time, people, name, phone, pin }),
      });
      const j = await res.json();
      if (!res.ok) {
        setErr(j.error || "예약에 실패했습니다.");
      } else {
        setDone(true);
        setShowDeposit(true);
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
            예약금 결제·확정 안내를 도와드릴게요. 예약금은 <b>{deposit.toLocaleString()}원</b>입니다.
            입력하신 전화번호로 곧 예약금 입금 안내 연락이 도착할 예정입니다.
            <b> 예약금 입금이 확인되어야 비로소 예약이 확정 처리</b>됩니다.
            <b> 30분 내 예약금 미입금 시 예약은 자동 취소</b>됩니다.
            예약 확인 및 취소는{" "}
            <Link href="/reservation" style={{ color: "var(--cyan)", fontWeight: 700 }}>예약조회</Link>
            에서 진행하실 수 있습니다.
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
            <Link href="/reservation" className="btn primary">예약 조회·취소</Link>
            <Link href="/" className="btn ghost">홈으로</Link>
          </div>
        </div>

        {showDeposit && (
          <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="deposit-title">
            <div className="modal">
              <h3 id="deposit-title">예약금 입금 안내</h3>
              <div className="modal-policy">
                <p>예약금은 <b>{deposit.toLocaleString()}원</b>입니다.</p>
                <p>입금 계좌 : <b>카카오뱅크 3333-09-7175706</b> (승현수)</p>
                <p>예약금 입금이 확인되어야 비로소 예약이 확정 처리됩니다.</p>
                <p>입금하실 때 <b>보내는 분(예금주)을 예약자 이름과 동일하게</b><br />해주셔야 정상 처리됩니다.</p>
                <p><b>30분 내 예약금 미입금 시 예약은 자동 취소</b>됩니다.</p>
                <p>예약금 환불 요청 시 처리까지 <b>최대 24시간</b>이 소요될 수 있습니다. 입금 전 참고 부탁드립니다.</p>
              </div>
              <label className="agree-row">
                <input type="checkbox" checked={depositAck} onChange={(e) => setDepositAck(e.target.checked)} />
                위 내용을 확인했습니다.
              </label>
              <div className="modal-btns">
                <button className="btn primary" disabled={!depositAck} onClick={() => setShowDeposit(false)}>확인</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="formwrap">
      <div className="page-top" />
      <h2 className="title" style={{ marginBottom: 22 }}>테마 예약</h2>

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
          {date && notOpenSelected && (
            <div className="rcal-sel" style={{ marginTop: 4 }}>
              예약창 오픈 날짜: <b>{openDateLabel(date)} 저녁 9시</b>
            </div>
          )}
        </div>

        {/* 오픈 전 날짜: 예약 단계 대신 안내만 */}
        {notOpenSelected ? (
          <div className="notice warn">
            이 날짜는 아직 예약 오픈 전이에요. <b>{openDateLabel(date)} 저녁 9시</b>부터 예약 가능합니다.
          </div>
        ) : (
        <>
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
          {dayClosed || noSlotsDay ? (
            <div className="notice warn">선택하신 날짜는 예약을 받지 않습니다. 다른 날짜를 선택해 주세요.</div>
          ) : (
            <div className="optrow">
              {activeSlots.map((tm) => {
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
            <input
              type="tel"
              inputMode="numeric"
              value={phone}
              placeholder="010-1234-5678"
              maxLength={13}
              onChange={(e) => {
                const d = e.target.value.replace(/[^0-9]/g, "").slice(0, 11);
                const f = d.length > 7 ? `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}` : d.length > 3 ? `${d.slice(0, 3)}-${d.slice(3)}` : d;
                setPhone(f);
              }}
            />
          </div>
        </div>

        {/* 예약 비밀번호 — 조회·취소 시 본인 확인용 */}
        <div className="field">
          <label>예약 비밀번호 (숫자 4자리)</label>
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={pin}
            placeholder="숫자 4자리"
            autoComplete="off"
            onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
          />
        </div>

        <div className="notice info">
          <b>전화번호를 제대로 입력</b>해야만 예약금 관련 안내를 받으실 수 있습니다.<br />
          예약 조회·취소할 때 <b>비밀번호</b>가 필요해요. 잊지 않게 기억해 주세요.
        </div>

        {err && <div className="msg-err">⚠️ {err}</div>}

        <button className="btn primary" style={{ width: "100%", justifyContent: "center", marginTop: 6 }} onClick={submit} disabled={loading}>
          {loading ? "접수 중…" : "예약 신청하기"}
        </button>
        </>
        )}
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
