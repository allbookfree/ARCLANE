# Arclane Studio — System Prompt Audit

Date: 2026-09-06
Scope: `app/api/automation/generate/prompts.ts` (1141 lines), `route.ts`, and the nine Studio stage workspaces.
Question audited: **Are the per-stage system prompts fit for current (2026) YouTube reality — will they produce output good enough for the channel to survive?**

---

## Verdict in one line

The **evidence and safety architecture is genuinely strong and above the market average**. The **demand and performance architecture is missing entirely**. As written, the system reliably produces *truthful, defensible, non-generic* documentaries, but it has no mechanism to check that anyone actually wants to watch them — and two UI toggles are silently overridden in code.

Rough split: editorial quality ~8.5/10, platform/algorithm fitness ~5/10, code correctness ~7/10.

---

## How the prompts are actually wired

- `channelSystemPrompt` (prompts.ts:32-55) is sent as the true system message on all four providers — OpenAI `instructions`, Anthropic `system`, Gemini `systemInstruction`, custom `role: 'system'` (route.ts:270, 310, 443, 504). This is correct and consistent.
- `buildStagePrompt()` returns one large user-role prompt per stage, versioned with a `<protocol>` tag (e.g. `ARCLANE_VISUAL_PLAN_2026_08_V4`).
- Every stage is stamped `2026_08`, i.e. roughly one month old. Nothing is stale by date.

---

## What is genuinely strong (keep this)

1. **Evidence-first chain.** Research produces a claim–evidence ledger with `VERIFIED / QUALIFIED / NOT VERIFIED / RECONSTRUCTION` statuses and `C01`-style IDs; Script may only use approved claims and must tag paragraphs; Recheck re-validates against the same dossier. Very few faceless pipelines have this. It is the main reason this channel is unlikely to publish an embarrassing factual error.
2. **Prompt-injection hygiene.** Every stage that ingests upstream text wraps it in `<protected_source>` / `<protected_inputs>` and states that the content is untrusted reference data, not instructions (prompts.ts:122, 289, 377, 516, 710, 888, 981). This is current best practice and correctly applied.
3. **Anti-AI-voice rules.** The Script `<voice>` block explicitly bans "Welcome back", "In this video", "Imagine a world", "delve", "a rich tapestry", "This wasn't just X—it was Y", rhetorical-question chains and moral-per-paragraph (prompts.ts:314). This directly targets the phrasing that gets content flagged as generic.
4. **Structured JSON contracts + validators.** Visuals, Thumbnails, Description, Shorts and Audio all return strict JSON, validated client-side, with `jsonrepair` for syntax-only damage and an explicit rule that repair can never invent missing content. Good engineering.
5. **Three materially different thumbnail concepts.** This maps exactly onto YouTube's A/B "Test & Compare" feature, which allows **up to 3 title/thumbnail variants** ([YouTube Help](https://support.google.com/youtube/answer/16391400?hl=en)). The stage is accidentally well-designed for it — but never mentions it (see Gap 5).

---

## Confirmed bugs (code, not opinion)

### BUG 1 — Visuals modesty toggle is dead

`prompts.ts:486` hardcodes `const strictModesty = true;` while `compactContext` still computes `visualModesty` from the user's setting and passes `modestyMode` into `batch_packet` (prompts.ts:499).

Result: a user who leaves the toggle on "evidence-led" gets a prompt whose JSON packet says `"modestyMode":"evidence_led"` while the adjacent text block says `STRICT COVERING IS ACTIVE`. **The prompt contradicts itself**, and the UI switch at `visuals-workspace.tsx:1283` does nothing to the request.

### BUG 2 — Audio faith-safe toggle is dead

`prompts.ts:634` hardcodes `const faithSafe = true;`, so the Audio prompt always forbids music. But the client parser at `audio-workspace.tsx:286` only enforces the music ban when `mode === 'faith_safe'`.

Result: a user who selects **Normal** audio is told music is allowed, the validator permits it, but the prompt forbids it — so music never appears and no error explains why. The `audio-workspace.tsx:643` switch is decorative.

*(Note: the same hardcoding in `shorts` is intentional — `shorts-workspace.tsx:201-202` locks both modes client-side too, so Shorts is consistent. Only Visuals and Audio are contradictory.)*

### BUG 3 — Stale length constraint in two prompts

`PROJECT_MEMORY.md` records that fixed episode length was deliberately removed, and the Script stage correctly uses natural length. But Ideas still says *"too broad for one 10–14 minute episode"* (prompts.ts:147) and Research still says *"cinematic 10–14 minute English documentary"* (prompts.ts:198). Ideas are therefore being screened against a rule the rest of the pipeline abandoned.

### BUG 4 — Translate stage is out of sync

`ARCLANE_SCRIPT_TRANSLATION_BENGALI_2026` (prompts.ts:1113-1130) instructs the model to preserve a **4-act structure** (`প্রথম অঙ্ক` … `চতুর্থ অঙ্ক`). The Script contract produces **at least five movements** with `## 1. Cold open` and a final `Closing payoff` (prompts.ts:333). The translator is being asked to map a structure that no longer exists.

---

## Strategic gaps vs. 2026 reality

### Gap 1 — The pipeline is demand-blind (most serious)

Ideas explicitly forbids demand signals: *"Search is a feasibility signal, never proof of demand or future performance. Report no metrics in the output"* (prompts.ts:137). Research, Thumbnails and Description repeat the ban.

The intent is honest — no fabricated metrics — and that instinct is right. But the consequence is that **nothing anywhere in nine stages ever asks whether a real audience is looking for this story.** Topic selection is judged purely on evidence quality and internal variety. A perfectly researched episode about a subject with no audience is indistinguishable, to this system, from a winner.

The fix is not to let the model hallucinate metrics. It is to add a **creator-supplied demand input** — a small field where real observed data (competitor view counts, search suggestions, a topic that already worked) is pasted in and treated as evidence, exactly like Firecrawl evidence is treated in Research.

### Gap 2 — Hook window is set to a 2019 standard

Script requires the central question and stakes *"within roughly the first 30 spoken seconds"* (prompts.ts:295). On a browse-dominated 2026 feed the retention decision happens in the **first 3–8 seconds**. There is no rule about the opening seconds specifically, no re-hook cadence for the mid-video drop, and no instruction that the **opening frame must visually confirm the thumbnail promise** — the single most common cause of high CTR with bad retention.

### Gap 3 — No feedback loop

Ideas reads previous ideas only to *avoid duplicates* (`<protected_memory>`, prompts.ts:122). Nothing ingests what actually performed. A surviving channel iterates on its own analytics; this pipeline cannot, because no stage accepts CTR, average view duration or retention as input.

### Gap 4 — Monetization policy is implied, never stated

YouTube's current policy (renamed **"inauthentic content"** on 15 July 2025) requires content that is *"not mass-produced, generic, repetitive, or manipulative"* and states reviewers specifically assess **titles, thumbnails and descriptions** ([YouTube Help](https://support.google.com/youtube/answer/1311392?hl=en)).

The prompts comply *in spirit* — "never produce an interchangeable slideshow", "make the episode visibly bespoke" (prompts.ts:567), original structure and wording (prompts.ts:51). But because this is a fully AI-produced pipeline (AI script → TTS voice → AI video), it sits in the exact category reviewers scrutinise, and **the policy is never named in `channelSystemPrompt`**. Naming it makes the constraint binding rather than incidental.

### Gap 5 — Packaging stops at the door

- Thumbnails generates 3 concepts but never tells the creator these map onto YouTube's native 3-variant A/B test.
- Description bans **chapters/timestamps and hashtags outright** (prompts.ts:922). The AI-disclosure ban is correct (that belongs in the upload checkbox, not the description). The chapter ban is not — chapters aid retention and navigation on long documentaries.
- Description body is capped at **90–160 words** (prompts.ts:921), short of the norm for documentary channels where the description carries real context.
- No end-screen, pinned-comment or first-hour engagement guidance anywhere.

### Gap 6 — Creator direction silently dropped in two stages

`extraInstructions` is threaded into Ideas, Research, Scripts, Visuals, Audio, Thumbnails, Description and Shorts. It is **not** included in the Voiceover or Script Recheck prompts. For Recheck this is deliberate and correct (`script-workspace.tsx:407` sends no `extraInstructions` at all). For **Voiceover** the client does have a direction field pathway but the prompt has no slot for it — worth confirming against intended behaviour.

---

## Recommended fix order

| # | Fix | Effort | Why |
|---|---|---|---|
| 1 | Honour `visualModesty.mode` and `audioMode.mode` instead of hardcoding | 10 min | Removes self-contradicting prompts; makes two UI switches real |
| 2 | Add a creator-supplied **demand/competition input** to Ideas | Medium | Closes the single biggest survival gap without inventing metrics |
| 3 | Rewrite the Script hook rule: first 3–8 seconds + thumbnail-promise match + re-hook beats | 30 min | Directly targets retention, the metric that decides distribution |
| 4 | Name the inauthentic-content policy in `channelSystemPrompt` | 10 min | Makes originality a binding constraint, not a side effect |
| 5 | Remove the stale "10–14 minute" text from Ideas and Research | 5 min | Aligns idea screening with natural-length policy |
| 6 | Allow chapters in Description; raise body to ~150–250 words | 15 min | Recovers navigation and context value |
| 7 | Add an analytics-feedback field to Ideas | Medium | Enables iteration |
| 8 | Sync the Translate prompt to the real movement structure | 10 min | Fixes a broken structural mapping |
| 9 | Mention native 3-variant A/B testing in the Thumbnails UI | 10 min | Free use of an already-correct output shape |

---

## Bottom line

Nothing here is out of date by *version* — every protocol is stamped 2026_08 and the injection, JSON and evidence practices are current. The weakness is **directional**: the system was built to guarantee that the channel never lies, and it succeeds. It was not built to determine what the channel should make, or how to open a video so people keep watching. Fix items 1–4 and the pipeline moves from "defensible" to "competitive".
