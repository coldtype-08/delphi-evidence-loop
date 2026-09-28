"""CLI — the whole loop in six commands. Every screen line is tagged with one of five levels:
[사실] 관찰된 사실 · [패턴] 통계적 패턴 · [해석] AI의 해석 · [제안] 전략적 제안 · [실행] 승인된 실행
"""
from __future__ import annotations

import argparse
import json

from . import board, screen, sense, store

STANCE_KO = {"SUPPORTS": "지지", "CONTRADICTS": "반대", "NEUTRAL": "중립"}


def cmd_sense(args):
    state, contract = store.load(), store.contract()
    notes = json.loads(store.FIELD_NOTES.read_text())
    st = sense.run(state, contract, notes, force=args.force)
    print(f"[사실] 면담 기록 {st['docs']}건 처리 · 인용 검증 통과 {st['kept']} · 원문에 없어 버림 {st['dropped']} · "
          f"유해사례 후보 {st['adverse_events']} (별도 safety 경로)")
    print("[패턴] 환자군 × 신호 유형 (검증된 발언만, 코드 집계)")
    for r in sense.tally(state):
        print(f"   {r['segment']:<14} {r['signal_type']:<20} 언급 {r['mentions']:>2} · 의료진 {r['hcps']:>2}")
    created = sense.draft_hypotheses(state, contract, args.min_mentions, args.min_hcps)
    for h in created:
        print(f"[해석] {h['id']} DRAFT — {h['statement_ko']}  (임계 {args.min_mentions}회/{args.min_hcps}인 통과)")
    if not created:
        print("[해석] 새 가설 없음 (임계 미달이거나 이미 있음)")


def cmd_hypotheses(args):
    for h in store.load()["hypotheses"]:
        f = h["field"]
        print(f"{h['id']} {h['status']:<11} {h['label_status']:<11} {h['segment']} × {h['signal_type']} · "
              f"현장 {f['mentions']}회/{f['hcps']}인 — {h['statement_ko']}")


def cmd_screen(args):
    state, contract = store.load(), store.contract()
    s = screen.run(state, args.hyp, contract, force=args.force)
    n = s["numbers"]
    print(f"[사실] PubMed {n['pubmed_hits']:,}건(RCT·3상·메타분석 {n['pubmed_heavy_hits']}) 중 {n['pubmed_read']}건 읽음 · "
          f"CT.gov {n['ctgov_total']:,}건(3상 {n['ctgov_phase3_total']} · 모집 중 {n['ctgov_recruiting']}) 중 "
          f"{n['ctgov_read']}건 읽음 · FAERS 보고 {n['faers_total']:,}건 · Part D 2024 청구 "
          f"{n['partd_per_year']['2024']['claims']:,}건 · 라벨 {n['label']['brand']} ({n['label']['effective_time']})")
    print(f"[패턴] 근거 집계 (코드): 지지 {s['totals']['SUPPORTS']} · 반대 {s['totals']['CONTRADICTS']} · 중립 {s['totals']['NEUTRAL']}"
          f" · 인용 검증 실패로 버림 {len(s['dropped'])} · 라벨 판정 {s['label_status']}"
          + (f" · 플래그 {s['flags']}" if s["flags"] else ""))
    for it in s["items"]:
        print(f"[해석] {STANCE_KO[it['stance']]:<2} {it['source_id']} @{it['char_start']}-{it['char_end']} — {it['note_ko']}")
        print(f"        “{it['quote'][:140]}”")
    for it in s["dropped"]:
        print(f"[버림] {it['source_id']} — {it['drop_reason']}: “{it['quote'][:80]}”")
    print(f"→ 다음: 사람이 근거를 읽고 서명합니다 — `review {args.hyp} --by 이름`")


def cmd_review(args):
    rev = board.sign_review(store.load(), args.hyp, args.by, args.note or "")
    print(f"[사실] {rev['by']} 이(가) {rev['at']} 에 외부 근거 {rev['items_read']}건(버림 {rev['dropped_seen']}건 포함)을 직접 검토했습니다 — 심의 상정 가능")


def cmd_board(args):
    m = board.deliberate(store.load(), args.hyp, force=args.force)
    print(f"[사실] 라벨 판정 {m['label_status']} → 경로: {m['route']} · 유형 {m['hypothesis_type']} · 주무 {m['lead_ko']} · 참석 {len(m['attendees'])}인 · 발언 {len(m['transcript'])}턴")
    for t in m["transcript"]:
        st = f" [{t['stance']}{'·변경' if t.get('stance_changed') else ''}]" if t.get("stance") else ""
        print(f"[해석] {t['phase']:<10} {t['speaker_ko']:<6}{st} {t['utterance_ko'].split('. ')[0][:110]}")
    tl = m["tally"]
    print(f"[패턴] 최종 입장 (코드 집계): " + " · ".join(f"{s} {tl['counts'][s]}인/{tl['weights'][s]:.1f}" for s in ("SUPPORT", "HOLD", "OPPOSE")) + f" → 권고 {m['recommendation']}")
    for b in m["blocked_actions"]:
        print(f"[사실] 코드 차단: {b['speaker_ko']} “{b['action_ko']}” — {b['reason_ko']}")
    print(f"[제안] 회의록: {m['summary_ko']}")
    print(f"[제안] 권고 사유: {m['rationale_ko']}")
    for r in m["kill_criteria_ko"]:
        print(f"[제안] 중단 기준: {r}")
    for i, q in enumerate(m["follow_up_questions"], 1):
        print(f"[제안] 후속 질문 {i}: {q['question_ko']}  ({q['why_ko']})")
    print(f"→ 다음: 사람이 결정합니다 — `approve {args.hyp} --by 이름`")


def cmd_approve(args):
    acts = board.approve(store.load(), args.hyp, args.by, args.note or "")
    for a in acts:
        print(f"[실행] {a['id']} → 현장 체크리스트: {a['question_ko']}")
    memo = store.load()["board"][args.hyp]
    print(f"[실행] {args.by} 이(가) 권고 {memo['recommendation']} 을 받아들임 · {len(acts)}개 질문이 다음 면담 체크리스트"
          f"({store.FIELD_CHECKLIST.name})에 들어갔습니다")


def cmd_status(args):
    st = store.load()
    print(f"claims {len(st['claims'])} (safety queue {len(st['safety_queue'])}) · hypotheses {len(st['hypotheses'])} · "
          f"screened {len(st['screens'])} · reviewed {len(st['reviews'])} · deliberated {len(st['board'])} · actions {len(st['actions'])}")


def main():
    p = argparse.ArgumentParser(prog="loop", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("sense", help="면담 기록 → 구조화 → 가설 초안"); s.add_argument("--force", action="store_true")
    s.add_argument("--min-mentions", type=int, default=3); s.add_argument("--min-hcps", type=int, default=3); s.set_defaults(fn=cmd_sense)
    sub.add_parser("hypotheses", help="가설 목록").set_defaults(fn=cmd_hypotheses)
    s = sub.add_parser("screen", help="공개 근거 교차검증"); s.add_argument("hyp"); s.add_argument("--force", action="store_true"); s.set_defaults(fn=cmd_screen)
    s = sub.add_parser("review", help="관문 ① 근거 검토 서명"); s.add_argument("hyp"); s.add_argument("--by", required=True); s.add_argument("--note"); s.set_defaults(fn=cmd_review)
    s = sub.add_parser("board", help="심의 (서명 후에만)"); s.add_argument("hyp"); s.add_argument("--force", action="store_true"); s.set_defaults(fn=cmd_board)
    s = sub.add_parser("approve", help="관문 ② 결정 → 현장 체크리스트"); s.add_argument("hyp"); s.add_argument("--by", required=True); s.add_argument("--note"); s.set_defaults(fn=cmd_approve)
    sub.add_parser("status", help="현황").set_defaults(fn=cmd_status)
    args = p.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
