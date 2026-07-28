"use client";
import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { THEMES, TIME_SLOTS, THEME_SLOTS, STORES, slotsForThemeDate, isTooSoon, type StoreSlots, type SlotSchedule, type Theme } from "@/lib/data";
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

// 미리 받아두는 마감/예약 시간 한 줄 (time 이 null 이면 그 날 통째 휴무=dayClosed)
type SlotRow = { theme_id: string | null; date: string; time: string | null };

export default function ReserveClient({ preset }: { preset: string }) {

  // 딥링크(preset)로 특정 테마가 지정돼 들어오면 그 테마를 바로 골라둔다(포스터 고르는 단계를 건너뜀).
  const presetTheme = preset ? THEMES.find((t) => t.id === preset) : undefined;
  const [themeId, setThemeId] = useState(presetTheme ? preset : "");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [people, setPeople] = useState(2);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [agree, setAgree] = useState(false); // 개인정보 수집·이용 동의(필수)
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
  // ── 마감/예약 시간: '즉시 표시(미리불러오기)' + '그 슬롯만 신선하게(조용히 재확인)' 2단 ──
  //   ※ 이중예약 자체는 DB 유니크 인덱스(uq_res_slot: store·theme·date·time, 취소 제외)가
  //     물리적으로 막는다. 아래 값들은 "이미 찬 칸을 손님이 안 고르게" 하는 화면 안내용일 뿐,
  //     조금 낡아도 이중예약으로 이어지지 않는다(신청 시 서버가 최종 거절).
  // (1) 페이지 열 때 앞으로의 모든 날짜·테마 마감/예약을 통째로 받아 '즉시 표시'용으로 둔다(로딩 제거).
  const [allSlots, setAllSlots] = useState<{ blockedSlots: SlotRow[]; reservations: SlotRow[] } | null>(null);
  const [allLoaded, setAllLoaded] = useState(false);
  // (2) 고른 그 (테마·날짜)만 서버에서 콕 집어 신선하게 받아온 값. 있으면 이걸 우선한다.
  const [freshSlots, setFreshSlots] = useState<Record<string, { blocked: string[]; dayClosed: boolean }>>({});
  // 예전 코드가 쓰던 이름 유지 — '최초 로딩 전'에만 true(그 뒤 재확인은 조용히 처리, 로딩표시 없음).
  const slotsLoading = !allLoaded;

  // 어떤 날짜든 그 테마의 마감/예약 시간을 계산한다 — 서버와 같은 규칙(그 날 blocked_slots + 이미 잡힌 예약).
  //   1순위: 방금 그 슬롯만 콕 집어 받아온 신선값(freshSlots)
  //   2순위: 없으면 미리 받아둔 allSlots 로 즉시 계산(네트워크 대기 없음)
  //   ※ 예전에는 '고른 날짜' 하나만 계산했는데, 달력 칸마다 남은 칸 수를 그리려면
  //     임의의 날짜에 대해 같은 계산이 필요해 함수로 뺐다.
  const blockedForDate = useCallback(
    (d: string): { blocked: string[]; dayClosed: boolean } => {
      if (!themeId || !d) return { blocked: [], dayClosed: false };
      const fresh = freshSlots[`${themeId}|${d}`];
      if (fresh) return fresh;
      if (!allSlots) return { blocked: [], dayClosed: false };
      const bs = allSlots.blockedSlots.filter((b) => b.date === d && (!b.theme_id || b.theme_id === themeId));
      const closed = bs.some((b) => !b.time);
      const blockedTimes = bs.filter((b) => b.time).map((b) => b.time as string);
      const taken = allSlots.reservations
        .filter((r) => r.theme_id === themeId && r.date === d && r.time)
        .map((r) => r.time as string);
      return { blocked: Array.from(new Set([...blockedTimes, ...taken])), dayClosed: closed };
    },
    [themeId, allSlots, freshSlots],
  );

  const { blocked, dayClosed } = useMemo(
    () => (date ? blockedForDate(date) : { blocked: [] as string[], dayClosed: false }),
    [date, blockedForDate],
  );

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

  // ── 예약자 정보가 열리는 조건 ────────────────────────────────────
  // 테마·날짜·시간이 다 정해져야 이름·전화를 묻는다. 달력과 시간은 처음부터 함께 보이지만
  // (2열), 입력 폼까지 미리 펼치면 화면이 길어지기만 하고 아직 채울 수 없다.
  const showInfo = !!themeId && !!date && !notOpenSelected && !!time;

  // 포스터 카드에서 테마를 고른다. 지점은 테마가 이미 알고 있어 따로 묻지 않는다(3지점 모두 강남).
  // 테마를 바꾸면 고른 시간을 푼다 — 테마마다 시간표가 완전히 달라서(사자의 서 70분 간격 등)
  // 그대로 두면 그 테마에 없는 시간이 골라진 채로 남는다. 날짜는 그대로 둔다(보통 같은 날을 원함).
  function pickThemeCard(t: Theme) {
    setThemeId(t.id);
    setTime("");
  }
  // [← 다른 테마] — 포스터 고르는 화면으로 돌아간다. 고른 날짜는 남겨 둔다(같은 날 다른 테마를 보는 경우가 많음).
  function resetTheme() {
    setThemeId("");
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

  // 달력 칸에 찍을 "그 날 남은 칸" — 시간칩을 만드는 규칙과 **똑같은 규칙**으로 센다.
  //   (그 요일 시간표) − (마감·이미 찬 시간) − (임박해서 못 누르는 시간)
  //   아직 설정·마감정보를 못 받았으면 null → 달력은 숫자를 안 그린다(0으로 잘못 표시하는 것보다 안전).
  const remainingFor = useCallback(
    (d: string): number | null => {
      if (!theme || !allLoaded || !cfgLoaded) return null;
      const list = slotsForThemeDate(cfg.themeSlots, cfg.storeSlots, cfg.timeSlots, theme.id, theme.store, d);
      if (list.length === 0) return 0; // 그 요일은 아예 안 여는 테마(휴무)
      const { blocked: bl, dayClosed: closed } = blockedForDate(d);
      if (closed) return 0;
      return list.filter((tm) => !bl.includes(tm) && !isTooSoon(d, tm, leadMin, nowMs)).length;
    },
    [theme, allLoaded, cfgLoaded, cfg.themeSlots, cfg.storeSlots, cfg.timeSlots, blockedForDate, leadMin, nowMs],
  );

  useEffect(() => {
    const pt = preset ? THEMES.find((t) => t.id === preset) : undefined;
    if (pt) setThemeId(pt.id);
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

  // (1) 페이지 열 때: 앞으로의 모든 마감/예약을 한 번에 받아 '즉시 표시'용으로 둔다(로딩 제거).
  useEffect(() => {
    let alive = true;
    fetch("/api/slots?all=1")
      .then((r) => r.json())
      .then((d) => { if (alive && d?.all) setAllSlots({ blockedSlots: d.blockedSlots || [], reservations: d.reservations || [] }); })
      .catch(() => {})
      .finally(() => { if (alive) setAllLoaded(true); });
    return () => { alive = false; };
  }, []);

  // (2) 테마·날짜를 고르면: 그 슬롯만 서버에서 콕 집어 '조용히' 다시 확인한다(화면은 이미 떠 있어 로딩 없음).
  //     그 화면에 머무는 동안 60초마다 같은 슬롯을 재확인해, 오래 켜둬도 최신 마감상태를 본다.
  //     ※ 이중예약 방지는 서버(uq_res_slot)가 최종적으로 담당 — 이 재확인은 '헛수고 방지'용 안내 갱신.
  useEffect(() => {
    if (!themeId || !date) return;
    let alive = true;
    const key = `${themeId}|${date}`;
    const refresh = () =>
      fetch(`/api/slots?theme=${themeId}&date=${date}`)
        .then((r) => r.json())
        .then((d) => { if (alive && d) setFreshSlots((prev) => ({ ...prev, [key]: { blocked: d.blocked || [], dayClosed: !!d.dayClosed } })); })
        .catch(() => {});
    refresh();
    const iv = setInterval(refresh, 60000);
    return () => { alive = false; clearInterval(iv); };
  }, [themeId, date]);

  // 이미 마감된 시간을 골라두고 있었다면(재확인으로 방금 찼다면) 선택을 자동으로 푼다.
  useEffect(() => {
    if (time && blocked.includes(time)) setTime("");
  }, [blocked, time]);

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
    if (!agree) return setErr("개인정보 수집·이용 동의가 필요합니다.");
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
    // rv-wrap — 달력·시간을 2열로 놓아야 해서 예약 폼(560px)보다 넓게 쓴다.
    <div className="formwrap rv-wrap">
      <div className="page-top" />
      <h1 className="title" style={{ marginBottom: 18 }}>테마 예약</h1>

      <div className="card rv-card">
        {/* 테마를 아직 안 골랐으면 포스터로 고르게 한다.
            예전엔 [지점 드롭다운 → 테마 드롭다운] 2단이었는데, 우리는 테마가 4개뿐이라
            지점을 먼저 물을 이유가 없다(3지점 모두 강남). 포스터가 곧 상품이라 포스터로 고르는 게 빠르다. */}
        {!themeId ? (
          <>
            <p className="rv-lab">테마 선택 <span>3개 지점 · 4개 테마</span></p>
            <div className="rv-pick">
              {THEMES.map((t) => (
                <button key={t.id} type="button" className="rv-pick-card" data-store={t.store} onClick={() => pickThemeCard(t)}>
                  <span className="rv-pick-poster">
                    <Image src={t.poster} alt={`${t.name} 포스터`} fill sizes="(max-width:640px) 42vw, 170px" />
                  </span>
                  <span className="rv-pick-body">
                    <b>{t.name}</b>
                    <span className="rv-pick-store">{t.storeTag}</span>
                    <span className="rv-pick-meta">{t.minutes}분 · 난이도 {t.difficulty}</span>
                    <span className="rv-pick-dep">예약금 {depositOf({ themeDeposits: cfg.themeDeposits ?? {} }, t.id, t.deposit).toLocaleString()}원</span>
                  </span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            {/* 가로 배너 — 세로 포스터를 그대로 두면 휴대폰 첫 화면이 포스터만으로 차서
                달력이 접힘선 아래로 밀린다. 눕혀서 달력을 첫 화면 안으로 올린다. */}
            <div className="rv-banner" data-store={theme?.store}>
              <span className="rv-b-poster">
                {theme && <Image src={theme.poster} alt={`${theme.name} 포스터`} fill sizes="(max-width:640px) 76px, 108px" />}
              </span>
              <div className="rv-b-txt">
                <div className="rv-b-title">
                  {theme?.name}
                  <span className="rv-b-store">{theme?.storeTag}</span>
                  {theme?.murder && <span className="rv-b-murder">머더미스터리</span>}
                </div>
                <div className="rv-b-meta">
                  {theme?.genres.join(" · ")} · {theme?.minutes}분
                  <span className="rv-gauge" aria-label={`난이도 ${theme?.difficulty}단계`}>
                    난이도
                    {[1, 2, 3, 4, 5].map((n) => (
                      <i key={n} className={n <= (theme?.difficulty ?? 0) ? "f" : ""} />
                    ))}
                  </span>
                </div>
                <div className="rv-b-dep">
                  예약금 <b>{deposit.toLocaleString()}원</b>
                  <span> · 시작 24시간 전까지 취소 시 100% 환불</span>
                </div>
              </div>
              <button type="button" className="btn ghost sm rv-b-swap" onClick={resetTheme}>← 다른 테마</button>
            </div>

            {/* 달력 | 시간 2열 — 휴대폰에서는 위아래로 접히되 순서(날짜 → 시간)는 그대로 유지된다. */}
            <div className="rv-2col">
              <div className="rv-col">
                <p className="rv-lab">날짜 <span>숫자 = 그 날 남은 칸</span></p>
                {/* 고른 날짜를 아래에 또 쓰지 않는다 — 오른쪽 '시간' 제목에 이미 같은 날짜가 있어
                    두 번 적으면 폼 시작 지점과 붙어 지저분해진다. */}
                <ReserveCalendar value={date} onChange={pickDate} countFor={remainingFor} />
              </div>

              <div className="rv-col">
                <p className="rv-lab">
                  시간
                  {date && !notOpenSelected && <span>{formatDate(date)} · {theme?.minutes}분 진행</span>}
                </p>

                {!date ? (
                  <div className="rv-empty">왼쪽 달력에서 <b>날짜</b>를 먼저 골라 주세요.</div>
                ) : notOpenSelected ? (
                  <div className="notice warn">
                    이 날짜는 아직 예약 오픈 전이에요. <b>{openDateLabel(date)} 저녁 9시</b>부터 예약 가능합니다.
                  </div>
                ) : dayClosed || noSlotsDay ? (
                  <div className="notice warn">선택하신 날짜는 예약을 받지 않습니다. 다른 날짜를 선택해 주세요.</div>
                ) : (
                  <>
                    <div className="rv-slots">
                      {activeSlots.map((tm) => {
                        const isBlocked = blocked.includes(tm);
                        // 시작 직전(기본 10분 전)이거나 이미 지난 칸은 예약 불가
                        const soon = !isBlocked && isTooSoon(date, tm, leadMin, nowMs);
                        // 아직 확실하지 않은 동안에는 전부 못 누르게 한다.
                        //   slotsLoading — 어느 칸이 찼는지 모름 / !cfgLoaded — 사장님이 시간표를 바꿨는지 모름
                        // 모르는 상태에서 누르게 두면 "이미 찬 칸"이나 "없는 시간"을 고른 채로 끝까지 입력하게 된다.
                        const waiting = slotsLoading || !cfgLoaded;
                        const off = isBlocked || soon || waiting;
                        return (
                          <button
                            key={tm}
                            type="button"
                            className={
                              "rv-slot" +
                              (time === tm ? " on" : "") +
                              (!waiting && isBlocked ? " full" : "") +
                              (!waiting && soon ? " soon" : "") +
                              (waiting ? " wait" : "")
                            }
                            aria-pressed={time === tm}
                            disabled={off}
                            onClick={() => { if (!off) setTime(tm); }}
                            title={waiting ? "확인 중" : isBlocked ? "마감" : soon ? (leadMin > 0 ? `시작 ${leadMin}분 전부터는 예약할 수 없어요` : "지난 시간") : ""}
                          >
                            <b>{tm}</b>
                            {!waiting && (isBlocked
                              ? <em><IconBan /> 마감</em>
                              : soon
                              ? <em><IconClock /> {leadMin > 0 ? "곧 시작" : "지난 시간"}</em>
                              : null)}
                          </button>
                        );
                      })}
                    </div>
                    {(slotsLoading || !cfgLoaded) && <div className="hint">예약 가능한 시간을 확인하는 중이에요…</div>}
                    {!slotsLoading && cfgLoaded && (
                      <div className="hint">
                        ※ <IconBan /> 는 마감된 시간입니다.
                        {leadMin > 0 && <> <IconClock /> 는 시작이 임박해(<b>{leadMin}분 전</b>) 온라인 예약이 닫힌 시간이에요. 매장으로 전화 주시면 도와드립니다.</>}
                      </div>
                    )}
                  </>
                )}

                {/* 인원 — 시간을 고른 뒤 같은 열에서 이어 고른다(아래 정보 입력까지 한 흐름) */}
                {showInfo && (
                  <div className="field rstep" style={{ marginTop: 16 }}>
                    <label htmlFor="rv-people">인원</label>
                    <select id="rv-people" value={people} onChange={(e) => setPeople(Number(e.target.value))}>
                      {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                        <option key={n} value={n}>{n}명</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* 예약자 정보 — 시간을 골라야 나타남 */}
        {showInfo && (
        <div className="rstep rv-form">
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

        <label className="agree-row" style={{ marginTop: 4 }}>
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          <span><b>[필수]</b> <Link href="/privacy" className="tlink" target="_blank" rel="noopener noreferrer">개인정보 수집·이용</Link>에 동의합니다. <span style={{ color: "var(--faint)" }}>(이름·전화번호를 예약 접수·확인·취소·안내 목적으로 이용)</span></span>
        </label>

        {err && <div className="msg-err"><IconWarn /> {err}</div>}

        <button className="btn primary" style={{ width: "100%", justifyContent: "center", marginTop: 6 }} onClick={submit} disabled={loading || !agree}>
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
