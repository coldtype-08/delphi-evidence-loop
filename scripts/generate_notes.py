#!/usr/bin/env python3
"""합성 현장 면담 기록 생성기 — data/field_notes.json (v2: 기록 420건 · 의료진 320인).

결정론적(고정 시드). 절 풀(환자군 도입구 × 서술절 × 종결구)에서 문장을 조립하고, 같은 문장은 두 기록에 다시 쓰지 않는다.
신호 문장 하나는 (환자군 × 신호 유형) 한 쌍만 뜻하도록 썼다 — Sense 추출기가 문장을 글자 그대로 인용하기 때문이다.
유해사례 문장은 한 환자에게 일어난 사건으로 읽히게 썼다(별도 safety 경로). 집계는 이 스크립트가 세어 요약표로 찍는다.

실행:  uv run python scripts/generate_notes.py            # data/field_notes.json 덮어씀
       uv run python scripts/generate_notes.py --dry-run  # 요약만 찍고 쓰지 않음
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import random
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "field_notes.json"
CONTRACT = ROOT / "data" / "contract.json"

SEED = 20260928
START = dt.date(2026, 3, 2)          # 월요일
WEEKS = 30                           # 마지막 주 금요일 = 2026-09-25
N_NOTES = 420
N_TRIPLE, N_DOUBLE = 15, 70          # 320인 = 235 × 1건 + 70 × 2건 + 15 × 3건 = 420건
MAX_PAIRS_PER_NOTE = 2
MAX_SENT_PER_PAIR_IN_NOTE = 3
MAX_SIGNAL_PER_NOTE = 5
TOPUP_CAP = 1.6                      # 덧붙이기는 쌍별 문장 하한의 1.6배까지 — 큰 쌍이 순서를 뒤집지 않게
N_ADVERSE = 30
SIGNAL_TARGET_WEIGHTS = {2: 78, 3: 19, 4: 3}   # 기록당 신호 문장 수 (2–5)
FILLER_WEIGHTS = {1: 80, 2: 20}                # 기록당 중립 문장 수

# ── 의료진 명부: (family, 표시 전문과, 인원) ──────────────────────────────────────────
FAMILIES = [
    ("ENDO", "내분비내과 · 대학병원", 14), ("ENDO", "내분비내과 · 종합병원", 13), ("ENDO", "내분비내과 · 개원", 13),
    ("FM", "가정의학과 · 개원", 17), ("IM", "내과 · 개원", 17),
    ("OBGYN", "산부인과 · 개원", 34), ("OBGYN", "산부인과 · 대학병원", 28), ("OBGYN", "산부인과 · 난임클리닉", 26),
    ("ONC", "종양내과 · 암센터", 26), ("ONC", "종양내과 · 대학병원", 22), ("BS", "유방외과 · 대학병원", 24),
    ("NEPH", "신장내과 · 종합병원", 26), ("GER", "노년내과 · 요양병원", 26),
    ("PED", "소아내분비 · 대학병원", 34),
]
assert sum(n for _, _, n in FAMILIES) == 320

# ── (환자군 × 신호 유형) 쌍 ─────────────────────────────────────────────────────────
PAIRS = {
    "PCOS_USE":     ("PCOS 여성", "OFF_LABEL_USE"),
    "PRE_DEMAND":   ("당뇨 전단계", "OFF_LABEL_DEMAND"),
    "BC_DEMAND":    ("유방암 환자", "OFF_LABEL_DEMAND"),
    "OLD_DOSING":   ("노인 65+ · 신기능 저하", "DOSING"),
    "BC_REPURP":    ("유방암 환자", "REPURPOSING"),
    "OLD_SAFETY":   ("노인 65+ · 신기능 저하", "SAFETY_TOLERABILITY"),
    "GDM_DEMAND":   ("임신부 · 임신성 당뇨", "OFF_LABEL_DEMAND"),
    "ADOL_SAFETY":  ("청소년 10-17세", "SAFETY_TOLERABILITY"),
    "PED_DEMAND":   ("소아 10세 미만", "OFF_LABEL_DEMAND"),
    "PCOS_DOSING":  ("PCOS 여성", "DOSING"),
    "PRE_UNMET":    ("당뇨 전단계", "UNMET_NEED"),
    "BC_UNMET":     ("유방암 환자", "UNMET_NEED"),
    "PRE_REPURP":   ("당뇨 전단계", "REPURPOSING"),
    # 문턱(5회·3인) 아래에 일부러 남겨 두는 네 쌍 — 문장 수를 정확히 고정한다
    "ADOL_DEMAND":  ("청소년 10-17세", "OFF_LABEL_DEMAND"),
    "GDM_DOSING":   ("임신부 · 임신성 당뇨", "DOSING"),
    "PED_SAFETY":   ("소아 10세 미만", "SAFETY_TOLERABILITY"),
    "PCOS_REPURP":  ("PCOS 여성", "REPURPOSING"),
}

# (pair, 독립 의료진 목표, 문장 수 하한, 고정 여부). 고정(weak) 쌍은 정확히 그 수만 쓴다.
# 앞에 둔 쌍부터 자리를 잡는다 — 작은 쌍이 빈 기록을 먼저 차지하고, 큰 쌍이 남은 자리를 채운다.
PLAN = [
    ("ADOL_DEMAND", 3, 3, True), ("GDM_DOSING", 4, 4, True), ("PED_SAFETY", 2, 2, True), ("PCOS_REPURP", 3, 3, True),
    ("PRE_REPURP", 15, 15, False), ("PRE_UNMET", 20, 20, False), ("PED_DEMAND", 18, 20, False),
    ("BC_UNMET", 25, 25, False), ("PCOS_DOSING", 25, 25, False),
    ("ADOL_SAFETY", 30, 35, False), ("GDM_DEMAND", 35, 40, False), ("OLD_SAFETY", 35, 40, False),
    ("BC_REPURP", 35, 40, False), ("OLD_DOSING", 50, 55, False), ("BC_DEMAND", 55, 60, False),
    ("PRE_DEMAND", 70, 85, False), ("PCOS_USE", 75, 100, False),
]
WEAK = {p for p, _, _, w in PLAN if w}
MAIN = [p for p, _, _, w in PLAN if not w]

# 전문과 → 말할 법한 쌍. (1순위 태그, 2순위 태그) — 1순위에서 못 채울 때만 2순위로 간다.
ELIGIBLE = {
    "PCOS_USE":    (["OBGYN"], ["ENDO"]),
    "PCOS_DOSING": (["OBGYN"], []),
    "PCOS_REPURP": (["OBGYN"], []),
    "GDM_DEMAND":  (["OBGYN_NONIVF"], ["ENDO_HOSP"]),
    "GDM_DOSING":  (["OBGYN_NONIVF"], []),
    "PRE_DEMAND":  (["ENDO", "FM", "IM"], []),
    "PRE_UNMET":   (["ENDO", "FM", "IM"], []),
    "PRE_REPURP":  (["ENDO", "FM", "IM"], []),
    "OLD_DOSING":  (["NEPH", "GER"], ["ENDO", "IM", "FM"]),
    "OLD_SAFETY":  (["NEPH", "GER"], ["ENDO", "IM", "FM"]),
    "BC_DEMAND":   (["ONC", "BS"], []),
    "BC_REPURP":   (["ONC", "BS"], ["ENDO"]),
    "BC_UNMET":    (["ONC", "BS"], []),
    "PED_DEMAND":  (["PED"], []),
    "PED_SAFETY":  (["PED"], []),
    "ADOL_SAFETY": (["PED"], []),
    "ADOL_DEMAND": (["PED"], []),
}

# 종결구 — 서술절의 '-다' 뒤에 바로 붙는다. OBS는 관찰·관행(서술체 허용), REP는 의견·요구(전언체만).
TAILS_OBS = [".", "고 했다.", "는 것이 본인 경험이라고 했다.", "는 이야기를 했다.", "고 여러 번 말했다."]
TAILS_REP = ["고 했다.", "는 이야기를 했다.", "고 여러 번 말했다.", "는 점을 강조했다.", "고 다시 말했다."]

# ── 절 풀: 쌍마다 [ {openers, cores} … ] 소풀 목록. 한 소풀 안에서는 어느 도입구와 어느 서술절을 붙여도 말이 되게 썼다.
# 도입구가 환자군을 지고, 서술절이 신호 유형을 진다. 서술절은 '-다'로 끝나는 평서형(의사의 말)이다.
POOLS: dict[str, dict] = {}

POOLS["PCOS_USE"] = {"tails": TAILS_OBS, "sub": [
    {   # 배란·난임 맥락
        "openers": [
            "배란 장애가 있는 PCOS 여성에게는", "클로미펜에 반응이 없던 PCOS 환자에서는", "난임으로 온 PCOS 환자에게는",
            "무월경이 길었던 PCOS 환자에게는", "PCOS 환자 중 인슐린 저항성이 뚜렷한 경우에는",
            "다낭성난소증후군으로 의뢰된 환자에게는", "배란 유도를 앞둔 PCOS 환자에게는", "PCOS로 임신을 준비하는 환자에게는",
        ],
        "cores": [
            "레트로졸에 메트포르민을 얹어 배란 유도를 하는데 배란이 되는 비율이 눈에 띄게 올라간다",
            "메트포르민을 석 달 먼저 쓰고 나서 배란 유도를 다시 시도하면 되는 경우가 여럿 있었다",
            "시험관 시술 전에 메트포르민을 미리 쓰면 난소과자극증후군이 덜 생기는 인상이 있어 계속 쓰고 있다",
            "메트포르민을 보조로 쓴 뒤 임신까지 이어진 사례가 지난 1년에 몇 건 있었다",
            "메트포르민 단독으로는 배란이 잘 안 되지만 레트로졸과 같이 쓰면 확실히 낫다",
            "메트포르민 사용 후 자궁내막 두께가 정상으로 돌아온 것을 초음파로 확인한 적이 있다",
            "메트포르민 6개월 만에 자연 주기를 되찾은 사례를 여러 번 봤다",
            "클로미펜 단독 주기보다 메트포르민을 얹은 주기에서 배란 확인율이 높았다",
            "메트포르민을 두 달 이상 쓴 뒤 배란 유도에 들어가면 주기 취소가 줄었다",
        ],
    },
    {   # 대사·주기·피부 맥락
        "openers": [
            "PCOS 환자 중 인슐린 저항성이 뚜렷한 경우에는", "다낭성난소증후군으로 의뢰된 환자에게는", "비만한 PCOS 환자에서는",
            "PCOS로 월경이 불규칙한 환자에게는", "PCOS 진단을 받은 20~30대 여성에게는",
            "인슐린 저항성이 확인된 다낭성난소증후군 환자에서는", "PCOS 환자 가운데 체중이 계속 느는 경우에는",
            "다낭성난소증후군 환자에게는", "내분비내과에서 PCOS로 넘어온 환자에게는",
        ],
        "cores": [
            "메트포르민을 수년째 써 왔고 서너 달이면 월경 주기가 규칙적으로 돌아오는 환자가 분명히 있다",
            "메트포르민을 쓰면 체중이 2~3kg 빠지면서 주기가 돌아오는 경우가 많다",
            "당뇨 적응증으로 메트포르민을 처방하지만 실제 목적은 주기 회복이고 반응은 절반 정도에서 본다",
            "경구피임약과 메트포르민을 같이 쓰면 여드름과 다모증이 조금 나아지는 환자가 있다",
            "메트포르민을 쓰고 나서 공복 인슐린 수치가 떨어지는 것을 검사로 확인하고 있다",
            "메트포르민을 1년 이상 유지한 환자들은 대체로 주기가 안정되어 지금도 계속 쓰고 있다",
            "메트포르민을 써 보면 체중 감소보다 주기 회복이 먼저 온다",
            "메트포르민을 쓴 뒤 여드름이 줄었다는 말을 환자에게서 자주 듣는다",
            "메트포르민을 쓰면 공복혈당보다 인슐린 수치가 먼저 반응한다는 것을 경험으로 안다",
            "메트포르민을 쓰고 월경이 돌아오면 그 뒤로는 약 없이도 유지되는 경우가 있다",
        ],
    },
]}

POOLS["PRE_DEMAND"] = {"tails": TAILS_REP, "sub": [
    {   # 의사가 쓰고 싶은데 허가·급여가 막는다
        "openers": [
            "당뇨 전단계 환자 중 BMI 30이 넘는 젊은 환자에게는", "공복혈당장애로 몇 년째 추적 중인 환자에게는",
            "당뇨 전단계라도 가족력이 강하고 체중이 계속 느는 환자에게는", "내당능장애 단계의 고위험 환자에게는",
            "당화혈색소 6.2 전후의 당뇨 전단계 환자에게는", "다음 검사에서 당뇨로 넘어갈 것이 뻔한 전단계 환자에게는",
            "당뇨 전단계인 30~40대 비만 환자에게는", "검진센터에서 당뇨 전단계로 의뢰된 환자에게는",
        ],
        "cores": [
            "메트포르민을 쓰고 싶은데 허가 범위 밖이라 먼저 권하지 못한다",
            "메트포르민을 처방하면 급여 삭감이 나와서 실제로는 손을 못 댄다",
            "약을 쓰는 게 맞다고 보지만 국내 허가가 없어 생활습관 교정만 권하고 있다",
            "메트포르민을 쓰려면 비급여 동의서를 따로 받아야 해서 대부분 포기한다",
            "메트포르민을 미리 시작하고 싶어도 적응증이 없어 3개월 뒤 재검만 잡는다",
            "메트포르민을 쓸 근거는 충분하다고 보지만 허가와 급여 두 가지가 모두 막고 있다",
            "허가 밖 처방을 했다가 급여 조정을 받은 뒤로는 메트포르민을 아예 시도하지 않는다",
            "학회 권고에 메트포르민 고려가 들어 있지만 국내 허가가 없어 처방이 어렵다",
            "메트포르민을 쓰지 못하는 것이 가장 답답한 부분이고 허가만 있으면 바로 쓰겠다",
            "허가 밖 처방에 따른 책임 문제가 걸려 메트포르민을 쓰지 못하고 있다",
            "메트포르민의 예방 효과를 알면서도 허가 밖이라 처방전을 쓰지 못한다",
            "메트포르민이 진행을 늦춘다는 자료가 있어도 적응증 밖이라 쓰지 못해 아쉽다",
        ],
    },
    {   # 환자가 먼저 요구하고 의사는 거절한다
        "openers": [
            "미국 예방 연구 자료를 들고 와서 메트포르민을 달라는 당뇨 전단계 환자에게는",
            "온라인에서 메트포르민 정보를 보고 온 당뇨 전단계 환자에게는", "당뇨 전단계 진단 후 약을 원하는 환자에게는",
            "공복혈당이 120 근처인 전단계 환자가 메트포르민을 요구하면", "당뇨 전단계 환자가 먼저 메트포르민을 물어보면",
            "검진에서 당뇨 전단계가 나와 약을 달라는 환자에게는",
        ],
        "cores": [
            "허가 밖이라 안 된다고 돌려보내는 일이 매달 있다",
            "적응증이 없어 매번 설명만 하고 끝난다",
            "허가 범위 때문에 처방하지 못한다고 같은 설명을 반복한다",
            "쓰고 싶은 마음은 있지만 허가와 급여 문제로 거절할 수밖에 없다",
            "국내 허가가 없다는 말로 시작해 생활습관 교정 이야기로 넘어간다",
            "미국에서 예방 효과가 확인된 것은 맞지만 국내에서는 허가 밖이라 처방하지 못한다고 답한다",
            "허가만 있으면 쓰겠는데 지금은 방법이 없다고 솔직하게 말한다",
            "급여가 안 되고 허가도 없어 처방을 거절하는 일이 늘었다",
        ],
    },
]}

POOLS["BC_DEMAND"] = {"tails": TAILS_REP, "sub": [
    {
        "openers": [
            "유방암 수술 후 외래에서", "메트포르민이 재발을 줄인다는 기사를 본 유방암 환자들이", "당뇨가 없는 유방암 환자가",
            "호르몬 수용체 양성 유방암 환자들이", "유방암 환자 커뮤니티에서 이야기를 듣고 온 환자가", "항암치료 중인 유방암 환자가",
            "유방암 재발을 걱정하는 젊은 환자들이", "유방암 치료를 마치고 정기 검진을 받는 환자가",
            "유방암 진단 후 대사증후군이 있는 환자가", "수술을 마친 유방암 환자가",
        ],
        "cores": [
            "메트포르민을 처방해 달라고 요청하는 일이 한 달에 몇 건씩 있고 적응증이 없어 거절한다",
            "메트포르민을 먹으면 안 되느냐고 묻는데 3,600명 넘게 참여한 캐나다 주도 3상이 무효로 나와 권하지 않는다",
            "비급여로라도 메트포르민을 달라고 하지만 처방할 근거가 없다",
            "메트포르민을 요구하면 대규모 3상에서 재발 감소가 확인되지 않았다는 점을 설명하고 돌려보낸다",
            "다른 병원에서는 메트포르민을 줬다며 요구했지만 적응증 밖이라 응하지 않았다",
            "논문을 출력해 와서 메트포르민 처방을 요구했고 3상 결과가 음성이라 권하지 않는다고 답했다",
            "메트포르민을 예방 목적으로 먹고 싶다고 하는데 허가도 근거도 없어 처방하지 않는다",
            "메트포르민 병용을 원했지만 적응증이 없어 처방 명분이 없었다",
            "메트포르민 처방을 부탁하는 일이 매주 있는데 무효였던 3상을 뒤집을 자료가 없어 거절한다",
            "메트포르민을 달라고 하면 캐나다 3상에서 무병생존 개선이 없었다고 설명하는 데 시간이 많이 든다",
            "메트포르민을 요청하는 빈도가 작년보다 늘었고 허가 밖으로는 처방하지 않는다는 원칙을 지킨다",
            "메트포르민을 원하는 심정은 이해하지만 3상이 음성인 약을 허가 밖으로 쓸 수는 없다",
            "메트포르민을 요구하면 당뇨 진단 기준에 미치지 못해 처방하지 못한다고 답한다",
            "메트포르민 이야기를 꺼내면 3상 결과와 허가 범위를 설명하는 표준 답변을 쓴다",
        ],
    },
]}

POOLS["BC_REPURP"] = {"tails": TAILS_REP, "sub": [
    {   # 당뇨 동반 유방암 환자에서 유지하는 관찰
        "openers": [
            "당뇨를 동반한 유방암 환자에서는", "유방암과 당뇨를 함께 가진 환자를 두고", "비만한 유방암 환자에서는",
            "유방암 환자 중 인슐린 저항성이 높은 군에서는", "당뇨약으로 메트포르민을 쓰던 유방암 환자에서는",
            "메트포르민을 이미 쓰고 있는 당뇨 동반 유방암 환자에 대해서는",
        ],
        "cores": [
            "메트포르민을 유지하는 편인데 항암 효과를 시사한 관찰 연구가 있어 끊을 이유가 없다고 본다",
            "메트포르민을 쓰면서 종양 반응이 다른지 내부 자료를 모아 보고 있다",
            "메트포르민 사용군의 재발률이 낮았다는 후향 자료가 있다",
            "메트포르민을 계속 쓰는 것은 혈당 관리 외에 항암 보조 효과를 기대하는 측면도 있다",
            "메트포르민이 예후에 영향을 줄 수 있다는 가설은 여전히 유효하다고 본다",
        ],
    },
    {   # 근거·기전 논의
        "openers": [
            "유방암에서 메트포르민의 항암 작용에 대해서는", "삼중음성 유방암에서는", "유방암 아형별로 보면",
            "유방암의 항암 보조 쓰임과 관련해서는", "유방암 재발 억제 목적의 메트포르민에 대해서는",
            "유방암 영역에서 메트포르민의 다른 쓰임에 대해서는",
        ],
        "cores": [
            "기전상으로는 그럴듯하다고 보고 관련 논문을 계속 챙겨 본다",
            "메트포르민이 항암제 반응을 높인다는 소규모 연구가 있어 대사증후군 하위군은 다를 수 있다고 본다",
            "메트포르민 병용을 본 2상 자료를 인용하며 항암 목적의 쓰임이 완전히 닫힌 것은 아니라고 본다",
            "메트포르민이 mTOR 경로를 억제한다는 기초 연구가 있어 항암 보조 가능성이 남아 있다고 본다",
            "3상이 음성이었어도 특정 아형에서는 메트포르민의 항암 쓰임이 남아 있다고 보는 동료가 있다",
            "메트포르민과 내분비 치료 병용을 본 연구 결과가 서로 엇갈린다",
            "관찰 연구와 무작위 연구가 서로 다른 방향을 가리키고 있어 판단을 유보하고 있다",
        ],
    },
]}

POOLS["BC_UNMET"] = {"tails": TAILS_REP, "sub": [
    {
        "openers": [
            "유방암 환자에게 메트포르민 근거를 설명할 때", "유방암 외래에서 메트포르민 질문을 받을 때", "유방암 환자 상담용으로",
            "유방암과 메트포르민에 대해서는", "유방암 환자의 메트포르민 문의에 답하려면", "유방암 환자 설명용으로",
        ],
        "cores": [
            "쓸 수 있는 한 장짜리 정리 자료가 없다는 점이 아쉽다",
            "연구가 어디까지 왔는지 요약한 자료가 있으면 바로 보여 주고 싶다",
            "임상 결과를 표로 정리한 자료가 필요하다",
            "근거를 매번 찾아봐야 해서 정리된 참고 자료가 절실하다",
            "최신 근거를 한 페이지로 요약해 주면 진료실에서 유용하겠다",
            "3상 결과와 하위군 자료를 함께 담은 요약본이 있으면 좋겠다",
            "환자 눈높이에 맞춘 설명 자료가 없어 매번 말로만 설명하고 있다",
            "무엇이 확인됐고 무엇이 아닌지 한눈에 보이는 자료가 필요하다",
        ],
    },
]}

POOLS["OLD_DOSING"] = {"tails": TAILS_OBS, "sub": [
    {   # eGFR 기준·프로토콜 불일치
        "openers": [
            "신기능이 떨어진 노인 환자에서는", "eGFR 30에서 45 사이의 노인 환자에게는", "신기능 저하가 있는 노인 당뇨 환자의 경우",
            "eGFR 45 미만의 노인에서는", "신기능이 경계선인 노인 환자에게는", "신장 기능이 오르내리는 노인 환자는",
            "노인 당뇨 환자를 볼 때",
        ],
        "cores": [
            "eGFR 45 미만이면 메트포르민을 새로 시작하지 않고 30 미만이면 끊는 기준을 쓴다",
            "메트포르민 하루 용량을 1000mg 이하로 줄이는 기준이 병원마다 달라 혼선이 있다",
            "메트포르민 감량 기준을 eGFR 45로 잡을지 60으로 잡을지 과 사이에 의견이 다르다",
            "3개월마다 eGFR을 확인하고 메트포르민 용량을 조정한다",
            "메트포르민을 절반으로 줄여 유지하는 것으로 병원 안에서 합의했다",
            "메트포르민을 감량하면 혈당이 오르니 다른 약을 얹어야 하는데 그 기준이 명확하지 않다",
            "체중과 eGFR에 따라 메트포르민 용량을 정하는 표가 있으면 실무에 도움이 되겠다",
            "메트포르민 최대 용량을 eGFR 구간별로 정해 둔 내부 지침을 쓰고 있다",
            "메트포르민을 끊는 시점을 eGFR 30으로 볼지 그보다 앞당길지 판단이 어렵다",
            "메트포르민 감량 시점을 놓치지 않도록 처방 시스템에 eGFR 경고를 넣어 두었다",
        ],
    },
    {   # 고령 환자의 실무 용량·제형
        "openers": [
            "80세 이상 고령 환자에게는", "거동이 불편한 고령 환자에게는", "노인 환자에게 메트포르민을 유지할 때는",
            "요양병원 노인 환자에게는",
        ],
        "cores": [
            "메트포르민을 하루 500mg 두 번을 넘기지 않는 것을 원칙으로 삼는다",
            "서방정으로 바꿔 하루 한 번 복용하게 하면 용량 관리가 쉬워진다",
            "하루 한 번 저용량으로 유지하는 방식을 쓴다",
            "서방정 500mg 단위로 조정하는 것이 편하다",
            "복용 횟수를 줄이려고 서방정 한 알로 통일한다",
            "입원 시 eGFR을 보고 용량을 다시 맞추는 것을 원칙으로 한다",
        ],
    },
    {   # 조영제 전후 중단
        "openers": ["조영제 검사를 앞둔 노인 환자에서는", "노인 환자의 CT 조영제 검사 전에는", "조영제를 쓰는 시술이 잡힌 노인 환자는"],
        "cores": [
            "요오드 조영제 전후로 메트포르민을 며칠 쉬게 할지 기준이 과마다 달라 조율이 필요하다",
            "메트포르민을 검사 당일부터 48시간 쉬게 하고 신기능을 확인한 뒤 다시 시작한다",
            "메트포르민 중단 지시가 누락되는 일이 있어 검사실과 체크리스트를 만들었다",
            "메트포르민을 쉬는 기간을 이틀로 할지 사흘로 할지 과마다 다르다",
        ],
    },
]}

POOLS["OLD_SAFETY"] = {"tails": TAILS_OBS, "sub": [
    {   # 젖산산증·탈수·병가 규칙
        "openers": [
            "신기능이 떨어진 노인에서는", "고령 당뇨 환자에서는", "신기능 저하가 있는 고령 환자의 경우", "탈수가 잦은 노인 환자에서는",
            "신기능이 나쁜 고령 환자에게는", "고령에 신기능까지 떨어진 환자에서는",
        ],
        "cores": [
            "메트포르민 젖산산증 위험을 늘 염두에 두고 탈수나 음주가 겹칠 때를 가장 걱정한다",
            "여름철 탈수와 겹치면 위험해서 더운 날에는 메트포르민을 쉬게 하는 규칙을 둔다",
            "젖산산증 경고를 설명하면 환자가 겁을 먹고 약을 끊는 일이 있다",
            "급성 질환이 생기면 메트포르민을 바로 중단하는 병가 규칙을 교육한다",
            "메트포르민 젖산산증은 드물지만 한번 생기면 치명적이라 보수적으로 본다",
            "메트포르민 젖산산증 위험을 실제보다 크게 보는 의사가 많아 과도하게 끊는 경향이 있다",
            "메트포르민은 저혈당 위험이 낮아 설폰요소제보다 안전하다고 보지만 신기능만은 꼭 본다",
        ],
    },
    {   # 장기 복용·B12·위장관·영양
        "openers": [
            "노인 환자에게 메트포르민을 오래 쓰면", "요양병원 노인 환자에게 메트포르민을 쓸 때는", "75세 이상 환자에게는",
            "노인 환자의 메트포르민 안전성에 대해서는", "메트포르민을 5년 넘게 쓴 노인 환자에서는", "장기 복용 중인 노인 환자에게는",
        ],
        "cores": [
            "비타민 B12가 떨어지는 경우가 많아 1년에 한 번은 검사한다",
            "위장관 부작용으로 식사량이 줄어 오히려 해가 되는 경우가 있어 주의한다",
            "식욕 저하와 체중 감소가 약 부작용인지 다른 병 때문인지 구분하기 어렵다",
            "B12 결핍과 신경병증, 빈혈을 놓치기 쉬워 정기 검사에 넣었다",
            "설사가 낙상이나 탈수로 이어질 수 있어 내약성을 자주 묻는다",
            "내약성은 대체로 괜찮지만 신기능 변화가 갑자기 올 때가 가장 걱정된다",
            "안전성 자료가 대부분 젊은 환자 연구라서 참고하기 어렵다",
        ],
    },
]}

POOLS["GDM_DEMAND"] = {"tails": TAILS_REP, "sub": [
    {   # 산모가 주어
        "openers": [
            "임신성 당뇨로 진단된 산모가", "해외 지침을 보고 온 임신성 당뇨 산모가", "임신성 당뇨로 의뢰된 산모가",
            "임신성 당뇨 산모들이", "인슐린을 두려워하는 임신성 당뇨 산모가",
        ],
        "cores": [
            "메트포르민을 원하는 경우가 많은데 국내 허가가 없어 설명이 길어진다",
            "메트포르민 처방을 요청했지만 국내 허가가 없어 거절했다",
            "메트포르민을 달라고 하면 허가 문제로 안 된다고 답할 수밖에 없다",
            "메트포르민 허가가 없다는 사실을 설명하면 대부분 실망한다",
            "메트포르민을 요구할 때 안 된다고 하면 다른 병원을 찾는 경우도 있다",
            "주사보다 먹는 약을 원해서 메트포르민 문의가 많지만 허가가 없어 처방하지 못한다",
            "메트포르민을 먼저 물어보는데 국내 적응증이 없어 인슐린 교육으로 넘어간다",
        ],
    },
    {   # 의사의 입장
        "openers": [
            "임신성 당뇨 산모 중 인슐린 주사를 거부하는 경우에는", "임신부에게 메트포르민을 쓰는 문제는",
            "임신성 당뇨 환자에게 먹는 약을 쓰는 것에 대해", "인슐린 대신 먹는 약을 원하는 임신부에게는",
            "임신 중 혈당 조절이 필요한 산모에게", "임신성 당뇨 관리에서",
        ],
        "cores": [
            "메트포르민을 쓰고 싶어도 허가 밖이라 인슐린으로 갈 수밖에 없다",
            "먹는 약 선택지가 없다는 것이 가장 큰 불만이고 메트포르민 허가가 나면 바로 쓰겠다",
            "영국이나 호주에서는 메트포르민이 흔히 쓰이는데 국내에서는 허가 밖이라 쓰지 못한다",
            "허가 밖 사용 동의를 받아야 해서 실제로는 메트포르민을 시도하지 않는다",
            "메트포르민을 쓸 수 있으면 외래 관리가 훨씬 수월할 텐데 허가가 없어 못 한다",
            "허가만 있으면 인슐린 대신 메트포르민을 먼저 쓰고 싶다",
            "메트포르민을 쓰고 싶은 마음은 있지만 허가 문제와 태아 안전에 대한 책임 때문에 쓰지 않는다",
        ],
    },
]}

POOLS["ADOL_SAFETY"] = {"tails": TAILS_OBS, "sub": [
    {
        "openers": [
            "청소년 제2형 당뇨 환자에서는", "10대 환자에게 메트포르민을 쓸 때", "비만한 10대 당뇨 환자에서",
            "중고등학생 당뇨 환자에게는", "12세에서 17세 사이 환자에서는", "청소년에게 메트포르민을 처음 시작할 때",
        ],
        "cores": [
            "메트포르민 내약성은 성인과 비슷하고 위장관 증상도 대개 몇 주 안에 가라앉는다",
            "부작용 때문에 중단하는 경우는 드물다",
            "위장관 불편감은 성인보다 오히려 적게 나타난다",
            "저혈당이 거의 없어 학교 생활에 지장이 적다는 점을 부모가 좋아한다",
            "위장관 증상은 처음 한 달이 고비이고 그 뒤로는 대체로 문제가 없다",
            "젖산산증은 본 적이 없고 안전성 면에서 걱정이 적다",
            "부작용은 대부분 가벼운 복통과 설사이고 서방정으로 바꾸면 해결된다",
            "안전성은 성인 자료와 크게 다르지 않아 부모에게 설명하기 어렵지 않다",
        ],
    },
    {
        "openers": ["청소년 당뇨 환자에게 메트포르민을 2년 이상 쓴 경험으로는", "청소년 환자를 수십 명 본 경험으로는", "청소년 당뇨 환자를 오래 추적한 경험상"],
        "cores": [
            "B12 결핍은 아직 보지 못했지만 매년 한 번은 확인한다",
            "성장이나 사춘기 발달에 영향을 본 적은 없다",
            "성인과 다를 게 없어 특별한 모니터링을 추가하지 않는다",
            "장기 안전성 자료가 성인보다 적지만 지금까지 경험으로는 문제가 없었다",
            "부작용으로 약을 바꾼 적이 한 번도 없다",
            "내약성은 성인과 같은 수준이라 부모에게 그렇게 설명한다",
        ],
    },
]}

POOLS["PED_DEMAND"] = {"tails": TAILS_REP, "sub": [
    {
        "openers": [
            "10세 미만 비만 아동에서 제2형 당뇨가 나오면", "8~9세 소아 당뇨 환자에게는", "10세가 안 된 당뇨 아동의 경우",
            "소아 10세 미만 제2형 당뇨는", "10세 미만 아동에서는",
        ],
        "cores": [
            "메트포르민 허가가 10세 이상이라 쓸 수 없어 답답하다",
            "메트포르민을 쓰고 싶어도 허가 연령 밖이라 인슐린으로 시작한다",
            "메트포르민을 쓸 수 있는 근거가 있으면 좋겠는데 지금은 허가 때문에 쓰지 못한다",
            "대안이 마땅치 않아 메트포르민을 쓰고 싶지만 허가 범위 밖이라 보류한다",
            "부모가 메트포르민을 물어봐도 허가 연령이 아니라 쓰지 못한다",
            "메트포르민을 허가 밖으로 쓰려면 병원 윤리위 검토가 필요해 현실적으로 어렵다",
            "메트포르민이 첫 선택이어야 한다고 보지만 허가가 10세부터라 손을 못 댄다",
            "허가 연령 제한 때문에 메트포르민 대신 식이 조절만 하다가 시간을 보낸다",
        ],
    },
]}

POOLS["PCOS_DOSING"] = {"tails": TAILS_OBS, "sub": [
    {
        "openers": [
            "PCOS 환자에게 메트포르민을 쓸 때는", "다낭성난소증후군 환자에게는", "배란 유도 전에 PCOS 환자에게 메트포르민을 쓸 때",
            "PCOS로 메트포르민을 시작하는 환자에게는", "PCOS 환자에게 메트포르민을 처방할 때", "PCOS 환자의 메트포르민 처방에서는",
        ],
        "cores": [
            "500mg으로 시작해 2주마다 올려 1500mg까지 가는 방식을 쓴다",
            "목표 용량을 하루 1500mg으로 볼지 2000mg으로 볼지 정해진 기준이 없다",
            "서방정을 저녁 한 번으로 쓰면 복약 순응도가 낫다",
            "용량을 얼마까지 올려야 배란 효과가 나는지 자료가 부족하다",
            "체중에 따라 용량을 달리할지 고민된다",
            "배란 유도 주기 시작 최소 두 달 전부터 용량을 맞춰 두어야 한다",
            "위장관 증상을 피하려고 식사 직후 복용으로 통일해 두었다",
            "하루 두 번보다 서방정 한 번이 유지가 잘 된다",
        ],
    },
]}

POOLS["PRE_UNMET"] = {"tails": TAILS_REP, "sub": [
    {
        "openers": ["당뇨 전단계 환자에게 생활습관 교정을 권해도"],
        "cores": [
            "6개월 뒤 유지되는 사람이 거의 없어 다른 방법이 필요하다",
            "환자가 위기감을 느끼지 못해 재방문율이 낮은 것이 큰 문제라고 본다",
            "석 달만 지나면 원래 습관으로 돌아가는 환자가 대부분을 차지한다",
            "따라오는 환자가 열에 둘도 안 된다",
        ],
    },
    {
        "openers": [
            "당뇨 전단계 환자 관리에서는", "당뇨 전단계로 진단된 환자를 두고", "공복혈당장애 환자를 추적하다 보면",
            "당뇨 전단계 단계에서는", "당뇨 전단계 환자를 볼 때마다",
        ],
        "cores": [
            "추적 관리할 체계가 개원가에 없어 재검 시기를 놓치는 환자가 많다",
            "누가 실제로 당뇨로 진행할지 가려낼 도구가 없다는 것이 가장 큰 공백으로 남아 있다",
            "급여가 되는 교육 프로그램이 없어 상담을 짧게 끝낼 수밖에 없다",
            "쓸 수 있는 검증된 치료 선택지가 사실상 없다",
            "진행을 늦출 방법이 생활습관 교정뿐이라 진료실에서 해 줄 것이 별로 없다",
            "영양 상담을 연결할 곳이 없어 종이 안내문 한 장으로 끝난다",
            "환자가 위기감을 느끼지 못해 재방문율이 낮은 것이 큰 문제라고 본다",
        ],
    },
]}

POOLS["PRE_REPURP"] = {"tails": TAILS_REP, "sub": [
    {
        "openers": [
            "당뇨 전단계이면서 지방간이 있는 환자에서는", "지방간을 동반한 당뇨 전단계 환자를 두고", "당뇨 전단계 환자의 지방간에 대해서는",
            "당뇨 전단계와 지방간을 같이 가진 환자에서", "대사이상 지방간이 있는 당뇨 전단계 환자에 대해서는",
        ],
        "cores": [
            "메트포르민이 간수치 개선에 도움이 되는지 관심이 있다",
            "메트포르민을 지방간 치료 목적으로 본 관찰 연구가 있어 근거가 더 나오는지 지켜보고 있다",
            "메트포르민이 간 지방을 줄인다는 자료가 있는지 궁금하다",
            "메트포르민을 지방간 쪽으로 보는 시각이 소화기내과에 있다",
            "메트포르민이 다른 쓰임으로 검토된 적이 있다는 것을 알고 있다",
            "메트포르민의 간 관련 효과는 관찰 자료뿐이라 근거가 엇갈린다",
            "혈당보다 간 지방 개선을 기대하고 메트포르민을 보는 동료가 있다",
        ],
    },
]}

# ── 문턱 아래에 남겨 두는 네 쌍: 완성 문장, 정확히 이 수만 쓴다 ────────────────────────
WEAK_SENTENCES = {
    "ADOL_DEMAND": [
        "당뇨 진단은 안 됐지만 인슐린 저항성이 심한 비만 청소년에게 메트포르민을 쓰고 싶은데 허가 범위 밖이라 쓰지 못한다고 했다.",
        "청소년 비만 환자의 체중 관리 목적으로 메트포르민을 쓰고 싶다는 요청이 있지만 적응증이 아니라 처방하지 못한다고 했다.",
        "당뇨가 없는 10대 비만 환자에게 메트포르민을 쓰고 싶어도 청소년 허가 범위가 당뇨뿐이라 보류한다고 했다.",
    ],
    "GDM_DOSING": [
        "임신성 당뇨에서 메트포르민을 쓴다면 용량을 어디까지 올릴지 참고할 국내 자료가 없다고 했다.",
        "임신부에게 메트포르민을 쓰는 해외 지침의 용량 구간이 우리 환자에게 맞는지 모르겠다고 했다.",
        "임신성 당뇨 산모에게 메트포르민을 쓸 경우 서방정과 속방정 중 무엇이 나은지 정리된 것이 없다고 했다.",
        "임신 중 메트포르민 용량은 체중 증가에 맞춰 조정해야 할 텐데 기준이 없다고 했다.",
    ],
    "PED_SAFETY": [
        "10세 미만 아동에서 메트포르민 안전성 자료는 거의 없어 판단할 근거가 없다고 했다.",
        "10세 미만 소아에게 메트포르민을 쓴 해외 증례에서는 내약성이 나쁘지 않았다고 들었다고 했다.",
    ],
    "PCOS_REPURP": [
        "PCOS 환자의 자궁내막 보호 목적으로 메트포르민을 보는 연구가 있다는 이야기를 했다.",
        "PCOS 여성에서 메트포르민이 장기적으로 심혈관 위험을 줄일지 보는 시각이 있다고 했다.",
        "PCOS 환자에서 메트포르민의 체중 감량 목적 사용은 별개 쓰임으로 봐야 한다는 의견을 냈다.",
    ],
}

# ── 중립 문장(신호 없음): 틀 + 빈칸 후보. 조합을 모두 펼친 뒤 섞어서 겹치지 않게 쓴다 ─────
FILLER_BASES = [
    ("면담은 {} {}분 정도 {}.", [["외래 사이", "오전 진료가 끝난 뒤", "점심시간에", "회진 뒤", "오후 진료 전", "외래 마감 후"],
                                ["15", "20", "25", "30", "40"], ["진행했다", "이어졌다", "했다"]]),
    ("다음 방문은 {} {}로 잡았다.", [["학회 일정을 피해", "외래 일정에 맞춰", "협진 교수 일정에 맞춰", "환자 진료가 적은 날인", "본인 요청대로"],
                                 ["한 달 뒤", "6주 뒤", "두 달 뒤", "다음 분기", "석 달 뒤"]]),
    ("{} 처방 시스템이 바뀌면서 {} 이야기를 곁들였다.", [["병원", "진료실", "원내", "그룹 병원 전체"],
                                                ["약물 상호작용 경고가 늘었다는", "처방 화면이 느려졌다는", "검사 결과 연동이 좋아졌다는", "재처방 절차가 복잡해졌다는"]]),
    ("{} 당뇨병 진료지침 개정판을 {}고 했다.", [["새로 나온", "올해 개정된", "최근 배포된", "학회에서 나눠 준"],
                                          ["아직 다 읽지 못했다", "전공의들과 같이 읽고 있다", "요약본만 봤다", "과 회의에서 검토했다"]]),
    ("환자 교육 자료는 {} {}고 했다.", [["간호사가", "영양사가", "교육 담당 간호사가", "코디네이터가"],
                                   ["따로 만들어 쓰고 있다", "병원 공용 자료로 통일했다", "학회 자료를 그대로 쓴다", "올해 새로 정리했다"]]),
    ("제2형 당뇨 성인 환자에서는 {} 메트포르민을 1차 약제로 쓴다고 했다.", [["여전히", "지금도", "변함없이", "당연히"]]),
    ("외래 환자 수가 늘어 면담 시간이 짧아졌고 {} 보기로 했다.", [["다음에는 점심시간에", "다음 방문은 오전에", "다음에는 진료 전 시간에", "다음에는 학회장에서", "다음에는 회의실에서"]]),
    ("전공의 교육 때 {} 다시 정리해서 가르치고 있다고 했다.", [["약물 처방 원칙을", "검사 판독 기준을", "환자 설명 방법을", "허가 범위 확인 절차를", "협진 의뢰 요령을"]]),
    ("다음 면담에서는 {} 같이 보기로 했다.", [["최근 발표된 학회 초록을", "요청한 자료를", "병원 내부 지침 개정안을", "환자 교육 자료 초안을", "외부 자문 회신을"]]),
    ("병원 약제부에서 {} 진행 중이라 {}고 했다.", [["제네릭 전환을", "처방 코드 정비를", "약품 목록 개편을", "포장 단위 변경을"],
                                         ["처방 코드가 바뀌었다", "처방 화면이 달라졌다", "당분간 혼선이 있다", "안내문이 돌았다"]]),
    ("면담 후 요청받은 자료는 {} 전달하기로 했다.", [["의학정보팀에", "이메일로", "다음 방문 때", "담당 MSL이", "이번 주 안에"]]),
    ("{} 진료 흐름을 {} 나눠 맡는 방식으로 바꿨다고 했다.", [["당뇨 환자", "만성질환 환자", "초진 환자", "재진 환자"],
                                                  ["간호사와 영양사가", "전담 간호사가", "코디네이터가", "약사와 간호사가"]]),
    ("이날은 {} 면담을 {} 마쳤다.", [["학회 준비로 바빠", "응급 환자가 있어", "외래가 밀려", "회의가 겹쳐", "수술 일정이 당겨져"],
                                ["짧게", "서둘러", "15분 만에", "예정보다 일찍"]]),
    ("진료 예약이 {}까지 차 있어 {}고 했다.", [["두 달 뒤", "석 달 뒤", "다음 분기", "연말"],
                                        ["신환 접수를 조절하고 있다", "재진 간격을 늘리고 있다", "오후 외래를 하나 더 열었다", "예약 대기 명단을 운영한다"]]),
    ("병원 전산에 {} 문제로 {} 일이 잦다고 했다.", [["검사 결과가 늦게 뜨는", "처방 전송이 지연되는", "외부 검사 연동이 안 되는", "차트가 느리게 열리는"],
                                            ["처방이 지연되는", "환자 대기가 길어지는", "재확인 전화를 하는", "진료가 밀리는"]]),
    ("최근 학회에서 들은 {} {}고 했다.", [["발표 내용을", "지침 논의를", "해외 연자 강의를", "패널 토론 내용을"],
                                     ["전공의들과 공유했다", "과 회의에서 소개했다", "정리해 두었다", "간호팀에도 전달했다"]]),
    ("다음 방문 때는 {} 함께 보기로 했다.", [["협진 담당 교수와", "전담 간호사와", "약제부 담당자와", "같은 과 후배 교수와", "교육 담당 간호사와"]]),
    ("{} 참여율을 올리는 방안을 {} 논의 중이라고 했다.", [["당뇨 교육 프로그램", "환자 교육 강좌", "자가 관리 교육", "복약 교육"],
                                                 ["병원 차원에서", "과 차원에서", "간호부와", "교육팀과"]]),
    ("면담 중 {} {}분 정도 중단됐다.", [["급한 콜이 있어", "병동 연락이 와서", "환자 보호자 면담이 잡혀", "검사실 문의가 와서"], ["5", "10", "15", "20"]]),
    ("이번 면담은 {} 바탕으로 진행했다.", [["사전에 보낸 질문지를", "지난 방문 때 남긴 질문을", "의학정보팀 요청 항목을", "학회에서 나온 질문을", "지난 면담 기록을"]]),
    ("자료 요청은 {} 보내기로 하고 면담을 마쳤다.", [["이메일로", "다음 방문 때 인쇄본으로", "의학정보팀을 통해", "이번 주 안에", "병원 공식 창구로"]]),
    ("진료 지침 개정 내용을 정리한 {} 최근 나왔다고 했다.", [["병원 내부 공지가", "과 회람 자료가", "학회 요약본이", "약제위원회 안내가"]]),
    ("면담 장소는 {}이었고 {}.", [["외래 진료실", "의국", "교수 연구실", "병원 1층 상담실", "회의실"],
                              ["배석자는 없었다", "전공의 한 명이 배석했다", "간호사가 잠시 배석했다", "펠로우가 함께 있었다"]]),
    ("환자 {} 관리는 {} 맡고 있다고 했다.", [["복약 상담", "검사 예약", "교육 일정", "재진 안내"], ["약사가", "간호사가", "코디네이터가", "행정 직원이"]]),
    ("{} 이야기는 다음 면담으로 미뤘다.", [["신약 임상 참여", "병원 내 연구 계획", "학회 발표 준비", "타 과 협진 체계", "환자 등록 사업"]]),
    ("이번 방문에서는 {} 위주로 이야기했다.", [["처방 현황", "진료 흐름", "환자 교육", "최근 지침 변화", "협진 절차"]]),
    ("병원이 {} 중이라 {}고 했다.", [["외래 리모델링", "전산 교체", "인증 평가 준비", "병동 재배치"],
                                 ["진료 동선이 바뀌었다", "면담 시간을 내기 어렵다", "당분간 예약이 줄었다", "회의가 많아졌다"]]),
    ("복약 순응도 확인은 {} 하고 있다고 했다.", [["재진 때마다", "3개월마다", "전화 상담으로", "약제부 도움을 받아", "설문지로"]]),
    ("검사 결과 설명은 {} {}고 했다.", [["재진 외래에서", "전화로", "환자 포털로", "간호사 상담실에서"],
                                   ["직접 한다", "간호사가 먼저 한다", "출력물과 함께 한다", "짧게 끝낸다"]]),
    ("{} 학회 참석 때문에 {} 외래가 없다고 했다.", [["다음 주", "이달 말", "다음 달 초", "6월"], ["이틀", "사흘", "일주일", "하루"]]),
    ("당뇨 환자 {}은 {} 정도라고 했다.", [["외래 비중", "재진 비율", "신환 비중"], ["3분의 1", "절반", "4분의 1", "3할"]]),
    ("이번 면담 기록은 {} {} 작성했다.", [["면담 직후", "당일 저녁", "다음 날 오전", "귀사 후"], ["기억을 정리해", "메모를 바탕으로", "녹음 없이", "노트를 보고"]]),
    ("협진 의뢰는 {} {}고 했다.", [["전산으로", "전화로", "서면으로"], ["보내고 있다", "받고 있다", "처리한다", "회신 받는다"]]),
    ("환자 대기 시간이 {} 넘어 {}고 했다.", [["30분을", "한 시간을", "40분을"], ["예약 간격을 조정했다", "접수 창구를 늘렸다", "안내 문자를 보낸다", "대기실 자리를 늘렸다"]]),
    ("{} 외래는 {} 진료라 면담을 {} 잡았다.", [["월요일", "화요일", "수요일", "금요일"], ["오전", "오후"], ["점심시간에", "진료 전에", "진료 뒤에"]]),
    ("병원 {} 위원회가 {} 열려 {}고 했다.", [["약사", "임상시험", "질 향상", "감염관리"], ["이번 주", "다음 주", "매달"], ["자료 준비로 바쁘다", "일정이 빠듯하다"]]),
    ("면담 도중 {} 확인하느라 {} 정도 시간이 걸렸다.", [["전산 차트를", "검사 결과를", "처방 기록을", "약제 목록을"], ["5분", "10분", "잠깐"]]),
    ("이번 방문 목적은 {} {}에 있었다.", [["지난 요청 자료 전달과", "학회 안내와", "신규 자료 소개와", "정기 방문과"], ["처방 현황 청취", "진료 환경 파악", "질문 수집", "일정 조율"]]),
    ("다음 방문 전에 {} {}로 했다.", [["요청 자료를", "질문 목록을", "학회 자료를", "지침 요약본을"], ["이메일로 먼저 보내기", "인쇄해서 준비하기", "의학정보팀에 검토받기", "간호사에게 전달하기"]]),
    ("진료실에는 {} 있어 {}.", [["환자가 계속", "보호자가 몇 명", "전공의가 두 명"], ["면담을 두 번에 나눠 진행했다", "목소리를 낮춰 이야기했다", "핵심만 짧게 물었다", "다음을 기약했다"]]),
]

# ── 유해사례(한 환자의 사건) 틀: (families, 틀, 빈칸 후보). 30건을 서로 다른 의료진 기록에 넣는다 ─
AE_TEMPLATES = [
    (["NEPH", "GER", "ENDO", "IM", "FM"], "{}가 메트포르민을 계속 쓰다가 {}까지 겹쳐 젖산산증으로 입원한 사례가 {} 있었다.",
     [["eGFR 30 근처의 노인 환자", "신기능이 나쁜 80대 환자", "만성 신부전이 있는 70대 환자"], ["탈수", "과음", "폐렴"], ["지난달에 한 건", "올봄에 한 건", "최근에 한 건"]]),
    (["FM", "IM", "ENDO", "GER"], "메트포르민을 {}년째 복용하던 {}가 손발 저림으로 왔는데 비타민 B12가 크게 떨어져 있어 말초신경병증으로 진단됐다.",
     [["6", "8", "10", "12"], ["60대 환자", "50대 남성 환자", "70대 여성 환자"]]),
    (["IM", "FM", "GER", "ENDO"], "메트포르민과 {}를 같이 쓰던 {}가 식사를 거른 뒤 심한 저혈당으로 응급실에 실려 온 일이 있었다.",
     [["글리메피리드", "설폰요소제"], ["70대 환자", "독거 노인 환자", "80대 환자"]]),
    (["NEPH", "GER", "IM"], "조영제 CT 전에 메트포르민을 쉬지 않은 {}가 검사 뒤 급성 신손상이 와서 {} 입원했다.",
     [["노인 환자", "신기능이 경계선이던 70대 환자", "요양병원 환자"], ["열흘간", "일주일 넘게", "2주 가까이"]]),
    (["IM", "FM"], "메트포르민 복용 중이던 {}가 흑색변으로 내원해 위장관 출혈을 의심했고 {}.",
     [["60대 환자", "50대 환자"], ["내시경 결과를 기다리는 중이라고 했다", "내시경에서 위궤양이 확인됐다"]]),
    (["OBGYN", "ENDO", "FM", "IM"], "메트포르민 시작 {} 만에 심한 설사와 구토로 탈수가 와서 {} 환자가 {}.",
     [["2주", "열흘", "한 달"], ["수액 치료를 받은", "응급실에 간"], ["한 명 있었다", "있었다"]]),
    (["PED"], "메트포르민을 복용하던 {}가 복통과 구토가 심해 응급실을 찾았고 {}.",
     [["10대 환자", "중학생 환자", "고등학생 환자"], ["며칠 약을 끊고 회복했다", "서방정으로 바꾼 뒤 괜찮아졌다"]]),
    (["ENDO", "IM", "FM", "OBGYN"], "메트포르민 시작 후 {} 생겨 약을 중단한 환자가 있었고 {}.",
     [["전신 두드러기가", "심한 피부 발진이"], ["다른 원인은 찾지 못했다", "중단 후 사흘 만에 가라앉았다"]]),
    (["GER", "IM", "FM", "ENDO"], "메트포르민 장기 복용 중이던 {}가 빈혈로 의뢰됐는데 B12 결핍이 원인이었다.",
     [["70대 환자", "60대 여성 환자", "80대 남성 환자"]]),
    (["GER", "NEPH"], "폭염에 탈수가 온 {}가 메트포르민을 그대로 먹다가 급성 신손상과 젖산 상승으로 입원했다.",
     [["80대 환자", "요양병원 환자"]]),
]

AE_SEGMENT_HINT = {0: "노인", 3: "노인", 9: "노인", 6: "청소년"}   # 틀 번호 → 같은 환자군 묶음 뒤에 붙인다


# ── 조립 엔진 ───────────────────────────────────────────────────────────────────────
def expand(template: str, slots: list[list[str]]) -> list[str]:
    out = [template]
    for options in slots:
        out = [s.replace("{}", opt, 1) for s in out for opt in options]
    return out


class ComboPool:
    """(도입구 × 서술절)을 섞어 두고 하나씩 꺼내 종결구를 붙인다. 한 바퀴 안에서 같은 조합은 한 번만 쓴다."""

    def __init__(self, rng: random.Random, spec: dict):
        self.rng, self.tails = rng, spec["tails"]
        self.combos = [(o, c) for sp in spec["sub"] for o in sp["openers"] for c in sp["cores"]]
        self.capacity = len(self.combos) * 2          # 두 바퀴까지 허용 (종결구가 달라 문장은 겹치지 않는다)
        self.queue: list[tuple[str, str]] = []

    def draw(self, avoid_openers: set, avoid_cores: set, taken: set) -> tuple[str, str, str]:
        for _lap in range(3):
            if not self.queue:
                self.queue = self.combos[:]
                self.rng.shuffle(self.queue)
            for i, (o, c) in enumerate(self.queue):
                if o in avoid_openers or c in avoid_cores:
                    continue
                tails = self.tails[:]
                self.rng.shuffle(tails)
                for t in tails:
                    s = f"{o} {c}{t}"
                    if s not in taken:
                        del self.queue[i]
                        return s, o, c
            self.queue = []
        raise RuntimeError("절 풀이 바닥났다")


class ListPool:
    def __init__(self, rng: random.Random, items: list[str]):
        self.items = list(dict.fromkeys(items))
        rng.shuffle(self.items)
        self.i = 0

    def draw(self, taken: set) -> str:
        while self.i < len(self.items):
            s = self.items[self.i]
            self.i += 1
            if s not in taken:
                return s
        raise RuntimeError("문장 목록이 바닥났다")


def weighted(rng: random.Random, weights: dict[int, int]) -> int:
    return rng.choices(list(weights), weights=list(weights.values()))[0]


def build_roster(rng: random.Random) -> list[dict]:
    hcps = []
    for family, specialty, n in FAMILIES:
        for _ in range(n):
            tags = {family}
            if family == "OBGYN" and "난임" not in specialty:
                tags.add("OBGYN_NONIVF")
            if family == "ENDO" and "개원" not in specialty:
                tags.add("ENDO_HOSP")
            hcps.append({"i": len(hcps), "family": family, "specialty": specialty, "tags": tags, "n": 1, "notes": []})
    multi = rng.sample(hcps, N_TRIPLE + N_DOUBLE)
    for h in multi[:N_TRIPLE]:
        h["n"] = 3
    for h in multi[N_TRIPLE:]:
        h["n"] = 2
    for h in hcps:
        h["notes"] = [{"hcp": h, "k": k, "pairs": {}, "ae": None, "ae_hint": None, "slot": None} for k in range(h["n"])]
    assert sum(h["n"] for h in hcps) == N_NOTES
    return hcps


def signal_count(note: dict) -> int:
    return sum(note["pairs"].values())


def load(h: dict) -> float:
    return sum(len(n["pairs"]) for n in h["notes"]) / (MAX_PAIRS_PER_NOTE * h["n"])


def seed_note(rng: random.Random, h: dict, weak: bool) -> dict | None:
    """새 쌍을 심을 기록. 고정 쌍은 빈 기록에만 심는다(다른 쌍과 섞이지 않게)."""
    limit = 0 if weak else MAX_PAIRS_PER_NOTE - 1
    cands = [n for n in h["notes"] if len(n["pairs"]) <= limit]
    if not cands:
        return None
    rng.shuffle(cands)
    cands.sort(key=lambda n: len(n["pairs"]))
    return cands[0]


def allocate(rng: random.Random, hcps: list[dict], capacity: dict[str, int]) -> dict[str, int]:
    """어느 기록에 어느 쌍을 몇 문장 넣을지 정한다. 숫자는 여기서 정해지고, 문장은 나중에 뽑는다."""
    reserved: dict[str, int] = defaultdict(int)
    target_sent = {p: s for p, _, s, _ in PLAN}

    # 1) 씨앗: 쌍마다 서로 다른 의료진 n_hcps명에게 한 문장씩
    for pair, n_hcps, n_sent, weak in PLAN:
        chosen: list[dict] = []
        for tier in ELIGIBLE[pair]:
            cands = [h for h in hcps if h not in chosen and h["tags"] & set(tier) and seed_note(rng, h, weak)]
            rng.shuffle(cands)
            cands.sort(key=lambda h: (load(h), 0 if any(not n["pairs"] for n in h["notes"]) else 1))
            chosen.extend(cands[: n_hcps - len(chosen)])
            if len(chosen) == n_hcps:
                break
        assert len(chosen) == n_hcps, f"{pair}: 의료진 {n_hcps}명을 못 채웠다 ({len(chosen)})"
        for h in chosen:
            seed_note(rng, h, weak)["pairs"][pair] = 1
            reserved[pair] += 1
        # 2) 재언급: 같은 의료진의 다른 면담(있으면)에, 없으면 같은 기록에 한 문장 더
        extra = n_sent - n_hcps
        if extra > 0 and not weak:
            later = [n for h in chosen for n in h["notes"] if pair not in n["pairs"] and len(n["pairs"]) < MAX_PAIRS_PER_NOTE]
            rng.shuffle(later)
            for n in later[:extra]:
                n["pairs"][pair] = 1
                reserved[pair] += 1
                extra -= 1
            same = [n for h in chosen for n in h["notes"] if pair in n["pairs"]]
            rng.shuffle(same)
            for n in same[:extra]:
                n["pairs"][pair] += 1
                reserved[pair] += 1
                extra -= 1
            assert extra == 0, pair

    def remaining(p: str) -> int:
        return capacity[p] - reserved[p]

    def add_sentence(note: dict, allow_new_pair: bool) -> bool:
        h = note["hcp"]
        ex = [p for p, k in note["pairs"].items() if p in MAIN and k < MAX_SENT_PER_PAIR_IN_NOTE and remaining(p) > 0]
        ex_ok = [p for p in ex if reserved[p] < TOPUP_CAP * target_sent[p]]

        def extend(cands: list[str]) -> bool:
            rng.shuffle(cands)
            cands.sort(key=lambda p: note["pairs"][p])
            note["pairs"][cands[0]] += 1
            reserved[cands[0]] += 1
            return True

        if ex_ok:
            return extend(ex_ok)
        if allow_new_pair and len(note["pairs"]) < MAX_PAIRS_PER_NOTE:
            elig = [p for p in MAIN if p not in note["pairs"] and remaining(p) > 0
                    and any(h["tags"] & set(tier) for tier in ELIGIBLE[p])]
            if elig:
                have = {p for n in h["notes"] for p in n["pairs"]}
                rng.shuffle(elig)
                elig.sort(key=lambda p: (0 if p in have else 1, reserved[p] / target_sent[p]))
                note["pairs"][elig[0]] = 1
                reserved[elig[0]] += 1
                return True
        if ex and allow_new_pair:          # 2문장 하한을 채우려면 상한을 넘겨서라도 붙인다
            return extend(ex)
        return False

    notes = [n for h in hcps for n in h["notes"]]
    order = notes[:]
    rng.shuffle(order)
    # 3) 모든 기록을 신호 문장 2개 이상으로
    for note in order:
        while signal_count(note) < 2:
            if not add_sentence(note, allow_new_pair=True):
                raise RuntimeError(f"기록을 채울 쌍이 없다: {note['hcp']['specialty']}")
    # 4) 기록마다 목표 문장 수까지 (이미 있는 쌍에만 덧붙인다 — 의료진 수가 목표에서 밀리지 않게)
    for note in order:
        t = min(weighted(rng, SIGNAL_TARGET_WEIGHTS), MAX_SIGNAL_PER_NOTE)
        while signal_count(note) < t and add_sentence(note, allow_new_pair=False):
            pass
    return reserved


def assign_adverse_events(rng: random.Random, notes: list[dict], taken: set) -> None:
    expansions = []
    for ti, (fams, tpl, slots) in enumerate(AE_TEMPLATES):
        strings = expand(tpl, slots)
        rng.shuffle(strings)
        expansions.append((ti, fams, strings))
    used_hcp: set[int] = set()
    count, ti = 0, 0
    while count < N_ADVERSE:
        idx, fams, strings = expansions[ti % len(expansions)]
        ti += 1
        s = next((x for x in strings if x not in taken), None)
        if s is None:
            continue
        cands = [n for n in notes if n["hcp"]["family"] in fams and n["hcp"]["i"] not in used_hcp and n["ae"] is None]
        if not cands:
            continue
        rng.shuffle(cands)
        cands.sort(key=signal_count)
        note = cands[0]
        note["ae"], note["ae_hint"] = s, AE_SEGMENT_HINT.get(idx)
        taken.add(s)
        used_hcp.add(note["hcp"]["i"])
        count += 1


def make_slots(rng: random.Random) -> list[dt.date]:
    days = [START + dt.timedelta(days=7 * w + d) for w in range(WEEKS) for d in range(5)]
    three = set(rng.sample(range(len(days)), N_NOTES - 2 * len(days)))
    return [day for i, day in enumerate(days) for _ in range(3 if i in three else 2)]


def assign_slots(rng: random.Random, hcps: list[dict]) -> None:
    free = list(range(N_NOTES))
    order = hcps[:]
    rng.shuffle(order)
    order.sort(key=lambda h: -h["n"])
    for h in order:
        n = h["n"]
        if n == 1:
            s = rng.choice(free)
            free.remove(s)
            h["notes"][0]["slot"] = s
            continue
        gap = 90 if n == 2 else 70            # 2회 면담은 약 6주 이상, 3회 면담은 약 5주 이상 띄운다
        prev = None
        for k, note in enumerate(h["notes"]):
            hi = N_NOTES - gap * (n - 1 - k)
            cands = [s for s in free if s < hi] if k == 0 else [s for s in free if prev + gap <= s < hi]
            if not cands:
                cands = [s for s in free if prev is None or s > prev]
            s = rng.choice(cands)
            free.remove(s)
            note["slot"] = s
            prev = s
    assert not free


def assemble(rng: random.Random, note: dict, pools: dict, weak_pools: dict, filler: ListPool, taken: set) -> str:
    groups = []
    for pair, k in note["pairs"].items():
        sents = []
        if pair in WEAK:
            s = weak_pools[pair].draw(taken)
            taken.add(s)
            sents.append(s)
        else:
            used_o, used_c = set(), set()
            for _ in range(k):
                s, o, c = pools[pair].draw(used_o, used_c, taken)
                taken.add(s)
                used_o.add(o)
                used_c.add(c)
                sents.append(s)
        groups.append((PAIRS[pair][0], sents))
    rng.shuffle(groups)
    if note["ae"]:
        hint = note["ae_hint"]
        at = next((i for i, (seg, _) in enumerate(groups) if hint and seg.startswith(hint)), len(groups) - 1)
        groups[at][1].append(note["ae"])
    blocks = [g[1] for g in groups]
    n_fill = weighted(rng, FILLER_WEIGHTS)
    positions = ["start", "end"] + (["between"] if len(blocks) == 2 else [])
    weights = [30, 50] + ([20] if len(blocks) == 2 else [])
    chosen = []
    while len(chosen) < n_fill:
        p = rng.choices(positions, weights=weights)[0]
        if p not in chosen:
            chosen.append(p)
    out: list[str] = []
    if "start" in chosen:
        out.append(filler.draw(taken))
    out.extend(blocks[0])
    if len(blocks) == 2:
        if "between" in chosen:
            out.append(filler.draw(taken))
        out.extend(blocks[1])
    if "end" in chosen:
        out.append(filler.draw(taken))
    for s in out:
        taken.add(s)
    return " ".join(out)


def generate() -> tuple[list[dict], dict]:
    rng = random.Random(SEED)
    hcps = build_roster(rng)
    pools = {p: ComboPool(rng, POOLS[p]) for p in MAIN}
    capacity = {p: pools[p].capacity for p in MAIN}
    capacity.update({p: len(v) for p, v in WEAK_SENTENCES.items()})
    allocate(rng, hcps, capacity)
    notes = [n for h in hcps for n in h["notes"]]
    taken: set[str] = set()
    assign_adverse_events(rng, notes, taken)
    assign_slots(rng, hcps)
    slots = make_slots(rng)
    notes.sort(key=lambda n: n["slot"])
    hcp_id: dict[int, str] = {}
    for n in notes:
        hcp_id.setdefault(n["hcp"]["i"], f"HCP-{len(hcp_id) + 1:03d}")
    weak_pools = {p: ListPool(rng, v) for p, v in WEAK_SENTENCES.items()}
    filler = ListPool(rng, [s for tpl, slots_ in FILLER_BASES for s in expand(tpl, slots_)])
    per_day: dict[str, int] = defaultdict(int)
    out = []
    for n in notes:
        date = slots[n["slot"]].isoformat()
        per_day[date] += 1
        n["text"] = assemble(rng, n, pools, weak_pools, filler, taken)
        out.append({"doc_id": f"FN-{date[:4]}-{date[5:7]}{date[8:10]}-{per_day[date]:02d}", "hcp_ref": hcp_id[n["hcp"]["i"]],
                    "specialty": n["hcp"]["specialty"], "date": date, "synthetic": True, "text": n["text"]})
    return out, {"notes": notes, "hcps": hcps, "hcp_id": hcp_id, "filler_capacity": len(filler.items)}


# ── 요약·검증 ───────────────────────────────────────────────────────────────────────
def summarize(records: list[dict], meta: dict) -> None:
    notes, hcp_id = meta["notes"], meta["hcp_id"]
    thr = json.loads(CONTRACT.read_text()).get("threshold", {}) if CONTRACT.exists() else {}
    c_m, c_h = int(thr.get("min_mentions", 3)), int(thr.get("min_hcps", 3))
    rows = []
    for pair, (seg, sig) in PAIRS.items():
        ns = [n for n in notes if pair in n["pairs"]]
        m = sum(n["pairs"][pair] for n in ns)
        h = len({n["hcp"]["i"] for n in ns})
        rows.append((seg, sig, m, h, len(ns)))
    rows.sort(key=lambda r: (-r[2], -r[3]))
    print(f"{'환자군':<16}{'신호 유형':<22}{'문장':>5}{'의료진':>6}{'기록':>5}  5회·3인  계약({c_m}회·{c_h}인)")
    for seg, sig, m, h, k in rows:
        print(f"{seg:<16}{sig:<22}{m:>5}{h:>6}{k:>5}  {'통과' if m >= 5 and h >= 3 else '미달':^7}  {'통과' if m >= c_m and h >= c_h else '미달':^7}")
    ae = [n for n in notes if n["ae"]]
    n_by = defaultdict(int)
    for h in meta["hcps"]:
        n_by[h["n"]] += 1
    dates = sorted(r["date"] for r in records)
    per_day: dict[str, int] = defaultdict(int)
    for d in dates:
        per_day[d] += 1
    sent_counts = [len(re.split(r"(?<=\.)\s+", r["text"].strip())) for r in records]
    all_sents = [s for r in records for s in re.split(r"(?<=\.)\s+", r["text"].strip())]
    sig_counts = [signal_count(n) for n in notes]
    print(f"\n유해사례 {len(ae)}건 (의료진 {len({n['hcp']['i'] for n in ae})}인, 기록 {len(ae)}건)")
    print(f"기록 {len(records)}건 · 의료진 {len(hcp_id)}인 (1건 {n_by[1]} · 2건 {n_by[2]} · 3건 {n_by[3]}) · 기간 {dates[0]} ~ {dates[-1]} · "
          f"면담일 {len(per_day)}일, 하루 {min(per_day.values())}~{max(per_day.values())}건")
    print(f"기록당 문장 {min(sent_counts)}~{max(sent_counts)}개 (신호 {min(sig_counts)}~{max(sig_counts)}, 쌍 최대 {max(len(n['pairs']) for n in notes)}) · "
          f"문장 {len(all_sents)}개 중 중복 {len(all_sents) - len(set(all_sents))}개 · 중립 문장 후보 {meta['filler_capacity']}개")
    print("\n샘플 3건")
    for r in (records[0], records[len(records) // 2], records[-1]):
        print(f"- {r['doc_id']} · {r['hcp_ref']} · {r['specialty']} · {r['date']}\n  {r['text']}")


def validate(records: list[dict]) -> None:
    assert len(records) == N_NOTES
    assert len({r["doc_id"] for r in records}) == N_NOTES
    all_sents = [s for r in records for s in re.split(r"(?<=\.)\s+", r["text"].strip())]
    assert len(all_sents) == len(set(all_sents)), "같은 문장이 두 기록에 있다"
    for r in records:
        sents = re.split(r"(?<=\.)\s+", r["text"].strip())
        assert len(sents) >= 2, r["doc_id"]
        assert "\\" not in r["text"] and "<" not in r["text"], r["doc_id"]
        assert set(r) == {"doc_id", "hcp_ref", "specialty", "date", "synthetic", "text"}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="요약만 찍고 파일은 쓰지 않는다")
    args = ap.parse_args()
    records, meta = generate()
    validate(records)
    summarize(records, meta)
    if args.dry_run:
        print("\n(dry-run: 쓰지 않음)")
        return
    OUT.write_text(json.dumps(records, ensure_ascii=False, indent=1) + "\n")
    print(f"\n→ {OUT.relative_to(ROOT)} ({OUT.stat().st_size:,} bytes)")
    json.loads(OUT.read_text())


if __name__ == "__main__":
    main()
