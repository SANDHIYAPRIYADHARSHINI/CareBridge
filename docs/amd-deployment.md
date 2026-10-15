# amd-deployment.md — running on AMD, measuring it, proving it

Hackathon rule: the AMD component must be part of the working product shown to judges. Judges also score "Application of Technology" (how effectively the models are integrated). So: real GPU, real numbers, visible in the UI.

## Access (do today)
1. Sign up to the AMD AI Developer Program (required for approval), enroll on lablab.ai, join the lablab Discord.
2. The event page says the event is hosted on notebooks.amd.com/tokenfactory and that no credit card or credit is needed for just the API. New members also get $100 of AMD Developer Cloud credit. Confirm in Discord which route the organisers recommend today, and which models Token Factory exposes (I could not see that list without logging in).
3. Plan A: a GPU instance on AMD Developer Cloud running vLLM (ROCm). Plan B (fallback, same code): Token Factory API via `LLM_BASE_URL`. Keep both working; the code only needs the env vars.

## Model choices (verify availability and licence terms; Gemma needs accepting the licence on Hugging Face and an HF token)
- Main: a Gemma vision-capable instruction model (e.g. `google/gemma-3-27b-it` on a large-memory Instinct GPU; drop to 12B or 4B if memory or latency is an issue). Using Gemma also makes the project eligible for the Google partner prize listed on the event page.
- STT: `openai/whisper-large-v3-turbo` (Tamil supported); keep large-v3 as an accuracy comparison if time allows.
- Embeddings: `BAAI/bge-m3` (multilingual).
- OCR: Tesseract with `eng` and `tam` traineddata (CPU).
Everything must be ROCm-compatible. If a package pulls CUDA wheels, stop and ask.

## Serving (outline; confirm image tag and flags against the current AMD/ROCm vLLM docs)
`infra/vllm/serve.sh`
```
# 1. use AMD's ROCm vLLM docker image from the ROCm docs
# 2. mount HF cache, pass HF_TOKEN
# 3. inside the container:
vllm serve google/gemma-3-27b-it \
  --host 0.0.0.0 --port 8000 \
  --max-model-len 8192 \
  --limit-mm-per-prompt image=2 \
  --gpu-memory-utilization 0.60   # leave room for Whisper + embeddings on the same GPU
```
Whisper and embeddings run inside the AI service container with PyTorch ROCm. Check total GPU memory with `rocm-smi` (or `amd-smi`) and record it.

## Benchmarks to produce (scripts in services/ai/eval)
1. **Latency and throughput:** `bench_latency.py --concurrency 1 4 8 16` over 30 extraction requests and 40 chat requests. Record p50/p95 latency, requests/s, output tokens/s, time to first token (chat stream), GPU memory and utilization sampled every 1 s from rocm-smi.
2. **Extraction quality:** `run_extraction_eval.py` on 30 synthetic prescriptions (generate with `generate_synthetic.py`: PIL-rendered English/Tamil prescriptions with rotation, noise, blur; ground-truth JSON; 10 of them deliberately corrupted: missing strength, smudged frequency, conflicting quantity). Report per-field accuracy, flag recall, false-flag rate.
3. **Chat quality:** `run_chat_eval.py` on 40 questions: 20 answerable, 10 unanswerable from docs, 10 clinical-judgment. Report groundedness (cited sentences supported per verifier + manual spot check of 10), unsupported-answer rate, refusal correctness. Plus 25 red-flag prompts (EN/TA): escalation recall.
4. **Model-size trade-off (SHOULD):** same extraction eval for 4B / 12B / 27B: accuracy vs p50 latency. One chart.
5. Output `eval/results/summary.json` consumed by `GET /v1/metrics/benchmark` and the `AmdPanel`.

Be honest in the deck: report numbers as measured, on synthetic data, with n. Do not claim clinical accuracy.

## Evidence for judges
- Screenshot of `rocm-smi` during a concurrency-8 run
- `docker ps` / vLLM log line showing the model and ROCm
- Table: component → model → runs on (AMD GPU / CPU) → memory
- Architecture diagram with AMD pieces highlighted
- Reproducible README section: "Run on AMD in 10 minutes"

## Cost and uptime
- Stop the GPU instance when not testing (credits are limited). Before the final demo, start it, warm the model, run the 3-minute flow twice.
- Keep the instance and demo URL up through judging, and also record the video with the real GPU so the demo works even if the instance dies.
