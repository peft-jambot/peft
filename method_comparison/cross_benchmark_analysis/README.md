# Cross-benchmark correlation of PEFT method metrics

Artifacts backing the (updated) issue *"Do PEFT method metrics correlate across the GSM8K and image-gen benchmarks?"*.

**Data source:** freshly synced `upstream/main` of the repo — **33 methods** present in both
benchmarks (72 MetaMathQA / 39 image-gen result files, all `status == "success"`), taken from
the committed `results/` folders only (no temporary/local experiment outputs).

## Contents

- `fig_test_quality.png` — raw test-quality correlation (GSM8K test acc vs image-gen test
  DINO similarity) and the parameter-controlled (residual) version, n=33.
- `fig_metric_heatmap.png` — Spearman cross-correlation between each MetaMathQA metric and
  the analogous image-gen metric, method-level n=33.
- `fig_rank_change.png` — each method's test-quality rank on GSM8K vs image-gen.
- `fig_tradeoff_within.png` — within-benchmark tradeoffs: quality vs forgetting/drift and vs memory.
- `fig_efficiency_transfer.png` — cross-benchmark "efficiency transfer": residual of quality
  on log10(memory/params/time/size) for GSM8K (x) vs image-gen (y).
- `method_table.csv` — per-method primary metrics and ranks on both benchmarks (33 methods).
- `corr_summary.md` — cross-benchmark Spearman correlations (all n=33 and excl. 3 outliers).
- `tradeoff_within.md` / `tradeoff_transfer.md` — the within-benchmark tradeoff correlations
  and the cross-benchmark efficiency-transfer correlations.

## Main findings

- **Test quality does NOT robustly transfer**: ρ(GSM8K acc, DINO sim) = +0.34 (p=0.051, n=33);
  among comparable-budget / non-outlier methods ρ ≈ 0.2 (ns).
- **Training dynamics DO transfer**: training loss ρ ≈ 0.7 (p<0.001) and validation quality
  ρ ≈ 0.5, robust across subsets.
- **Accuracy↔forgetting tradeoff does NOT transfer** (ρ ≈ 0.17, ns), even though within GSM8K
  higher accuracy is significantly associated with more forgetting (ρ=0.50).
- **Resource efficiency transfers weakly-moderately** (memory/time/size/params efficiency
  ρ ≈ 0.35–0.49 over n=33) but the significance is fragile — it drops once the methods that
  fail on both tasks (FourierFT, LN tuning, full fine-tuning) are removed.
- Within benchmarks, higher quality is bought with more trainable params / larger checkpoint
  (significant on GSM8K) and more forgetting, but not clearly with more memory or train time.
