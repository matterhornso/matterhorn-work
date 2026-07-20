const DURATION_BUCKETS_SECONDS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10] as const;

type RequestMetric = {
  method: string;
  route: string;
  status: number;
  durationMs: number;
  provider?: string;
  rateLimited?: boolean;
};

type RenderMetricsInput = {
  ready: boolean;
  uptimeMs: number;
};

function escapeLabel(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("\n", "\\n").replaceAll('"', '\\"');
}

function metricLine(name: string, labels: Record<string, string>, value: number): string {
  const serializedLabels = Object.entries(labels)
    .map(([key, label]) => `${key}="${escapeLabel(label)}"`)
    .join(",");
  return `${name}{${serializedLabels}} ${value}`;
}

function statusClass(status: number): string {
  return `${Math.floor(status / 100)}xx`;
}

export class OperationalMetrics {
  private readonly requestCounts = new Map<string, {
    method: string;
    route: string;
    statusClass: string;
    count: number;
  }>();
  private readonly providerFailures = new Map<string, number>();
  private readonly durationBuckets = new Array<number>(DURATION_BUCKETS_SECONDS.length).fill(0);
  private requestDurationSecondsSum = 0;
  private requestDurationCount = 0;
  private rateLimitRejections = 0;

  record(input: RequestMetric): void {
    const normalizedMethod = input.method.toUpperCase().slice(0, 12) || "UNKNOWN";
    const normalizedRoute = input.route.slice(0, 160) || "unmatched";
    const normalizedStatusClass = statusClass(input.status);
    const key = `${normalizedMethod}\u0000${normalizedRoute}\u0000${normalizedStatusClass}`;
    const existing = this.requestCounts.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      this.requestCounts.set(key, {
        method: normalizedMethod,
        route: normalizedRoute,
        statusClass: normalizedStatusClass,
        count: 1,
      });
    }

    const durationSeconds = Math.max(0, input.durationMs / 1000);
    this.requestDurationSecondsSum += durationSeconds;
    this.requestDurationCount += 1;
    DURATION_BUCKETS_SECONDS.forEach((bucket, index) => {
      if (durationSeconds <= bucket) this.durationBuckets[index] += 1;
    });

    if (input.rateLimited || input.status === 429) {
      this.rateLimitRejections += 1;
    }
    if (input.provider && input.status >= 500) {
      this.providerFailures.set(input.provider, (this.providerFailures.get(input.provider) ?? 0) + 1);
    }
  }

  renderPrometheus(input: RenderMetricsInput): string {
    const lines = [
      "# HELP matterhorn_backend_ready Whether the backend is ready to serve workspace requests.",
      "# TYPE matterhorn_backend_ready gauge",
      `matterhorn_backend_ready ${input.ready ? 1 : 0}`,
      "# HELP matterhorn_process_uptime_seconds Matterhorn backend process uptime.",
      "# TYPE matterhorn_process_uptime_seconds gauge",
      `matterhorn_process_uptime_seconds ${Math.max(0, input.uptimeMs / 1000).toFixed(3)}`,
      "# HELP matterhorn_http_requests_total HTTP requests grouped by bounded route template and status class.",
      "# TYPE matterhorn_http_requests_total counter",
    ];

    for (const metric of Array.from(this.requestCounts.values()).sort((left, right) =>
      `${left.method}:${left.route}:${left.statusClass}`.localeCompare(`${right.method}:${right.route}:${right.statusClass}`),
    )) {
      lines.push(metricLine("matterhorn_http_requests_total", {
        method: metric.method,
        route: metric.route,
        status_class: metric.statusClass,
      }, metric.count));
    }

    lines.push(
      "# HELP matterhorn_http_request_duration_seconds HTTP request duration across all bounded routes.",
      "# TYPE matterhorn_http_request_duration_seconds histogram",
    );
    DURATION_BUCKETS_SECONDS.forEach((bucket, index) => {
      lines.push(metricLine("matterhorn_http_request_duration_seconds_bucket", { le: String(bucket) }, this.durationBuckets[index]));
    });
    lines.push(metricLine("matterhorn_http_request_duration_seconds_bucket", { le: "+Inf" }, this.requestDurationCount));
    lines.push(`matterhorn_http_request_duration_seconds_sum ${this.requestDurationSecondsSum.toFixed(6)}`);
    lines.push(`matterhorn_http_request_duration_seconds_count ${this.requestDurationCount}`);
    lines.push(
      "# HELP matterhorn_http_rate_limit_rejections_total Requests rejected by the local API rate limiter.",
      "# TYPE matterhorn_http_rate_limit_rejections_total counter",
      `matterhorn_http_rate_limit_rejections_total ${this.rateLimitRejections}`,
      "# HELP matterhorn_provider_failures_total Upstream provider or agent-engine requests that returned 5xx.",
      "# TYPE matterhorn_provider_failures_total counter",
    );
    for (const [provider, count] of Array.from(this.providerFailures.entries()).sort(([left], [right]) => left.localeCompare(right))) {
      lines.push(metricLine("matterhorn_provider_failures_total", { provider }, count));
    }

    return `${lines.join("\n")}\n`;
  }
}
