"""ClinicalTrials.gov API v2 — registered trials. No key needed."""
from __future__ import annotations

from . import cached_get

API = "https://clinicaltrials.gov/api/v2/studies"
FIELDS = ",".join([
    "NCTId", "BriefTitle", "OverallStatus", "Phase", "Condition", "InterventionName",
    "BriefSummary", "EnrollmentCount", "StartDate", "StudyType", "LeadSponsorName",
])


def search(intervention: str, condition: str | None = None, page_size: int = 25,
           phase3_only: bool = False) -> dict:
    params = {"query.intr": intervention, "pageSize": page_size, "countTotal": "true", "fields": FIELDS}
    if condition:
        params["query.cond"] = condition
    if phase3_only:
        params["aggFilters"] = "phase:3"
    rec = cached_get("ctgov", API, params)
    body = rec["body"]
    studies = []
    for s in body.get("studies", []):
        p = s.get("protocolSection", {})
        idm = p.get("identificationModule", {})
        st = p.get("statusModule", {})
        design = p.get("designModule", {})
        nct = idm.get("nctId", "")
        studies.append({
            "id": nct,
            "title": idm.get("briefTitle", ""),
            "status": st.get("overallStatus", ""),
            "phases": design.get("phases", []),
            "study_type": design.get("studyType", ""),
            "enrollment": (design.get("enrollmentInfo") or {}).get("count"),
            "start": (st.get("startDateStruct") or {}).get("date", ""),
            "conditions": p.get("conditionsModule", {}).get("conditions", []),
            "sponsor": ((p.get("sponsorCollaboratorsModule") or {}).get("leadSponsor") or {}).get("name", ""),
            "summary": p.get("descriptionModule", {}).get("briefSummary", ""),
            "url": f"https://clinicaltrials.gov/study/{nct}",
            "as_of": rec["as_of"],
        })
    return {"intervention": intervention, "condition": condition,
            "total": body.get("totalCount", len(studies)), "studies": studies, "as_of": rec["as_of"]}


def count(intervention: str, condition: str | None = None, status: str | None = None) -> int:
    params = {"query.intr": intervention, "pageSize": 1, "countTotal": "true", "fields": "NCTId"}
    if condition:
        params["query.cond"] = condition
    if status:
        params["filter.overallStatus"] = status
    return int(cached_get("ctgov", API, params)["body"].get("totalCount", 0))
