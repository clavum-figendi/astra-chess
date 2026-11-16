# Published chess architectures: replacing an authored feature circuit

Research snapshot: **2026-11-16**. Public primary papers, actual source/configuration files, model cards, and file metadata were inspected. No upstream code was executed; no weights or datasets were downloaded. This is an architectural recommendation, not a locally measured improvement.

## Bottom line

**Replace the fixed sparse feature bank with a jointly trained board encoder and move scorer.** The most relevant small-model evidence is the **2026 Chessformer/Leela-CF 2.51M and 4.01M parameter strength ablation**, not Maia's human move-matching percentage. A practical progression is a small learned residual board encoder first, then a 64-square transformer with learned relative attention bias, and only then dynamic Geometric Attention Bias (GAB). These are proposed experiments, not promises of improvement.[27]

DeepMind demonstrates large-scale **Stockfish action-value distillation**, not that a 270M model or a small head retune can learn strong chess from hundreds of positions. Its paper explicitly notes that action-value training has roughly 30 times as many examples as state-value or best-action training when games are held fixed; with 40M examples held fixed, state-value slightly outperformed action-value. Do not attribute the entire result to the objective alone.[1]

Maia-3 is a genuine newer small open-weights candidate: released 3M/5M models, with a 5M checkpoint of 20,968,049 bytes. **It predicts human choices, not best engine moves.** Its architecture is useful inspiration; its pretrained policy is not a verified strength upgrade for this project.[27][30][31]

## Scope and reproducibility

All revisions below were resolved from public GitHub APIs on the snapshot date. A branch tip is a reproducible inspection point, not necessarily the original paper's training revision. Inline references link to immutable source files. The local baseline and tiny Stockfish dataset sizes are context supplied by the project owner, not independently re-audited here. Historical datasets and local models were not changed.

| Repository | Inspected revision | Role |
|---|---|---|
| `google-deepmind/searchless_chess` | `90ae0e6b121673fc3079aaeffa047580bb600c0a` | Official DeepMind implementation.[2] |
| `CSSLab/maia3` | `1e13597c42d4858b7cfd7cfdae01e297263364b2` | Official 2026 Chessformer human-emulation inference implementation.[13] |
| `CSSLab/maia2` | `67bee6ce7e2f264344fe6d2026a2e18c76a82efa` | Official Maia-2 model/configuration.[14][15] |
| `LeelaChessZero/lc0` | `bf15d558e178aa6415e40ab476bd1a3617828f1f` | Engine and network serialization schema.[19][20] |
| `LeelaChessZero/lczero-training` | `ee626a97e517df76e85084339bbe6d0895eaba09` | Current JAX model/configuration examples.[21][22] |
| `Ergodice/lczero-training` | `7b3ee3fcdb49d8abeb034718935b099134c11882` | Author-linked 2024 transformer implementation.[23][29] |
| `ptshen/chessformer` | `4f725520522de8ce5696fe1a3c7b7c4f9ae795e8` | Independent replication, not the official 2026 Chessformer implementation.[25] |

## 1. DeepMind `searchless_chess`

### Architecture and representation

The source describes a decoder-style, LLaMA-inspired backbone, but the released engine configuration explicitly sets **`use_causal_mask=False`**. Thus do not implement ordinary causal language-model masking just because the module says “decoder.” Its blocks have pre-LayerNorm residual attention, SwiGLU gated MLPs with widening factor 4, and a final normalization and linear log-softmax output. Learned absolute positions are used for the released engines.[3][4]

The FEN tokenizer emits **77 tokens**: side to move, 64 expanded squares, four padded castling characters, two en-passant characters, three halfmove-clock characters, and three fullmove-number characters. Its literal character alphabet has 31 entries, but model embeddings use the larger move-action vocabulary; these are different counts.[5][3]

The move enumeration covers queen-like and knight-like square traversals plus promotions for both colors. Independent enumeration of the published geometry gives **1,968 action IDs**, not Lc0's 1,858 and not Maia-2's 1,880. This includes separate four-piece promotion suffixes on both promotion ranks.[9]

| Release label | Layers | Width | Heads | Main output |
|---|---:|---:|---:|---|
| 9M | 8 | 256 | 8 | 128 action-value buckets |
| 136M | 8 | 1,024 | 8 | 128 action-value buckets |
| 270M | 16 | 1,024 | 8 | 128 action-value buckets |

These are published size labels, not parameter counts recomputed from loaded tensors. The released engine factory selects checkpoint step **6,400,000** for these three releases.[3]

### Targets and inference cost

* **Action value:** train on `(state, candidate move, bucketed Stockfish win probability)`. The dataset sequence has length 79 including the target; right shifting prevents feeding the final target into its own prediction. At move time evaluate every legal candidate and maximize expected bucket value. “Searchless” does not mean one forward pass per move.[4][6][1]
* **State value:** predict the state-value bucket; choosing a move requires evaluating successors with the correct side-to-move value convention.[1][6]
* **Behavioral cloning:** predict the Stockfish best-move action ID directly, rather than imitating the human move from the source game. The release downloader includes separate 9M state-value and behavioral-cloning archives in addition to action-value archives.[1][8]

The principal training target uses **128 uniform return buckets** with cross-entropy. The paper also studies other losses; HL-Gauss is an ablation, not a reason to describe the released baseline as scalar centipawn regression.[1][3][9]

### Data, strength claims, and checkpoint structure

ChessBench starts from **10M February 2023 Lichess games**, annotated with **Stockfish 16** state and legal-action evaluations, roughly **15B** data points. The main action-value recipe reports **10M gradient steps, batch 4,096**, with 50 ms Stockfish annotation. The paper reports **2,895 Lichess blitz Elo against humans** for its large searchless policy; that is a specific evaluation setting, not a transferable rating for a local reproduction.[1]

The loader restores **JAX/Haiku parameter pytrees using Orbax**, under `<checkpoint_dir>/<step>/params`; EMA restoration uses `params_ema`. Model shapes are initialized from the exact configuration before restore. These are **not** flat PyTorch state dictionaries, GGUF, or a binary compatible with the existing affine circuit. The archive contents themselves were not downloaded or decoded; this directory contract is verified from loading code.[7]

Public Google Storage HTTP HEAD requests returned these stored archive sizes (bytes; archive size is not resident weight memory):

| Archive | Stored bytes |
|---|---:|
| `9M.zip` | 66,375,867 [39] |
| `9M_state_value.zip` | 31,358,327 [40] |
| `9M_behavioral_cloning.zip` | 33,094,721 [41] |
| `136M.zip` | 1,012,357,690 [42] |
| `270M.zip` | 2,011,006,753 [43] |

**Rights:** code Apache-2.0; weights CC-BY-4.0; Lichess portions CC0 and remaining dataset annotations CC-BY-4.0. These are separate explicit statements in the official README.[2]

**Implication:** learn relational features throughout the network, preserve full rule state, and supervise alternatives—not merely a single best-move bit. Importing a checkpoint would require an explicit encoder/runtime conversion project and a license/attribution decision, not changing a few terminal weights.

## 2. Chessformer 2026 / Maia-3 / Leela-CF

### Same architecture family, different tasks

The May 2026 paper introduces **64 square tokens**, encoder-only bidirectional attention, a learned dynamic **Geometric Attention Bias**, and an attention-based source/destination policy. GAB is generated from the current hidden board state; its final projection is shared across layers. This is learned position-dependent computation, not a frozen hand-authored attack-feature library.[27][10]

For **Maia-3 human prediction**, the input per square is 12 piece channels over the current plus seven previous boards (96 features), plus two 128-dimensional interpolated rating embeddings: **352 features per token**. The released presets omit clock inputs. The implementation uses eight blocks, GELU, RMSNorm in the blocks, MLP ratio 2, no QKV biases, and dropout 0.[10][11]

| Release | Width / heads / blocks | GAB configuration | File bytes and pinned HF revision |
|---|---|---|---|
| 3M ablation | 192 / 6 / 8 | Average-pool generator; intermediate 64, generator 64 | 12,659,441; `990dfd78e6403805dbbbb5fcfccd4b3d3e778cc1`.[11][37] |
| 5M | 256 / 8 / 8 | Average-pool generator; intermediate 64, generator 64 | 20,968,049; `b6559de2398d7140b985f28fd2c19fb5e47ddabe`.[11][31] |
| 23M | 512 / 16 / 8 | Per-square projection 32; intermediate 128, generator 128 | 91,799,307; `51a0145a8178046f7de23119160b136672deeb2b`.[11][33] |
| 79M | 1,024 / 32 / 8 | Per-square projection 32; intermediate 128, generator 128 | 315,651,851; `a107d6ceb7b298cb04ae1da4edffe2939858b894`.[11][35] |

Sizes are remote file metadata only; no checkpoint was fetched. Named parameter sizes are rounded published labels.[30][32][34]

### Move head: inspect the implementation, not only the abstract

`proj_sq_from` and `proj_sq_to` produce vectors whose scaled dot products form **64×64** move logits. `promo_bias_proj` produces four promotion offsets per destination. The current Maia-3 implementation concatenates **4,096 ordinary + 256 promotion = 4,352 logits**, then its engine masks legal moves; this is **not a 1,858-way Lc0 vector**. Mean-pooled hidden features also feed a three-class game-outcome head and a ponder-time head.[10][38]

The loader accepts a raw tensor state dictionary or a `model_state_dict` wrapper, renames legacy `smolgen` keys to `gab`, and uses `weights_only=True` unless explicit trust is requested. It currently loads with `strict=False` and prints missing/unexpected-key warnings: a conversion or integration should instead require a verified complete match, rather than treating warnings as success.[38]

### Human targets and scales

Maia-3 trains on Lichess **blitz games January 2023–July 2025**, balanced across rating bins, sampling up to 32 positions per game and excluding positions after either clock falls below 30 seconds. The paper gives **1M steps**, AdamW, and configuration values `batch_size_train=128`, accumulation 4; do not infer a global multi-GPU effective batch without the missing training-loop details. A total unique retained game/position count was not established in the inspected paper/card, so no billion-position total is asserted here.[27][30]

Human move matching on the Allie **884,049-position** test set is **55.4% (5M), 56.6% (23M), 57.1% (79M)**. These are human-move top-1 accuracies, not Stockfish agreement, Elo, or tactical correctness. The official engine README explicitly says its WDL outputs predict human game outcomes rather than searched engine evaluations.[27][13]

### Small strength models are the more relevant evidence

The same paper separately distills fixed **April 2024 Lc0 self-play from a roughly 100M teacher searching 600 nodes/move**, using search policy distributions and game/value targets. Its input follows Lc0's **112 features per square**: 96 piece-history, eight repetition indicators, four castling indicators, side-to-move, halfmove information, and two constant planes. Do not confuse this encoding or target with Maia-3.[27]

The strength ablation reports **2.51M** and **4.01M** GAB models. The 4.01M model uses eight layers, width 256, head dimension 32, MLP width 256, GAB per-square dimension 8 and generator/intermediate dimensions 32. The 2.51M model reduces embedding/MLP widths to 192. Both train for **1.4M steps, batch 2,048, approximately four days on one A100**. Relative to an absolute-position ablation baseline at 0 ±18 Elo, the 4.01M GAB model scores **+83 ±18 Elo**, whereas the 2.51M scores **−4 ±18**. These are relative ratings in that controlled tournament, not independent absolute engine ratings.[27]

The large **191M Leela-CF** is 15 layers, width 1,024, MLP width 1,536, head dimension 32; it is a different model from the 79M human policy. Its reported full-engine strength gains involve search; the paper separately evaluates single-forward-pass policy and per-legal-move value maximization. No readily verified small strength checkpoint download was established in the inspected official Maia-3 inference repository; the small strength models are research evidence, not a claimed ready-to-import asset.[27][13]

### Rights and reproducibility caveats

* **Code:** current official Maia-3 repository is **AGPL-3.0**.[12]
* **79M weights:** its model card explicitly says **AGPLv3**.[34]
* **3M/5M/23M weights:** their cards say “CC BY 4.0 (paper); see repo for code/weights license.” That is **not an explicit CC-BY grant for those weights**. Treat weight reuse terms as unresolved until clarified; do not automatically inherit either the paper license or 79M card.[30][32][36]
* Cards refer to training files such as `ablate_size.sh` (and a transcoder) not present in the inspected inference tree. Paper recipes plus inference code are not a full verified training reproduction.[30][13]

## 3. Maia-2: useful comparison, weaker fit for strongest-move training

Maia-2 is a **roughly 23M** human-modeling baseline in the 2026 paper, with a convolutional encoder followed by skill-aware attention over **channel patches**, not a 64-square transformer. The current packaged configuration specifies **18×8×8 inputs**, CNN width 256 with **five residual blocks**, projection to eight channel tokens, transformer width 1,024 with two layers, 16 attention heads of dimension 64, and 128-dimensional rating embeddings for each player.[27][14][15]

The 18 input planes are 12 piece planes, side to move, four castling flags, and an en-passant plane. The move generator enumerates queen/knight traversals plus four promotion choices on the white promotion rank: **1,880 outputs**, independently counted from the published scheme. Black positions are canonicalized to the white side's perspective. The global policy head is linear; auxiliary outputs describe legal moves/pieces/threats and a scalar outcome head predicts human-game value.[18][14][28]

The paper trains on **168.93M retained games / 9.15B positions**, principally May 2018–November 2023 after filtering and balancing, with one-hot **human played-move CE**, auxiliary information loss, and game-outcome loss. This is not a Stockfish oracle dataset.[28]

**Important source discrepancy:** the paper's appendix lists **12 backbone blocks**, while the current released packaged configuration says **5**. For loading released weights, match the actual packaged implementation/configuration; do not silently replace it with the paper table. `model.py` constructs that architecture and restores `checkpoint['model_state_dict']` using tensor-only loading, with published SHA-256 checksums for rapid/blitz assets. This report did not download either checkpoint and therefore does not claim exact disk sizes or independently counted tensor parameters.[28][15][16]

**Rights:** repository code MIT; a separate explicit weight license was not established in the inspected loader/license. MIT code licensing is not independently sufficient evidence about externally hosted Google Drive weights.[17][16]

## 4. Lc0 transformers and the earlier 2024 Chessformer line

The 2024 **Mastering Chess with a Transformer Model** paper links the author's `Ergodice/lczero-training` fork. Its **CF-6M** uses eight layers, embedding 256, eight heads and MLP width 256; training is **2M steps, batch 2,048**, on **53M April 2024 self-play games**. Its large model is described as **243M parameters**, 15 layers, width 1,024, 32 heads and MLP width 4,096, trained **3.7M steps, batch 4,096**, using **500M games**. These are paper-reported recipes, not local training runs.[29]

Inputs are 64 tokens with 112 Lc0-compatible features. The policy uses source/destination attention and promotion offsets; targets include **MCTS/search policy**, game-result WDL and auxiliary search/value predictions, rather than only the final played move. The actual author configuration enables query/key/value relative positional encodings, disables Smolgen, and lists policy, soft-policy, game/search/short-term value and auxiliary losses. Thus the earlier Shaw-relative setup should not be mislabeled as the exact 2026 GAB recipe.[29][23][24]

The current Lc0 schema supports attention-body networks and encodes embeddings, encoder blocks, policy/value heads and Smolgen parameters in protobuf. The current training policy head builds a 64×64 attention map, adds promotion logits, then gathers the **Lc0 1,858-action indexing**. Its example configuration uses a **15×1,024**, 32-head encoder with MLP 1,536 and a Smolgen generator; this is a configuration example, not proof of a specific checkpoint's parameter count or rating.[19][21][22]

**Rights:** Lc0 engine code is GPL-3.0-or-later with the documented additional CUDA-linking permission. A root weight license or exact selected network's redistribution grant was not established here; check the individual network source. The author training fork and independent replication did not expose a root license in the inspected trees; absence of a license is not permission to copy. Do not infer the current training repository's full licensing from the engine's license.[20][23][25]

### Avoid the `chessformer` name collision

`ptshen/chessformer` is an **independent 2024-paper replication**, not CSSLab's official 2026 release. It reports **5,743,463 parameters** for its CF-6M configuration, but its supposed large configuration has **205,656,679**, explicitly leaving the paper's 243M discrepancy unresolved. Its README says only pilots were trained and large-scale strength was not replicated. It is useful as a readable engineering cross-check, not a substitute for published trained strength or a license-cleared pretrained engine.[25][26]

## 5. Recommended replacement experiments for Chess Lab

The supplied project context describes fixed, authored affine/ReLU relations with only a small terminal parameter subset trained. The proposal below changes **what can be learned**, rather than retuning coefficients over the same frozen basis. Everything in this section is a recommendation, not a verified implementation or reported benchmark.

1. **First learned baseline:** train all layers of a small residual board encoder from raw piece/rule-state planes. Include side to move, castling, en passant, halfmove/repetition information; if history is unavailable, explicitly record that limitation. Keep a 64-square hidden representation rather than collapsing into authored tactical feature scores. A compact convolutional/residual encoder is the lower-runtime-risk first experiment if the existing execution system only supports affine/ReLU operations.
2. **Relational model:** compare a 64-token encoder with learned embeddings/positions, two to four layers and width 64–128 as a cheap capacity probe. Expand toward the published eight-layer width-192/256 regime only after showing validation improvement and measuring latency. This smaller probe is **not** a reproduction of the published 2.51M/4.01M models.
3. **Move scorer:** score legal moves from contextual source and destination vectors, plus promotion-type information. For a transformer runtime, use scaled dot products and promotion offsets. For a strict affine/ReLU runtime, use an MLP over concatenated contextual source/destination features as an explicitly different approximation. Dynamic attention, normalization and dot products cannot be represented by merely swapping terminal weights into the existing frozen affine graph.
4. **Geometry ablation:** start with learned absolute square positions; compare 15×15 learned relative-offset attention biases; add GAB only if it helps at matched parameter budget and latency. Learned geometry sharing is compatible with eliminating fixed handcrafted tactical feature banks. Do not claim GAB gains locally until measured.
5. **Training target:** on a new versioned dataset, collect distributions or evaluations for **several/all legal alternatives**, not just the teacher's winning move. Compare legal-masked soft policy CE/KL against the existing hard/rank mix; separately test bucketed action value. Avoid arbitrary rank weights masquerading as calibrated teacher probabilities. Use explicit score-to-probability/temperature conventions and side-to-move orientation.
6. **Data scale:** the supplied 458/219/159 split is suitable for smoke tests and pipeline checks, not evidence that a multi-million-parameter model can learn competitive chess. Increase data under an explicit storage/annotation budget, group splits by game and deduplicate positions to avoid leakage, and draw learning curves. Do not overwrite historical data, claim paper-scale equivalence, or start paid cloud/GPU work without authorization.
7. **Acceptance tests:** retain frozen old baselines; evaluate held-out teacher policy loss/agreement, tactical blunder rate or value regret, paired-opening game results with uncertainty, and actual inference latency/memory. Keep **human move matching**, **teacher agreement**, **puzzle completion**, **searchless policy play**, **per-move value evaluation**, and **search-enabled engine Elo** as separate metrics.
8. **Rights:** an independently implemented architecture trained on authorized data is a different deliverable from bundling upstream code or pretrained weights. Record attribution, exact dataset/version, and code/weight licenses separately before any distribution. No legal clearance is implied by this technical report.

**Preferred path:** a fully learned compact encoder + legal-move scorer, trained on a substantially broader new teacher dataset, with a controlled square-transformer/relative-bias comparison. Use DeepMind's action-value approach as an objective/inference-cost ablation and Chessformer's small strength models as architectural evidence. Do not adopt Maia solely because its human-matching accuracy is high.

## Limitations

This research did not load tensors, execute upstream code, measure any candidate on this machine, or verify the internal contents of weight archives. Parameter labels and published scores remain author-reported. File byte sizes come from HTTP HEAD or pinned Hugging Face metadata. Public source inspection verifies architecture and configuration contracts, not checkpoint correctness, license interpretation, or locally reproduced strength. No remote repository, deployment, deletion, paid cloud resource, or credential access was attempted.

## Sources

[1] https://arxiv.org/html/2402.04494v2 — DeepMind paper, v2
[2] https://github.com/google-deepmind/searchless_chess/blob/90ae0e6b121673fc3079aaeffa047580bb600c0a/README.md — google-deepmind/searchless_chess README.md
[3] https://github.com/google-deepmind/searchless_chess/blob/90ae0e6b121673fc3079aaeffa047580bb600c0a/src/engines/constants.py — google-deepmind/searchless_chess src/engines/constants.py
[4] https://github.com/google-deepmind/searchless_chess/blob/90ae0e6b121673fc3079aaeffa047580bb600c0a/src/transformer.py — google-deepmind/searchless_chess src/transformer.py
[5] https://github.com/google-deepmind/searchless_chess/blob/90ae0e6b121673fc3079aaeffa047580bb600c0a/src/tokenizer.py — google-deepmind/searchless_chess src/tokenizer.py
[6] https://github.com/google-deepmind/searchless_chess/blob/90ae0e6b121673fc3079aaeffa047580bb600c0a/src/data_loader.py — google-deepmind/searchless_chess src/data_loader.py
[7] https://github.com/google-deepmind/searchless_chess/blob/90ae0e6b121673fc3079aaeffa047580bb600c0a/src/training_utils.py — google-deepmind/searchless_chess src/training_utils.py
[8] https://github.com/google-deepmind/searchless_chess/blob/90ae0e6b121673fc3079aaeffa047580bb600c0a/checkpoints/download.sh — google-deepmind/searchless_chess checkpoints/download.sh
[9] https://github.com/google-deepmind/searchless_chess/blob/90ae0e6b121673fc3079aaeffa047580bb600c0a/src/utils.py — google-deepmind/searchless_chess src/utils.py
[10] https://github.com/CSSLab/maia3/blob/1e13597c42d4858b7cfd7cfdae01e297263364b2/maia3/models.py — CSSLab/maia3 maia3/models.py
[11] https://github.com/CSSLab/maia3/blob/1e13597c42d4858b7cfd7cfdae01e297263364b2/maia3/model_registry.py — CSSLab/maia3 maia3/model_registry.py
[12] https://github.com/CSSLab/maia3/blob/1e13597c42d4858b7cfd7cfdae01e297263364b2/LICENSE — CSSLab/maia3 LICENSE
[13] https://github.com/CSSLab/maia3/blob/1e13597c42d4858b7cfd7cfdae01e297263364b2/README.md — CSSLab/maia3 README.md
[14] https://github.com/CSSLab/maia2/blob/67bee6ce7e2f264344fe6d2026a2e18c76a82efa/maia2/main.py — CSSLab/maia2 maia2/main.py
[15] https://github.com/CSSLab/maia2/blob/67bee6ce7e2f264344fe6d2026a2e18c76a82efa/maia2/configs/maia2-training.yaml — CSSLab/maia2 maia2/configs/maia2-training.yaml
[16] https://github.com/CSSLab/maia2/blob/67bee6ce7e2f264344fe6d2026a2e18c76a82efa/maia2/model.py — CSSLab/maia2 maia2/model.py
[17] https://github.com/CSSLab/maia2/blob/67bee6ce7e2f264344fe6d2026a2e18c76a82efa/LICENSE — CSSLab/maia2 LICENSE
[18] https://github.com/CSSLab/maia2/blob/67bee6ce7e2f264344fe6d2026a2e18c76a82efa/maia2/utils.py — CSSLab/maia2 maia2/utils.py
[19] https://github.com/LeelaChessZero/lc0/blob/bf15d558e178aa6415e40ab476bd1a3617828f1f/proto/net.proto — LeelaChessZero/lc0 proto/net.proto
[20] https://github.com/LeelaChessZero/lc0/blob/bf15d558e178aa6415e40ab476bd1a3617828f1f/README.md — LeelaChessZero/lc0 README.md
[21] https://github.com/LeelaChessZero/lczero-training/blob/ee626a97e517df76e85084339bbe6d0895eaba09/docs/example.textproto — LeelaChessZero/lczero-training docs/example.textproto
[22] https://github.com/LeelaChessZero/lczero-training/blob/ee626a97e517df76e85084339bbe6d0895eaba09/src/lczero_training/model/policy_head.py — LeelaChessZero/lczero-training src/lczero_training/model/policy_head.py
[23] https://github.com/Ergodice/lczero-training/blob/7b3ee3fcdb49d8abeb034718935b099134c11882/tf/tfprocess.py — Ergodice/lczero-training tf/tfprocess.py
[24] https://github.com/Ergodice/lczero-training/blob/7b3ee3fcdb49d8abeb034718935b099134c11882/tf/configs/example.yaml — Ergodice/lczero-training tf/configs/example.yaml
[25] https://github.com/ptshen/chessformer/blob/4f725520522de8ce5696fe1a3c7b7c4f9ae795e8/README.md — ptshen/chessformer README.md
[26] https://github.com/ptshen/chessformer/blob/4f725520522de8ce5696fe1a3c7b7c4f9ae795e8/configs/cf6m.json — ptshen/chessformer configs/cf6m.json
[27] https://arxiv.org/html/2605.19091v1 — Chessformer 2026 paper, v1
[28] https://arxiv.org/html/2409.20553v1 — Maia-2 paper, v1
[29] https://arxiv.org/html/2409.12272v2 — Mastering Chess with a Transformer Model, v2
[30] https://huggingface.co/UofTCSSLab/Maia3-5M/blob/b6559de2398d7140b985f28fd2c19fb5e47ddabe/README.md — Maia3-5M card
[31] https://huggingface.co/api/models/UofTCSSLab/Maia3-5M/tree/b6559de2398d7140b985f28fd2c19fb5e47ddabe — Maia3-5M file metadata
[32] https://huggingface.co/UofTCSSLab/Maia3-23M/blob/51a0145a8178046f7de23119160b136672deeb2b/README.md — Maia3-23M card
[33] https://huggingface.co/api/models/UofTCSSLab/Maia3-23M/tree/51a0145a8178046f7de23119160b136672deeb2b — Maia3-23M file metadata
[34] https://huggingface.co/UofTCSSLab/Maia3-79M/blob/a107d6ceb7b298cb04ae1da4edffe2939858b894/README.md — Maia3-79M card
[35] https://huggingface.co/api/models/UofTCSSLab/Maia3-79M/tree/a107d6ceb7b298cb04ae1da4edffe2939858b894 — Maia3-79M file metadata
[36] https://huggingface.co/UofTCSSLab/Maia3-ablate-3M/blob/990dfd78e6403805dbbbb5fcfccd4b3d3e778cc1/README.md — Maia3-ablate-3M card
[37] https://huggingface.co/api/models/UofTCSSLab/Maia3-ablate-3M/tree/990dfd78e6403805dbbbb5fcfccd4b3d3e778cc1 — Maia3-ablate-3M file metadata
[38] https://github.com/CSSLab/maia3/blob/1e13597c42d4858b7cfd7cfdae01e297263364b2/maia3/uci.py — Maia-3 checkpoint loading
[39] https://storage.googleapis.com/searchless_chess/checkpoints/9M.zip — 9M archive HTTP HEAD only
[40] https://storage.googleapis.com/searchless_chess/checkpoints/9M_state_value.zip — 9M_state_value archive HTTP HEAD only
[41] https://storage.googleapis.com/searchless_chess/checkpoints/9M_behavioral_cloning.zip — 9M_behavioral_cloning archive HTTP HEAD only
[42] https://storage.googleapis.com/searchless_chess/checkpoints/136M.zip — 136M archive HTTP HEAD only
[43] https://storage.googleapis.com/searchless_chess/checkpoints/270M.zip — 270M archive HTTP HEAD only
