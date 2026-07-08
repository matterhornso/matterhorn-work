/** @jsxImportSource react */
import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import {
  Bot,
  DollarSign,
  Clock,
  Star,
  Plus,
  Search,
  ChevronRight,
  Play,
  Pause,
  ExternalLink,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  useMarketplaceStore,
  browseAgents,
  selectAgent,
  deployAgent,
  hireAgent,
  pauseAgent,
  resumeAgent,
  addDeployLog,
  clearDeployLog,
  finishDeploy,
  setFilters,
  type AgentBlueprint,
  type DeployedAgent,
} from "../state/marketplace-store"
import { agentBlueprints } from "../data/agent-blueprints"

// ── Helpers ─────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  defi: "DeFi",
  trading: "Trading",
  analytics: "Analytics",
  social: "Social",
}

const CATEGORY_COLORS: Record<string, string> = {
  defi: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  trading: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  analytics: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  social: "bg-pink-500/10 text-pink-400 border-pink-500/20",
}

const DIFFICULTY_LABELS: Record<string, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
}

const DIFFICULTY_COLORS: Record<string, string> = {
  beginner: "text-emerald-400",
  intermediate: "text-amber-400",
  advanced: "text-rose-400",
}

const PROVIDERS = [
  { value: "auto", label: "Auto-select" },
  { value: "heuristic", label: "Heuristic AI" },
  { value: "openai", label: "OpenAI GPT-4o" },
  { value: "anthropic", label: "Anthropic Sonnet" },
  { value: "ollama", label: "Ollama Local" },
]

const TABS = ["Browse Agents", "My Agents", "Deploy"] as const
type Tab = (typeof TABS)[number]
const TAB_LABELS: Record<Tab, string> = {
  "Browse Agents": "Browse Templates",
  "My Agents": "Saved Previews",
  Deploy: "Deployment Preview",
}

// ── Deploy Terminal Component ───────────────────────────────────────────────

function DeployTerminal({ log }: { log: string[] }) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [log])

  return (
    <div className="rounded-lg border border-gray-4 bg-gray-1 p-4 font-mono text-xs text-emerald-400 h-64 overflow-y-auto">
      {log.length === 0 ? (
        <p className="text-gray-9">Awaiting preview command...</p>
      ) : (
        log.map((line, i) => (
          <div key={i} className="flex gap-2">
            <span className="text-gray-9 shrink-0">[{i + 1}]</span>
            <span>{line}</span>
          </div>
        ))
      )}
      <div ref={bottomRef} />
    </div>
  )
}

// ── Agent Card Component ────────────────────────────────────────────────────

function AgentCard({
  agent,
  onSelect,
  onHire,
}: {
  agent: AgentBlueprint
  onSelect: (id: string) => void
  onHire: (agent: AgentBlueprint) => void
}) {
  return (
    <div
      className={cn(
        "group relative rounded-xl border border-gray-4 bg-gray-2 p-5 cursor-pointer",
        "hover:border-gray-6 hover:bg-gray-3 transition-all duration-200",
      )}
      onClick={() => onSelect(agent.id)}
    >
      {/* Accent strip */}
      <div
        className="absolute top-0 left-4 right-4 h-[2px] rounded-b opacity-60"
        style={{ background: agent.accentColor }}
      />

      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-gray-12 text-sm leading-tight">
            {agent.name}
          </h3>
          <p className="text-xs text-gray-10 mt-0.5">{agent.tagline}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0 ml-3">
          <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
          <span className="text-xs font-medium text-amber-400">
            {agent.reputation}
          </span>
        </div>
      </div>

      <p className="text-xs text-gray-10 leading-relaxed line-clamp-2 mb-3">
        {agent.description}
      </p>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {agent.tags.map((tag) => (
          <span
            key={tag}
            className="text-[10px] px-2 py-0.5 rounded-full bg-gray-3 text-gray-11 border border-gray-5"
          >
            {tag}
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "text-[10px] px-2 py-0.5 rounded-full border",
              CATEGORY_COLORS[agent.category] || "bg-gray-3 text-gray-11 border-gray-5",
            )}
          >
            {CATEGORY_LABELS[agent.category] || agent.category}
          </span>
          <span
            className={cn(
              "text-[10px]",
              DIFFICULTY_COLORS[agent.difficulty] || "text-gray-10",
            )}
          >
            {DIFFICULTY_LABELS[agent.difficulty] || agent.difficulty}
          </span>
        </div>
        <div className="flex items-center gap-0.5 text-xs font-medium text-gray-12">
          <DollarSign className="w-3 h-3 text-emerald-400" />
          {agent.dailyCost}
          <span className="text-gray-9">/day</span>
        </div>
      </div>

      <Button
        size="sm"
        className="mt-3 w-full gap-1.5"
        variant="secondary"
        onClick={(e) => {
          e.stopPropagation()
          onHire(agent)
        }}
      >
        <Plus className="w-3.5 h-3.5" />
        Preview template
      </Button>
    </div>
  )
}

// ── My Agents Row Component ─────────────────────────────────────────────────

function MyAgentRow({
  agent,
  blueprint,
}: {
  agent: DeployedAgent
  blueprint: AgentBlueprint | null
}) {
  return (
    <div className="flex items-center justify-between py-3 px-1 border-b border-gray-3 last:border-0">
      <div className="flex items-center gap-3 min-w-0">
        <div
          className="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center"
          style={{
            background: blueprint?.bgGradient ?? "#333",
          }}
        >
          <Bot className="w-4 h-4 text-gray-12" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-12 truncate">
            {agent.name}
          </p>
          <p className="text-xs text-gray-10">{agent.provider}</p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <span
          className="text-[10px] font-medium px-2 py-0.5 rounded-full border bg-cyan-500/10 text-cyan-300 border-cyan-500/20"
        >
          Preview
        </span>
        <span className="text-xs text-gray-11 w-16 text-right font-mono">
          ${agent.revenue.toFixed(2)}
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 gap-1 text-xs"
          onClick={(e) => {
            e.stopPropagation()
            agent.status === "live" ? pauseAgent(agent.id) : resumeAgent(agent.id)
          }}
        >
          {agent.status === "live" ? (
            <>
              <Pause className="w-3 h-3" />
              Archive
            </>
          ) : (
            <>
              <Play className="w-3 h-3" />
              Restore
            </>
          )}
        </Button>
      </div>
    </div>
  )
}

// ── Main View ───────────────────────────────────────────────────────────────

export default function MarketplaceView() {
  const snapshot = useMarketplaceStore()
  const [activeTab, setActiveTab] = useState<Tab>("Browse Agents")
  const [searchValue, setSearchValue] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)
  const [minRepFilter, setMinRepFilter] = useState(0)

  // Deploy form state
  const [deployTargetId, setDeployTargetId] = useState<string | null>(null)
  const [deployName, setDeployName] = useState("")
  const [deployProvider, setDeployProvider] = useState("auto")
  const [deployBudget, setDeployBudget] = useState("")

  // Simulate deployment steps
  const deployTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const handleSearch = useCallback(
    (q: string) => {
      setSearchValue(q)
      setFilters({ search: q })
    },
    [],
  )

  const handleCategoryChange = useCallback((cat: string | null) => {
    setCategoryFilter(cat)
    setFilters({ category: cat })
  }, [])

  const handleMinRepChange = useCallback((val: number) => {
    setMinRepFilter(val)
    setFilters({ minReputation: val })
  }, [])

  const filteredAgents = browseAgents()

  const handleSelectAgent = useCallback(
    (id: string) => {
      selectAgent(id === snapshot.selectedAgentId ? null : id)
    },
    [snapshot.selectedAgentId],
  )

  const handleHire = useCallback((agent: AgentBlueprint) => {
    hireAgent(agent.id)
    setActiveTab("My Agents")
  }, [])

  const handleDeploy = useCallback(() => {
    if (!deployTargetId) return
    const blueprint = agentBlueprints.find((a) => a.id === deployTargetId)
    if (!blueprint) return

    deployAgent(deployTargetId, deployName, deployProvider)

    // Simulate step-by-step deployment log
    const steps = [
      `[BOOT] Initializing ${deployName} (blueprint: ${blueprint.id})...`,
      `[INFO] Provider resolved: ${deployProvider}`,
      `[PREVIEW] Building a local deployment plan only...`,
      `[SKILLS] Listing ${blueprint.requiredSkillIds.length} required skill contracts...`,
      ...blueprint.requiredSkillIds.map(
        (sid) => `[SKILL]   ${" ".repeat(2)}${sid} available in registry preview`,
      ),
      `[BUDGET] Proposed daily cap: $${deployBudget || "0"}`,
      `[SAFETY] No wallet connection, payment, or on-chain deployment was attempted.`,
      `[DONE]  Preview for "${deployName}" is ready to review.`,
    ]

    let step = 0
    deployTimerRef.current = setInterval(() => {
      if (step >= steps.length) {
        if (deployTimerRef.current) clearInterval(deployTimerRef.current)
        finishDeploy()
        return
      }
      addDeployLog(steps[step])
      step++
    }, 600)
  }, [deployTargetId, deployName, deployProvider, deployBudget])

  const handleCancelDeploy = useCallback(() => {
    if (deployTimerRef.current) clearInterval(deployTimerRef.current)
    clearDeployLog()
    setDeployTargetId(null)
  }, [])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (deployTimerRef.current) clearInterval(deployTimerRef.current)
    }
  }, [])

  const selectedAgentDetail = useMemo(() => {
    if (!snapshot.selectedAgentId) return null
    const agent = agentBlueprints.find((a) => a.id === snapshot.selectedAgentId)
    if (!agent) return null
    return (
      <div className="mt-6 rounded-xl border border-gray-4 bg-gray-2 overflow-hidden">
        <div className="h-1" style={{ background: agent.bgGradient }} />
        <div className="p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-base font-semibold text-gray-12">{agent.name}</h3>
              <p className="text-sm text-gray-11 mt-0.5">{agent.tagline}</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                <span className="text-sm font-medium text-amber-400">{agent.reputation}</span>
              </div>
              <div className="flex items-center gap-0.5">
                <DollarSign className="w-4 h-4 text-emerald-400" />
                <span className="text-sm font-medium text-emerald-400">{agent.dailyCost}</span>
                <span className="text-xs text-gray-9">/day</span>
              </div>
            </div>
          </div>
          <p className="text-sm text-gray-11 leading-relaxed mb-4">{agent.description}</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-9 mb-1">Category</p>
              <span className={cn("text-xs px-2 py-0.5 rounded-full border", CATEGORY_COLORS[agent.category] || "bg-gray-3 text-gray-11 border-gray-5")}>
                {CATEGORY_LABELS[agent.category]}
              </span>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-9 mb-1">Difficulty</p>
              <span className={cn("text-xs", DIFFICULTY_COLORS[agent.difficulty] || "text-gray-10")}>
                {DIFFICULTY_LABELS[agent.difficulty]}
              </span>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-9 mb-1">Estimated Return</p>
              <span className="text-xs text-gray-12">{agent.estimatedReturn}</span>
            </div>
          </div>
          <div className="mb-4">
            <p className="text-[10px] uppercase tracking-wider text-gray-9 mb-2">Required Skills</p>
            <div className="flex flex-wrap gap-1.5">
              {agent.requiredSkillIds.map((sid) => (
                <span key={sid} className="text-[10px] px-2 py-1 rounded bg-gray-3 border border-gray-5 text-gray-11 font-mono">
                  {sid}
                </span>
              ))}
            </div>
          </div>
          <div className="mb-4">
            <p className="text-[10px] uppercase tracking-wider text-gray-9 mb-2">Tags</p>
            <div className="flex flex-wrap gap-1.5">
              {agent.tags.map((tag) => (
                <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full bg-gray-3 text-gray-11 border border-gray-5">
                  {tag}
                </span>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3 pt-2 border-t border-gray-3">
            <Button size="sm" className="gap-1.5" onClick={() => handleHire(agent)}>
              <Plus className="w-3.5 h-3.5" />
              Save preview
            </Button>
            <Button size="sm" variant="ghost" className="gap-1.5 text-xs" onClick={() => selectAgent(null)}>
              Close
            </Button>
          </div>
        </div>
      </div>
    )
  }, [snapshot.selectedAgentId, handleHire])

  const deployFormContent = useMemo(() => {
    if (!deployTargetId) return null
    const selectedBp = agentBlueprints.find((a) => a.id === deployTargetId)
    if (!selectedBp) return null
    return (
      <div
        className={cn(
          "rounded-xl border border-gray-4 bg-gray-2 p-5 space-y-4",
          snapshot.isDeploying && "border-purple-500/30",
        )}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-6 h-6 rounded flex items-center justify-center"
            style={{ background: selectedBp.accentColor }}
          >
            <Bot className="w-3.5 h-3.5 text-gray-12" />
          </div>
          <h3 className="text-sm font-medium text-gray-12">
            Configure: {selectedBp.name}
          </h3>
        </div>

        {!snapshot.isDeploying && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-gray-9 mb-1.5">
                Agent Name
              </label>
              <input
                type="text"
                value={deployName}
                onChange={(e) => setDeployName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-4 bg-gray-1 text-xs text-gray-12 placeholder-gray-9 focus:outline-none focus:border-gray-6"
                placeholder="My agent name"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-gray-9 mb-1.5">
                AI Provider
              </label>
              <select
                value={deployProvider}
                onChange={(e) => setDeployProvider(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-4 bg-gray-1 text-xs text-gray-12 focus:outline-none focus:border-gray-6"
              >
                {PROVIDERS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-gray-9 mb-1.5">
                Daily Budget ($)
              </label>
              <input
                type="number"
                value={deployBudget}
                onChange={(e) => setDeployBudget(e.target.value)}
                min="0"
                step="0.5"
                className="w-full px-3 py-2 rounded-lg border border-gray-4 bg-gray-1 text-xs text-gray-12 placeholder-gray-9 focus:outline-none focus:border-gray-6"
              />
            </div>
          </div>
        )}

        <DeployTerminal log={snapshot.deployLog} />

        <div className="flex items-center gap-3">
          {!snapshot.isDeploying ? (
            <>
              <Button
                size="sm"
                className="gap-1.5"
                disabled={!deployName.trim()}
                onClick={handleDeploy}
              >
                <Play className="w-3.5 h-3.5" />
                Generate preview
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                variant="ghost"
                className="gap-1.5"
                onClick={handleCancelDeploy}
              >
                Cancel
              </Button>
              {snapshot.deployLog.length > 0 && !snapshot.isDeploying && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => setActiveTab("My Agents")}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  View in My Agents
                </Button>
              )}
            </>
          )}

          {snapshot.isDeploying && (
            <div className="flex items-center gap-2 ml-auto">
              <div className="w-4 h-4 rounded-full border-2 border-purple-500 border-t-transparent animate-spin" />
              <span className="text-[10px] text-purple-400">Generating preview...</span>
            </div>
          )}
        </div>
      </div>
    )
  }, [deployTargetId, deployName, deployProvider, deployBudget, snapshot.isDeploying, snapshot.deployLog, handleDeploy, handleCancelDeploy])

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 pt-6 pb-4">
        <div className="flex items-center gap-3 mb-1">
          <div className="flex size-8 items-center justify-center rounded-md bg-dls-hover/45 text-dls-secondary">
            <Bot className="size-4" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-12">
              Agent Marketplace Preview
            </h1>
            <p className="text-xs text-gray-10">
              Browse future agent templates. Hiring, payment, and deployment are not live in this beta.
            </p>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-gray-4 px-6 gap-0">
        {TABS.map((tab) => (
          <button
            key={tab}
            className={cn(
              "px-4 py-2.5 text-xs font-medium border-b-2 -mb-[1px] transition-colors",
              activeTab === tab
                ? "border-purple-500 text-purple-300"
                : "border-transparent text-gray-10 hover:text-gray-11",
            )}
            onClick={() => setActiveTab(tab)}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
        <div className="flex-1" />
        <div className="text-[10px] text-gray-9 self-center mb-1">
          Preview-only in this beta. No wallet, payment, or live deployment.
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {/* ── Browse Agents ─────────────────────────────────────────────── */}
        {activeTab === "Browse Agents" && (
          <div className="space-y-4">
            {/* Search + filters */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-9" />
                <input
                  type="text"
                  placeholder="Search agents..."
                  value={searchValue}
                  onChange={(e) => handleSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-4 bg-gray-1 text-xs text-gray-12 placeholder-gray-9 focus:outline-none focus:border-gray-6"
                />
              </div>

              <select
                value={categoryFilter ?? ""}
                onChange={(e) =>
                  handleCategoryChange(e.target.value || null)
                }
                className="rounded-lg border border-gray-4 bg-gray-1 text-xs text-gray-12 px-3 py-2 focus:outline-none focus:border-gray-6"
              >
                <option value="">All Categories</option>
                <option value="defi">DeFi</option>
                <option value="trading">Trading</option>
                <option value="analytics">Analytics</option>
                <option value="social">Social</option>
              </select>

              <select
                value={minRepFilter}
                onChange={(e) => handleMinRepChange(Number(e.target.value))}
                className="rounded-lg border border-gray-4 bg-gray-1 text-xs text-gray-12 px-3 py-2 focus:outline-none focus:border-gray-6"
              >
                <option value={0}>Any Reputation</option>
                <option value={90}>90+</option>
                <option value={93}>93+</option>
                <option value={95}>95+</option>
              </select>

              {filteredAgents.length > 0 && (
                <span className="text-[10px] text-gray-9">
                  {filteredAgents.length} agent
                  {filteredAgents.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>

            {/* Agent grid */}
            {filteredAgents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-9">
                <Bot className="w-10 h-10 mb-3 opacity-30" />
                <p className="text-sm">No agents match your filters</p>
                <p className="text-xs mt-1">Try adjusting your search or category</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredAgents.map((agent) => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    onSelect={handleSelectAgent}
                    onHire={handleHire}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── My Agents ─────────────────────────────────────────────────── */}
        {activeTab === "My Agents" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-gray-12">
                Saved Agent Previews
              </h2>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs h-8"
                onClick={() => setActiveTab("Deploy")}
              >
                <Plus className="w-3.5 h-3.5" />
                New Preview
              </Button>
            </div>

            {snapshot.myAgents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-9">
                <Clock className="w-10 h-10 mb-3 opacity-30" />
                <p className="text-sm">No saved previews yet</p>
                <p className="text-xs mt-1">
                  Browse the marketplace and save a template preview.
                </p>
                <Button
                  size="sm"
                  variant="secondary"
                  className="mt-4 gap-1.5"
                  onClick={() => setActiveTab("Browse Agents")}
                >
                  <Search className="w-3.5 h-3.5" />
                  Browse Agents
                </Button>
              </div>
            ) : (
              <div className="rounded-xl border border-gray-4 bg-gray-2 divide-y divide-gray-3">
                {/* Header row */}
                <div className="flex items-center justify-between py-2 px-4 text-[10px] uppercase tracking-wider text-gray-9">
                  <span>Agent</span>
                  <div className="flex items-center gap-4">
                    <span className="w-16 text-center">State</span>
                    <span className="w-16 text-right">Estimate</span>
                    <span className="w-20" />
                  </div>
                </div>
                {snapshot.myAgents.map((deployed) => {
                  const blueprint = agentBlueprints.find(
                    (a) => a.id === deployed.blueprintId,
                  )
                  return (
                    <div key={deployed.id} className="px-4">
                      <MyAgentRow agent={deployed} blueprint={blueprint ?? null} />
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Deployment preview ────────────────────────────────────────── */}
        {activeTab === "Deploy" && (
          <div className="space-y-5">
            {/* Blueprint selection grid */}
            {!snapshot.isDeploying && (
              <>
                <div>
                  <h2 className="text-sm font-medium text-gray-12 mb-1">
                    Choose a Blueprint
                  </h2>
                  <p className="text-xs text-gray-10">
                    Select an agent template to generate a local preview. Deployment is not live in this beta.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {agentBlueprints.map((bp) => {
                    const isSelected = deployTargetId === bp.id
                    return (
                      <button
                        key={bp.id}
                        className={cn(
                          "relative text-left rounded-xl border p-4 transition-all duration-200",
                          isSelected
                            ? "border-purple-500/50 bg-purple-500/5"
                            : "border-gray-4 bg-gray-2 hover:border-gray-6",
                        )}
                        onClick={() => {
                          setDeployTargetId(bp.id)
                          setDeployName(bp.name)
                          setDeployBudget(bp.dailyCost.toFixed(0))
                        }}
                      >
                        <div
                          className="absolute top-0 left-3 right-3 h-[2px] rounded-b opacity-50"
                          style={{ background: bp.accentColor }}
                        />
                        <div className="flex items-start justify-between mb-2">
                          <span className="text-xs font-medium text-gray-12 leading-snug pr-2">
                            {bp.name}
                          </span>
                          <span
                            className={cn(
                              "text-[9px] px-1.5 py-0.5 rounded-full border shrink-0",
                              CATEGORY_COLORS[bp.category] || "bg-gray-3 text-gray-11 border-gray-5",
                            )}
                          >
                            {CATEGORY_LABELS[bp.category]}
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-10 leading-relaxed line-clamp-2 mb-2">
                          {bp.tagline}
                        </p>
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-gray-9">
                            {DIFFICULTY_LABELS[bp.difficulty]}
                          </span>
                          <span className="text-emerald-400 font-medium">
                            ${bp.dailyCost}/day
                          </span>
                        </div>
                        {isSelected && (
                          <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-purple-500 flex items-center justify-center">
                            <span className="text-[9px] text-gray-12 font-bold">
                              &#10003;
                            </span>
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              </>
            )}

            {/* Preview form */}
            {deployFormContent}
          </div>
        )}

        {/* ── Selected agent detail panel ────────────────────────────────── */}
        {activeTab === "Browse Agents" && selectedAgentDetail}
          </div>
        </div>
      )
    }
