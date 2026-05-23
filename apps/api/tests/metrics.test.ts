import assert from "node:assert/strict";
import test from "node:test";
import {
  incrementCounter,
  observeHistogram,
  registerCounter,
  registerGauge,
  registerHistogram,
  renderMetrics,
  setGauge,
} from "../src/lib/metrics";

test("counter renders in Prometheus text format", () => {
  registerCounter("test_counter_a", "test counter A");
  incrementCounter("test_counter_a", { foo: "bar" }, 3);
  incrementCounter("test_counter_a", { foo: "bar" }, 2);
  const out = renderMetrics();
  assert.match(out, /# HELP test_counter_a test counter A/);
  assert.match(out, /# TYPE test_counter_a counter/);
  assert.match(out, /test_counter_a\{foo="bar"\} 5/);
});

test("gauge renders + latest setGauge wins", () => {
  registerGauge("test_gauge_b", "test gauge B");
  setGauge("test_gauge_b", 1, { name: "foo" });
  setGauge("test_gauge_b", 7, { name: "foo" });
  const out = renderMetrics();
  assert.match(out, /test_gauge_b\{name="foo"\} 7/);
});

test("histogram renders bucket / sum / count lines", () => {
  registerHistogram("test_hist_c", "test hist C", [0.1, 0.5, 1, 5]);
  observeHistogram("test_hist_c", 0.3);
  observeHistogram("test_hist_c", 2);
  observeHistogram("test_hist_c", 0.05);
  const out = renderMetrics();
  // 0.05 ≤ 0.1, 0.5, 1, 5  → bucket counts ramp
  assert.match(out, /test_hist_c_bucket\{le="0.1"\} 1/);
  assert.match(out, /test_hist_c_bucket\{le="0.5"\} 2/);
  assert.match(out, /test_hist_c_bucket\{le="1"\} 2/);
  assert.match(out, /test_hist_c_bucket\{le="5"\} 3/);
  assert.match(out, /test_hist_c_bucket\{le="\+Inf"\} 3/);
  assert.match(out, /test_hist_c_count 3/);
});

test("default Retune metric set is registered at module load", () => {
  const out = renderMetrics();
  assert.match(out, /retune_http_requests_total/);
  assert.match(out, /retune_http_request_duration_seconds/);
  assert.match(out, /retune_generation_outcomes_total/);
  assert.match(out, /retune_generation_ticks/);
  assert.match(out, /retune_generation_cost_usd/);
  assert.match(out, /retune_active_traces/);
  assert.match(out, /retune_temporal_enabled/);
});

test("escapes quote/backslash/newline in label values", () => {
  registerCounter("test_counter_d", "test counter D");
  incrementCounter("test_counter_d", { tricky: 'a"b\\c\nd' });
  const out = renderMetrics();
  assert.match(out, /tricky="a\\"b\\\\c\\nd"/);
});
