import { useEffect, useState } from "react";
import {
  Cpu,
  Speedometer,
  ShieldCheck,
  X,
  Gauge,
  WarningCircle,
} from "@phosphor-icons/react";
import type { BenchmarkSummary } from "../../types/ai";
import { benchmarkSummaryFixture } from "../../fixtures";
import "./AmdPanel.css";

interface AmdPanelProps {
  isOpen: boolean;
  onClose: () => void;
  apiBaseUrl?: string;
  forceEmpty?: boolean;
}

export const AmdPanel: React.FC<AmdPanelProps> = ({
  isOpen,
  onClose,
  apiBaseUrl = "http://localhost:8100",
  forceEmpty = false,
}) => {
  const [benchmarkData, setBenchmarkData] = useState<BenchmarkSummary | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    if (forceEmpty) {
      setBenchmarkData(null);
      return;
    }

    const fetchBenchmark = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${apiBaseUrl}/v1/metrics/benchmark`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.status !== "no_benchmark_yet" && data.benchmarks) {
            setBenchmarkData(data);
          } else {
            // Real benchmark does not exist yet; default to unmeasured pending state
            setBenchmarkData(null);
          }
        } else {
          setBenchmarkData(null);
        }
      } catch {
        // Network error or backend offline; default to unmeasured pending state
        setBenchmarkData(null);
      } finally {
        setLoading(false);
      }
    };

    fetchBenchmark();
  }, [isOpen, apiBaseUrl, forceEmpty]);

  if (!isOpen) return null;

  const benchmarks = benchmarkData?.benchmarks;
  const isSample = Boolean(benchmarkData?.is_sample || benchmarkData?.status === "sample");

  return (
    <div
      className="amd-panel-drawer"
      role="dialog"
      aria-modal="true"
      aria-label="AMD ROCm Performance and Benchmark Dashboard"
    >
      {/* Header */}
      <div className="amd-panel-header">
        <div className="amd-header-brand">
          <span className="amd-brand-tag">AMD ROCm</span>
          <h2 className="amd-title">Performance Telemetry</h2>
          {isSample && (
            <span className="amd-header-sample-badge">Sample data, not measured</span>
          )}
        </div>

        <button
          className="amd-close-btn"
          onClick={onClose}
          title="Close AMD Panel"
          aria-label="Close AMD Panel"
        >
          <X size={18} />
        </button>
      </div>

      {/* Content */}
      <div className="amd-panel-content">
        {loading ? (
          <div style={{ textAlign: "center", padding: "3rem", color: "#888" }}>
            <Gauge size={32} className="skeleton-spinner" />
            <p style={{ marginTop: "0.5rem" }}>Querying AMD ROCm device counters...</p>
          </div>
        ) : !benchmarks || forceEmpty ? (
          /* Empty State per docs/design.md: "shows 'no benchmark yet' when empty, never fake numbers" */
          <div className="amd-empty-state">
            <Cpu size={48} className="amd-empty-icon" />
            <h4>No Benchmark Yet</h4>
            <p style={{ margin: "0.5rem 0 1rem 0" }}>
              To populate live throughput, latency, and accuracy metrics on your AMD Instinct GPU:
            </p>
            <code>python eval/bench_latency.py --concurrency 1 4 8 16</code>
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
            {/* Sample Warning Banner if unmeasured sample data is shown */}
            {isSample && (
              <div className="amd-sample-banner" role="status">
                <WarningCircle size={22} weight="bold" className="amd-sample-icon" />
                <div className="amd-sample-banner-text">
                  <div className="amd-sample-headline">Sample data, not measured</div>
                  <div className="amd-sample-subtext">
                    This telemetry is illustrative layout preview data. Measured performance requires running eval scripts on AMD ROCm hardware.
                  </div>
                </div>
                <button
                  type="button"
                  className="amd-sample-reset-btn"
                  onClick={() => setBenchmarkData(null)}
                  title="Switch back to live pending status"
                >
                  Clear Preview
                </button>
              </div>
            )}

            {/* Hardware & Model Specifications */}
            <div className="amd-meta-box">
              <div className="amd-meta-row">
                <span className="amd-meta-label">Accelerator</span>
                <span className="amd-meta-val font-mono">{benchmarkData?.gpu}</span>
              </div>
              <div className="amd-meta-row">
                <span className="amd-meta-label">Model Weights</span>
                <span className="amd-meta-val font-mono">{benchmarkData?.model}</span>
              </div>
              <div className="amd-meta-row">
                <span className="amd-meta-label">Evaluated At</span>
                <span className="amd-meta-val font-mono">
                  {isSample ? "Sample data, not measured" : benchmarkData?.generated_at}
                </span>
              </div>
            </div>

            {/* Concurrency & Latency Table */}
            <div>
              <div className="amd-section-header-row">
                <h3 className="amd-section-title">
                  <Speedometer size={18} color="#ED1C24" />
                  <span>ROCm vLLM Concurrency Scaling</span>
                </h3>
                {isSample && (
                  <span className="amd-section-sample-label">Sample data, not measured</span>
                )}
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
                        <td className="font-mono" style={{ color: "#ED1C24", fontWeight: 600 }}>
                          {row.tokens_per_sec.toFixed(1)} t/s
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Quality & Safety Gates */}
            <div>
              <div className="amd-section-header-row">
                <h3 className="amd-section-title">
                  <ShieldCheck size={18} color="#4CAF50" />
                  <span>Clinical Extraction & Safety Metrics</span>
                </h3>
                {isSample && (
                  <span className="amd-section-sample-label">Sample data, not measured</span>
                )}
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
                  <div className="accuracy-metric-value font-mono" style={{ color: "#4CAF50" }}>
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

            {/* Footer Notice */}
            <p style={{ fontSize: "0.78rem", color: "#888888", textAlign: "center", margin: 0 }}>
              {isSample
                ? "Sample data, not measured — Awaiting live run of eval/bench_latency.py on AMD ROCm."
                : "Metrics measured against synthetic prescription evaluation dataset (eval/data)."}
            </p>
          </>
        )}
      </div>
    </div>
  );
};

