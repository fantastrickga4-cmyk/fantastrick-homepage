"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { THEMES, TIME_SLOTS, THEME_SLOTS, STORES, slotsForThemeDate, isTooSoon, type StoreSlots, type SlotSchedule } from "@/lib/data";
import { formatDate, formatPhone, isValidPhone, reservationDateState } from "@/lib/util";
import { depositOf } from "@/lib/settings";
import { IconCheck, IconWarn, IconBan, IconClock } from "@/components/Icon";
import { ReserveCalendar, openDateLabel } from "@/components/ReserveCalendar";

// 예약금 입금 계좌 (한 곳에서 관리 — 딥링크·복사·표시가 항상 같은 값을 쓰도록)
const PAY_BANK = "카카오뱅크";
const PAY_ACCT = "3333-09-7175706";   // 화면 표시용
const PAY_ACCT_NO = "3333097175706";  // 복사·딥링크용(숫자만)
const PAY_HOLDER = "승현수";
// 토스 송금 딥링크 — 앱이 받는 계좌·금액을 미리 채운 송금화면으로 열린다(모바일 전용).
const tossSendLink = (amount: number) =>
  `supertoss://send?bank=${encodeURIComponent(PAY_BANK)}&accountNo=${PAY_ACCT_NO}&amount=${amount}&origin=link`;

type Cfg = { timeSlots: string[]; storeSlots?: Record<string, StoreSlots>; themeSlots?: Record<string, SlotSchedule>; minLeadMinutes?: number;
  // 사장님이 관리자에서 바꾼 테마별 예약금. 이걸 안 쓰면 화면만 옛 금액이 남아
  // 손님이 틀린 금액을 입금하고 자동매칭(금액 정확일치)이 실패해 30분 뒤 자동취소된다.
  themeDeposits?: Record<string, number> };

export default function ReserveClient({ preset }: { preset: string }) {

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
  const [paidDeposit, setPaidDeposit] = useState<number | null>(null); // 서버가 실제로 저장한 예약금
  const [copied, setCopied] = useState(false);   // 계좌번호 복사됨 표시
  const [isMobile, setIsMobile] = useState(false); // 휴대폰이면 은행앱 딥링크, PC면 QR
  const [qrUrl, setQrUrl] = useState("");          // PC용 토스 송금 QR 이미지(data URL)

  // 시간표 기본값은 서버(settings.ts 의 DEFAULT_CONFIG)와 똑같은 값으로 시작한다.
  //   전에는 timeSlots(전 매장 공통 fallback)만 갖고 시작해서, /api/config 가 도착하기 전에는
  //   테마별 시간표 대신 엉뚱한 공통 시간표(10:00·11:30·13:00…)가 보였다.
  //   → 손님이 그 사이에 "그 테마엔 없는 시간"을 골라 끝까지 입력하고 거절당했다.
  //   기본값을 같게 두면 설정이 오기 전에도 처음부터 올바른 시간표가 뜬다(기다림 없음).
  const [cfg, setCfg] = useState<Cfg>({ timeSlots: TIME_SLOTS, themeSlots: THEME_SLOTS });
  // 사장님이 관리자 화면에서 시간표를 바꿨을 수도 있으므로, 답이 오기 전엔 고르지 못하게 한다.
  const [cfgLoaded, setCfgLoaded] = useState(false);
  const [blocked, setBlocked] = useState<string[]>([]);
  const [dayClosed, setDayClosed] = useState(false);
  // 마감된 칸이 어디인지 서버에 물어보는 중인가.
  //   이걸 안 두면: 날짜를 고른 순간 모든 칸이 "예약 가능"처럼 보이다가 2~3초 뒤 🚫 가 붙는다.
  //   그 사이에 이미 찬 칸을 고른 손님은 이름·전화까지 다 입력하고 나서야 거절당한다(헛수고).
  //   ※ 실제 이중예약은 서버가 막는다(uq_res_slot). 이건 손님을 헛고생시키지 않기 위한 것.
  const [slotsLoading, setSlotsLoading] = useState(false);

  const theme = useMemo(() => THEMES.find((t) => t.id === themeId), [themeId]);
  const store = useMemo(() => STORES.find((s) => s.id === theme?.store), [theme]);
  // 서버(예약 저장·안내문자)는 관리자 설정값을 쓴다 → 화면도 같은 값을 써야 손님이 맞는 금액을 넣는다.
  // 접수 후에는 서버가 실제로 저장한 금액(paidDeposit)을 우선한다(설정이 그 사이 바뀌었을 수도).
  const cfgDeposit = depositOf({ themeDeposits: cfg.themeDeposits ?? {} }, themeId, theme?.deposit ?? 0);
  const deposit = paidDeposit ?? cfgDeposit;

  // 선택한 날짜가 아직 예약 오픈 전인지 (오픈 전이면 시간·인원·신청 숨김)
  const notOpenSelected = useMemo(() => (date ? reservationDateState(date) === "not_open" : false), [date]);

  // 선택한 테마·날짜(요일)에 실제 예약 가능한 시간대 (테마마다 시작시각·간격이 다름)
  const activeSlots = useMemo(
    () => slotsForThemeDate(cfg.themeSlots, cfg.storeSlots, cfg.timeSlots, theme?.id, theme?.store, date),
    [cfg.themeSlots, cfg.storeSlots, cfg.timeSlots, theme?.id, theme?.store, date],
  );
  // 그 요일은 아예 예약을 안 받는 테마(휴무) 인지
  const noSlotsDay = useMemo(() => !!(themeId && date && activeSlots.length === 0), [themeId, date, activeSlots]);

  // ── 단계별 열림 ──────────────────────────────────────────────────
  // 손님이 한 번에 모든 걸 보고 헤매지 않도록, 앞 단계를 고르면 다음 단계가 나타난다.
  //   ① 테마 → ② 날짜 → ③ 시간 → ④ 인원·예약자 정보
  // 고른 것은 계속 보이고 다시 바꿀 수 있다(뒤로 갈 수 있어야 함).
  const showDate = !!themeId;
  const showTime = showDate && !!date && !notOpenSelected;
  // 휴무·마감인 날은 시간을 고를 수 없으니 ④는 자연히 안 열린다
  const showInfo = showTime && !!time;

  // 테마를 바꾸면 고른 시간을 푼다 — 테마마다 시간표가 완전히 달라서(사자의 서 70분 간격 등)
  // 그대로 두면 그 테마에 없는 시간이 골라진 채로 남는다. 날짜는 그대로 둔다(보통 같은 날을 원함).
  function pickTheme(id: string) {
    setThemeId(id);
    setTime("");
  }
  function pickDate(d: string) {
    setDate(d);
    setTime("");
  }

  // 예약 임박 차단 — 시간이 흐르면 임박한 칸이 실제로 잠기도록 30초마다 현재시각 갱신
  const leadMin = cfg.minLeadMinutes ?? 10;
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNowMs(Date.now()), 30000); return () => clearInterval(t); }, []);
  // 골라둔 시간이 그 사이 임박해지면 선택을 풀어준다 (모르고 신청하는 것 방지)
  useEffect(() => {
    if (time && date && isTooSoon(date, time, leadMin, nowMs)) setTime("");
  }, [nowMs, time, date, leadMin]);

  useEffect(() => {
    if (preset && THEMES.some((t) => t.id === preset)) setThemeId(preset);
  }, [preset]);

  // 손님 기기가 휴대폰인지 (휴대폰이면 은행앱 딥링크, PC면 QR 안내)
  useEffect(() => {
    setIsMobile(/android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent));
  }, []);

  // PC에서 예약금 팝업이 뜨면 토스 송금 QR을 만들어 둔다(폰으로 스캔 → 토스 송금 열림)
  useEffect(() => {
    if (showDeposit && !isMobile && deposit > 0) {
      QRCode.toDataURL(tossSendLink(deposit), { margin: 1, width: 220 })
        .then(setQrUrl)
        .catch(() => setQrUrl(""));
    }
  }, [showDeposit, isMobile, deposit]);

  // 계좌번호를 복사한다(딥링크가 실패해도 손님이 붙여넣을 수 있게 항상 먼저 복사).
  async function copyAcct() {
    try { await navigator.clipboard.writeText(PAY_ACCT_NO); }
    catch { prompt("계좌번호를 복사하세요", PAY_ACCT_NO); } // http·구형 브라우저 폴백
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  }
  // 토스로 바로 송금 — 계좌·금액이 채워진 송금화면이 열린다. 안 열려도 계좌는 복사돼 있다.
  function openToss() { copyAcct(); window.location.href = tossSendLink(deposit); }
  // 카카오뱅크 앱 열기 — 앱만 열리므로 계좌를 미리 복사해 붙여넣게 한다.
  function openKakaoBank() { copyAcct(); window.location.href = "kakaobank://"; }

  // 관리자 설정 불러오기 (예약금·시간대)
  // 실패해도 위 기본값(THEME_SLOTS)으로 동작하므로 finally 에서 반드시 열어준다 —
  // 안 그러면 설정 조회가 실패했을 때 손님이 영영 시간을 못 고른다.
  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((c) => { if (c?.timeSlots) setCfg(c); })
      .catch(() => {})
      .finally(() => setCfgLoaded(true));
  }, []);

  // 테마·날짜 선택 시 마감(차단/예약된) 시간 조회
  useEffect(() => {
    if (!themeId || !date) { setBlocked([]); setDayClosed(false); setSlotsLoading(false); return; }
    // 답이 오기 전까지는 "모른다" 상태로 둔다 — 지난 날짜의 마감정보를 그대로 쓰면 안 된다.
    let alive = true;
    setSlotsLoading(true);
    setBlocked([]);
    setDayClosed(false);
    fetch(`/api/slots?theme=${themeId}&date=${date}`)
      .then((r) => r.json())
      .then((d) => {
        // 답을 기다리는 사이 손님이 다른 날짜를 골랐으면 이 답은 버린다.
        // (안 버리면 늦게 도착한 옛 날짜의 마감정보가 새 날짜 위에 덮인다)
        if (!alive) return;
        setBlocked(d.blocked || []);
        setDayClosed(!!d.dayClosed);
        if (d.blocked?.includes(time)) setTime("");
      })
      .catch(() => {})
      .finally(() => { if (alive) setSlotsLoading(false); });
    return () => { alive = false; };
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
        if (typeof j.deposit === "number") setPaidDeposit(j.deposit); // 화면 추정치 말고 서버가 저장한 값으로
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
          <div className="notice ok"><IconCheck /> 예약 신청이 접수되었습니다!</div>
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
                <div className="pay-acct">
                  <div className="pay-acct-info">
                    <span className="pay-bank">{PAY_BANK}</span>
                    <b>{PAY_ACCT}</b>
                    <span className="pay-holder">{PAY_HOLDER}</span>
                  </div>
                </div>
                <p>예약금 입금이 확인되어야 비로소 예약이 확정 처리됩니다.</p>
                <p>입금하실 때 <b>보내는 분(예금주)을 예약자 이름과 동일하게</b><br />해주셔야 정상 처리됩니다.</p>
                <p><b>30분 내 예약금 미입금 시 예약은 자동 취소</b>됩니다.</p>
                <p>예약금 환불 요청 시 처리까지 <b>최대 24시간</b>이 소요될 수 있습니다. 입금 전 참고 부탁드립니다.</p>
              </div>
              <label className="agree-row">
                <input type="checkbox" checked={depositAck} onChange={(e) => setDepositAck(e.target.checked)} />
                위 내용을 확인했습니다.
              </label>

              {/* 체크하면 송금 방법이 열린다. 어떤 버튼을 눌러도 계좌번호는 항상 먼저 복사돼
                  앱이 안 열려도 손님이 붙여넣을 수 있다(손해 없음). */}
              {depositAck && (isMobile ? (
                <div className="pay-actions">
                  <button className="btn primary pay-toss" onClick={openToss}>
                    토스로 바로 송금<span className="pay-sub">계좌·금액 자동</span>
                  </button>
                  <div className="pay-two">
                    <button className="btn ghost" onClick={openKakaoBank}>카카오뱅크 앱</button>
                    <button className="btn ghost" onClick={copyAcct}>{copied ? "복사됨" : "계좌 복사"}</button>
                  </div>
                </div>
              ) : (
                <div className="pay-actions">
                  {qrUrl && (
                    <div className="pay-qr">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={qrUrl} alt="토스 송금 QR 코드" width={140} height={140} />
                      <span>휴대폰으로 스캔하면 토스 송금이 열려요</span>
                    </div>
                  )}
                  <button className="btn primary" onClick={copyAcct}>
                    {copied ? "계좌번호 복사됨" : "계좌번호 복사"}
                  </button>
                </div>
              ))}

              <div className="modal-btns" style={{ marginTop: 10 }}>
                <button className="btn ghost" onClick={() => setShowDeposit(false)}>닫기</button>
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
      <h1 className="title" style={{ marginBottom: 22 }}>테마 예약</h1>

      <div className="card">
        {/* ① 테마 선택 — 여기서부터 시작. 고르면 아래 날짜가 나타난다. */}
        <div className="field">
          <label>① 테마 선택</label>
          <div className="optrow">
            {THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                className={"opt" + (themeId === t.id ? " on" : "")}
                aria-pressed={themeId === t.id}
                onClick={() => pickTheme(t.id)}
              >
                {t.name}
                <span style={{ display: "block", fontSize: 11, color: "var(--muted)", marginTop: 3 }}>{t.storeTag}</span>
              </button>
            ))}
          </div>
          {!showDate && <div className="hint">테마를 선택하면 날짜를 고를 수 있어요.</div>}
        </div>

        {/* ② 날짜 — 테마를 골라야 나타남 */}
        {showDate && (
          <div className="field rstep">
            <label>② 날짜</label>
            <ReserveCalendar value={date} onChange={pickDate} />
            {date && <div className="rcal-sel">선택한 날짜: <b>{formatDate(date)}</b></div>}
            {date && notOpenSelected && (
              <div className="rcal-sel" style={{ marginTop: 4 }}>
                예약창 오픈 날짜: <b>{openDateLabel(date)} 저녁 9시</b>
              </div>
            )}
            {!date && <div className="hint">날짜를 선택하면 시간을 고를 수 있어요.</div>}
          </div>
        )}

        {/* 오픈 전 날짜: 다음 단계로 넘어가지 않고 안내만 */}
        {showDate && date && notOpenSelected && (
          <div className="notice warn rstep">
            이 날짜는 아직 예약 오픈 전이에요. <b>{openDateLabel(date)} 저녁 9시</b>부터 예약 가능합니다.
          </div>
        )}

        {/* ③ 시간 — 날짜를 골라야 나타남 */}
        {showTime && (
        <div className="field rstep">
          <label>③ 시간</label>
          {dayClosed || noSlotsDay ? (
            <div className="notice warn">선택하신 날짜는 예약을 받지 않습니다. 다른 날짜를 선택해 주세요.</div>
          ) : (
            <div className="optrow">
              {activeSlots.map((tm) => {
                const isBlocked = blocked.includes(tm);
                // 시작 직전(기본 10분 전)이거나 이미 지난 칸은 예약 불가
                const soon = !isBlocked && isTooSoon(date, tm, leadMin, nowMs);
                // 아직 확실하지 않은 동안에는 전부 못 누르게 한다.
                //   slotsLoading — 어느 칸이 찼는지 모름
                //   !cfgLoaded   — 사장님이 시간표를 바꿨는지 모름
                // 모르는 상태에서 누르게 두면 "이미 찬 칸"이나 "없는 시간"을 고른 채로 끝까지 입력하게 된다.
                const off = isBlocked || soon || slotsLoading || !cfgLoaded;
                return (
                  <button
                    key={tm}
                    type="button"
                    className={"opt" + (time === tm ? " on" : "") + (off ? " soon" : "")}
                    aria-pressed={time === tm}
                    disabled={off}
                    style={{ minWidth: 64, flex: "0 0 auto" }}
                    onClick={() => { if (!off) setTime(tm); }}
                    title={slotsLoading ? "확인 중" : isBlocked ? "마감" : soon ? (leadMin > 0 ? `시작 ${leadMin}분 전부터는 예약할 수 없어요` : "지난 시간") : ""}
                  >
                    {tm}{!slotsLoading && (isBlocked ? <>{" "}<IconBan /></> : soon ? <>{" "}<IconClock /></> : null)}
                  </button>
                );
              })}
            </div>
          )}
          {(slotsLoading || !cfgLoaded) && <div className="hint">예약 가능한 시간을 확인하는 중이에요…</div>}
          {!slotsLoading && cfgLoaded && !(dayClosed || noSlotsDay) && (
            <div className="hint">
              ※ <IconBan /> 표시는 마감(예약 불가)된 시간입니다.
              {leadMin > 0 && <> <IconClock /> 표시는 시작이 임박해(<b>{leadMin}분 전</b>) 온라인 예약이 닫힌 시간이에요 — 매장으로 전화 주시면 도와드립니다.</>}
            </div>
          )}
          {!slotsLoading && cfgLoaded && !time && !(dayClosed || noSlotsDay) && (
            <div className="hint">시간을 선택하면 예약자 정보를 입력할 수 있어요.</div>
          )}
        </div>
        )}

        {/* ④ 인원·예약자 정보 — 시간을 골라야 나타남 */}
        {showInfo && (
        <div className="rstep">
        <div className="field">
          <label htmlFor="rv-people">④ 인원</label>
          <select id="rv-people" value={people} onChange={(e) => setPeople(Number(e.target.value))}>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <option key={n} value={n}>{n}명</option>
            ))}
          </select>
        </div>

        {/* 예약자 정보 */}
        <div className="grid2">
          <div className="field">
            <label htmlFor="rv-name">예약자 이름</label>
            <input id="rv-name" type="text" value={name} placeholder="홍길동" onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="rv-phone">전화번호</label>
            <input
              id="rv-phone"
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
          <label htmlFor="rv-pin">예약 비밀번호 (숫자 4자리)</label>
          <input
            id="rv-pin"
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

        {err && <div className="msg-err"><IconWarn /> {err}</div>}

        <button className="btn primary" style={{ width: "100%", justifyContent: "center", marginTop: 6 }} onClick={submit} disabled={loading}>
          {loading ? "접수 중…" : "예약 신청하기"}
        </button>
        </div>
        )}
      </div>

      <p style={{ marginTop: 16, textAlign: "center" }}>
        <Link href="/reservation" style={{ color: "var(--muted)" }}>이미 예약하셨나요? 예약 조회·취소 →</Link>
      </p>
    </div>
  );
}
