# Network egress this loop needs — for a deny-by-default sandbox (NVIDIA OpenShell / NemoClaw)

The agent must reach exactly five hosts. Everything else stays closed. Enter these into the sandbox's
network policy; the loop has no other outbound calls (verified: `grep -rn "https://" loop/`).

| Host | Purpose | Method | Auth |
|---|---|---|---|
| `integrate.api.nvidia.com` | Nemotron inference (NIM, OpenAI-compatible) | POST `/v1/chat/completions` | `NVIDIA_API_KEY` — kept on the host, injected as env, never written to cache or logs |
| `eutils.ncbi.nlm.nih.gov` | PubMed E-utilities (esearch, efetch) | GET | none |
| `clinicaltrials.gov` | ClinicalTrials.gov API v2 | GET `/api/v2/studies` | none |
| `api.fda.gov` | openFDA drug label + FAERS events | GET | none |
| `data.cms.gov` | Medicare Part D spending by drug | GET `/data-api/v1/dataset/…/data` | none |

Filesystem: read `data/contract.json`, `data/field_notes.json`, `loop/prompts/`; write only under `data/`.

Why this matters for this loop specifically: the agent reads field notes (sensitive in a real deployment),
receives text from the open web (untrusted), and can write. That is the combination a sandbox cannot fix
on its own — so the loop also (a) verifies every quote against its source in code, (b) stores no number
the model produced, and (c) advances nothing without a named human signature.

This demo was developed on macOS, where OpenShell does not run; the policy above is what a NemoClaw
deployment on DGX / Linux should apply. It has not been executed inside OpenShell yet.
