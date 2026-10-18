"""Script to evaluate real extraction on all 5 demo PNGs through POST /v1/prescriptions/extract."""

import json
import sys
import time
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

BASE_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = BASE_DIR.parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

demo_files = [
    "rx_demo_001.png",
    "rx_demo_002.png",
    "rx_demo_003.png",
    "rx_demo_004.png",
    "rx_demo_005.png",
]

def run_evaluation():
    print("=" * 80)
    print("CareBridge AI: Live Extraction on 5 Demo Prescriptions via POST /v1/prescriptions/extract")
    print("Endpoint: POST /v1/prescriptions/extract")
    print("LLM Provider: AMD Token Factory (Gemma-4-31B-IT)")
    print("=" * 80)

    all_results = {}

    for idx, fname in enumerate(demo_files, 1):
        img_path = REPO_ROOT / "demo" / fname
        if not img_path.exists():
            print(f"[ERROR] File not found: {img_path}", flush=True)
            continue

        print(f"\n[{idx}/5] Processing {fname} ({img_path.stat().st_size} bytes)...", flush=True)
        start = time.perf_counter()

        with open(img_path, "rb") as f:
            files = {"file": (fname, f, "image/png")}
            data = {"language_hint": "auto"}
            resp = client.post("/v1/prescriptions/extract", files=files, data=data)

        elapsed = time.perf_counter() - start
        print(f"Status Code: {resp.status_code} (took {elapsed:.2f}s)", flush=True)

        if resp.status_code != 200:
            print(f"[!] Extraction failed: {resp.text}", flush=True)
            all_results[fname] = {"status_code": resp.status_code, "error": resp.text}
            continue

        res_json = resp.json()
        all_results[fname] = res_json

        # Summary Display
        prescriber = res_json.get("prescriber", {})
        patient = res_json.get("patient", {})
        medicines = res_json.get("medicines", [])
        follow_up = res_json.get("follow_up", {})
        flags = res_json.get("flags", [])
        overall_status = res_json.get("overall_status")
        review_reasons = res_json.get("review_reasons", [])
        metrics = res_json.get("metrics", {})

        print("--- Extracted Prescriber ---", flush=True)
        for k in ["name", "registration_no", "hospital", "date"]:
            f_val = prescriber.get(k, {})
            print(f"  {k:15}: {f_val.get('value')} (status: {f_val.get('status')}, conf: {f_val.get('confidence')}, ev: {f_val.get('evidence_line_ids')})", flush=True)

        print("--- Extracted Patient ---", flush=True)
        for k in ["name", "age"]:
            f_val = patient.get(k, {})
            print(f"  {k:15}: {f_val.get('value')} (status: {f_val.get('status')}, conf: {f_val.get('confidence')}, ev: {f_val.get('evidence_line_ids')})", flush=True)

        print(f"--- Extracted Medicines ({len(medicines)}) ---", flush=True)
        for m in medicines:
            m_name = m.get("name", {}).get("value")
            m_str = m.get("strength", {}).get("value")
            m_dose = m.get("dose", {}).get("value")
            m_freq = m.get("frequency", {}).get("value")
            m_timing = m.get("timing", {}).get("value")
            m_dur = m.get("duration", {}).get("value")
            m_status = m.get("status")
            m_ev = m.get("name", {}).get("evidence_line_ids")
            print(f"  * {m_name} | {m_str} | dose: {m_dose} | freq: {m_freq} | timing: {m_timing} | dur: {m_dur} | status: {m_status} | ev: {m_ev}", flush=True)

        print("--- Follow Up ---", flush=True)
        print(f"  value: {follow_up.get('value')} (ev: {follow_up.get('evidence_line_ids')})", flush=True)

        print("--- Overall Status & Flags ---", flush=True)
        print(f"  Overall Status: {overall_status}", flush=True)
        print(f"  Review Reasons: {review_reasons}", flush=True)
        print(f"  Flags ({len(flags)}):", flush=True)
        for fl in flags:
            print(f"    - [{fl.get('severity')}] {fl.get('code')}: {fl.get('message')} (ev: {fl.get('evidence_line_ids')})", flush=True)

        print("--- Metrics ---", flush=True)
        print(f"  Latency: {metrics.get('latency_ms')} ms | Model: {metrics.get('model')} | In: {metrics.get('tokens_in')} | Out: {metrics.get('tokens_out')}", flush=True)

        # Sleep 3 seconds between demo requests to respect shared rate limit
        time.sleep(3.0)

    # Save complete evaluation output
    out_path = BASE_DIR / "eval" / "results" / "demo_5_real_extractions.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(all_results, f, indent=2)
    print(f"\nSaved all 5 live extraction results to {out_path}", flush=True)

if __name__ == "__main__":
    run_evaluation()
