"use client";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useState, type CSSProperties } from "react";
import { IconPencil, IconPlan, IconGear } from "@/components/Icon";

export default function BusinessPage() {
  const [sent, setSent] = useState(false);

  useEffect(() => {
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }),
      { threshold: 0.14 }
    );
    document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <>
      {/* HERO */}
      <section className="biz-hero">
        <div className="bg">
          <Image src="/images/lockdowncity-street.jpg" alt="" fill priority sizes="100vw" style={{ objectFit: "cover" }} />
        </div>
        <div className="wrap">
          <div className="eyebrow gold">FANTASTRICK BUSINESS · B2B</div>
          <h1>11년의 이머시브 노하우를,<br /><span className="accent">당신의 프로젝트에</span></h1>
          <p className="sub">
            직영 매장 3곳을 직접 기획·시공·운영하며 쌓은 콘텐츠·공간·장치 역량을 외부 프로젝트에 제공합니다.
            체험형 콘텐츠, 브랜드 공간, 이머시브 장치 — 처음부터 끝까지 함께합니다.
          </p>
          <div className="cta">
            <a href="#contact" className="btn gold">프로젝트 문의하기 →</a>
            <Link href="/" className="btn ghost">← 예약·테마 보러 가기</Link>
          </div>
          <div className="meta">
            <div><b>11년</b>직영 운영</div>
            <div><b>4종</b>자체 제작 테마</div>
            <div><b>3축</b>콘텐츠·공간·장치</div>
          </div>
        </div>
      </section>

      {/* CAPABILITIES */}
      <section className="block" id="cap">
        <div className="wrap">
          <div className="shead reveal">
            <div className="eyebrow gold">CAPABILITY · 역량 3축</div>
            <h2 className="title">기획부터 장치까지, 한 팀에서</h2>
            <p className="lead">콘텐츠·공간·기술을 따로 외주 주지 않아도 됩니다. 한 팀이 끝까지 책임지는 인하우스 턴키.</p>
          </div>
          <div className="cap3">
            <div className="cap reveal">
              <div className="ci"><IconPencil /></div><div className="en">Contents</div><h3>콘텐츠 제작</h3>
              <p>이야기와 게임 설계. 방탈출·머더미스터리·브랜드 체험 콘텐츠를 기획합니다.</p>
              <ul><li>세계관·시나리오 기획</li><li>퍼즐·장치 게임 설계</li><li>연출·사운드 디렉팅</li><li>운영 매뉴얼·GM 교육</li></ul>
            </div>
            <div className="cap reveal">
              <div className="ci"><IconPlan /></div><div className="en">Space</div><h3>공간 디자인</h3>
              <p>이야기에 맞춘 몰입형 공간을 직접 디자인하고 시공합니다.</p>
              <ul><li>컨셉·세트 디자인</li><li>인테리어 시공·마감</li><li>동선·조명 설계</li><li>현장 연출 셋업</li></ul>
            </div>
            <div className="cap reveal">
              <div className="ci"><IconGear /></div><div className="en">Tech · Device</div><h3>기술 · 장치</h3>
              <p>이머시브를 만드는 장치를 제작·납품·판매하고 유지보수합니다.</p>
              <ul><li>잠금/해제 장치(RFID·전자석·기계식)</li><li>연출 제어(조명·음향·영상·기믹)</li><li>센서 트리거(동작·압력·자기)</li><li>통합 제어 시스템·유지보수</li></ul>
            </div>
          </div>
        </div>
      </section>

      {/* SERVICES */}
      <section className="block alt" id="service">
        <div className="wrap">
          <div className="shead reveal">
            <div className="eyebrow gold">SERVICES · 제공 서비스</div>
            <h2 className="title">필요한 만큼, 원하는 단계부터</h2>
            <p className="lead">전체 턴키부터 장치 단품 공급까지. 프로젝트 규모와 단계에 맞춰 제안합니다.</p>
          </div>
          <div className="svc">
            <div className="s reveal"><b>컨설팅</b><span>창업·운영·리뉴얼 진단과 방향 제안</span></div>
            <div className="s reveal"><b>턴키 외주 제작</b><span>기획 → 시공 → 오픈까지 일괄</span></div>
            <div className="s reveal"><b>테마 리뉴얼</b><span>기존 공간·콘텐츠 개선·재연출</span></div>
            <div className="s reveal"><b>장치 공급·판매</b><span>장치 단품/세트 제작·납품</span></div>
          </div>
        </div>
      </section>

      {/* PROCESS */}
      <section className="block" id="process">
        <div className="wrap">
          <div className="shead reveal">
            <div className="eyebrow gold">PROCESS · 진행 방식</div>
            <h2 className="title">문의에서 오픈까지 5단계</h2>
          </div>
          <div className="steps">
            <div className="step reveal"><b>문의·상담</b><span>목표·예산·일정 공유</span></div>
            <div className="step reveal"><b>진단·기획</b><span>현장 분석과 콘셉트 제안</span></div>
            <div className="step reveal"><b>설계·견적</b><span>콘텐츠·공간·장치 설계와 견적</span></div>
            <div className="step reveal"><b>제작·시공</b><span>세트·장치 제작 및 현장 셋업</span></div>
            <div className="step reveal"><b>오픈·지원</b><span>운영 교육과 사후 유지보수</span></div>
          </div>
        </div>
      </section>

      {/* REFERENCES */}
      <section className="block alt" id="ref">
        <div className="wrap">
          <div className="shead reveal">
            <div className="eyebrow gold">REFERENCES · 레퍼런스</div>
            <h2 className="title">직접 만들어 11년 운영한 것이, 곧 포트폴리오</h2>
            <p className="lead">강남 직영 3곳·테마 4종을 우리 손으로 기획·시공·운영하며 검증했습니다.</p>
          </div>
          <div className="ref-grid">
            <div className="ref reveal" style={{ "--i": 0 } as CSSProperties}><div className="rt"><Image src="/images/poster-bride.jpg" alt="태초의 신부" fill sizes="(max-width:520px) 100vw, (max-width:860px) 50vw, 280px" /></div><div className="rb"><b>태초의 신부</b><span>1호점 · 잠입 이머시브 · 100분</span></div></div>
            <div className="ref reveal" style={{ "--i": 1 } as CSSProperties}><div className="rt"><Image src="/images/poster-duat.png" alt="사자의 서" fill sizes="(max-width:520px) 100vw, (max-width:860px) 50vw, 280px" /></div><div className="rb"><b>사자의 서</b><span>2호점 · 잠입 이머시브 · 80분</span></div></div>
            <div className="ref reveal" style={{ "--i": 2 } as CSSProperties}><div className="rt"><Image src="/images/lockdowncity-street.jpg" alt="락다운시티" fill sizes="(max-width:520px) 100vw, (max-width:860px) 50vw, 280px" /></div><div className="rb"><b>락다운시티</b><span>3호점 TGC · SF 이머시브 · 100분</span></div></div>
            <div className="ref reveal" style={{ "--i": 3 } as CSSProperties}><div className="rt"><Image src="/images/permanence-escape.jpg" alt="시간의 영속성" fill sizes="(max-width:520px) 100vw, (max-width:860px) 50vw, 280px" /></div><div className="rb"><b>시간의 영속성</b><span>3호점 TGC · 머더룸 · 80분</span></div></div>
          </div>
        </div>
      </section>

      {/* CONTACT */}
      <section className="block contact" id="contact">
        <div className="wrap cgrid">
          <div className="cinfo reveal">
            <div className="eyebrow gold">CONTACT · 문의</div>
            <h2 className="title">프로젝트를 알려주세요</h2>
            <p className="lead">창업, 테마 리뉴얼, 브랜드 전시, 장치 도입 — 무엇이든 상담해 드립니다.</p>
            <div style={{ marginTop: 18 }}>
              <div className="line"><span>이메일</span><b>fantastrick@fantastrick.co.kr</b></div>
              <div className="line"><span>대상</span><b>방탈출·체험형 매장, 브랜드/전시, 장치 도입처</b></div>
              <div className="line"><span>위치</span><b>서울 강남 (직영 매장 1·2·3호점)</b></div>
            </div>
          </div>
          <form
            className="cform reveal"
            onSubmit={(e) => { e.preventDefault(); setSent(true); }}
          >
            <div className="frow">
              <div className="field"><label>이름 / 담당자</label><input type="text" placeholder="홍길동" /></div>
              <div className="field"><label>회사 / 상호 (선택)</label><input type="text" placeholder="회사명" /></div>
            </div>
            <div className="frow">
              <div className="field"><label>연락처</label><input type="text" placeholder="010-0000-0000" /></div>
              <div className="field"><label>문의 유형</label>
                <select><option>컨설팅</option><option>턴키 외주 제작</option><option>테마 리뉴얼</option><option>장치 구매·공급</option><option>기타</option></select>
              </div>
            </div>
            <div className="field"><label>문의 내용</label><textarea placeholder="프로젝트 개요, 예산, 희망 일정 등을 적어주세요." /></div>
            <button type="submit" className="btn gold" style={{ width: "100%", justifyContent: "center" }}>문의 보내기</button>
            <div className="formnote">
              {sent
                ? "※ 문의 전송 기능은 곧 연결됩니다. 우선 fantastrick@fantastrick.co.kr 로 메일 주시면 빠르게 답변드려요."
                : "개인정보는 문의 처리 목적으로만 사용됩니다."}
            </div>
          </form>
        </div>
      </section>
    </>
  );
}
