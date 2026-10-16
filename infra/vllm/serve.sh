#!/usr/bin/env bash
# ==============================================================================
# CareBridge AI — vLLM Serving on AMD ROCm (Instinct GPU / AMD Developer Cloud)
# Reference: docs/amd-deployment.md
# ==============================================================================

set -euo pipefail

# ------------------------------------------------------------------------------
# 1. Environment & Hugging Face Access
# ------------------------------------------------------------------------------
# Gated models (such as google/gemma-3-27b-it) require accepting license terms
# on Hugging Face and exporting a valid HF_TOKEN.
if [ -z "${HF_TOKEN:-}" ]; then
  echo "WARNING: HF_TOKEN environment variable is not set."
  echo "Gemma vision models are gated. Please export HF_TOKEN=<your_token> before running."
fi

# Hugging Face local cache directory on host
HF_CACHE_DIR="${HF_HOME:-$HOME/.cache/huggingface}"
mkdir -p "$HF_CACHE_DIR"

# ------------------------------------------------------------------------------
# 2. Container Image & Hardware Mapping
# ------------------------------------------------------------------------------
# [TO_VERIFY]: Confirm the exact ROCm vLLM Docker image tag for target GPU hardware
# (e.g. rocm/vllm:rocm6.2_mi300_ubuntu22.04 or rocm/vllm:latest from AMD ROCm catalog).
IMAGE="${VLLM_ROCM_IMAGE:-rocm/vllm:latest}" # [TO_VERIFY]

# Model identifier
MODEL_ID="${LLM_MODEL:-google/gemma-3-27b-it}"

echo "=========================================================================="
echo "Starting vLLM container for CareBridge AI on AMD ROCm hardware"
echo "Image: $IMAGE"
echo "Model: $MODEL_ID"
echo "=========================================================================="

# ------------------------------------------------------------------------------
# 3. Launch Docker Container with ROCm Devices & vLLM Service
# ------------------------------------------------------------------------------
exec docker run --rm -it \
  --name carebridge-vllm \
  --network host \
  --device=/dev/kfd \
  --device=/dev/dri \
  --group-add video \
  --cap-add=SYS_PTRACE \
  --security-opt seccomp=unconfined \
  -v "${HF_CACHE_DIR}:/root/.cache/huggingface" \
  -e HF_TOKEN="${HF_TOKEN:-}" \
  "$IMAGE" \
  vllm serve "$MODEL_ID" \
    --host 0.0.0.0 \
    --port 8000 \
    --max-model-len 8192 \
    --limit-mm-per-prompt image=2 \
    --gpu-memory-utilization 0.60 \
    --trust-remote-code \
    --dtype bfloat16

# ==============================================================================
# Flag Explanations & Verification Checklist (docs/amd-deployment.md):
# ==============================================================================
# --max-model-len 8192
#   [TO_VERIFY]: Adjust based on model context size and available GPU VRAM.
#
# --limit-mm-per-prompt image=2
#   [TO_VERIFY]: Confirm multimodal flag syntax for multi-page prescription
#   images on current vLLM version.
#
# --gpu-memory-utilization 0.60
#   [TO_VERIFY]: Restricts vLLM KV-cache to 60% of GPU memory to reserve ~40%
#   headroom for Whisper (STT) and BGE-M3 (embeddings) on the same AMD Instinct GPU.
#
# --trust-remote-code
#   [TO_VERIFY]: Check if Gemma-3 vision architecture requires remote code execution.
#
# --dtype bfloat16
#   [TO_VERIFY]: Confirm hardware bfloat16 acceleration support on target AMD GPU.
# ==============================================================================
