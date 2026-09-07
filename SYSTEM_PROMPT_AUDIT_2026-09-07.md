# Arclane Creator Studio — Full System Prompt Audit

Date: 2026-09-07
Auditor: Accio (instructor mode)
Scope: Complete `prompts.ts` (1184 lines, all 11 stages) + all 9 workspace components + `route.ts` API wiring
Goal: Determine whether each section's system prompt is strong enough to captivate viewers and survive on YouTube in 2026 and beyond, and identify any gaps or weaknesses.

---

## Executive Summary

### Overall verdict: **Strong — 8.5/10**

This is a genuinely well-engineered, evidence-first, retention-aware pipeline. The architecture is above the standard for AI-produced faceless channels. The core strengths are:

1. **Evidence chain integrity** — Research → Claim IDs → Script → Recheck. Almost no factual error risk.
2. **2026 retention alignment** — First 3–8 second hook, packaging match, momentum cadence.
3. **Inauthentic content policy compliance** — Named explicitly in `channelSystemPrompt`.
4. **Anti-AI-voice phrasing** — Specific blacklist of generic creator/AI phrases.
5. **Self-repair validation** — Every downstream stage salvages instead of dead-ending.
6. **Modesty safeguard system** — Strict/evidence-led modes properly wired through prompts and client.

### What needs fixing

After reading all 11 stages and 9 components, I found **6 issues** — 2 are genuine bugs, 4 are prompt-level improvements. None are catastrophic. Details below.

---

## Section-by-Section Audit

### 1. Channel System Prompt (`channelSystemPrompt`)

**Lines 34–65 | Status: STRONG**

The shared system prompt sent to all four providers on every request.

| Aspect | Verdict |
|--------|---------|
| Niche definition (Global Everyday History) | ✅ Clear and specific |
| Audience definition (global English viewers) | ✅ Correct |
| Channel promise | ✅ Concrete and memorable |
| Editorial rules (14 items) | ✅ Comprehensive — no geography banned, no facts invented, cultural respect, natural length |
| Platform Authenticity Requirement (lines 59–65) | ✅ Names YouTube's inauthentic content policy directly, makes originality binding, higher burden for AI |
| Anti-imitation rule | ✅ "Never imitate a competitor's title, thumbnail, script, or signature format" |

**No issues found.** This is one of the strongest channel system prompts I have seen for an AI-produced channel.

---

### 2. Ideas Stage (`ideas`)

**Lines 130–194 | Status: STRONG**

| Aspect | Verdict |
|--------|---------|
| Demand signal input (`demandSignal`) | ✅ Creator-supplied real data, treated as evidence not instruction |
| Performance feedback (`performanceFeedback`) | ✅ Carries past video analytics into screening |
| Demand policy (lines 149–155) | ✅ Never invents metrics, uses as screening evidence only |
| Protected memory (previous ideas) | ✅ Prevents duplicates |
| Private selection workflow (32→8) | ✅ Quality-first, no artificial quotas |
| Output contract (8 JSON ideas) | ✅ Clean, no extra fields |
| Stale "10–14 minute" text | ✅ Removed (confirmed by grep) |

**No issues found.** The demand-blind gap identified in the September 6 audit has been closed.

---

### 3. Research Stage (`research`)

**Lines 197–303 | Status: STRONG**

| Aspect | Verdict |
|--------|---------|
| Three research modes (Firecrawl / native search / knowledge-only) | ✅ Flexible |
| Evidence policy | ✅ Source assessment, claim statuses (VERIFIED/QUALIFIED/NOT VERIFIED/RECONSTRUCTION) |
| 12-section output contract | ✅ Comprehensive — claim ledger, chronology, lived experience, disputes, visual evidence map |
| Story architecture (5–8 beats with Claim IDs) | ✅ Bridges to Script |
| Handoff gate (READY/READY WITH CONDITIONS/NOT READY) | ✅ Honest stop |
| Protected inputs | ✅ Injection hygiene |

**No issues found.**

---

### 4. Script Draft Stage (`scripts`)

**Lines 306–396 | Status: STRONG**

| Aspect | Verdict |
|--------|---------|
| First 3–8 second hook rule | ✅ "the very first sentence must land a concrete, specific human situation" |
| Packaging match | ✅ "the opening must immediately confirm the subject a viewer was promised by the title and thumbnail" |
| Momentum rule | ✅ "no stretch of narration may run without forward pull" |
| 5+ movements through cause and effect | ✅ |
| Curiosity questions (2–4, all repaid) | ✅ |
| Anti-AI-voice phrase blacklist | ✅ 14+ specific banned phrases |
| Evidence contract (Claim IDs, no memory) | ✅ |
| Natural length (no word/minute quota) | ✅ |
| Blocked output (NEEDS RESEARCH) | ✅ |
| Final check self-audit | ✅ |

**No issues found.** This is the strongest single prompt in the pipeline.

---

### 5. Script Recheck Stage (`script_review`)

**Lines 398–465 | Status: STRONG**

| Aspect | Verdict |
|--------|---------|
| Controlled editorial pass (not fresh invention) | ✅ |
| Can use unused VERIFIED claims from Research | ✅ |
| Can restructure weak movements | ✅ |
| Cannot invent new facts | ✅ |
| Opening seconds recheck (3–8s + packaging match) | ✅ |
| Momentum, transportation, curiosity, voice, ending checks | ✅ |
| Natural length contract | ✅ |
| Stop rules (NEEDS RESEARCH gate) | ✅ |

**No issues found.** The two-pass system (Draft → Recheck) is well-designed.

---

### 6. Script Translation Stage (`script_translate`)

**Lines 1152–1173 | Status: STRONG**

| Aspect | Verdict |
|--------|---------|
| Preserves movement structure exactly | ✅ "Do not merge, split, reorder, add, or drop a movement" |
| Cold open + Closing payoff preserved | ✅ |
| Claim IDs untouched | ✅ |
| Natural Bengali (not robotic) | ✅ "expressive storytelling vocabulary, natural rhythm" |
| Transliteration rules | ✅ |
| No added facts | ✅ |

**No issues found.** The September 6 audit's Bug 4 (stale 4-act structure) has been fixed — the prompt now says "do not impose a fixed act count" and preserves the source's own movements.

---

### 7. Voiceover Stage (`voiceover`)

**Lines 468–514 | Status: STRONG**

| Aspect | Verdict |
|--------|---------|
| Two modes: Normal + Advanced | ✅ |
| Source protection (preserve every spoken word) | ✅ |
| Remove completely (headings, Claim IDs, metadata) | ✅ |
| Normal mode: punctuation-only performance | ✅ |
| Advanced mode: 40+ permitted bracket cues | ✅ Comprehensive set |
| Cue placement rules | ✅ "immediately before the sentence or phrase it controls" |
| Stack limit (max 2, unless one is a pause) | ✅ |
| Nonverbal reactions kept rare | ✅ |
| Minimum advanced cues enforcement (client-side) | ✅ `minimumAdvancedCues()` function |
| Client-side tag cleaning (`cleanVoiceoverOutput`) | ✅ Filters unknown tags |

**Regarding your question about emotion in voiceover:** Yes, the Advanced mode does add emotional cues — `[thoughtful]`, `[reflective]`, `[curious]`, `[serious]`, `[warm]`, `[softly]`, `[whispers]`, `[sighs]`, etc. The system maps the complete documentary arc first, then places cues where delivery genuinely changes. The prompt explicitly says "Tags must follow that arc rather than decorate isolated sentences." This is correctly designed.

**No issues found.**

---

### 8. Visuals Stage (`visuals`)

**Lines 516–665 | Status: STRONG (1 issue found)**

| Aspect | Verdict |
|--------|---------|
| Scene Library + Timeline architecture | ✅ One-request, clean |
| 5 asset types (ai_video, archive, map, stock, ai_still_motion) | ✅ |
| Visual Bible (strategy, evidenceLocks, modestyRule, continuityRules) | ✅ |
| Recurring character locks | ✅ Identity-locked |
| Reuse rules (max 3, never adjacent) | ✅ |
| Auto-variant generation for overused scenes | ✅ Client-side in `parseModelVisualPlan` |
| Modesty preference wired correctly | ✅ `data.visualModesty.mode` (not hardcoded) |
| Batch support for large manifests | ✅ 28-clip batches, lockedBible continuation |
| Repair mode | ✅ |
| Editorial grammar (grounded cinematic, not cartoon) | ✅ |
| YouTube synthetic-content disclosure note | ✅ |
| Final quality gate | ✅ |

**Issue V-1 (minor — prompt, not bug): Missing visual pacing guidance for retention.**
The visuals prompt says "Each item has a fixed ID, estimated timecode, duration and exact narration excerpt" and the client builds 6–8 second automatic beats, but the prompt itself never tells the AI to consider visual rhythm for attention. A 10-minute documentary with 6-second beats means ~100 clips — if they all look similar, viewers tune out visually even if the script is strong. The editorial grammar section says "vary shot function, scale, angle" but doesn't connect visual variety to viewer retention.

**Recommended fix:** Add one line to `<editorial_grammar>` about visual pacing and attention renewal at scene boundaries.

---

### 9. Audio Stage (`audio`)

**Lines 667–734 | Status: STRONG (1 issue found)**

| Aspect | Verdict |
|--------|---------|
| CapCut-focused output (volumeDb, fadeIn, fadeOut) | ✅ Practical |
| Script-grounded sound selection | ✅ "choose sound that directly supports what the viewer is hearing" |
| No invented events | ✅ |
| Faith-safe mode (no music) | ✅ Correctly wired to `data.audioMode.mode` |
| Normal mode (restrained music allowed) | ✅ |
| Coverage repair (clamps, closes gaps) | ✅ Client-side `parseAudioPlan` |
| Source rules (YouTube Audio Library, Pixabay) | ✅ |
| Silence as valid option | ✅ |

**Issue A-1 (minor — prompt): No emotional dynamics guidance for music/ambience.**
The audio prompt says "choose sound that directly supports what the viewer is hearing" and gives volume/fade rules, but it doesn't instruct the AI to vary intensity across the documentary's emotional arc. A documentary that starts tense, softens for explanation, then builds to a reveal should have audio that follows that curve. The current prompt could produce a flat bed of ambience that doesn't enhance the story's emotional movement.

**Recommended fix:** Add one sentence about following the documentary's emotional arc.

---

### 10. Thumbnails Stage (`thumbnails`)

**Lines 736–913 | Status: STRONG**

| Aspect | Verdict |
|--------|---------|
| 3 materially different concepts | ✅ |
| Text-free + text-led mix required | ✅ |
| Mobile-feed clarity | ✅ "Design must survive reduction to a small mobile preview" |
| Truth anchor (no invented drama) | ✅ |
| YouTube 3-variant A/B Test & Compare | ✅ Mentioned in UI |
| 3840x2160 production-ready prompts | ✅ |
| Modesty rule wired | ✅ |
| Private workflow (18→3) | ✅ |
| Evidence-based rules (no universal winning face) | ✅ |
| Phone-feed size testing | ✅ |
| No imitative content | ✅ |

**No issues found.** This is a well-designed thumbnail system.

---

### 11. Description Stage (`description`)

**Lines 915–1010 | Status: STRONG**

| Aspect | Verdict |
|--------|---------|
| 3 title finalists (browse / balanced / search) | ✅ |
| 100-character limit | ✅ |
| Fact gate (every claim supported by Script) | ✅ |
| Promise gate (opening confirms title) | ✅ |
| Thumbnail partnership (no headline repeat) | ✅ |
| Opening lines (2 lines before "Show more") | ✅ |
| Body 150–250 words | ✅ |
| Chapters (4–8, start at 0:00, increasing) | ✅ |
| No hashtags, AI disclosure, keyword stuffing | ✅ |
| Client-side salvage (drops unusable, keeps good) | ✅ |
| 5000-character limit enforcement | ✅ |

**No issues found.** The September 6 audit's gaps (chapter ban, short body) have been fixed.

---

### 12. Shorts Stage (`shorts`)

**Lines 1012–1150 | Status: STRONG**

| Aspect | Verdict |
|--------|---------|
| 3 slots, each independently publishable | ✅ |
| First-second hook (no greeting, no "Did you know?") | ✅ |
| Clean progression (hook → context → escalation → payoff → bridge) | ✅ |
| No invented facts | ✅ |
| Fresh connective narration allowed | ✅ |
| Non-repetition check against earlier Shorts | ✅ Client-side `wordSimilarity` |
| Timeline (4–45 shots, 2–12s each) | ✅ |
| 9:16 vertical visuals | ✅ |
| 2160x3840 cover with exact headline | ✅ |
| Audio zones with faith-safe support | ✅ |
| Caption rules (sparse, mobile-safe) | ✅ |
| Client-side repair (timing, faith-safe, length) | ✅ |

**No issues found.**

---

## Issues Found — Detailed

### Issue 1: BUG — Voiceover prompt is missing `extraInstructions` pathway

**Location:** `prompts.ts` line 468, `voiceover` stage
**Severity:** Medium (affects creator direction capability)

The September 6 audit (PROMPT_AUDIT_2026-09.md, Gap 6) noted that `extraInstructions` is not included in the Voiceover prompt. Looking at the code:

- Ideas: receives `creatorDirection` (line 131) ✅
- Research: receives `creatorDirection` (line 199) ✅
- Script: receives `creatorDirection` (line 307) ✅
- Script Recheck: does NOT receive `extraInstructions` — **intentional and correct** (the client at `script-workspace.tsx` sends no `extraInstructions` for recheck) ✅
- Voiceover: does NOT receive `extraInstructions` — the prompt has no `<creator_direction>` slot ❌
- Visuals: receives `creatorDirection` (line 517) ✅
- Audio: receives `${extra}` (line 709) ✅
- Thumbnails: receives `${extra}` (line 801) ✅
- Description: receives `${extra}` (line 962) ✅
- Shorts: receives `${extra}` (line 1093) ✅

The voiceover client at `voiceover-workspace.tsx` does not have a direction input field in the UI, so this is consistent — but it means a creator who wants to say "make the voiceover more somber" or "add more pauses in the middle section" has no way to pass that direction. For a channel that wants maximum captivation, this is a limitation.

**Verdict:** This is a design choice, not a bug. The voiceover prompt already maps the complete documentary arc and places cues based on the story. Adding a direction field could help, but the current system is functional.

**Recommendation:** Add an optional `creatorDirection` slot to the voiceover prompt for consistency, even if the UI doesn't expose it yet.

### Issue 2: BUG — Voiceover prompt version is stale (2026_08 vs 2026_09)

**Location:** `prompts.ts` line 470
**Severity:** Low (cosmetic, but worth bumping)

The voiceover prompt is versioned `ARCLANE_COPY_READY_VOICEOVER_2026_08_V3` while the Script and Recheck prompts were bumped to `2026_09` in the latest update. This is cosmetic — the content is current — but version drift makes future audits harder.

**Recommendation:** Bump to `2026_09_V4` when the next change is made.

### Issue 3: PROMPT — Visuals: missing visual pacing/attention renewal guidance

**Location:** `prompts.ts` lines 597–604 (`<editorial_grammar>`)
**Severity:** Low-Medium (affects long-form retention)

The prompt says "Make the episode visibly bespoke: vary shot function, scale, angle" but doesn't connect visual variety to the viewer's attention cycle. In a 10-minute documentary with ~100 clips, visual monotony is a real retention risk.

**Recommendation:** Add: "Vary visual rhythm to sustain attention: alternate tight and wide shots, shift pace at movement boundaries, and ensure that every major story transition brings a visible change in composition, colour, or evidence type."

### Issue 4: PROMPT — Audio: missing emotional arc guidance

**Location:** `prompts.ts` lines 682–693 (`<selection_rules>`)
**Severity:** Low (affects emotional immersion)

The prompt correctly says "choose sound that directly supports what the viewer is hearing" but doesn't instruct the AI to follow the documentary's emotional arc (tense → reflective → revelatory → resolved).

**Recommendation:** Add: "Follow the documentary's emotional arc: let intensity rise and fall with the story's tension, softening for explanation and building for reveals and consequences."

### Issue 5: PROMPT — Visuals protocol version says V4 but client expects V2

**Location:** `prompts.ts` line 544 says `ARCLANE_VISUAL_PLAN_2026_08_V4`, but `visuals-workspace.tsx` line 100 expects `ARCLANE_VISUAL_PLAN_2026_08_V2`
**Severity:** None — these are different fields

The prompt protocol tag (`<protocol>ARCLANE_VISUAL_PLAN_2026_08_V4</protocol>`) is a prompt-level version stamp that the AI sees. The client's `VisualPlan.version` field (`ARCLANE_VISUAL_PLAN_2026_08_V2`) is a JSON output contract version that the client validates. These are separate systems and the mismatch is intentional. No action needed.

### Issue 6: OBSERVATION — No end-screen or pinned-comment guidance

**Location:** Description stage
**Severity:** Low (nice-to-have, not a gap)

YouTube's 2026 best practices suggest end-screen elements and pinned comments for engagement. The description prompt explicitly says "Do not add publishing extras that belong elsewhere" — which is correct (end-screen belongs in the video editor, not the description). But no stage in the pipeline generates end-screen guidance or pinned-comment text.

**Verdict:** This is outside the current scope. The pipeline ends at packaging (title + description + thumbnails + shorts). End-screen guidance would be a future feature, not a fix.

---

## Summary Table

| Stage | Prompt Version | Issues | Severity |
|-------|---------------|--------|----------|
| Channel System Prompt | — | 0 | — |
| Ideas | 2026_09_V3 | 0 | — |
| Research | 2026_08_V3 | 0 | — |
| Script Draft | 2026_09_V3 | 0 | — |
| Script Recheck | 2026_09_V2 | 0 | — |
| Script Translate | 2026_09_V2 | 0 | — |
| Voiceover | 2026_08_V3 | 1 (stale version, missing direction slot) | Low |
| Visuals | 2026_08_V4 | 1 (missing pacing guidance) | Low-Medium |
| Audio | 2026_08_V3 | 1 (missing emotional arc) | Low |
| Thumbnails | 2026_08_V5 | 0 | — |
| Description | 2026_09_V5 | 0 | — |
| Shorts | 2026_08_V2 | 0 | — |

**Total issues: 3 prompt improvements + 1 version bump + 2 observations = 6 items, none critical.**

---

## What's Already Excellent (Keep)

1. **Evidence chain** — Research → Claim IDs → Script → Recheck. This is the channel's strongest defence against factual errors and the inauthentic content policy.
2. **Retention architecture** — First 3–8 second hook, packaging match, momentum cadence, re-hook beats. This is 2026-aligned.
3. **Self-repair validation** — Every downstream stage (Visuals, Audio, Thumbnails, Description, Shorts) salvages instead of dead-ending. One bad AI response never destroys a session.
4. **Modesty safeguard system** — Strict/evidence-led modes correctly wired through prompts, client validation, and auto-attached safeguard sentences.
5. **Anti-AI-voice phrasing** — The specific blacklist in the Script prompt directly targets phrases that get content flagged as generic.
6. **Two-pass script system** — Draft → Recheck with editorial freedom but no invention. This produces stronger scripts than a single pass.

---

## Will This Channel Succeed?

**The system prompts are strong enough.** The pipeline is built for truthfulness, retention, and platform compliance — the three things that determine whether a faceless AI-produced history channel survives YouTube's 2026 review process and keeps viewers watching.

The remaining variables are not in the prompts:
- **Consistency** — publishing regularly
- **Packaging quality** — the thumbnail and title are what get the click; the script keeps them watching
- **Visual execution** — the AI video/image generation quality (outside the prompt's control)
- **Voice quality** — the TTS model chosen (outside the prompt's control)

The prompts do their job. The rest is execution.
