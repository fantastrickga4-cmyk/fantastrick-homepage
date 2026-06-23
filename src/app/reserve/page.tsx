"use client";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { THEMES, TIME_SLOTS, DEPOSIT_PER_PERSON, STORES } from "@/lib/data";
import { formatDate, formatPhone } from "@/lib/util";

function todayStr() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
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

  const theme = useMemo(() => THEMES.find((t) => t.id === themeId), [themeId]);
  const store = useMemo(() => STORES.find((s) => s.id === theme?.store), [theme]);
  const deposit = DEPOSIT_PER_PERSON * people;

  useEffect(() => {
    if (preset && THEMES.some((t) => t.id === preset)) setThemeId(preset);
  }, [preset]);

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
            {THEMES.map((t) => (
              <div
                key={t.id}
                className={"opt" + (themeId === t.id ? " on" : "")}
                onClick={() => setThemeId(t.id)}
              >
                {t.name}
                <div style={{ fontSize: 11, color: "var(--faint)", marginTop: 3 }}>{t.storeTag}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 날짜 / 인원 */}
        <div className="grid2">
          <div className="field">
            <label>날짜</label>
            <input type="date" min={todayStr()} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field">
            <label>인원</label>
            <select value={people} onChange={(e) => setPeople(Number(e.target.value))}>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <option key={n} value={n}>{n}명</option>
              ))}
            </select>
          </div>
        </div>

        {/* 시간 */}
        <div className="field">
          <label>시간</label>
          <div className="optrow">
            {TIME_SLOTS.map((tm) => (
              <div
                key={tm}
                className={"opt" + (time === tm ? " on" : "")}
                style={{ minWidth: 64, flex: "0 0 auto" }}
                onClick={() => setTime(tm)}
              >
                {tm}
              </div>
            ))}
          </div>
          <div className="hint">※ 실제 가능 시간은 매장 사정에 따라 확정 시 안내됩니다.</div>
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
          예약금 <b>{deposit.toLocaleString()}원</b> ({people}명 × {DEPOSIT_PER_PERSON.toLocaleString()}원) ·
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
