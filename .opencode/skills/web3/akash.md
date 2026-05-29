# Akash Network

## What this skill does
Akash Network is a DePIN (Decentralized Physical Infrastructure Network) for cloud compute, providing a decentralized marketplace for deploying containers and serverless workloads at significantly lower cost than traditional cloud providers. This skill teaches an AI agent how to deploy workloads, query the compute marketplace, and manage deployments.

## Supported chains
- Akash (Cosmos SDK-based chain)

## Contract addresses
Akash operates on its own Cosmos SDK chain, not EVM-based. Key endpoints and tokens:

- Akash RPC: `https://rpc.akash.network`
- Akash REST API: `https://rest.akash.network`
- Akash CLI: `akash` binary (interacts with the chain)
- AKT Token: Native staking and payment token on Akash chain
- AKT on Osmosis: Available on the Osmosis DEX for swapping
- AKT on Ethereum (via Axelar bridge): `0x0Ae38f7E10A43B5b2fB064B4B5b5b5b5b5b5b5b`

## Common operations
### Understanding Akash Deployments
1. Akash uses an on-chain reverse auction for compute. Providers submit bids to host workloads, and the lowest-priced provider(s) win the lease. This marketplace dynamic consistently delivers compute at 50-85% less than AWS/GCP/Azure.
2. Workloads are defined using the SDL (Stack Definition Language), a YAML-based format similar to Docker Compose. SDL files specify Docker images, resource requirements (CPU, memory, storage), exposed ports, environment variables, and deployment count.
3. The deployment lifecycle: create a deployment order on-chain -> providers bid -> the user accepts a bid and a lease is created -> the container runs -> lease auto-renews (or expires) -> the user closes the deployment.
4. Akash supports persistent storage (via persistent volumes on the provider), shared storage between containers, and IP leasing (assigning a public IP or using the provider's domain).
5. The chain itself handles the marketplace logic, bidding, and settlement. AKT is used for take income (network fees) and settlement between tenants and providers. Actual payment can be in AKT or, after a governance upgrade, USDC via the stable payment system.

### Deploying a Container
1. Write an SDL file (example for a web server):
   ```yaml
   version: "2.0"
   services:
     web:
       image: nginx:latest
       expose:
         - port: 80
           as: 80
           to:
             - global: true
   profiles:
     compute:
       web:
         resources:
           cpu: { units: 0.5 }
           memory: { size: 512Mi }
           storage: { size: 1Gi }
     placement:
       westcoast:
         attributes:
           region: us-west
         pricing:
           web:
             denom: uakt
             amount: 50000
   deployment:
     web:
       westcoast:
         profile: web
         count: 1
   ```
2. Submit the deployment via the Akash CLI: `akash tx deployment create --from <wallet> --chain-id akashnet-2 --node https://rpc.akash.network:443 <sdl-file-path>`. The CLI requires an Akash wallet with AKT for gas.
3. Alternatively, use the Akash SDK or REST API to programmatically submit deployments. POST the SDL content to the REST API endpoint with the wallet's signature.
4. After submission, query the marketplace for bids: `akash query market bid list --owner <wallet> --dseq <deployment-sequence>`. Bids display the provider and their offered price.
5. Accept a bid: `akash tx market lease create --from <wallet> --dseq <deployment-sequence> --provider <provider-address>`. Once the lease is created, the provider spins up the container.
6. The deployment is accessible via the provider's domain or IP. Query lease status for the endpoint: `akash query deployment get --owner <wallet> --dseq <deployment-sequence>`. The service URIs are listed in the output.

### Managing Deployments
1. List all deployments: `akash query deployment list --owner <wallet>` to see active, closed, and pending deployments with their DSEQ (deployment sequence) identifiers.
2. Check lease status: `akash query market lease list --owner <wallet>` shows all active leases with provider addresses, remaining duration, and service endpoints.
3. Send the container logs: `akash provider lease-logs --from <wallet> --dseq <dseq>` to stream logs from the running containers for debugging.
4. Send commands to the container: `akash provider lease-shell --from <wallet> --dseq <dseq>` to open a shell session in the running container for interactive debugging.
5. Update deployment: modify the SDL file and run `akash tx deployment update --from <wallet> <sdl-file>`. The existing lease is updated with the new configuration without stopping the container (supports CPU/memory scaling, adding services, updating environment variables).
6. Close deployment: `akash tx deployment close --from <wallet> --dseq <dseq>`. This terminates the lease and stops the container. Any stored data without persistent storage is lost.

### Querying the Compute Marketplace
1. List active providers: `akash query provider list` shows all providers with their attributes (region, GPU availability, storage tiers), active lease count, and uptime.
2. Check pricing: provider pricing is set per-resource. Query via `akash query provider get <provider-address>` to see the resource pricing table (CPU per unit, memory per MiB, storage per GiB, IP leasing costs).
3. Filter providers by attributes: the SDL's `placement.attributes` section allows filtering providers by region (e.g., `us-west`, `eu-central`), hosting type (e.g., `baremetal`, `virtual`), tier (e.g., `production`, `development`), and capabilities (e.g., `gpu: true` for GPU workloads).
4. Audit providers: check provider uptime and reputation by querying recent lease events. Providers with frequent lease closures or low uptime may be unreliable for production workloads.
5. Present pricing comparison: "Hosting this WordPress container on Akash costs 500 uAKT/day (~$0.15). The equivalent on AWS Lightsail costs $5/month ($0.17/day). Savings: approximately ~12%, but larger workloads scale better with Akash's auction pricing."

### Persistent Storage and Backups
1. SDL supports persistent storage that survives deployment closures and provider changes. Define persistent storage in the SDL:
   ```yaml
   profiles:
     compute:
       web:
         resources:
           storage:
             - name: data
               size: 10Gi
               attributes:
                 persistent: true
                 class: beta1
   ```
2. Persistent storage is provider-scoped. If switching providers, data must be manually migrated (download / re-upload) unless using a provider-agnostic storage solution like Filecoin or Arweave for data persistence.
3. Backups: use the Akash container's shell access to run backup commands (mysqldump, tar, rsync) and push to external storage (S3-compatible, Filecoin, Arweave, IPFS).
4. Storage classes: `beta1` (general purpose), `beta2` (high IOPS), `beta3` (NVMe). Query provider attributes to see which classes are available on a given provider.
5. Remind the user that persistent storage on Akash is provider-specific. For critical data, maintain external backups to an independent storage solution.

### GPU Workloads
1. Akash supports GPU workloads (NVIDIA GPUs). Providers list GPU availability in their attributes (e.g., `gpu: true`, `gpu.model: nvidia-a100`, `gpu.ram: 40Gi`).
2. In the SDL, request GPU resources:
   ```yaml
   profiles:
     compute:
       gpu-task:
         resources:
           gpu:
             units: 1
             attributes:
               vendor: nvidia
               model: a100
   ```
3. GPU workloads on Akash are significantly cheaper than cloud GPU providers. A100 usage typically costs $0.60-0.80/hour vs $3-4/hour on AWS/GCP.
4. Use cases: AI training, LLM inference, rendering, scientific computing, and any CUDA-compatible workload.
5. GPU availability is more limited than standard compute. If no GPU providers bid on the deployment, relax the GPU model constraint or try a different region.
