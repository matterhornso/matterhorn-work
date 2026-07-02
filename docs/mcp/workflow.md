# Workflow MCP

Use the Workflow MCP when an agent needs Matterhorn workflow catalogs, prompt packs, service capability planning, or customer templates.

## What It Does

- Reads customer-visible workflow catalogs and template metadata.
- Generates staged prompt packs for Matterhorn desks and workflows.
- Plans service capabilities such as hosting, storage, email, payments, and identity/access.
- Returns reviewed plans and prompts rather than executing external providers.

## Tools

- `matterhorn_services_get_capabilities`
- `matterhorn_services_chat_plan`
- `matterhorn_workflows_catalog`
- `matterhorn_workflows_prompt_pack`
- `matterhorn_workflows_customer_templates`

## Setup

```bash
matterhorn-work mcp config --target codex --profile full
matterhorn-work mcp config --target claude --profile full
matterhorn-work mcp config --target claude-desktop --profile full
matterhorn-work mcp config --target cursor --profile full
```

After installing, restart the client and confirm `matterhorn_workflows_catalog` appears.

## Safety Boundary

- Discovery and planning only.
- No live provider execution, payments, email sending, hosting publish, token gates, or hidden external steps.
- Users review generated plans before any external work happens.

## Example Prompts

- List workflow templates available for a first customer demo.
- Generate a prompt pack for the Bittensor desk.
- Plan hosting and email capabilities without executing a provider.
