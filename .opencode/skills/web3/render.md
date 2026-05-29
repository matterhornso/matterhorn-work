# Render Network

## What this skill does
Render Network is a DePIN (Decentralized Physical Infrastructure Network) for GPU compute, connecting users who need rendering and AI inference power with GPU node operators who earn RENDER tokens. This skill teaches an AI agent how to submit rendering jobs, query available GPU resources, and manage compute workloads.

## Supported chains
- Ethereum (RENDER token, governance)
- Solana (RENDER token on Solana)

## Contract addresses
The Render Network primarily operates through APIs for compute orchestration. Key addresses:

- RENDER Token (Ethereum): `0x6De037ef9aD2725EB40118Bb8A0b1f0a0E0E0E0E`
- Render Network API: `https://api.rendernetwork.com`
- Node Discovery: Query available nodes via the Render Network orchestrator

Token migration: RENDER originally launched as RNDR on Ethereum, later migrated to RENDER on Solana. The Ethereum RENDER token is a bridged version. Ensure you use the correct token contract for the user's chain.

## Common operations
### Submitting a Rendering Job
1. Use the Render Network API to submit a rendering job. POST to `/jobs` with the job specification: `sceneFile` (URL or IPFS hash to the 3D scene file), `renderer` (e.g., `octane`, `cycles`, `redshift`), `frameCount`, `outputFormat`, and `resolution`.
2. Job pricing is determined by the scene complexity, render engine, and available GPU tiers. Query `/jobs/estimate` with the same parameters to get a cost estimate in RENDER tokens before submitting.
3. The API returns a job ID. The status progresses through: `pending` (waiting for a node to accept), `processing` (rendering in progress), `completed`, or `failed`.
4. Monitor job status via GET `/jobs/<jobId>`. Completed jobs return download URLs for each rendered frame.
5. Present the estimate clearly: "Rendering a 10-second animation at 30fps (300 frames) with Octane will cost approximately 150 RENDER and take roughly 45 minutes on available Tier 3 GPUs."

### Querying GPU Resources
1. Query available GPU compute tiers via the Render Network API at GET `/nodes/available`. The response lists available nodes with their specifications: GPU model, VRAM, tier (Tier 1 = RTX 4090, Tier 2 = A6000, Tier 3 = A100/H100), and current availability.
2. Each node has a reputation score based on completed jobs, success rate, and speed. Higher reputation nodes may have shorter queues.
3. For AI inference workloads, filter nodes by `supportsAI: true` — these are nodes running inference-capable software (PyTorch, TensorFlow, vLLM, etc.).
4. Present GPU options to the user: "3 Tier-1 GPUs (RTX 4090) available at 5 RENDER/hour, 1 Tier-3 GPU (A100) available at 25 RENDER/hour. The A100 will complete your Stable Diffusion XL batch 4x faster."
5. For large compute workloads, consider splitting across multiple nodes. The Render Network supports distributed rendering where frames are farmed across many GPUs simultaneously.

### AI Inference on Render
1. Render supports AI inference jobs (not just traditional 3D rendering). Submit an inference job by specifying `taskType: "inference"` and providing the model ID or a link to the model weights.
2. Supported AI tasks: image generation (Stable Diffusion, SDXL, Midjourney-style), LLM inference (Llama, Mistral, etc.), video generation, and custom PyTorch/TensorFlow models.
3. For custom models, upload model weights to IPFS or Arweave, then pass the content hash in the job spec. The node will download and run the model in a containerized environment.
4. API format for inference:
   ```json
   {
     "taskType": "inference",
     "model": "ipfs://QmModelHash",
     "inputs": { "prompt": "...", "negative_prompt": "...", "steps": 30, "resolution": "1024x1024" },
     "outputFormat": "png"
   }
   ```
5. Inference jobs are billed per GPU-second (or per inference) rather than per frame. The estimate endpoint provides an approximate cost based on the model size and expected inference time.

### Managing RENDER Token Payments
1. RENDER tokens are used to pay for compute. The user must hold RENDER on the same chain as the Render Network payment contract (typically Solana, with Ethereum bridge available).
2. Before submitting large jobs, the user should deposit RENDER into the Render Network's escrow via a payment channel. Query the user's escrow balance via the API.
3. Payment is deducted incrementally as frames complete (for rendering) or as inference requests are processed. Failed tasks are not charged.
4. Cancel a running job via POST `/jobs/<jobId>/cancel` to stop further charges. Completed frames are still delivered and billed.
5. Unused escrow balance can be withdrawn via POST `/escrow/withdraw` with the user's wallet address.

### Node Operation (for GPU providers)
1. GPU node operators earn RENDER by completing rendering and inference jobs. Node operators register their hardware via the Render Network client application.
2. Node requirements: Tier 1 minimum is an NVIDIA RTX 3070 or equivalent (8GB+ VRAM). Tier 3 (enterprise) requires A100 or H100 class GPUs.
3. Earnings depend on GPU tier, uptime, and job success rate. The node's reputation score directly impacts its priority in job assignment.
4. Node operators set their own pricing within tier-based bands. Competitive pricing typically follows the current market rate visible on the `/nodes/rates` endpoint.
5. Payments are released from escrow after job completion and verification. The Render Network uses a multi-party computation (MPC) system to verify that rendered outputs match the expected results, preventing fraud.
6. Withdraw earnings from the node operator dashboard or via the API. Payments are in RENDER tokens on the operator's registered wallet address.
