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

const POLICY_TEXT =
  "테마시작 시간기준 24시간 이후면 100% 환불, 24시간 미만으로 남아있을경우 80%, 당일예약 변경 및 취소는 전액 환불이 불가능합니다. 그래도 진행하시겠습니까?";

export default function ReservationLookup() {
  const [phone, setPhone] = useState("");
  const [lookupName, setLookupName] = useState("");
  const [pin, setPin] = useState("");
  const [list, setList] = useState<Reservation[] | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  // 취소 모달 상태
  const [target, setTarget] = useState<Reservation | null>(null); // 취소하려는 예약
  const [bank, setBank] = useState("");
  const [account, setAccount] = useState("");
  const [holder, setHolder] = useState("");
  const [modalErr, setModalErr] = useState("");
  const [showPolicy, setShowPolicy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [doneMsg, setDoneMsg] = useState("");

  async function lookup() {
    setErr(""); setList(null); setDoneMsg("");
    if (!phone.trim()) return setErr("전화번호를 입력해 주세요.");
    if (!lookupName.trim()) return setErr("예약자 이름을 입력해 주세요.");
    if (!/^\d{4}$/.test(pin)) return setErr("예약 비밀번호(숫자 4자리)를 입력해 주세요.");
    setLoading(true);
    try {
      const res = await fetch(
        `/api/reservations?phone=${encodeURIComponent(phone)}&name=${encodeURIComponent(lookupName.trim())}&pin=${encodeURIComponent(pin)}`
      );
      const j = await res.json();
      if (!res.ok) setErr(j.error || "조회에 실패했습니다.");
      else setList(j.reservations);
    } catch {
      setErr("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  function openCancel(r: Reservation) {
    setTarget(r);
    setBank(""); setAccount(""); setHolder("");
    setModalErr(""); setShowPolicy(false);
  }
  function closeModal() {
    setTarget(null); setShowPolicy(false); setSubmitting(false);
  }

  // 완료 버튼 → 환불 정보 검증 후 정책 확인창 표시
  function onComplete() {
    setModalErr("");
    if (!bank.trim() || !account.trim() || !holder.trim()) {
      setModalErr("은행 · 계좌번호 · 예금주를 모두 입력해 주세요.");
      return;
    }
    setShowPolicy(true);
  }

  // 정책 확인창 "예" → 실제 취소 진행
  async function confirmCancel() {
    if (!target) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/reservations/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: target.id,
          phone,
          name: lookupName.trim(),
          pin,
          refundBank: bank,
          refundAccount: account,
          refundHolder: holder,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        setShowPolicy(false);
        setModalErr(j.error || "취소에 실패했습니다.");
        setSubmitting(false);
        return;
      }
      // 목록 갱신 + 안내
      setList((prev) => prev?.map((x) => (x.id === target.id ? { ...x, status: "cancelled" } : x)) || null);
      const rate = j.refundRate;
      setDoneMsg(
        rate === 0
          ? "예약이 취소되었습니다. (당일 예약/방문으로 환불은 불가합니다.)"
          : `예약이 취소되었습니다. 입력하신 계좌로 예약금의 ${rate}%가 환불됩니다.`
      );
      closeModal();
    } catch {
      setShowPolicy(false);
      setModalErr("네트워크 오류가 발생했습니다.");
      setSubmitting(false);
    }
  }

  return (
    <div className="formwrap">
      <div className="page-top" />
      <h2 className="title" style={{ marginBottom: 4 }}>예약 조회 · 취소</h2>
      <p className="lead" style={{ marginBottom: 22 }}>본인 확인을 위해 <b style={{ color: "var(--text)" }}>예약자 이름</b>과 <b style={{ color: "var(--text)" }}>전화번호</b>를 모두 입력해 주세요.</p>

      <div className="card">
        <div className="field">
          <label>예약자 이름</label>
          <input
            type="text"
            value={lookupName}
            placeholder="예약 때 입력한 이름"
            onChange={(e) => setLookupName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && lookup()}
          />
        </div>
        <div className="field">
          <label>전화번호</label>
          <input
            type="tel"
            value={phone}
            placeholder="010-1234-5678"
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && lookup()}
          />
        </div>
        <div className="field" style={{ marginBottom: 12 }}>
          <label>예약 비밀번호 (숫자 4자리)</label>
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={pin}
            placeholder="예약 때 정한 4자리"
            autoComplete="off"
            onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
            onKeyDown={(e) => e.key === "Enter" && lookup()}
          />
        </div>
        <button className="btn primary" style={{ width: "100%", justifyContent: "center" }} onClick={lookup} disabled={loading}>
          {loading ? "조회 중…" : "예약 조회"}
        </button>
        {err && <div className="msg-err">⚠️ {err}</div>}
      </div>

      {doneMsg && <div className="notice ok" style={{ marginTop: 16 }}>✅ {doneMsg}</div>}

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
                      <button className="btn ghost sm" onClick={() => openCancel(r)}>예약 취소</button>
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

      {/* 취소 모달 — 환불 계좌 입력 */}
      {target && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget && !submitting) closeModal(); }}>
          <div className="modal">
            <button className="close-x" onClick={closeModal} aria-label="닫기">✕</button>
            <h3>예약 취소</h3>

            {/* 자동으로 채워지는 예약 정보 */}
            <div className="res-summary" style={{ marginTop: 0, marginBottom: 18 }}>
              <div className="r"><span>테마</span><b>{target.theme_name}</b></div>
              <div className="r"><span>날짜</span><b>{formatDate(target.date)}</b></div>
              <div className="r"><span>시간</span><b>{target.time}</b></div>
            </div>

            <div className="notice info" style={{ marginBottom: 16 }}>
              환불받으실 계좌 정보를 입력해 주세요.
            </div>

            <div className="field">
              <label>은행</label>
              <input type="text" value={bank} placeholder="예: 카카오뱅크" onChange={(e) => setBank(e.target.value)} />
            </div>
            <div className="field">
              <label>계좌번호</label>
              <input type="text" inputMode="numeric" value={account} placeholder="'-' 없이 숫자만" onChange={(e) => setAccount(e.target.value)} />
            </div>
            <div className="field">
              <label>예금주</label>
              <input type="text" value={holder} placeholder="홍길동" onChange={(e) => setHolder(e.target.value)} />
            </div>

            {modalErr && <div className="msg-err">⚠️ {modalErr}</div>}

            <div className="modal-btns" style={{ marginTop: 18 }}>
              <button className="btn ghost" onClick={closeModal}>닫기</button>
              <button className="btn primary" onClick={onComplete}>완료</button>
            </div>
          </div>
        </div>
      )}

      {/* 정책 확인창 — 예 / 아니오 */}
      {target && showPolicy && (
        <div className="modal-overlay" style={{ zIndex: 310 }}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <h3>환불 규정 안내</h3>
            <p className="modal-policy">{POLICY_TEXT}</p>
            <div className="modal-btns">
              <button className="btn ghost" onClick={() => setShowPolicy(false)} disabled={submitting}>아니오</button>
              <button className="btn danger" onClick={confirmCancel} disabled={submitting}>
                {submitting ? "처리 중…" : "예"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
