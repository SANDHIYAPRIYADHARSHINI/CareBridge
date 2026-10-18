import { useEffect, useState } from "react";
import {
  Cpu,
  Speedometer,
  ShieldCheck,
  X,
  Gauge,
  WarningCircle,
  Flask,
  CheckCircle,
} from "@phosphor-icons/react";
import type { BenchmarkSummary } from "../../types/ai";
import { benchmarkSummaryFixture } from "../../fixtures";
import { getAiHealth, getAiBenchmark } from "../../services/aiApi";
import "./AmdPanel.css";

interface AmdPanelProps {
  isOpen: boolean;
  onClose: () => void;
  apiBaseUrl?: string;
  forceEmpty?: boolean;
  useFixtures: boolean;
  onToggleFixtures: (val: boolean) => void;
}

export const AmdPanel: React.FC<AmdPanelProps> = ({
  isOpen,
  onClose,
  apiBaseUrl = "http://localhost:8100",
  forceEmpty = false,
  useFixtures,
  onToggleFixtures,
}) => {
  const [benchmarkData, setBenchmarkData] = useState<BenchmarkSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [healthStatus, setHealthStatus] = useState<{
    status: string;
    model: string;
    device: string;
  } | null>(null);

  useEffect(() => {
    if (!isOpen || forceEmpty) return;

    const fetchTelemetry = async () => {
      setLoading(true);
      try {
        // Fetch health
        try {
          const healthRes = await fetch(`${apiBaseUrl}/v1/health`);
          if (healthRes.ok) {
            const hData = await healthRes.json();
            setHealthStatus({
              status: hData.status || "ok",
              model: hData.model || "Gemma-4-31B-IT",
              device: hData.compute_location || hData.device || "hosted on AMD Token Factory",
            });
          } else {
            const fallbackHealth = await getAiHealth();
            setHealthStatus({
              status: fallbackHealth.status,
              model: fallbackHealth.model,
              device: fallbackHealth.gpu || "AMD Token Factory",
            });
          }
        } catch {
          try {
            const fallbackHealth = await getAiHealth();
            setHealthStatus({
              status: fallbackHealth.status,
              model: fallbackHealth.model,
              device: fallbackHealth.gpu || "AMD Token Factory",
            });
          } catch {
            setHealthStatus(null);
          }
        }

        const bData = await getAiBenchmark();
        setBenchmarkData(bData);
      } catch {
        setHealthStatus(null);
        setBenchmarkData(null);
      } finally {
        setLoading(false);
      }
    };

    fetchTelemetry();
  }, [isOpen, apiBaseUrl, forceEmpty]);

  if (!isOpen) return null;

  const benchmarks = benchmarkData?.benchmarks;
  const isSample = Boolean(benchmarkData?.is_sample || benchmarkData?.status === "sample");

  return (
    <>
      <div
        className="amd-drawer-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className="amd-panel-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Under the hood — Engineering & AMD Telemetry"
      >
      {/* Drawer Header */}
      <div className="amd-panel-header">
        <div className="amd-header-brand">
          <span className="amd-brand-tag">ENGINEER LAYER</span>
          <h2 className="amd-title">Under the hood</h2>
          <span className="amd-shortcut-hint">Hotkey: .</span>
        </div>

        <button
          className="amd-close-btn"
          onClick={onClose}
          title="Close drawer (.)"
          aria-label="Close drawer"
        >
          <X size={18} />
        </button>
      </div>

      {/* Drawer Content */}
      <div className="amd-panel-content">
        {/* Dev Switch: Fixtures vs Live AI (Section 2: Moved into Under the Hood) */}
        <div className="dev-switch-card">
          <div className="dev-switch-header">
            <Flask size={18} color="var(--eng-accent)" weight="bold" />
            <span className="dev-switch-title">Backend Connection &amp; Data Source</span>
          </div>
          <p className="dev-switch-desc">
            Toggle between the live Python FastAPI backend on Port 8100 (LLM on AMD Token Factory, OCR &amp; embeddings on CPU) and offline synthetic demo fixtures.
          </p>
          <div className="dev-toggle-row">
            <button
              type="button"
              className={`dev-toggle-btn ${!useFixtures ? "active" : ""}`}
              onClick={() => onToggleFixtures(false)}
            >
              <span>Live AI (Port 8100)</span>
            </button>
            <button
              type="button"
              className={`dev-toggle-btn ${useFixtures ? "active" : ""}`}
              onClick={() => onToggleFixtures(true)}
            >
              <span>Offline Fixtures</span>
            </button>
          </div>
        </div>

        {/* Runtime Model & Device Status */}
        <div className="amd-meta-box">
          <div className="amd-meta-row">
            <span className="amd-meta-label">Model Status</span>
            <span className="amd-meta-val font-mono">
              {healthStatus ? (
                <span className="status-live-pill">
                  <CheckCircle size={13} weight="bold" />
                  <span>{healthStatus.model}</span>
                </span>
              ) : (
                <span className="status-unconnected-pill">Model: not connected</span>
              )}
            </span>
          </div>
          <div className="amd-meta-row">
            <span className="amd-meta-label">Compute Device</span>
            <span className="amd-meta-val font-mono">
              {healthStatus ? healthStatus.device : "LLM on AMD Token Factory (hosted), OCR and embeddings on this server's CPU"}
            </span>
          </div>
          <div className="amd-meta-row">
            <span className="amd-meta-label">Backend Target</span>
            <span className="amd-meta-val font-mono">{apiBaseUrl}</span>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "3rem", color: "var(--eng-muted)" }}>
            <Gauge size={32} className="skeleton-spinner" />
            <p style={{ marginTop: "0.5rem" }}>Querying AMD Token Factory endpoint status...</p>
          </div>
        ) : !benchmarks || forceEmpty ? (
          /* Empty State per docs/design-v2.md: "shows 'no benchmark yet' when empty, never fake numbers" */
          <div className="amd-empty-state">
            <Cpu size={44} className="amd-empty-icon" />
            <h4>No Benchmark Yet</h4>
            <p style={{ margin: "0.5rem 0 1rem 0", color: "var(--eng-muted)", fontSize: "0.88rem" }}>
              Run the benchmark suite against AMD Token Factory to measure client-side latency:
            </p>
            <code className="font-mono">python eval/bench_latency.py --concurrency 1 2 4 8</code>
            <div className="amd-preview-action">
              <button
                type="button"
                className="amd-preview-btn"
                onClick={() =>
                  setBenchmarkData({ ...benchmarkSummaryFixture, is_sample: true, status: "sample" })
                }
              >
                Preview Sample Benchmark Layout
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Sample Warning Banner */}
            {isSample && (
              <div className="amd-sample-banner" role="status">
                <WarningCircle size={20} weight="bold" className="amd-sample-icon" />
                <div className="amd-sample-banner-text">
                  <div className="amd-sample-headline">Sample layout preview, not measured</div>
                  <div className="amd-sample-subtext">
                    Illustrative preview data. Live numbers are recorded when running eval scripts on AMD Token Factory.
                  </div>
                </div>
                <button
                  type="button"
                  className="amd-sample-reset-btn"
                  onClick={() => setBenchmarkData(null)}
                  title="Switch back to live state"
                >
                  Clear
                </button>
              </div>
            )}

            {/* Concurrency Scaling Table */}
            <div className="amd-section-card">
              <div className="amd-section-header-row">
                <h3 className="amd-section-title">
                  <Speedometer size={16} color="var(--eng-accent)" />
                  <span>AMD Token Factory Concurrency Scaling</span>
                </h3>
              </div>

              <div className="benchmark-table-wrapper">
                <table className="benchmark-table">
                  <thead>
                    <tr>
                      <th>Streams</th>
                      <th>P50 Latency</th>
                      <th>P95 Latency</th>
                      <th>Throughput</th>
                    </tr>
                  </thead>
                  <tbody>
                    {benchmarks.concurrency_table.map((row) => (
                      <tr key={row.concurrency}>
                        <td className="font-mono">{row.concurrency}x</td>
                        <td className="font-mono">{row.p50_ms.toFixed(1)} ms</td>
                        <td className="font-mono">{row.p95_ms.toFixed(1)} ms</td>
                        <td className="font-mono" style={{ color: "var(--eng-accent)", fontWeight: 600 }}>
                          {row.tokens_per_sec.toFixed(1)} t/s
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Quality & Safety Gates */}
            <div className="amd-section-card">
              <div className="amd-section-header-row">
                <h3 className="amd-section-title">
                  <ShieldCheck size={16} color="var(--eng-accent)" />
                  <span>Extraction &amp; Safety Verification</span>
                </h3>
              </div>

              <div className="accuracy-grid">
                <div className="accuracy-metric-card">
                  <div className="accuracy-metric-label">Extraction Accuracy</div>
                  <div className="accuracy-metric-value font-mono">
                    {(benchmarks.extraction_accuracy * 100).toFixed(1)}%
                  </div>
                </div>

                <div className="accuracy-metric-card">
                  <div className="accuracy-metric-label">Safety Flag Recall</div>
                  <div className="accuracy-metric-value font-mono">
                    {(benchmarks.flag_recall * 100).toFixed(1)}%
                  </div>
                </div>

                <div className="accuracy-metric-card">
                  <div className="accuracy-metric-label">Emergency Recall</div>
                  <div className="accuracy-metric-value font-mono" style={{ color: "var(--eng-accent)" }}>
                    {(benchmarks.red_flag_emergency_recall * 100).toFixed(0)}%
                  </div>
                </div>

                <div className="accuracy-metric-card">
                  <div className="accuracy-metric-label">Escalation Recall</div>
                  <div className="accuracy-metric-value font-mono">
                    {(benchmarks.escalation_recall * 100).toFixed(0)}%
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </aside>
    </>
  );
};
