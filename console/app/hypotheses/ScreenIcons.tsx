/**
 * Screen 층 아이콘 — 역할별 라인 아이콘 한 벌 (08/31 팀장 피드백: 아이콘 통일).
 *
 * Untitled UI 아이콘의 문법(24 그리드 · stroke 2 · round cap/join · 채움 없음)을 따라
 * 직접 그렸다 — 외부 에셋을 들이지 않고(오프라인 시연·라이선스 파일 관리 회피) 같은
 * 룩을 얻는다. 색은 currentColor — 쓰는 쪽 텍스트 색을 그대로 입는다.
 */

function Svg({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden
         className={className ?? "h-4 w-4"}>
      {children}
    </svg>
  );
}

/** 허가·규제 검토관 — 저울 (scales) */
export function IconScales({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M12 3v18M8 21h8" />
      <path d="M5 6l7-2 7 2" />
      <path d="M5 6l-2.5 6a3 3 0 0 0 5 0L5 6ZM19 6l-2.5 6a3 3 0 0 0 5 0L19 6Z" />
    </Svg>
  );
}

/** 임상개발 전략가 — 플라스크 (beaker) */
export function IconFlask({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M10 3h4M10 3v6.3L4.8 18a2 2 0 0 0 1.8 3h10.8a2 2 0 0 0 1.8-3L14 9.3V3" />
      <path d="M7.5 15h9" />
    </Svg>
  );
}

/** 메디컬 어페어 리뷰어 — 펼친 책 (book-open) */
export function IconBook({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M12 6.5C10.6 5 8.6 4 4 4v14c4.6 0 6.6 1 8 2.5 1.4-1.5 3.4-2.5 8-2.5V4c-4.6 0-6.6 1-8 2.5Z" />
      <path d="M12 6.5V20.5" />
    </Svg>
  );
}

/** 마켓 액세스 애널리스트 — 막대 차트 (bar-chart) */
export function IconChart({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M4 20V14M10 20V9M16 20V4M4 20h16" strokeWidth="2" />
    </Svg>
  );
}

/** 안전성 — 방패 체크 (shield-tick) */
export function IconShield({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M12 21c-4.5-1.8-7-4.8-7-9.5V6l7-3 7 3v5.5c0 4.7-2.5 7.7-7 9.5Z" />
      <path d="M9 11.5l2 2 4-4" />
    </Svg>
  );
}

/** 검증 에이전트 — 인증 배지 (check-verified) */
export function IconVerified({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M9 3.5 12 2l3 1.5L18.5 5 20 8l1 3-1 3-1.5 3L15 20.5 12 22l-3-1.5L5.5 19 4 16l-1-3 1-3 1.5-3L9 3.5Z" />
      <path d="M8.5 12l2.5 2.5L15.5 9.5" />
    </Svg>
  );
}

/** 검토 서명(사람) — 사용자 체크 (user-check) */
export function IconUserCheck({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <circle cx="10" cy="7.5" r="3.5" />
      <path d="M3.5 20c.8-3.2 3.4-5 6.5-5 1.2 0 2.3.25 3.3.75" />
      <path d="M15.5 18l2 2 3.5-3.5" />
    </Svg>
  );
}

/** Sense로 보내기 — 뒤로 (corner-up-left) */
export function IconBack({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M8 6 4 10l4 4" />
      <path d="M4 10h11a5 5 0 0 1 5 5v3" />
    </Svg>
  );
}
