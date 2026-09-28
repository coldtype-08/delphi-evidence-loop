import { redirect } from "next/navigation";

/**
 * AI Board 목록은 더 이상 여기 없다 (08/27 IA 개편).
 *
 * 좌측 내비의 "AI Board"는 가설 보드의 board 칸(`/hypotheses?stage=board`)을 가리키고,
 * 상정(BOARD_READY→IN_REVIEW)은 그 카드의 HandoffBar가 한다. 같은 목록을 두 곳에서
 * 그리면 어느 쪽이 정본인지 알 수 없게 되므로, 이 경로는 그 칸으로 넘기기만 한다.
 * 회의장 자체는 `/board/[hypId]`에 그대로 산다.
 */
export default function BoardIndexRedirect(): never {
  redirect("/hypotheses?stage=board");
}
