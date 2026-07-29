import { BIZ_INFO } from "@/lib/theme-content";

// 개인정보처리방침 — 예약 시 수집하는 이름·전화번호 등에 대한 법정 고지.
//   ⚠️ 실제 수집·이용 흐름(예약/취소/환불/문자)에 맞춰 작성. 항목이 바뀌면 여기도 같이 고칠 것.
export default function PrivacyPage() {
  const 시행일 = "2026년 7월 27일";
  return (
    <div className="formwrap legal" style={{ maxWidth: 820 }}>
      <div className="page-top" />
      <h1 className="title" style={{ margin: 0 }}>개인정보처리방침</h1>
      <p className="lead" style={{ margin: "6px 0 24px" }}>
        {BIZ_INFO.상호}(이하 &lsquo;회사&rsquo;)은 「개인정보 보호법」 등 관련 법령을 준수하며, 이용자의 개인정보를 소중히 다룹니다.
      </p>

      <section className="lg-sec">
        <h2>1. 수집하는 개인정보 항목</h2>
        <ul>
          <li><b>예약 시(필수)</b> — 이름, 전화번호, 예약 비밀번호(숫자 4자리), 예약 정보(테마·날짜·시간·인원)</li>
          <li><b>예약 취소·환불 시</b> — 환불받으실 계좌 정보(은행명·계좌번호·예금주)</li>
          <li><b>후기 작성 시</b> — 이름(또는 닉네임), 전화번호, 후기 내용</li>
          <li><b>서비스 이용 과정에서 자동 생성</b> — 접속 기록 등 최소한의 정보</li>
        </ul>
      </section>

      <section className="lg-sec">
        <h2>2. 개인정보의 수집·이용 목적</h2>
        <ul>
          <li>예약 접수·확인·변경·취소 및 예약금 안내</li>
          <li>예약 조회·취소 시 본인 확인</li>
          <li>예약금 입금 확인 및 환불 처리</li>
          <li>예약 관련 안내 연락(문자 메시지·카카오 알림톡 등)</li>
          <li>이용자가 등록한 후기의 게시</li>
        </ul>
      </section>

      <section className="lg-sec">
        <h2>3. 개인정보의 보유·이용 기간</h2>
        <p>회사는 수집·이용 목적이 달성되면 해당 정보를 지체 없이 파기합니다. 다만, 관련 법령에 따라 아래 기간 동안 보존합니다.</p>
        <ul>
          <li>계약 또는 청약철회 등에 관한 기록 — 5년 (전자상거래 등에서의 소비자보호에 관한 법률)</li>
          <li>대금결제 및 재화 등의 공급에 관한 기록 — 5년 (동법)</li>
          <li>소비자의 불만 또는 분쟁처리에 관한 기록 — 3년 (동법)</li>
        </ul>
      </section>

      <section className="lg-sec">
        <h2>4. 개인정보의 제3자 제공</h2>
        <p>회사는 이용자의 개인정보를 원칙적으로 외부에 제공하지 않습니다. 다만, 법령에 특별한 규정이 있거나 이용자가 사전에 동의한 경우에는 예외로 합니다.</p>
      </section>

      <section className="lg-sec">
        <h2>5. 개인정보 처리의 위탁</h2>
        <p>회사는 서비스 제공을 위해 아래와 같이 개인정보 처리 업무를 위탁할 수 있습니다.</p>
        <ul>
          {/* ⚠️ 실제로 쓰는 업체와 반드시 일치해야 한다(위탁 고지). 발송 업체를 바꾸면 여기도 같이 고칠 것.
              2026-07-29: 알리고 → (솔라피) → NHN Cloud 로 바뀌는 동안 이 줄만 알리고로 남아 있었다. */}
          <li><b>예약 안내 문자·알림톡 발송</b> — NHN Cloud(문자·알림톡 발송 대행), 카카오(카카오 알림톡) <span className="lg-muted">(안내 메시지 발송 목적)</span></li>
          <li><b>데이터 보관·서비스 운영(호스팅)</b> — Supabase, Cloudflare <span className="lg-muted">(예약 데이터의 안전한 저장·처리)</span></li>
        </ul>
      </section>

      <section className="lg-sec">
        <h2>6. 마케팅·광고성 정보 수신</h2>
        <p>회사는 이벤트·혜택(예: 생일 쿠폰) 등 광고성 정보를 <b>별도의 수신 동의</b>를 받은 이용자에 한하여 발송합니다. 수신 동의는 언제든지 철회하실 수 있습니다.</p>
      </section>

      <section className="lg-sec">
        <h2>7. 정보주체의 권리와 행사 방법</h2>
        <p>이용자는 언제든지 본인의 개인정보에 대해 열람·정정·삭제·처리정지를 요구할 수 있습니다. 예약 정보는 홈페이지의 <b>예약 조회·취소</b>에서 직접 확인·취소하실 수 있으며, 그 밖의 요청은 아래 연락처로 문의해 주세요.</p>
      </section>

      <section className="lg-sec">
        <h2>8. 개인정보의 파기</h2>
        <p>보유 기간이 지나거나 처리 목적이 달성된 개인정보는 지체 없이 파기하며, 전자적 파일 형태는 복구·재생할 수 없는 방법으로 삭제합니다.</p>
      </section>

      <section className="lg-sec">
        <h2>9. 개인정보의 안전성 확보 조치</h2>
        <p>회사는 개인정보의 안전한 처리를 위해 접근 권한 관리, 최소 수집, 비밀번호 등 중요정보의 제한적 취급, 관리자 접근 통제 등의 조치를 취하고 있습니다.</p>
      </section>

      <section className="lg-sec">
        <h2>10. 개인정보 보호책임자</h2>
        <ul>
          <li>성명(직위) — {BIZ_INFO.대표자} (대표)</li>
          <li>연락처 — {BIZ_INFO.전화}</li>
          <li>이메일 — {BIZ_INFO.이메일}</li>
        </ul>
        <p className="lg-muted">사업자 정보 — {BIZ_INFO.상호} · 대표 {BIZ_INFO.대표자} · 사업자등록번호 {BIZ_INFO.사업자등록번호} · {BIZ_INFO.주소}</p>
      </section>

      <section className="lg-sec">
        <h2>11. 시행일</h2>
        <p>이 개인정보처리방침은 <b>{시행일}</b>부터 시행됩니다.</p>
      </section>
    </div>
  );
}
