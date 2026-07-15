"use client";
import { useCallback, useEffect, useState } from "react";
import type { Notice } from "@/lib/settings";

// 팝업 공지 (기존 fantastrick.co.kr 의 modal-window 이식 — 같은 동작)
//   · 페이지 열자마자 표시 · 모든 페이지
//   · 닫기: 우측상단 버튼 / 바깥 클릭 / ESC
//   · "N일 동안 안 보기" (기존 쿠키 1일과 동일) — 공지 내용이 바뀌면 다시 보임
const KEY = "fx-notice-hide";

function todayKst() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export default function NoticeModal() {
  const [notice, setNotice] = useState<Notice | null>(null);
  const [open, setOpen] = useState(false);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    let alive = true;
    fetch("/api/config")
      .then((r) => r.json())
      .then((cfg) => {
        if (!alive) return;
        const n: Notice | undefined = cfg?.notice;
        if (!n?.enabled) return;
        // 노출 종료일이 지났으면 표시 안 함
        if (n.until && todayKst() > n.until) return;
        // "N일 동안 안 보기" 확인 — 공지가 수정되면(updatedAt 변경) 다시 보여준다
        try {
          const raw = localStorage.getItem(KEY);
          if (raw) {
            const saved = JSON.parse(raw) as { v: string; until: string };
            if (saved.v === n.updatedAt && saved.until >= todayKst()) return;
          }
        } catch {
          /* 저장값이 깨졌으면 그냥 보여준다 */
        }
        setNotice(n);
        setOpen(true);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // ESC 로 닫기 + 열려있는 동안 배경 스크롤 잠금
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open, close]);

  if (!open || !notice) return null;

  function hideForDays() {
    if (!notice) return;
    const d = new Date(Date.now() + 9 * 3600 * 1000);
    d.setUTCDate(d.getUTCDate() + (notice.hideDays || 1));
    try {
      localStorage.setItem(KEY, JSON.stringify({ v: notice.updatedAt, until: d.toISOString().slice(0, 10) }));
    } catch {
      /* 저장이 막혀 있어도 닫기는 되게 */
    }
    close();
  }

  const inner = (
    <>
      {notice.imageUrl && (
        <div className="nt-img">
          {/* 외부 주소일 수 있어 next/image 최적화 대신 일반 img (도메인 설정 불필요) */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={notice.imageUrl} alt={notice.title || "공지"} />
        </div>
      )}
      {notice.title && <h3 className="nt-title">{notice.title}</h3>}
      {notice.body && <p className="nt-body">{notice.body}</p>}
    </>
  );

  return (
    <div className="modal-overlay nt-overlay" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal nt-modal" role="dialog" aria-modal="true" aria-label={notice.title || "공지사항"}>
        <button className="close-x" onClick={close} aria-label="닫기">✕</button>
        {notice.linkUrl ? (
          <a href={notice.linkUrl} className="nt-link" target="_blank" rel="noopener noreferrer">{inner}</a>
        ) : (
          inner
        )}
        <div className="nt-foot">
          {notice.hideDays > 0 && (
            <button className="nt-hide" onClick={hideForDays}>
              {notice.hideDays === 1 ? "오늘 하루 보지 않기" : `${notice.hideDays}일 동안 보지 않기`}
            </button>
          )}
          <button className="btn sm" onClick={close}>닫기</button>
        </div>
      </div>
    </div>
  );
}
