"use client";
import { useState } from "react";
import { reservationDateState } from "@/lib/util";
import { IconLock } from "@/components/Icon";

// 예약 날짜 고르기 달력 — 새 예약(/reserve)과 예약 시간변경(예약 조회) 양쪽에서 함께 쓴다.
//   원래 ReserveClient 안에만 있던 걸 시간변경 기능을 만들며 공용으로 분리했다(2026-07-20).
//   ⚠️ '오늘'과 '오픈 전' 판정은 반드시 서버와 같은 함수(reservationDateState, KST 고정)를 써야 한다 —
//      로컬시각으로 계산하면 해외에서 화면과 서버가 다른 날을 가리킨다(2026-07-17 RPA 점검에서 발견).

// 선택한 이용일의 예약창 오픈일(이용일 - 7일) 을 "M월 D일" 로 반환
export function openDateLabel(dateStr: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return "";
  const o = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) - 7);
  return `${o.getMonth() + 1}월 ${o.getDate()}일`;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

// 상시 표시되는 인라인 월 달력 (클릭 팝업 없이 항상 떠 있음)
export function ReserveCalendar({ value, onChange }: { value: string; onChange: (d: string) => void }) {
  const kst = new Date(Date.now() + 9 * 3600 * 1000);
  const now = new Date(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate());
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
          const state = reservationDateState(ds);
          const past = state === "past";
          const notOpen = state === "not_open";
          const openHint = `${openDateLabel(ds)} 저녁 9시 오픈`;
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
              {notOpen && <span className="rcal-lk" aria-hidden="true"><IconLock /></span>}
            </button>
          );
        })}
      </div>
      <div className="rcal-legend">
        <span><span className="lk"><IconLock /></span> 아직 예약 오픈 전</span>
        <span>예약은 이용일 <b>일주일 전 저녁 9시</b>에 열립니다</span>
      </div>
    </div>
  );
}
