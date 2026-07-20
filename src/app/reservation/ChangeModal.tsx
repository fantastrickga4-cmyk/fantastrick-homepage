"use client";
import { useEffect, useMemo, useState } from "react";
import { slotsForThemeDate, isTooSoon, TIME_SLOTS, THEME_SLOTS, type StoreSlots, type SlotSchedule } from "@/lib/data";
import { formatDate, reservationDateState } from "@/lib/util";
import { ReserveCalendar, openDateLabel } from "@/components/ReserveCalendar";
import { IconClose, IconWarn, IconBan, IconClock } from "@/components/Icon";

type Cfg = {
  timeSlots: string[];
  storeSlots?: Record<string, StoreSlots>;
  themeSlots?: Record<string, SlotSchedule>;
  minLeadMinutes?: number;
};

type Target = {
  id: string;
  store_id: string;
  theme_id: string;
  theme_name: string;
  date: string;
  time: string;
};

// 예약 시간·날짜 변경 팝업.
//   새 예약(/reserve)의 ②날짜 ③시간 단계를 그대로 가져와, "옮길 날짜·시간"만 고르게 한다.
//   같은 테마 안에서만 옮기므로 테마 선택 단계는 없다(예약금 그대로).
export default function ChangeModal({
  target, phone, name, pin, onClose, onDone,
}: {
  target: Target;
  phone: string;
  name: string;
  pin: string;
  onClose: () => void;
  onDone: (id: string, date: string, time: string) => void;
}) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  // 새 예약 화면과 똑같이 기본 시간표로 시작한다. 이걸 빈 배열로 두면 /api/config 가 실패했을 때
  // 시간표가 텅 비어 "그 요일은 예약을 받지 않아요" 라고 잘못 안내된다(2026-07-20 자체 점검에서 발견).
  const [cfg, setCfg] = useState<Cfg>({ timeSlots: TIME_SLOTS, themeSlots: THEME_SLOTS });
  const [cfgLoaded, setCfgLoaded] = useState(false);
  const [blocked, setBlocked] = useState<string[]>([]);
  const [dayClosed, setDayClosed] = useState(false);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [err, setErr] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const leadMin = cfg.minLeadMinutes ?? 10;
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNowMs(Date.now()), 30000); return () => clearInterval(t); }, []);

  // 관리자 설정(시간표) 불러오기
  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((c) => { if (c?.timeSlots) setCfg(c); })
      .catch(() => {})
      .finally(() => setCfgLoaded(true));
  }, []);

  const notOpen = useMemo(() => (date ? reservationDateState(date) === "not_open" : false), [date]);
  const activeSlots = useMemo(
    () => slotsForThemeDate(cfg.themeSlots, cfg.storeSlots, cfg.timeSlots, target.theme_id, target.store_id, date),
    [cfg.themeSlots, cfg.storeSlots, cfg.timeSlots, target.theme_id, target.store_id, date],
  );
  const noSlotsDay = !!(date && cfgLoaded && activeSlots.length === 0);
  const showTime = !!date && !notOpen;

  function pickDate(d: string) { setDate(d); setTime(""); setErr(""); }

  // 날짜 선택 시 마감·예약된 시간 조회
  useEffect(() => {
    if (!date) { setBlocked([]); setDayClosed(false); setSlotsLoading(false); return; }
    let alive = true;
    setSlotsLoading(true); setBlocked([]); setDayClosed(false);
    fetch(`/api/slots?theme=${target.theme_id}&date=${date}`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        setBlocked(d.blocked || []);
        setDayClosed(!!d.dayClosed);
        if (d.blocked?.includes(time)) setTime("");
      })
      .catch(() => {})
      .finally(() => { if (alive) setSlotsLoading(false); });
    return () => { alive = false; };
  }, [date, target.theme_id]); // eslint-disable-line react-hooks/exhaustive-deps

  // 골라둔 시간이 그 사이 임박해지면 선택 풀기
  useEffect(() => {
    if (time && date && isTooSoon(date, time, leadMin, nowMs)) setTime("");
  }, [nowMs, time, date, leadMin]);

  async function submit() {
    setErr("");
    if (!date) return setErr("옮길 날짜를 선택해 주세요.");
    if (notOpen) return setErr("아직 예약 오픈 전인 날짜예요. 다른 날짜를 선택해 주세요.");
    if (noSlotsDay) return setErr("그 요일은 예약을 받지 않아요. 다른 날짜를 선택해 주세요.");
    if (!time) return setErr("옮길 시간을 선택해 주세요.");
    if (date === target.date && time === target.time) return setErr("지금 예약과 같은 시간이에요.");
    setSubmitting(true);
    try {
      const res = await fetch("/api/reservations/change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: target.id, phone, name, pin, date, time }),
      });
      const j = await res.json();
      if (!res.ok) { setErr(j.error || "변경에 실패했어요."); setSubmitting(false); return; }
      onDone(target.id, date, time);
    } catch {
      setErr("네트워크 오류가 발생했어요.");
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget && !submitting) onClose(); }}>
      <div className="modal" style={{ maxWidth: 460 }}>
        <button className="close-x" onClick={onClose} aria-label="닫기"><IconClose /></button>
        <h3>예약 시간 변경</h3>

        <div className="notice info" style={{ marginBottom: 14 }}>
          <b>{target.theme_name}</b> · 지금 예약 <b>{formatDate(target.date)} {target.time}</b>
          <br />옮길 날짜와 시간을 골라 주세요. <b>예약금은 그대로</b> 유지돼요. (변경은 한 번만 가능)
        </div>

        {/* 날짜 */}
        <div className="field">
          <label>새 날짜</label>
          <ReserveCalendar value={date} onChange={pickDate} />
        </div>

        {notOpen && (
          <div className="notice warn">
            이 날짜는 아직 예약 오픈 전이에요. <b>{openDateLabel(date)} 저녁 9시</b>부터 가능합니다.
          </div>
        )}

        {/* 시간 */}
        {showTime && (
          <div className="field">
            <label>새 시간</label>
            {dayClosed || noSlotsDay ? (
              <div className="notice warn">그 날짜는 예약을 받지 않아요. 다른 날짜를 선택해 주세요.</div>
            ) : (
              <div className="optrow">
                {activeSlots.map((tm) => {
                  const isBlocked = blocked.includes(tm);
                  const soon = !isBlocked && isTooSoon(date, tm, leadMin, nowMs);
                  const isNow = tm === target.time && date === target.date; // 지금 예약과 같은 칸
                  const off = isBlocked || soon || slotsLoading || !cfgLoaded || isNow;
                  return (
                    <button
                      key={tm}
                      type="button"
                      className={"opt" + (time === tm ? " on" : "") + (off ? " soon" : "")}
                      aria-pressed={time === tm}
                      disabled={off}
                      style={{ minWidth: 64, flex: "0 0 auto" }}
                      onClick={() => { if (!off) setTime(tm); }}
                      title={isNow ? "지금 예약된 시간" : slotsLoading ? "확인 중" : isBlocked ? "마감" : soon ? "예약 불가" : ""}
                    >
                      {tm}{!slotsLoading && (isBlocked ? <>{" "}<IconBan /></> : soon ? <>{" "}<IconClock /></> : null)}
                    </button>
                  );
                })}
              </div>
            )}
            {(slotsLoading || !cfgLoaded) && <div className="hint">예약 가능한 시간을 확인하는 중이에요…</div>}
            {!slotsLoading && cfgLoaded && !(dayClosed || noSlotsDay) && (
              <div className="hint">※ <IconBan /> 마감 · <IconClock /> 임박(예약 불가)</div>
            )}
          </div>
        )}

        {err && <div className="msg-err"><IconWarn /> {err}</div>}

        <div className="modal-btns" style={{ marginTop: 16 }}>
          <button className="btn ghost" onClick={onClose} disabled={submitting}>닫기</button>
          <button className="btn primary" onClick={submit} disabled={submitting || !time}>
            {submitting ? "변경 중…" : "이 시간으로 변경"}
          </button>
        </div>
      </div>
    </div>
  );
}
