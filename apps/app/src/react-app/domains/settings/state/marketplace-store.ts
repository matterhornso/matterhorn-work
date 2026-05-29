import { createStore } from "zustand/vanilla"
import { useSyncExternalStore } from "react"
import type { AgentBlueprint } from "../data/agent-blueprints"
import { agentBlueprints } from "../data/agent-blueprints"

// ── Types ───────────────────────────────────────────────────────────────────

export type { AgentBlueprint }

export interface DeployedAgent {
  id: string
  blueprintId: string
  name: string
  provider: string
  status: "live" | "paused"
  revenue: number
  deployedAt: number
}

export interface MarketplaceFilters {
  category: string | null
  minReputation: number
  search: string
}

export interface MarketplaceSnapshot {
  agents: AgentBlueprint[]
  myAgents: DeployedAgent[]
  selectedAgentId: string | null
  filters: MarketplaceFilters
  isDeploying: boolean
  deployStep: number
  deployLog: string[]
}

// ── Initial snapshot ────────────────────────────────────────────────────────

const getInitialSnapshot = (): MarketplaceSnapshot => ({
  agents: agentBlueprints,
  myAgents: [],
  selectedAgentId: null,
  filters: { category: null, minReputation: 0, search: "" },
  isDeploying: false,
  deployStep: 0,
  deployLog: [],
})

// ── Store ───────────────────────────────────────────────────────────────────

let nextDeployedId = 1

const marketplaceStore = createStore<MarketplaceSnapshot>(getInitialSnapshot)

// ── Actions ─────────────────────────────────────────────────────────────────

export function browseAgents(): AgentBlueprint[] {
  const { agents, filters } = marketplaceStore.getState()
  return agents.filter((a) => {
    if (filters.category && a.category !== filters.category) return false
    if (a.reputation < filters.minReputation) return false
    if (filters.search) {
      const q = filters.search.toLowerCase()
      const haystack = `${a.name} ${a.tagline} ${a.description} ${a.tags.join(" ")}`.toLowerCase()
      if (!haystack.includes(q)) return false
    }
    return true
  })
}

export function selectAgent(id: string | null): void {
  marketplaceStore.setState({ selectedAgentId: id })
}

export function getSelectedAgent(): AgentBlueprint | null {
  const { agents, selectedAgentId } = marketplaceStore.getState()
  return agents.find((a) => a.id === selectedAgentId) ?? null
}

export function deployAgent(
  blueprintId: string,
  name: string,
  provider: string,
): string {
  const { agents } = marketplaceStore.getState()
  const blueprint = agents.find((a) => a.id === blueprintId)
  if (!blueprint) throw new Error(`Blueprint ${blueprintId} not found`)

  const id = `deployed-${nextDeployedId++}`
  const deployed: DeployedAgent = {
    id,
    blueprintId,
    name: name || blueprint.name,
    provider: provider || "auto",
    status: "live",
    revenue: 0,
    deployedAt: Date.now(),
  }

  marketplaceStore.setState((s) => ({
    myAgents: [...s.myAgents, deployed],
    isDeploying: true,
    deployStep: 0,
    deployLog: [],
  }))

  return id
}

export function pauseAgent(id: string): void {
  marketplaceStore.setState((s) => ({
    myAgents: s.myAgents.map((a) =>
      a.id === id ? { ...a, status: "paused" as const } : a,
    ),
  }))
}

export function resumeAgent(id: string): void {
  marketplaceStore.setState((s) => ({
    myAgents: s.myAgents.map((a) =>
      a.id === id ? { ...a, status: "live" as const } : a,
    ),
  }))
}

export function addDeployLog(line: string): void {
  marketplaceStore.setState((s) => ({
    deployLog: [...s.deployLog, line],
    deployStep: s.deployStep + 1,
  }))
}

export function finishDeploy(): void {
  marketplaceStore.setState({ isDeploying: false, deployStep: 0, deployLog: [] })
}

export function clearDeployLog(): void {
  marketplaceStore.setState({
    isDeploying: false,
    deployStep: 0,
    deployLog: [],
    selectedAgentId: null,
  })
}

export function setFilters(partial: Partial<MarketplaceFilters>): void {
  marketplaceStore.setState((s) => ({
    filters: { ...s.filters, ...partial },
  }))
}

// ── React hook ──────────────────────────────────────────────────────────────

export function useMarketplaceStore(): MarketplaceSnapshot {
  return useSyncExternalStore(
    marketplaceStore.subscribe,
    marketplaceStore.getState,
    marketplaceStore.getInitialState,
  )
}

export function useMarketplaceStoreWithSelector<T>(
  selector: (snapshot: MarketplaceSnapshot) => T,
): T {
  return useSyncExternalStore(
    marketplaceStore.subscribe,
    () => selector(marketplaceStore.getState()),
    () => selector(marketplaceStore.getInitialState()),
  )
}
