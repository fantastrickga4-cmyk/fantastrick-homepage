import { describe, it, expect } from "vitest";
import { smsByteLength, DEFAULT_TEMPLATES, renderTemplate } from "../src/lib/sms";
import { THEME_TEMPLATES } from "../src/lib/sms-templates";

// NHN Cloud 는 솔라피와 달리 **길이에 따라 호출 경로가 갈린다**.
//   90바이트 이하 → /sender/sms (단문)
//   초과          → /sender/mms (장문, title 필요)
// 이 판정이 틀리면 손님이 받는 문자가 통째로 잘리거나 발송이 실패한다.
// 통신사 기준(EUC-KR)대로 한글은 2바이트로 센다. UTF-8 바이트(한글 3바이트)로 세면
// 멀쩡한 단문까지 장문으로 나가 요금이 3배가 된다.
const LMS_THRESHOLD = 90;

describe("smsByteLength — 통신사 기준 바이트 수", () => {
  it("영문·숫자는 1바이트", () => {
    expect(smsByteLength("abc123")).toBe(6);
  });

  it("한글은 2바이트", () => {
    expect(smsByteLength("판타스트릭")).toBe(10);
  });

  it("섞이면 각각 더한다", () => {
    // "판타스트릭"(10) + " "(1) + "TGC"(3)
    expect(smsByteLength("판타스트릭 TGC")).toBe(14);
  });

  it("빈 문자열은 0", () => {
    expect(smsByteLength("")).toBe(0);
  });

  it("줄바꿈도 1바이트로 센다", () => {
    expect(smsByteLength("가\n나")).toBe(5);
  });

  it("45자짜리 한글은 정확히 경계(90바이트)", () => {
    const s = "가".repeat(45);
    expect(smsByteLength(s)).toBe(LMS_THRESHOLD);
    expect(smsByteLength(s) > LMS_THRESHOLD).toBe(false); // 단문으로 나가야 함
    expect(smsByteLength(s + "가") > LMS_THRESHOLD).toBe(true); // 한 글자 더하면 장문
  });
});

describe("실제 발송 문구는 장문(LMS) 경로로 가야 한다", () => {
  // 우리 안내 문구는 전부 90바이트를 훌쩍 넘는다. 혹시 누가 문구를 줄이더라도
  // "단문 경로로 갔다가 잘리는" 일이 없도록 실제 템플릿으로 확인해 둔다.
  const vars = { name: "홍길동", theme: "사자의 서", date: "2026-08-01", time: "20:40", people: 4 };

  it("확정 안내 기본 문구", () => {
    const body = renderTemplate(DEFAULT_TEMPLATES.confirm, vars);
    expect(smsByteLength(body)).toBeGreaterThan(LMS_THRESHOLD);
  });

  it("테마별 문구(예약·입금)도 모두 장문", () => {
    const bodies = Object.values(THEME_TEMPLATES);
    expect(bodies.length).toBeGreaterThan(0);
    for (const tpl of bodies) {
      expect(smsByteLength(renderTemplate(tpl, vars))).toBeGreaterThan(LMS_THRESHOLD);
    }
  });
});
