---
title: PEFT Adapter Flow Graph
emoji: 🔀
colorFrom: blue
colorTo: pink
sdk: static
pinned: false
license: apache-2.0
short_description: Browsable call-flow graph for set_adapter / add_adapter in PEFT
---

# PEFT `set_adapter` / `add_adapter` flow graph

An interactive, browsable call-flow graph for the two adapter entry points in
[huggingface/peft](https://github.com/huggingface/peft), including **what model
state each call mutates**.

* `PeftModel.set_adapter` → `BaseTuner.set_adapter` → `BaseTunerLayer.set_adapter`
* `PeftModel.add_adapter` → `BaseTuner.inject_adapter` (4 phases) → `cast_adapter_dtype`

Every node was read out of the actual source at `huggingface/peft@91ca7945`
(the `origin/main` at the time of writing). Line numbers match that commit and
every node links to GitHub.

## Reading order

The graph is layered into **columns** (one per call depth) and **four
swimlanes**, so it reads left→right instead of as a hairball:

| lane | what it covers |
|---|---|
| `set_adapter` | switching the active adapter(s), down to per-layer `_active_adapter` |
| `add_adapter` | injection: PREP → MATCH & CREATE → CHECKS → HOUSEKEEPING |
| shared | auxiliary wrappers, `_mark_only_adapters_as_trainable`, dtype casting |
| **model state** | *what actually gets mutated*, split into base-model state and per-adapter entries |

The two flows meet in exactly one place: `inject_adapter` finishes by calling
`set_adapter` again (`tuners_utils.py:1142`) — drawn as a purple dashed
cross-flow edge.

## Where state is actually mutated

A **halo** around a node means that call mutates state. Mutation edges are
dashed: **red = base model** (weights / module graph / flags), **teal = adapter
entries**. The bottom lane holds the targets:

* `base_layer.weight` — `unmerge()` subtracts ΔW, `merge()` adds it
  (`lora/layer.py:1093` / `:1024`). `set_adapter` unmerges any layer that is
  already merged, so switching adapters can rewrite base weights.
* `module graph` — `_replace_module` swaps the child via `setattr` (`tuners_utils.py:1276`)
* `nn.Parameter wrappers` — `ParamWrapper` parametrizations for `target_parameters`
* `base params · requires_grad` — `_mark_only_adapters_as_trainable`
* `FSDP2 parameter sharding` — `set_adapter` reshards first (`peft_model.py:1746`)
* `lora_A / lora_B [adapter]` — the "add to the param dict" step (`lora/layer.py:263`)
* `per-adapter scalar dicts` — `r`, `lora_alpha`, `scaling`, `lora_dropout`, …
* `adapter params · requires_grad`, `layer._active_adapter`
* `modules_to_save[adapter]` — full module copies per adapter (`other.py:653`)
* `adapter param dtype / device` — `cast_adapter_dtype` upcasts to fp32
* `peft_config[adapter]` — registered on add, deleted again on failure

## Semantic zoom

| zoom | revealed |
|---|---|
| ≤ 0.55 | levels 1–2: entry points, branches, calls (+ phase boxes, + mutation targets) |
| ≥ 0.55 | + level 3: guards, warnings, snapshot logic, phase internals |
| ≥ 1.0 | + level 4: LoRA internals (`_create_and_replace`, `update_layer`, `_create_new_module`) |

When detail is hidden the surviving nodes stay connected through dotted
**bridge** edges, so nothing looks truncated.

## Controls

| gesture | effect |
|---|---|
| wheel / pinch | zoom — more detail appears as you zoom in |
| drag node | move it (saved in `localStorage`) |
| click node | detail panel: source link, signature, what it does, watch-outs, calls in/out, mutations, your own notes |
| double-click | focus neighbourhood (note nodes: rename) |
| click lane title | collapse / expand that entire lane, then **Fit** |
| Connect / Note modes | draw your own edges, drop note nodes |
| `V` `C` `N` `F` `L` `/` | select / connect / note / fit / re-layout / search |

**Export JSON** writes the whole graph (baseline + your additions) as a
self-contained snapshot; **Import** reads it back losslessly. **PNG** exports the
complete graph at 2×. Note that in the embedded Space iframe, browser downloads
may be blocked by the embedding page — open the Space in its own tab if a
download does not start.

## Source of truth

`graph-data.js` holds the whole dataset (nodes + edges with `col`/`row`/`tier`
layout hints, `file`/`line` refs and prose notes); the viewer derives everything
else from it. `window.__flow` exposes `cy`, `snapshot()`, `relayout()` and a
small scripted API from the console.
