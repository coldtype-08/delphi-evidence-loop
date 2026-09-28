/**
 * 호버 팝업 자리 잡기 — **커서가 아니라 올린 요소에 고정한다** (08/30 팀장 피드백:
 * "마우스를 대면 너무 많이 움직여서 엄청 불편해").
 *
 * 그전에는 다섯 곳이 전부 `onMouseMove` 로 커서를 따라다녔다. 커서 추적은 작은
 * 점(수집 캘린더)에서는 티가 안 나지만 **큰 카드 위에서는 팝업이 화면을 휘젓는다** —
 * 읽으려고 시선을 옮기는 동안에도 글자가 계속 도망간다. 요소에 고정하면 들어갈 때
 * 한 번 자리를 잡고 나갈 때까지 가만히 있고, 리렌더도 진입·이탈 두 번뿐이다.
 *
 * 두 함수의 차이는 **좌표계**뿐이다: `anchorTip` 은 `position: fixed`(뷰포트),
 * `anchorWithin` 은 `position: absolute`(지정한 컨테이너) 팝업용.
 */

export type TipPos = { x: number; y: number };

type Opts = {
  /** 팝업 크기 — 실측이 있으면 넘긴다. 없으면 넉넉히 잡아 화면 밖으로 나가지 않게. */
  w?: number;
  h?: number;
  /** 요소와 팝업 사이 간격 */
  gap?: number;
  /** 경계에서 남길 여백 */
  margin?: number;
  /** "below" = 아래 우선(넓은 카드), "right" = 오른쪽 우선(작은 칸·타일) */
  prefer?: "below" | "right";
};

/** 뷰포트 좌표 — `position: fixed` 팝업용. */
export function anchorTip(el: Element, o: Opts = {}): TipPos {
  const { w = 280, h = 140, gap = 10, margin = 10, prefer = "below" } = o;
  const r = el.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const clamp = (v: number, max: number) => Math.max(margin, Math.min(v, max - margin));

  if (prefer === "right") {
    // 오른쪽이 기본, 안 들어가면 왼쪽. 세로는 요소 윗변에 맞추고 화면 안으로 접는다.
    const x = r.right + gap + w + margin <= vw ? r.right + gap : r.left - gap - w;
    return { x: clamp(x, vw - w), y: clamp(r.top, vh - h) };
  }
  // 아래가 기본, 안 들어가면 위. 가로는 요소 왼쪽에 맞추고 화면 안으로 접는다.
  const y = r.bottom + gap + h + margin <= vh ? r.bottom + gap : r.top - gap - h;
  return { x: clamp(r.left, vw - w), y: clamp(y, vh - h) };
}

/** 컨테이너 기준 좌표 — `position: absolute` 팝업용(컨테이너는 `relative`). */
export function anchorWithin(el: Element, container: Element, o: Opts = {}): TipPos {
  const { w = 288, h = 200, gap = 12, margin = 4, prefer = "right" } = o;
  const r = el.getBoundingClientRect();
  const box = container.getBoundingClientRect();
  const clamp = (v: number, max: number) => Math.max(margin, Math.min(v, max - margin));

  const left = r.left - box.left;
  const right = r.right - box.left;
  const top = r.top - box.top;
  const bottom = r.bottom - box.top;

  if (prefer === "right") {
    const x = right + gap + w + margin <= box.width ? right + gap : left - gap - w;
    return { x: clamp(x, box.width - w), y: clamp(top, box.height - h) };
  }
  const y = bottom + gap + h + margin <= box.height ? bottom + gap : top - gap - h;
  return { x: clamp(left, box.width - w), y: clamp(y, box.height - h) };
}
