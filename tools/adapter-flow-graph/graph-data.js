/* ============================================================================
 * PEFT flow graph dataset — set_adapter / add_adapter
 *
 * Extracted by reading the actual source of huggingface/peft @ 91ca7945
 * (= origin/main). Line numbers below match that commit.
 *
 * Geometry: x = col * COL_W, y = laneTop[lane] + row * ROW_H.
 * tier: 1 = landmark (visible when zoomed out), 2 = call level, 3 = internals.
 * ==========================================================================*/
window.PEFT_FLOW = {

  meta: {
    title: "PEFT — set_adapter / add_adapter call flow",
    repo: "huggingface/peft",
    ref: "91ca7945",
    refUrl: "https://github.com/huggingface/peft/tree/91ca7945",
    note: "Line numbers are from the commit above. Everything here was read out of the source, not from docs.",
  },

  geo: { COL_W: 320, ROW_H: 92, LANE_GAP: 150, LANE_PAD: 140 },

  lanes: [
    { id: "set",     label: "set_adapter — switch the active adapter(s)", color: "#3b82f6" },
    { id: "add",     label: "add_adapter — inject a new adapter",         color: "#f59e0b" },
    { id: "shared",  label: "shared helpers & wrapper layers",            color: "#a855f7" },
    { id: "mut",     label: "model state — what actually gets mutated",   color: "#fb7185" },
  ],

  /* ---------------------------------------------------------------- nodes */
  nodes: [

  /* ======================= LANE: set_adapter ========================= */
  {
    id: "s_entry", lane: "set", col: 0, row: 0, tier: 1, kind: "entry",
    label: "PeftModel.set_adapter", sub: "peft_model.py:1699",
    file: "src/peft/peft_model.py", line: 1699,
    sig: "set_adapter(self, adapter_name: str, inference_mode: bool = False) -> None",
    does: [
      "Raises ValueError if adapter_name is not in self.peft_config.",
      "Reshards FSDP2 modules, then sets self.active_adapter = adapter_name on the PeftModel.",
      "Forks: prompt-learning adapters go through _set_adapter here; everything else is delegated to the tuner.",
    ],
    watch: [
      "There are two different active_adapter attributes: PeftModel.active_adapter (plain attribute) and BaseTuner.active_adapter. set_adapter keeps them in sync; the layer-level _active_adapter is a third one.",
      "inference_mode=True is not just 'don't unfreeze' — it actively freezes the activated adapter.",
    ],
  },
  {
    id: "s_guard", lane: "set", col: 1, row: -1, tier: 3, kind: "guard",
    label: "unknown adapter → ValueError", sub: "peft_model.py:1714",
    file: "src/peft/peft_model.py", line: 1714,
    sig: 'if adapter_name not in self.peft_config: raise ValueError(f"Adapter {adapter_name} not found.")',
    does: ["Cheapest possible failure: the adapter must have been added or loaded first."],
  },
  {
    id: "s_fsdp", lane: "set", col: 1, row: 0, tier: 2, kind: "method",
    label: "_reshard_fsdp_modules()", sub: "peft_model.py:1746",
    file: "src/peft/peft_model.py", line: 1746,
    does: [
      "No-op unless FSDP2 modules are present.",
      "Reshards so the requires_grad flips below land on the sharded parameters, not on gathered copies.",
      "Skips FSDP modules that shard parameters of a merged tuner layer — resharding drops weights merged into them.",
    ],
  },
  {
    id: "s_attr", lane: "set", col: 1, row: 1, tier: 2, kind: "method",
    label: "self.active_adapter = adapter_name", sub: "peft_model.py:1717",
    file: "src/peft/peft_model.py", line: 1717,
    does: ["Sets the PeftModel-level attribute, which drives active_peft_config and forward-time bookkeeping."],
  },
  {
    id: "s_branch", lane: "set", col: 1, row: 2, tier: 1, kind: "branch",
    label: "is_prompt_learning ?", sub: "peft_model.py:1718",
    file: "src/peft/peft_model.py", line: 1718,
    sig: "if not self.peft_config[adapter_name].is_prompt_learning: … else: …",
    does: [
      "False → tuner path (LoRA, IA³, OFT, …): BaseTuner.set_adapter.",
      "True → prompt path: the comment in the source says _set_adapter does not need to be called there because it runs through BaseTuner.",
    ],
  },
  {
    id: "s_prompt", lane: "set", col: 2, row: 2, tier: 1, kind: "method",
    label: "_set_adapter(self, …)", sub: "other.py:1171",
    file: "src/peft/utils/other.py", line: 1171,
    does: [
      "Prompt learning has no tuner layers, so the PeftModel itself is scanned for auxiliary wrappers.",
    ],
  },
  {
    id: "s_base", lane: "set", col: 2, row: 0.5, tier: 1, kind: "method",
    label: "BaseTuner.set_adapter", sub: "tuners_utils.py:1358",
    file: "src/peft/tuners/tuners_utils.py", line: 1358,
    sig: "set_adapter(self, adapter_name: str | list[str], inference_mode: bool = False) -> None",
    does: [
      "Delegates to the module-level helper set_adapter() with layer_cls=self.tuner_layer_cls (so subclasses can scope the sweep).",
      "Then records the tuner-level self.active_adapter = adapter_name.",
    ],
    watch: ["Order matters: layers are switched first, the tuner attribute is updated last."],
  },
  {
    id: "s_tattr", lane: "set", col: 3, row: -0.6, tier: 3, kind: "method",
    label: "self.active_adapter = adapter_name", sub: "tuners_utils.py:1370",
    file: "src/peft/tuners/tuners_utils.py", line: 1370,
    does: ["Tuner-level bookkeeping, read by inject_adapter and _mark_only_adapters_as_trainable."],
  },
  {
    id: "s_modfn", lane: "set", col: 3, row: 0.5, tier: 1, kind: "method",
    label: "set_adapter(model, adapter_name, …)", sub: "tuners_utils.py:2622",
    file: "src/peft/tuners/tuners_utils.py", line: 2622,
    sig: "set_adapter(model, adapter_name, inference_mode=False, layer_cls=BaseTunerLayer)",
    does: [
      "Order: FIRST call _set_adapter() for auxiliary wrappers (modules_to_save, trainable tokens), THEN sweep the tuner layers.",
      "Public entry point too: functional.py and add_adapter's bookkeeping both call it.",
    ],
  },
  {
    id: "s_auxcall", lane: "set", col: 4, row: -0.6, tier: 2, kind: "method",
    label: "_set_adapter(model, …)", sub: "other.py:1171",
    file: "src/peft/utils/other.py", line: 1171,
    does: ["Walks the model for AuxiliaryTrainingWrapper instances only — tuner layers are handled by the caller."],
  },
  {
    id: "s_loop", lane: "set", col: 4, row: 0.7, tier: 2, kind: "method",
    label: "for module in model.modules()", sub: "tuners_utils.py:2644",
    file: "src/peft/tuners/tuners_utils.py", line: 2644,
    does: [
      "isinstance(module, layer_cls) — subclasses (e.g. LoraModel) pass their own layer class to avoid touching foreign layers.",
    ],
    watch: ["A model could in principle nest two tuners; the layer_cls filter is what keeps them apart."],
  },
  {
    id: "s_merge", lane: "set", col: 5, row: -0.7, tier: 3, kind: "branch",
    label: "if module.merged → unmerge()", sub: "tuners_utils.py:2646",
    file: "src/peft/tuners/tuners_utils.py", line: 2646,
    does: ['Warns "Adapter cannot be set when the model is merged. Unmerging the model first." then unmerges that layer.'],
  },
  {
    id: "s_layer", lane: "set", col: 5, row: 1.0, tier: 1, kind: "method",
    label: "BaseTunerLayer.set_adapter", sub: "tuners_utils.py:2052",
    file: "src/peft/tuners/tuners_utils.py", line: 2052,
    sig: "set_adapter(self, adapter_names: str | list[str], inference_mode: bool = False) -> None",
    does: [
      "For every name in adapter_layer_names: for key, layer in module_dict.items() → _set_layer_requires_grad(layer, key in adapter_names and not inference_mode).",
      "So one pass both unfreezes newly active adapters and freezes the others.",
      "Then re-applies per-variant freeze declarations, and finally sets self._active_adapter = adapter_names.",
    ],
    watch: [
      "_active_adapter is a property with no setter — the source comment says use set_adapter rather than assigning it directly.",
    ],
  },
  {
    id: "s_auxwrap", lane: "set", col: 5, row: 3.0, tier: 1, kind: "layer",
    label: "AuxiliaryTrainingWrapper.set_adapter", sub: "other.py:528",
    file: "src/peft/utils/other.py", line: 528,
    does: [
      "Base class (other.py:528) only moves _active_adapter, and validates that list-form names exist.",
      "ModulesToSaveWrapper (:707) additionally swaps which saved module copy is forwarded and fixes requires_grad.",
      "TrainableTokens (:991) forwards to token_adapter.set_adapter.",
    ],
  },
  {
    id: "s_grad", lane: "set", col: 6, row: 0.5, tier: 2, kind: "method",
    label: "_set_layer_requires_grad(layer, bool)", sub: "other.py:284",
    file: "src/peft/utils/other.py", line: 284,
    does: ["Tiny helper that sets requires_grad on all parameters of one adapter's sub-module."],
  },
  {
    id: "s_freeze", lane: "set", col: 6, row: 1.7, tier: 2, kind: "method",
    label: "_freeze_non_trainable_peft_weights(names)", sub: "tuners_utils.py:2026",
    file: "src/peft/tuners/tuners_utils.py", line: 2026,
    does: [
      "Re-applies the frozen_peft_weight_names declarations after the blanket requires_grad pass above.",
      "Exists because some variants intentionally train only a subset of their adapter weights.",
    ],
  },
  {
    id: "s_active", lane: "set", col: 6, row: 2.9, tier: 2, kind: "method",
    label: "self._active_adapter = names", sub: "tuners_utils.py:2075",
    file: "src/peft/tuners/tuners_utils.py", line: 2075,
    does: ["The layer-level truth used by forward(): which adapter weights participate."],
  },
  {
    id: "s_check", lane: "set", col: 6, row: 4.3, tier: 2, kind: "method",
    label: "check_set_adapter(name) → name | None", sub: "other.py:521",
    file: "src/peft/utils/other.py", line: 521,
    does: [
      "Per-wrapper filter: does this wrapper even hold an adapter with that name?",
      "Returning None/falsy makes _set_adapter call set_adapter([]), i.e. deliberately switch the wrapper off.",
    ],
  },

  /* ======================= LANE: add_adapter ========================= */
  {
    id: "a_entry", lane: "add", col: 0, row: 0.4, tier: 1, kind: "entry",
    label: "PeftModel.add_adapter", sub: "peft_model.py:1103",
    file: "src/peft/peft_model.py", line: 1103,
    sig: "add_adapter(self, adapter_name, peft_config, low_cpu_mem_usage=False, autocast_adapter_dtype=True)",
    does: [
      "Registers the config, then either sets up prompt-learning machinery or delegates injection to the tuner.",
      "The new adapter is NOT activated — call set_adapter afterwards for that.",
      "On any exception it rolls the config entry back and re-raises.",
    ],
    watch: ["autocast_adapter_dtype=True at the end upcasts fp16/bf16 adapter weights to fp32 — see the note node."],
  },
  {
    id: "a_gpm", lane: "add", col: 0, row: -4.8, tier: 3, kind: "entry",
    label: "get_peft_model / inject_adapter_in_model", sub: "mapping.py:47",
    file: "src/peft/mapping.py", line: 47,
    does: [
      "Does not call add_adapter at all: it constructs the tuner, whose __init__ (tuners_utils.py:344) calls inject_adapter directly.",
      "That is why the 'first injection' case inside inject_adapter freezes the base model instead of restoring trainability.",
    ],
  },
  {
    id: "a_init", lane: "add", col: 0, row: -3.0, tier: 3, kind: "entry",
    label: "PeftModel.__init__ (prompt path)", sub: "peft_model.py:185",
    file: "src/peft/peft_model.py", line: 185,
    does: ["For prompt-learning configs the constructor sets self.base_model = model and then calls self.add_adapter(...)."],
  },
  {
    id: "a_load", lane: "add", col: 0, row: -1.4, tier: 2, kind: "entry",
    label: "PeftModel.load_adapter", sub: "peft_model.py:1580",
    file: "src/peft/peft_model.py", line: 1580,
    does: [
      "The most common real-world caller of add_adapter.",
      "Sets peft_config.inference_mode = not is_trainable before calling add_adapter.",
      "If is_trainable, calls set_requires_grad(adapter_name) afterwards, because add_adapter leaves the new adapter frozen.",
    ],
  },
  {
    id: "a_task", lane: "add", col: 0, row: 2.2, tier: 2, kind: "entry",
    label: "PeftModelFor*.add_adapter overrides", sub: "peft_model.py:1978",
    file: "src/peft/peft_model.py", line: 1978,
    does: [
      "SequenceClassification / TokenClassification / QuestionAnswering override add_adapter.",
      "They call _add_modules_to_save(peft_config, ['classifier', 'score']) first, so each new adapter gets its own head copy.",
      "Then super().add_adapter(...).",
    ],
  },
  {
    id: "a_mixed", lane: "add", col: 0, row: 3.8, tier: 3, kind: "entry",
    label: "PeftMixedModel.add_adapter", sub: "mixed_model.py:203",
    file: "src/peft/mixed_model.py", line: 203,
    does: ["Parallel implementation for mixed adapter types; its set_adapter (mixed_model.py:269) mirrors PeftModel.set_adapter."],
  },
  {
    id: "a_guard", lane: "add", col: 1, row: -1.0, tier: 2, kind: "guard",
    label: "name / type checks", sub: "peft_model.py:1134",
    file: "src/peft/peft_model.py", line: 1134,
    does: [
      "Duplicate adapter_name → ValueError.",
      "adapter_name contained in the method prefix → warning about possible weight re-initialization on load.",
      "peft_config.peft_type != self.peft_type → ValueError ('Cannot combine adapters with different peft types').",
    ],
  },
  {
    id: "a_branch", lane: "add", col: 1, row: 0.8, tier: 1, kind: "branch",
    label: "prompt / adaption_prompt / else", sub: "peft_model.py:1150",
    file: "src/peft/peft_model.py", line: 1151,
    does: [
      "is_prompt_learning → prompt encoder setup.",
      "is_adaption_prompt → delegate to the tuner's own add_adapter.",
      "else → the tuner injects layers (the interesting path).",
    ],
  },
  {
    id: "a_prompt", lane: "add", col: 2, row: -0.8, tier: 2, kind: "method",
    label: "prompt encoder setup", sub: "peft_model.py:1153",
    file: "src/peft/peft_model.py", line: 1153,
    does: [
      "Stores the config, then _prepare_prompt_learning_config (other.py:1186) fills num_layers / token_dim / hidden_size from the model config.",
      "_setup_prompt_encoder(adapter_name) (peft_model.py:661) creates the prompt embeddings.",
      "set_additional_trainable_modules(..., activate_adapter default True) — prompt adapters are activated immediately.",
    ],
  },
  {
    id: "a_adapt", lane: "add", col: 2, row: 0.7, tier: 3, kind: "method",
    label: "base_model.add_adapter(...)", sub: "adaption_prompt/model.py:62",
    file: "src/peft/tuners/adaption_prompt/model.py", line: 62,
    does: [
      "Adaption prompt keeps its modules outside the normal injection path, so the tuner owns an add_adapter of its own.",
      "Followed by set_additional_trainable_modules for the same adapter name.",
    ],
  },
  {
    id: "a_inject", lane: "add", col: 2, row: 2.2, tier: 1, kind: "method",
    label: "BaseTuner.inject_adapter", sub: "tuners_utils.py:799",
    file: "src/peft/tuners/tuners_utils.py", line: 799,
    sig: "inject_adapter(self, model, adapter_name, autocast_adapter_dtype=True, low_cpu_mem_usage=False, state_dict=None)",
    does: [
      "The single most complex function in this graph — four phases, all inside one body.",
      "Called as:self.base_model.inject_adapter(self.base_model.model, adapter_name, low_cpu_mem_usage=…)",
      "state_dict (when given) is used only for its KEYS: it decides which modules get adapted when target_modules is unknown.",
    ],
    watch: ["All checks are deliberately front-loaded so a failure leaves the model untouched."],
  },

  /* --- phase 1: PREPARATION OF MODEL AND CONFIG --- */
  {
    id: "a_p1", lane: "add", col: 3, row: -3.4, tier: 1, kind: "band",
    label: "PHASE 1 · preparation of model and config", sub: "tuners_utils.py:829",
  },
  {
    id: "a_p1_conv", lane: "add", col: 3, row: -2.6, tier: 3, kind: "method",
    label: "transformers v5 config conversion", sub: "tuners_utils.py:832",
    file: "src/peft/tuners/tuners_utils.py", line: 832,
    does: [
      "Only when the transformers version is ≥5 and the target looks like a transformers model.",
      "Rewrites the PEFT config in place via convert_peft_config_for_transformers so v4-trained adapters still hit the right layers (e.g. renamed MoE layers in Mixtral).",
      "Runs first, before peft_config is even read into a local.",
    ],
  },
  {
    id: "a_p1_cfg", lane: "add", col: 3, row: -1.5, tier: 2, kind: "method",
    label: "_check_new_adapter_config(cfg)", sub: "tuners_utils.py:603",
    file: "src/peft/tuners/tuners_utils.py", line: 603,
    does: [
      "No-op while there is only one adapter.",
      "Otherwise: only one adapter in the tuner may have bias != 'none'.",
    ],
  },
  {
    id: "a_p1_tie", lane: "add", col: 3, row: -0.5, tier: 3, kind: "method",
    label: "_check_tied_modules(model, cfg)", sub: "tuners_utils.py:1424",
    file: "src/peft/tuners/tuners_utils.py", line: 1424,
    does: [
      "Detects layers that are weight-tied to an embedding layer and targeted by modules_to_save / target_modules.",
      "Updates the config in place (modules_to_tie / target_modules_to_tie) so the tie is honoured later.",
    ],
  },
  {
    id: "a_p1_prep", lane: "add", col: 3, row: 0.6, tier: 2, kind: "tuner",
    label: "_prepare_adapter_config", sub: "tuners_utils.py:869",
    file: "src/peft/tuners/tuners_utils.py", line: 869,
    does: [
      "Tuner-specific config fix-up, given the model config dict.",
      "LoRA (lora/model.py:695) infers default target_modules from model_type; IA³ (:196) does the same plus feedforward_modules.",
    ],
  },
  {
    id: "a_p1_model", lane: "add", col: 3, row: 1.7, tier: 2, kind: "tuner",
    label: "_prepare_model(cfg, model)", sub: "tuners_utils.py:420",
    file: "src/peft/tuners/tuners_utils.py", line: 420,
    does: ["Tuner-specific model prep that must happen before module replacement (e.g. gradient-checkpointing flags)."],
  },
  {
    id: "a_p1_snap", lane: "add", col: 3, row: 2.8, tier: 3, kind: "method",
    label: "snapshot existing requires_grad", sub: "tuners_utils.py:882",
    file: "src/peft/tuners/tuners_utils.py", line: 882,
    does: [
      "Records (parameter, requires_grad) for every parameter not belonging to this adapter.",
      "Restored in phase 4, so adding an adapter never changes the trainability of pre-existing weights.",
      "Deliberately skipped when no tuner layer exists yet (first injection) → base model gets frozen instead.",
    ],
  },
  {
    id: "a_p1_lin", lane: "add", col: 3, row: 3.8, tier: 3, kind: "method",
    label: "_maybe_include_all_linear_layers", sub: "tuners_utils.py:909",
    file: "src/peft/tuners/tuners_utils.py", line: 909,
    does: ["Expands 'all-linear' into the concrete list of linear module suffixes for this model."],
  },
  {
    id: "a_p1_min", lane: "add", col: 3, row: 4.9, tier: 3, kind: "method",
    label: "condense target_modules", sub: "tuners_utils.py:923",
    file: "src/peft/tuners/tuners_utils.py", line: 923,
    does: [
      "Only when the list has ≥ MIN_TARGET_MODULES_FOR_OPTIMIZATION entries and the method is not IA³.",
      "Replaces hundreds of entries by a minimal equivalent set (_find_minimal_target_modules) — the matching loop is O(modules × targets).",
    ],
    watch: ["Skipped for IA³ because target_modules and feedforward_modules are coupled (see #2429)."],
  },

  /* --- phase 2: MATCHING & CREATING MODULES --- */
  {
    id: "a_p2", lane: "add", col: 4, row: -3.4, tier: 1, kind: "band",
    label: "PHASE 2 · matching & creating modules", sub: "tuners_utils.py:936",
  },
  {
    id: "a_p2_loop", lane: "add", col: 4, row: -2.6, tier: 2, kind: "method",
    label: "for key, module in named_modules()", sub: "tuners_utils.py:948-956",
    file: "src/peft/tuners/tuners_utils.py", line: 948,
    does: [
      "Skips the empty top-level key.",
      "Skips any key that lies under an existing adapter prefix, so a second adapter never rewrites an existing adapter's internals.",
    ],
  },
  {
    id: "a_p2_match", lane: "add", col: 4, row: -1.3, tier: 2, kind: "method",
    label: "_check_target_module_exists(cfg, key)", sub: "tuners_utils.py:960",
    file: "src/peft/tuners/tuners_utils.py", line: 960,
    does: [
      "Truthy → targeted; _ExcludedModule → collected as excluded; falsy → collected as unmatched.",
      "Handles target_modules / layers_to_transform / layers_pattern / exclude_modules semantics.",
    ],
    watch: ["LoraModel overrides this (lora/model.py:450) to also deal with target_parameters and tied modules."],
  },
  {
    id: "a_p2_tied", lane: "add", col: 4, row: -0.1, tier: 2, kind: "method",
    label: "tied layer? → defer", sub: "tuners_utils.py:965",
    file: "src/peft/tuners/tuners_utils.py", line: 965,
    does: [
      "A tied layer is not injected in the main loop; its key goes to targets_to_tie.",
      "Only the source layer (e.g. embed_tokens) is adapted in this pass.",
    ],
  },
  {
    id: "a_p2_sub", lane: "add", col: 4, row: 1.1, tier: 3, kind: "method",
    label: "_get_submodules + compatibility check", sub: "tuners_utils.py:974",
    file: "src/peft/tuners/tuners_utils.py", line: 974,
    does: [
      "_get_submodules(model, key) resolves (parent, target, target_name) — the parent is needed to swap the child in place.",
      "_check_target_module_compatiblity rejects known-bad targets (e.g. LoRA on Mamba blocks).",
    ],
  },
  {
    id: "a_p2_ctx", lane: "add", col: 4, row: 2.1, tier: 3, kind: "method",
    label: "init_empty_weights() if low_cpu_mem_usage", sub: "tuners_utils.py:976",
    file: "src/peft/tuners/tuners_utils.py", line: 976,
    does: ["Wraps creation in a meta-device context, so new adapter weights allocate no memory until loaded."],
  },
  {
    id: "a_p2_car", lane: "add", col: 4, row: 3.2, tier: 1, kind: "tuner",
    label: "_create_and_replace(…)", sub: "tuners_utils.py:978",
    file: "src/peft/tuners/tuners_utils.py", line: 978,
    does: [
      "The actual 'make this module into an adapter layer' hook. Every tuner implements it (LoRA, IA³, OFT, LoHa, …).",
      "Receives peft_config, adapter_name, target, target_name, parent, current_key — and parameter_name when an nn.Parameter is targeted.",
    ],
    watch: ["Most per-method differences in this whole flow live behind this one hook."],
  },
  {
    id: "a_p2_lora", lane: "add", col: 4, row: 4.4, tier: 4, kind: "tuner",
    label: "LoraModel._create_and_replace", sub: "lora/model.py:294",
    file: "src/peft/tuners/lora/model.py", line: 294,
    does: [
      "Resolves r / alpha per layer via rank_pattern and alpha_pattern (get_pattern_key).",
      "Builds tied_adapter references for target_modules_to_tie.",
      "Collects quantisation flags (loaded_in_4bit/8bit, gptq/aqlm/awq configs, torchao subclass hook).",
      "Existing LoraLayer (and not AdaLora, not a ParamWrapper that needs nesting) → update_layer in place; otherwise → _create_new_module.",
    ],
  },
  {
    id: "a_p2_upd", lane: "add", col: 4, row: 5.6, tier: 4, kind: "layer",
    label: "LoraLayer.update_layer", sub: "lora/layer.py:219",
    file: "src/peft/tuners/lora/layer.py", line: 219,
    does: [
      "Per-adapter dict entries: r, lora_alpha, dropout, use_rslora, use_dora, lora_bias.",
      "Creates lora_A (in→r) and lora_B (r→out) nn.Linear, no bias by default.",
      "scaling = alpha / r, or alpha / sqrt(r) with rsLoRA.",
      "Runs the chosen init: pissa* / corda* / astra* / olora / mica / loftq, otherwise default kaiming.",
      "Ends by moving the new adapter to the base layer's device/dtype.",
    ],
    watch: [
      "This is the function that makes 'adding a 2nd adapter to the same layer' cheap — it mutates the existing layer instead of replacing it.",
    ],
  },
  {
    id: "a_p2_new", lane: "add", col: 4, row: 6.8, tier: 4, kind: "tuner",
    label: "LoraModel._create_new_module → _replace_module", sub: "lora/model.py:499",
    file: "src/peft/tuners/lora/model.py", line: 499,
    does: [
      "Dispatches on the target's class (Linear / Embedding / Conv2d / MultiheadAttention / custom dispatch callbacks).",
      "Wraps the original module as base_layer and returns the adapter layer.",
      "_replace_module swaps the child on the parent and then aligns device/dtype.",
    ],
  },
  {
    id: "a_p2_par", lane: "add", col: 4, row: 8.0, tier: 3, kind: "method",
    label: "_inject_parameters (target_parameters)", sub: "tuners_utils.py:1156",
    file: "src/peft/tuners/tuners_utils.py", line: 1156,
    does: [
      "Separate path for nn.Parameter targets (e.g. MoE expert weights): wraps the owning module in lora.ParamWrapper.",
      "Reuses an existing ParamWrapper for the same parameter instead of nesting a new one.",
      "Rejects parameters registered directly on the top-level module (would create a cyclic module graph).",
    ],
  },
  {
    id: "a_p2_tie2", lane: "add", col: 4, row: 9.2, tier: 3, kind: "method",
    label: "inject deferred tied targets", sub: "tuners_utils.py:1016",
    file: "src/peft/tuners/tuners_utils.py", line: 1016,
    does: ["Second pass over targets_to_tie, now that the source embedding layer has its adapter references."],
  },

  /* --- phase 3: CHECKS --- */
  {
    id: "a_p3", lane: "add", col: 5, row: -3.4, tier: 1, kind: "band",
    label: "PHASE 3 · checks & diagnostics", sub: "tuners_utils.py:1024",
  },
  {
    id: "a_p3_sd", lane: "add", col: 5, row: -2.6, tier: 3, kind: "method",
    label: "state_dict vs config mismatch", sub: "tuners_utils.py:1028",
    file: "src/peft/tuners/tuners_utils.py", line: 1028,
    does: ["If a state_dict drove matching, compares the resulting set against what the config would have matched and warns on the diff."],
  },
  {
    id: "a_p3_err", lane: "add", col: 5, row: -1.4, tier: 2, kind: "guard",
    label: "NoMatchingPeftModuleError", sub: "tuners_utils.py:1051",
    file: "src/peft/tuners/tuners_utils.py", line: 1051,
    does: [
      "Raised when nothing was targeted, in four flavours: all modules excluded; no target_modules and no target_parameters; nothing matched; matched-and-excluded combination.",
      "Adds hints when layers_to_transform / layers_pattern are set.",
      "Skipped entirely for DUMMY_TARGET_MODULES (meta-device dummy adapters).",
    ],
  },
  {
    id: "a_p3_excl", lane: "add", col: 5, row: 0.2, tier: 3, kind: "guard",
    label: "exclude_modules unused → warning", sub: "tuners_utils.py:1088",
    file: "src/peft/tuners/tuners_utils.py", line: 1088,
    does: ["You passed exclude_modules but nothing was actually excluded — almost always a typo."],
  },
  {
    id: "a_p3_nomatch", lane: "add", col: 5, row: 1.4, tier: 3, kind: "guard",
    label: "target_modules matched nothing → warning", sub: "tuners_utils.py:1100",
    file: "src/peft/tuners/tuners_utils.py", line: 1100,
    does: ["RuntimeWarning when something was adapted overall, but this particular list matched no module/parameter."],
  },
  {
    id: "a_p3_pat", lane: "add", col: 5, row: 2.6, tier: 3, kind: "guard",
    label: "rank/alpha_pattern unused → warning", sub: "tuners_utils.py:1113",
    file: "src/peft/tuners/tuners_utils.py", line: 1113,
    does: ["Reports pattern keys that matched no targeted module or parameter (same matching semantics as get_pattern_key)."],
  },

  /* --- phase 4: HOUSEKEEPING --- */
  {
    id: "a_p4", lane: "add", col: 6, row: -3.4, tier: 1, kind: "band",
    label: "PHASE 4 · housekeeping", sub: "tuners_utils.py:1130",
  },
  {
    id: "a_p4_ext", lane: "add", col: 6, row: -2.6, tier: 3, kind: "method",
    label: "_extend_unique(targeted_*_names)", sub: "tuners_utils.py:1132",
    file: "src/peft/tuners/tuners_utils.py", line: 1132,
    does: ["Merges this adapter's matches into the tuner-level bookkeeping, deduplicated, only after all checks passed."],
  },
  {
    id: "a_p4_set", lane: "add", col: 6, row: -1.4, tier: 1, kind: "method",
    label: "self.set_adapter(self.active_adapters, …)", sub: "tuners_utils.py:1142",
    file: "src/peft/tuners/tuners_utils.py", line: 1142,
    does: [
      "The join point between the two flows: injection ends by re-applying the *current* active adapters.",
      "Reason (source comment): if a 2nd adapter targets different layers than the active one, those extra layers would otherwise end up activated.",
      "Passes inference_mode=peft_config.inference_mode so a frozen (loaded, non-trainable) adapter stays frozen.",
    ],
    watch: ["This is why add_adapter alone never activates the new adapter — active_adapters is still the old set here."],
  },
  {
    id: "a_p4_mark", lane: "add", col: 6, row: -0.2, tier: 2, kind: "method",
    label: "_mark_only_adapters_as_trainable", sub: "tuners_utils.py:506",
    file: "src/peft/tuners/tuners_utils.py", line: 506,
    does: [
      "Freezes every parameter that is not an adapter parameter; auxiliary wrappers manage their own requires_grad and are skipped.",
      "Then re-enables bias parameters according to the active adapters' bias setting ('all', 'lora_only', …).",
      "Finally calls _freeze_non_trainable_peft_weights() on each tuner layer.",
    ],
    watch: ["Overridden by several tuners (LoraModel, Shadow, TinyLora, mixed/model.py) with their own notion of 'adapter parameter'."],
  },
  {
    id: "a_p4_addtm", lane: "add", col: 6, row: 1.0, tier: 2, kind: "method",
    label: "set_additional_trainable_modules(…)", sub: "other.py:1570",
    file: "src/peft/utils/other.py", line: 1570,
    does: [
      "activate_adapter = (adapter_name in self.active_adapters) — usually False right after add_adapter.",
      "Handles modules_to_save, modules_to_tie and trainable_token_indices.",
    ],
  },
  {
    id: "a_p4_rest", lane: "add", col: 6, row: 2.2, tier: 3, kind: "method",
    label: "restore requires_grad snapshot", sub: "tuners_utils.py:1153",
    file: "src/peft/tuners/tuners_utils.py", line: 1153,
    does: ["Writes back the phase-1 snapshot, so pre-existing parameters keep exactly the trainability they had."],
  },
  {
    id: "a_cast", lane: "add", col: 7, row: 0.4, tier: 1, kind: "method",
    label: "_cast_adapter_dtype → cast_adapter_dtype", sub: "tuners_utils.py:2712",
    file: "src/peft/tuners/tuners_utils.py", line: 2712,
    does: [
      "Called by PeftModel.add_adapter after injection returns (and again by BaseTuner/PeftModel on load).",
      "Upcasts fp16 / bf16 / low-precision-float adapter weights to fp32 for stable training.",
      "Touches ModuleDict, ParameterDict and BufferDict entries; reassigns rather than mutating .data because DTensor-backed (TP) params keep the local shard dtype otherwise.",
    ],
    watch: ["Skipped when autocast_adapter_dtype=False."],
  },
  {
    id: "a_rollback", lane: "add", col: 7, row: 2.0, tier: 2, kind: "branch",
    label: "except → roll back", sub: "peft_model.py:1174",
    file: "src/peft/peft_model.py", line: 1174,
    does: ["Deletes self.peft_config[adapter_name] again and re-raises, so a failed add leaves no half-registered adapter."],
    watch: ["The model itself is not rolled back — partially injected layers stay. Injection deliberately front-loads its checks to make this rare."],
  },

  /* ======================= LANE: shared ========================= */
  {
    id: "sh_addtm", lane: "shared", col: 0, row: 0, tier: 1, kind: "method",
    label: "set_additional_trainable_modules", sub: "other.py:1570",
    file: "src/peft/utils/other.py", line: 1570,
    sig: "set_additional_trainable_modules(model, peft_config, model_config, adapter_name, activate_adapter=True)",
    does: [
      "Routes to _set_trainable for modules_to_save, then modules_to_tie (must run after modules_to_save), then trainable_token_indices.",
      "Creates the wrapper if absent, else .update(adapter_name) on the existing one — the same add-another-adapter pattern as LoraLayer.update_layer.",
      "Refuses to have the same embedding layer both fully trained (modules_to_save) and token-trained (trainable_tokens).",
    ],
  },
  {
    id: "sh_m2s", lane: "shared", col: 1, row: -0.9, tier: 2, kind: "layer",
    label: "ModulesToSaveWrapper", sub: "other.py:598",
    file: "src/peft/utils/other.py", line: 598,
    does: [
      "Holds one full copy of the wrapped module per adapter name in a ModuleDict and forwards to the active one.",
      "Used for trainable heads/lm_head; its set_adapter picks the copy, which is why classifiers are per-adapter.",
    ],
  },
  {
    id: "sh_tt", lane: "shared", col: 1, row: 0.7, tier: 2, kind: "layer",
    label: "TrainableTokensWrapper", sub: "other.py:900",
    file: "src/peft/utils/other.py", line: 900,
    does: [
      "Wraps an embedding and adds a trainable_tokens_delta parameter per adapter.",
      "Only one adapter can be set at a time for a given wrapper — check_set_adapter enforces it.",
    ],
  },
  {
    id: "sh_mark", lane: "shared", col: 0, row: 2.2, tier: 2, kind: "method",
    label: "_mark_only_adapters_as_trainable", sub: "tuners_utils.py:506",
    file: "src/peft/tuners/tuners_utils.py", line: 506,
    does: [
      "Determines adapter parameters structurally by walking tuner layers, not by name prefix matching.",
      "Reason given in the source: a base-model module whose name contains the prefix must not be mistaken for an adapter.",
    ],
  },
  {
    id: "sh_grad", lane: "shared", col: 1, row: 2.2, tier: 3, kind: "method",
    label: "_set_layer_requires_grad", sub: "other.py:284",
    file: "src/peft/utils/other.py", line: 284,
    does: ["The single point where requires_grad is actually written, used by set_adapter, enable_adapters and set_requires_grad."],
  },
  {
    id: "sh_cast", lane: "shared", col: 0, row: 3.6, tier: 3, kind: "method",
    label: "cast_adapter_dtype", sub: "tuners_utils.py:2712",
    file: "src/peft/tuners/tuners_utils.py", line: 2712,
    does: ["Free function behind _cast_adapter_dtype; iterates tuner layers and their Parameter/Module/Buffer dicts."],
  },
  {
    id: "sh_move", lane: "shared", col: 1, row: 4.4, tier: 3, kind: "method",
    label: "_move_adapter_to_device_of_base_layer", sub: "tuners_utils.py:2175",
    file: "src/peft/tuners/tuners_utils.py", line: 2175,
    does: [
      "Moves only the named adapter to the base layer's device, plus dtype when the base layer is float/complex.",
      "Skips integer parameters/buffers and meta-device entries.",
    ],
  },
  {
    id: "sh_pitfall", lane: "shared", col: 2, row: 3.4, tier: 3, kind: "note",
    label: "⚠ requires_grad can be lost on reassignment",
    does: [
      "Both cast_adapter_dtype (tuners_utils.py:2752) and _move_adapter_to_device_of_base_layer (:2217/:2219) write back through a ParameterDict.",
      "nn.ParameterDict.__setitem__ re-wraps any non-Parameter / plain tensor as Parameter(value), whose requires_grad defaults to True.",
      "Verified locally: d['a'] = d['a'].to(torch.float32) turns a requires_grad=False fp16 parameter into requires_grad=True fp32.",
    ],
    watch: [
      "Consequence: an adapter deliberately frozen (e.g. set_adapter(name, inference_mode=True) or a loaded non-trainable adapter) can come back trainable if a dtype/device cast reassigns its ParameterDict entry.",
      "The ModuleDict branch of cast_adapter_dtype (:2769) gets this right by passing requires_grad=param.requires_grad explicitly — BufferDict does not re-wrap at all.",
      "Only triggers when the cast actually changes something: tensor.to() returns the same object when device and dtype already match.",
    ],
  },

  /* ================= LANE: model state mutations ===================== */
  /* Red-ish nodes = the base model / nn.Module state. Teal nodes = per-adapter
     entries. These are the *targets*: the sub line names the operation that
     writes them, the panel lists every call site that does so. */

  {
    id: "mu_band_base", lane: "mut", col: 1, row: -0.9, tier: 1, kind: "band",
    label: "base model state — weights · module graph · flags", sub: "tuners_utils.py / lora/layer.py",
  },
  {
    id: "mu_band_adap", lane: "mut", col: 2, row: -0.9, tier: 1, kind: "band",
    label: "adapter state — per-adapter entries", sub: "written once per added adapter",
  },
  {
    id: "mu_mergepath", lane: "mut", col: 0, row: 0, tier: 3, kind: "entry",
    label: "merge_and_unload()", sub: "tuners_utils.py:742",
    file: "src/peft/tuners/tuners_utils.py", line: 742,
    does: [
      "Not a PeftModel method: PeftModel.__getattr__ (peft_model.py:994) forwards the call to the tuner.",
      "BaseTuner.merge_and_unload → _unload_and_optionally_merge (tuners_utils.py:679) → every layer's merge().",
      "Shown for symmetry with unmerge — this path is NOT reachable from set_adapter or add_adapter.",
    ],
    watch: ["The docstring is explicit that this is not in-place: it returns a new, unloaded model."],
  },
  {
    id: "mu_baseweight", lane: "mut", col: 1, row: 0, tier: 2, kind: "mutate-base",
    label: "base_layer.weight", sub: "lora/layer.py:1093 / :1024",
    file: "src/peft/tuners/lora/layer.py", line: 1093,
    does: [
      "unmerge() (:1093): weight.data -= delta_weight — subtracts the adapter's ΔW back out of the base weight. This is the mutation set_adapter triggers when a layer is already merged.",
      "merge() (:1024): weight.data += delta_weight on the unsafe path, or weight.data = orig_weight on the safe path (:1073), plus self.merged_adapters.append(adapter) (:1091).",
      "LoRA variants bypass this: variant.unmerge(...) returns a new tensor and merge_unsafe(...) writes the weight itself.",
      "base_layer.bias is mutated too whenever lora_bias=True.",
    ],
    watch: [
      "unmerge is a subtraction, not a saved snapshot: if anything else edits the base weight while a layer is merged, unmerge leaves the weight wrong.",
      "This is the only place in these two flows where real base-model weights change — everything else is flags, bookkeeping or new parameters.",
    ],
  },
  {
    id: "mu_modgraph", lane: "mut", col: 1, row: 1.1, tier: 2, kind: "mutate-base",
    label: "module graph (nn.Module tree)", sub: "tuners_utils.py:1276",
    file: "src/peft/tuners/tuners_utils.py", line: 1276,
    does: [
      "_replace_module does setattr(parent, child_name, new_module): the original layer survives as new_module.base_layer.",
      "The original weight tensor is shared, not copied — new_module.weight = child.weight (:1285).",
      "Happens once per targeted module, on the first adapter that touches it, under init_empty_weights if low_cpu_mem_usage.",
    ],
    watch: ["Adding a further adapter to an already-wrapped module does NOT re-replace it — update_layer mutates the existing layer instead."],
  },
  {
    id: "mu_paramw", lane: "mut", col: 1, row: 2.2, tier: 3, kind: "mutate-base",
    label: "nn.Parameter wrappers", sub: "tuners_utils.py:1156",
    file: "src/peft/tuners/tuners_utils.py", line: 1156,
    does: [
      "For target_parameters the owning module is wrapped in lora.ParamWrapper, which installs a torch parametrization on that parameter.",
      "ParamWrappers nest, so several parameters of the same module can each carry adapters.",
      "Parameters registered directly on the top-level module are rejected — the wrapper would end up as a child of the module it wraps (cyclic graph).",
    ],
  },
  {
    id: "mu_basereqgrad", lane: "mut", col: 1, row: 3.3, tier: 2, kind: "mutate-base",
    label: "base params · requires_grad", sub: "tuners_utils.py:523",
    file: "src/peft/tuners/tuners_utils.py", line: 523,
    does: [
      "_mark_only_adapters_as_trainable writes p.requires_grad = False on every parameter that is not an adapter parameter.",
      "Bias parameters are re-enabled afterwards according to the active adapters' bias setting (all / lora_only / none).",
      "add_adapter restores pre-existing flags from a snapshot taken in phase 1 (:1153), so adding an adapter never changes the trainability of what was already there.",
    ],
    watch: ["First injection is special-cased: with no tuner layer present yet, the snapshot is discarded on purpose so the base model actually gets frozen."],
  },
  {
    id: "mu_shard", lane: "mut", col: 1, row: 4.4, tier: 3, kind: "mutate-base",
    label: "FSDP2 parameter sharding", sub: "peft_model.py:1746",
    file: "src/peft/peft_model.py", line: 1746,
    does: [
      "set_adapter calls _reshard_fsdp_modules() first, so the requires_grad flips land on the sharded parameters rather than a gathered copy.",
      "A reshard drops the unsharded parameters, which is why FSDP modules sharding a merged layer are skipped.",
    ],
    watch: ["With FSDP2, set_adapter therefore has a memory-layout side effect on the base model, not just a flag flip."],
  },
  {
    id: "mu_loraab", lane: "mut", col: 2, row: 0, tier: 2, kind: "mutate-adapter",
    label: "lora_A / lora_B [adapter]", sub: "lora/layer.py:263",
    file: "src/peft/tuners/lora/layer.py", line: 263,
    does: [
      "update_layer assigns fresh modules per adapter: lora_A[name] = nn.Linear(in_features, r, bias=False), lora_B[name] = nn.Linear(r, out_features, bias=lora_bias).",
      "Embedding layers write lora_embedding_A[name] = nn.Parameter(weight_A) instead (:1315).",
      "Tied adapters replace the weight with a reference to the embedding layer's adapter tensors (:273), so the two stay tied.",
    ],
    watch: ["These land in a ParameterDict / ModuleDict, so re-assignment re-wraps the value as a fresh Parameter — see the requires_grad pitfall note."],
  },
  {
    id: "mu_loraattrs", lane: "mut", col: 2, row: 1.1, tier: 2, kind: "mutate-adapter",
    label: "per-adapter scalar dicts", sub: "lora/layer.py:251",
    file: "src/peft/tuners/lora/layer.py", line: 251,
    does: [
      "The same update_layer call also writes lora_variant[name], r[name], lora_alpha[name], lora_dropout (a ModuleDict), lora_bias[name] and use_rslora[name] / use_dora[name].",
      "scaling[name] is derived: lora_alpha / r, or lora_alpha / sqrt(r) when rsLoRA is enabled.",
      "Every entry is keyed by adapter name, so the layer's bookkeeping grows with each adapter added.",
    ],
  },
  {
    id: "mu_adapreqgrad", lane: "mut", col: 2, row: 2.2, tier: 2, kind: "mutate-adapter",
    label: "adapter params · requires_grad", sub: "other.py:284",
    file: "src/peft/utils/other.py", line: 284,
    does: [
      "_set_layer_requires_grad is the single writer of requires_grad on adapter parameters: active adapters get True unless inference_mode, all others get False.",
      "Reached from BaseTunerLayer.set_adapter, enable_adapters/disable_adapters, and PeftModel.set_requires_grad.",
      "_freeze_non_trainable_peft_weights (tuners_utils.py:2026) then re-freezes the subsets that variants declare as non-trainable.",
    ],
    watch: [
      "set_adapter's requires_grad effect is a side effect, not its purpose: this is why switching adapters changes what an already-created optimizer would see.",
    ],
  },
  {
    id: "mu_active", lane: "mut", col: 2, row: 3.3, tier: 2, kind: "mutate-adapter",
    label: "layer._active_adapter", sub: "tuners_utils.py:2075",
    file: "src/peft/tuners/tuners_utils.py", line: 2075,
    does: [
      "The per-layer switch that forward() reads to decide which adapter weights participate.",
      "Written last in set_adapter, after every requires_grad write has been applied.",
      "The wrappers keep their own _active_adapter too (other.py:541), for modules_to_save and trainable tokens.",
    ],
    watch: ["_active_adapter is exposed as a property without a setter — the source comment says to go through set_adapter instead of assigning it."],
  },
  {
    id: "mu_copies", lane: "mut", col: 2, row: 4.4, tier: 3, kind: "mutate-adapter",
    label: "modules_to_save[adapter]", sub: "other.py:653",
    file: "src/peft/utils/other.py", line: 653,
    does: [
      "ModulesToSaveWrapper.update stores a full copy per adapter: copy.deepcopy(self.original_module) (:653), or a Linear that shares a tied module's weight (:651).",
      "It also freezes the original: self.original_module.requires_grad_(False) (:661).",
      "TrainableTokens writes trainable_tokens_delta[adapter_name] = nn.Parameter(values.clone(), requires_grad=True) (tuners/trainable_tokens/layer.py:157).",
    ],
    watch: ["These are full-size weights, not low-rank — the one adapter-related mutation that costs as much memory as the layer it wraps."],
  },
  {
    id: "mu_dtype", lane: "mut", col: 2, row: 5.5, tier: 2, kind: "mutate-adapter",
    label: "adapter param dtype / device", sub: "tuners_utils.py:2712",
    file: "src/peft/tuners/tuners_utils.py", line: 2712,
    does: [
      "cast_adapter_dtype upcasts fp16 / bf16 / fp8 adapter weights to fp32 by reassigning them into their Parameter/Module/Buffer dict.",
      "_move_adapter_to_device_of_base_layer (:2217) does the same when an adapter has to follow the base layer's device or dtype.",
      "Both are called every time an adapter is added (add_adapter ends with _cast_adapter_dtype) and on load.",
    ],
    watch: [
      "⚠ Both write back through a ParameterDict, whose __setitem__ re-wraps plain tensors as Parameter(value) with requires_grad defaulting to True.",
      "Consequence: an adapter frozen on purpose (inference_mode=True, or a loaded non-trainable adapter) can come back trainable. Verified locally — see the pitfall note.",
    ],
  },
  {
    id: "mu_cfg", lane: "mut", col: 2, row: 6.6, tier: 2, kind: "mutate-adapter",
    label: "peft_config[adapter]", sub: "peft_model.py:1170",
    file: "src/peft/peft_model.py", line: 1170,
    does: [
      "add_adapter registers self.peft_config[adapter_name] = peft_config before injecting anything, and deletes it again if injection raises (:1174).",
      "load_adapter additionally writes peft_config.inference_mode = not is_trainable (:1579) — the flag that ultimately decides requires_grad later.",
      "PeftModel.peft_config and BaseTuner.peft_config are the same dict for non-prompt methods (the property at peft_model.py:210 reads through to the tuner).",
    ],
  },

  /* --- mutation edges are declared in the edges array as kind: "mutate" --- */

  ], /* end nodes */

  /* ---------------------------------------------------------------- edges */
  edges: [

  /* --- set_adapter spine --- */
  { s: "s_entry", t: "s_guard",   kind: "call",   label: "validate" },
  { s: "s_entry", t: "s_fsdp",    kind: "call" },
  { s: "s_entry", t: "s_attr",    kind: "call" },
  { s: "s_entry", t: "s_branch",  kind: "call" },
  { s: "s_branch", t: "s_prompt", kind: "branch", label: "prompt learning" },
  { s: "s_branch", t: "s_base",   kind: "branch", label: "else (tuner)" },
  { s: "s_base",  t: "s_tattr",   kind: "call" },
  { s: "s_base",  t: "s_modfn",   kind: "call" },
  { s: "s_modfn", t: "s_auxcall", kind: "call",   label: "1 · aux wrappers" },
  { s: "s_modfn", t: "s_loop",    kind: "call",   label: "2 · tuner layers" },
  { s: "s_loop",  t: "s_merge",   kind: "branch", label: "merged" },
  { s: "s_loop",  t: "s_layer",   kind: "call" },
  { s: "s_layer", t: "s_grad",    kind: "call" },
  { s: "s_layer", t: "s_freeze",  kind: "call" },
  { s: "s_layer", t: "s_active",  kind: "call" },
  { s: "s_prompt",  t: "s_auxwrap", kind: "call" },
  { s: "s_auxcall", t: "s_auxwrap", kind: "call" },
  { s: "s_auxwrap", t: "s_check",   kind: "call" },

  /* --- add_adapter entries --- */
  { s: "a_gpm",   t: "a_inject", kind: "cross", label: "first injection (no add_adapter)" },
  { s: "a_init",  t: "a_entry",  kind: "call" },
  { s: "a_load",  t: "a_entry",  kind: "call" },
  { s: "a_task",  t: "a_entry",  kind: "call",  label: "super().add_adapter" },
  { s: "a_mixed", t: "a_entry",  kind: "cross", label: "same protocol" },

  /* --- add_adapter spine --- */
  { s: "a_entry", t: "a_guard",    kind: "call",   label: "validate" },
  { s: "a_entry", t: "a_branch",   kind: "call" },
  { s: "a_entry", t: "a_rollback", kind: "branch", label: "on exception" },
  { s: "a_branch", t: "a_prompt",  kind: "branch", label: "is_prompt_learning" },
  { s: "a_branch", t: "a_adapt",   kind: "branch", label: "is_adaption_prompt" },
  { s: "a_branch", t: "a_inject",  kind: "branch", label: "else" },

  { s: "a_inject", t: "a_p1_conv", kind: "call" },
  { s: "a_p1_conv", t: "a_p1_cfg",  kind: "call" },
  { s: "a_p1_cfg",  t: "a_p1_tie",  kind: "call" },
  { s: "a_p1_tie",  t: "a_p1_prep", kind: "call" },
  { s: "a_p1_prep", t: "a_p1_model", kind: "call" },
  { s: "a_p1_model", t: "a_p1_snap", kind: "call" },
  { s: "a_p1_snap",  t: "a_p1_lin",  kind: "call" },
  { s: "a_p1_lin",   t: "a_p1_min",  kind: "call" },

  { s: "a_p1_min",  t: "a_p2_loop",  kind: "call" },
  { s: "a_p2_loop", t: "a_p2_match", kind: "call" },
  { s: "a_p2_loop", t: "a_p2_tied",  kind: "branch", label: "tied key" },
  { s: "a_p2_match", t: "a_p2_sub",  kind: "call",   label: "matched" },
  { s: "a_p2_sub",  t: "a_p2_ctx",   kind: "call" },
  { s: "a_p2_ctx",  t: "a_p2_car",   kind: "call" },
  { s: "a_p2_car",  t: "a_p2_lora",  kind: "call" },
  { s: "a_p2_lora", t: "a_p2_upd",   kind: "branch", label: "existing LoraLayer" },
  { s: "a_p2_lora", t: "a_p2_new",   kind: "branch", label: "wrap new layer" },
  { s: "a_p2_tied", t: "a_p2_tie2",  kind: "call",   label: "deferred" },
  { s: "a_p2_match", t: "a_p2_par",  kind: "branch", label: "target_parameters" },
  { s: "a_p2_new",  t: "a_p2_par",   kind: "call" },

  { s: "a_p2_tie2", t: "a_p3_sd",  kind: "call" },
  { s: "a_p3_sd",   t: "a_p3_err", kind: "call" },
  { s: "a_p3_err",  t: "a_p3_excl", kind: "call" },
  { s: "a_p3_excl", t: "a_p3_nomatch", kind: "call" },
  { s: "a_p3_nomatch", t: "a_p3_pat",  kind: "call" },

  { s: "a_p3_pat",  t: "a_p4_ext",  kind: "call" },
  { s: "a_p4_ext",  t: "a_p4_set",  kind: "call" },
  { s: "a_p4_set",  t: "a_p4_mark", kind: "call" },
  { s: "a_p4_mark", t: "a_p4_addtm", kind: "call" },
  { s: "a_p4_addtm", t: "a_p4_rest", kind: "call" },
  { s: "a_p4_rest",  t: "a_cast",    kind: "call" },

  /* --- cross-flow: the two flows meet here --- */
  { s: "a_p4_set", t: "s_modfn", kind: "cross", label: "re-applies set_adapter" },

  /* --- into the shared lane --- */
  { s: "a_p4_mark", t: "sh_mark",  kind: "call" },
  { s: "a_p4_addtm", t: "sh_addtm", kind: "call" },
  { s: "a_cast",    t: "sh_cast",  kind: "call" },
  { s: "a_prompt",  t: "sh_addtm", kind: "call" },
  { s: "a_adapt",   t: "sh_addtm", kind: "call" },
  { s: "a_p2_upd",  t: "sh_move",  kind: "call" },
  { s: "s_grad",    t: "sh_grad",  kind: "call" },
  { s: "s_auxwrap", t: "sh_m2s",   kind: "call", label: "wrapper flavour" },
  { s: "sh_addtm",  t: "sh_m2s",   kind: "call" },
  { s: "sh_addtm",  t: "sh_tt",    kind: "call" },
  { s: "sh_mark",   t: "sh_grad",  kind: "call" },
  { s: "sh_move",   t: "sh_pitfall", kind: "note" },
  { s: "sh_cast",   t: "sh_pitfall", kind: "note" },

  /* --- state mutations: every edge that changes something, pointing at what
         it changes. kind "mutate" is styled by the target's kind. --- */
  { s: "mu_mergepath", t: "mu_baseweight", kind: "mutate", label: "merge(): W += ΔW" },
  { s: "s_merge",   t: "mu_baseweight",  kind: "mutate", label: "unmerge(): W −= ΔW" },
  { s: "s_fsdp",    t: "mu_shard",       kind: "mutate", label: "reshard" },
  { s: "a_p2_new",  t: "mu_modgraph",    kind: "mutate", label: "setattr(parent, …)" },
  { s: "a_p2_par",  t: "mu_paramw",      kind: "mutate", label: "parametrize" },
  { s: "a_p4_mark", t: "mu_basereqgrad", kind: "mutate", label: "requires_grad=False" },
  { s: "sh_mark",   t: "mu_basereqgrad", kind: "mutate", label: "freeze base" },

  { s: "a_entry",   t: "mu_cfg",         kind: "mutate", label: "register config" },
  { s: "a_load",    t: "mu_cfg",         kind: "mutate", label: "inference_mode = not is_trainable" },
  { s: "a_rollback", t: "mu_cfg",        kind: "mutate", label: "del on failure" },
  { s: "a_p2_upd",  t: "mu_loraab",      kind: "mutate", label: "lora_A/B[name] = nn.Linear" },
  { s: "a_p2_upd",  t: "mu_loraattrs",   kind: "mutate", label: "r/alpha/scaling/…" },
  { s: "a_p4_addtm", t: "mu_copies",     kind: "mutate", label: "deepcopy per adapter" },
  { s: "sh_tt",     t: "mu_copies",      kind: "mutate", label: "trainable_tokens_delta" },
  { s: "s_layer",   t: "mu_adapreqgrad", kind: "mutate", label: "per-adapter flip" },
  { s: "s_grad",    t: "mu_adapreqgrad", kind: "mutate", label: "requires_grad" },
  { s: "s_freeze",  t: "mu_adapreqgrad", kind: "mutate", label: "re-freeze" },
  { s: "sh_mark",   t: "mu_adapreqgrad", kind: "mutate", label: "re-freeze" },
  { s: "s_active",  t: "mu_active",      kind: "mutate", label: "= adapter_names" },
  { s: "s_auxwrap", t: "mu_active",      kind: "mutate", label: "wrapper's own switch" },
  { s: "a_cast",    t: "mu_dtype",       kind: "mutate", label: "upcast → fp32" },
  { s: "sh_move",   t: "mu_dtype",       kind: "mutate", label: "follow base device" },

  ], /* end edges */

};
