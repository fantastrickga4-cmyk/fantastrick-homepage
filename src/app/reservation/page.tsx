"use client";
import Link from "next/link";
import { useState } from "react";
import { formatDate, formatPhone } from "@/lib/util";
import { STORES } from "@/lib/data";

type Reservation = {
  id: string;
  store_id: string;
  theme_name: string;
  date: string;
  time: string;
  people: number;
  name: string;
  deposit: number;
  deposit_paid: boolean;
  status: string;
};

const STATUS_LABEL: Record<string, string> = {
  pending: "확정 대기",
  confirmed: "예약 확정",
  cancelled: "취소됨",
};

export default function ReservationLookup() {
  const [phone, setPhone] = useState("");
  const [list, setList] = useState<Reservation[] | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function lookup() {
    setErr(""); setList(null); setLoading(true);
    try {
      const res = await fetch(`/api/reservations?phone=${encodeURIComponent(phone)}`);
      const j = await res.json();
      if (!res.ok) setErr(j.error || "조회에 실패했습니다.");
      else setList(j.reservations);
    } catch {
      setErr("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function cancel(id: string) {
    if (!confirm("이 예약을 취소할까요?")) return;
    try {
      const res = await fetch("/api/reservations/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, phone }),
      });
      const j = await res.json();
      if (!res.ok) { alert(j.error || "취소에 실패했습니다."); return; }
      // 목록 갱신
      setList((prev) => prev?.map((r) => (r.id === id ? { ...r, status: "cancelled" } : r)) || null);
    } catch {
      alert("네트워크 오류가 발생했습니다.");
    }
  }

  return (
    <div className="formwrap">
      <div className="page-top" />
      <h2 className="title" style={{ marginBottom: 4 }}>예약 조회 · 취소</h2>
      <p className="lead" style={{ marginBottom: 22 }}>예약하실 때 입력한 전화번호로 조회하세요.</p>

      <div className="card">
        <div className="field" style={{ marginBottom: 12 }}>
          <label>전화번호</label>
          <input
            type="tel"
            value={phone}
            placeholder="010-1234-5678"
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && lookup()}
          />
        </div>
        <button className="btn primary" style={{ width: "100%", justifyContent: "center" }} onClick={lookup} disabled={loading}>
          {loading ? "조회 중…" : "예약 조회"}
        </button>
        {err && <div className="msg-err">⚠️ {err}</div>}
      </div>

      {list && (
        <div style={{ marginTop: 20 }}>
          {list.length === 0 ? (
            <div className="notice info">해당 전화번호로 접수된 예약이 없습니다.</div>
          ) : (
            <div className="rev-list">
              {list.map((r) => {
                const store = STORES.find((s) => s.id === r.store_id);
                const cancelled = r.status === "cancelled";
                return (
                  <div key={r.id} className="rev" style={{ opacity: cancelled ? 0.55 : 1 }}>
                    <div className="rev-h">
                      <span className="who">{r.theme_name}</span>
                      <span className="date" style={{ color: cancelled ? "var(--danger)" : "var(--cyan)", fontWeight: 700 }}>
                        {STATUS_LABEL[r.status] || r.status}
                      </span>
                    </div>
                    <div className="res-summary" style={{ margin: "6px 0" }}>
                      <div className="r"><span>매장</span><b>{store?.name}</b></div>
                      <div className="r"><span>일시</span><b>{formatDate(r.date)} {r.time}</b></div>
                      <div className="r"><span>인원</span><b>{r.people}명</b></div>
                      <div className="r"><span>예약자</span><b>{r.name} ({formatPhone(phone)})</b></div>
                      <div className="r"><span>예약금</span><b>{r.deposit.toLocaleString()}원 {r.deposit_paid ? "(결제완료)" : "(미결제)"}</b></div>
                    </div>
                    {!cancelled && (
                      <button className="btn ghost sm" onClick={() => cancel(r.id)}>예약 취소</button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <p style={{ marginTop: 18, textAlign: "center" }}>
        <Link href="/reserve" style={{ color: "var(--muted)" }}>← 새 예약하기</Link>
      </p>
    </div>
  );
}
