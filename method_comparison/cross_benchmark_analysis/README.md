# Cross-benchmark correlation of PEFT method metrics

This folder hosts artifacts backing the issue _"Do PEFT method metrics correlate across the GSM8K and image-gen benchmarks?"_

## What these are

- `fig_test_quality.png` — two panels: (left) raw test-quality correlation
  (MetaMathQA/GSM8K test accuracy vs. image-gen test DINO similarity) across the 28
  methods that appear in **both** benchmarks; (right) the same after controlling for the
  parameter budget (residual of quality on `log10` trainable params).
- `fig_metric_heatmap.png` — Spearman cross-correlation between each MetaMathQA metric and
  the analogous image-gen metric, at the method level (n=28).
- `fig_rank_change.png` — each method's test-quality rank on GSM8K vs. image-gen, showing
  how much the ranking reshuffles.
- `method_table.csv` — per-method primary metric values and ranks on both benchmarks.
- `corr_summary.md` — the full table of cross-benchmark Spearman correlations.

## Method used

- One representative ("default") run is chosen per method per benchmark. Method label comes
  from `run_info.peft_config.peft_type` (same convention as the repo's own
  `processing.py`), so e.g. DoRA runs filed under `lora/...-dora` are handled by config.
- Only runs with `status == "success"` are used; duplicate runs are de-duplicated by recency.
- Since parametrizations differ across methods **and** a given method is often trained at a
  different parameter count on the two benchmarks (e.g. LoRA rank-32 = 9.2M params on the
  text task but ~38M params on image-gen), the analysis reports **both** raw Spearman
  correlations and, for the headline test-quality pair, a parameter-controlled version
  (residuals after regressing quality on `log10` trainable params within each benchmark).
- Robustness is checked over three subsets: all common methods; excluding the methods that
  essentially fail on both (FourierFT, LN tuning, full fine-tuning); and a
  comparable-budget subset (both benchmarks < 20M trainable params).

## Headline results

- **Test quality does NOT robustly transfer.** Raw ρ(GSM8K acc, DINO sim) = +0.29
  (p = 0.13, n = 28); over the comparable-budget subset ρ ≈ 0. The apparent
  parameter-controlled correlation (+0.52) is driven by a handful of methods that fail on
  both tasks and disappears once those are excluded.
- **Training dynamics DO transfer.** Training-loss correlation is strong and robust
  (ρ ≈ 0.7, p < 0.001 across all subsets), and best-validation quality correlates
  moderately (ρ ≈ 0.5). Methods that converge well on text also converge well on images.
- Forgetting↔drift and the resource metrics correlate positively; the resource/efficiency
  metrics (trainable params, checkpoint size, runtime, memory) correlate strongly because
  each method is parametrized at a consistent scale across both benchmarks — a statement
  about consistency of sizing, not of quality.
