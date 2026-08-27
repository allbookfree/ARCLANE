# Arclane Creator Studio — Project Memory

Last updated: 2026-08-25

## Purpose

Arclane Creator Studio is a professional, local-first production workspace for a faceless English-language YouTube channel. The selected niche is **Global Everyday History**: deeply researched, human-centred documentary stories about how ordinary people lived, worked, travelled, ate, survived and adapted across every region and era of the world.

This file is the durable recovery point for future sessions and power interruptions. Read it before making project changes and update it after every major section is completed.

## Confirmed workflow

Ideas → Research → Script → Voiceover → Visuals → Audio → Thumbnails → Description → Shorts

Memory and Settings are separate workspace areas, not production stages.

## Product rules

- No database is being used yet. User data and preferences remain in browser local storage.
- Nothing should automatically spend an AI or search credit. Each generation starts only after a clear user action.
- A selected item moves forward; unrelated alternatives do not enter the next stage.
- Every stage must preserve its upstream source and make it viewable.
- Native model live search and Firecrawl are optional Research tools. The user can keep both off or choose an available source; unsupported combinations must be explained in the interface.
- Automated validation must never use saved API keys or consume provider/Firecrawl credits.

## Completed sections

### Ideas

- Niche-aware idea generation for Global Everyday History.
- Automatic discovery settings, selection, copy, save, clear and duplicate-memory protection.
- Saved ideas live in the dedicated Memory section and can be exported/imported for transfer between computers.
- The selected idea is handed to Research without automatically starting Research.

### Research

- The selected idea appears as the active source with a detailed view.
- Research begins only after the user clicks the generation button.
- Structured, evidence-conscious research output and quality checks.
- Optional native live search / Firecrawl paths and provider settings.
- A completed Research dossier can be handed to Script without automatically generating a Script.

### Script

- Manual Draft generation from the selected Research dossier.
- Script length is fully automatic and follows the evidence and natural story arc. There is no fixed 10/12/14-minute setting and no required word-count window.
- Spoken-word count and estimated runtime remain visible as information only; neither can block Recheck approval or Voiceover.
- Original Draft is preserved before Recheck; it can be viewed or chosen again as the current Script.
- **Recheck & Polish** is a separate manual final-editor request. It treats the Draft as a starting point rather than a creative ceiling: it may rewrite or restructure weak movements and add transitions, contrasts, setup/payoff language, unused VERIFIED claims and explicitly permitted QUALIFIED material from the complete approved Research. It may never add an outside or invented factual claim. It returns one complete corrected Script—not a report.
- The former four-gate display has been removed. The interface gives one plain instruction: click Recheck & Polish. A successful, saved Recheck automatically enables Voiceover.
- Only essential evidence failures can stop the handoff: disconnected approved Research, a `NEEDS RESEARCH` result, or an unresolved verification note.
- Editing or restoring the Script resets Recheck approval so Voiceover cannot receive outdated wording.
- Draft/Recheck requests write a temporary operation checkpoint. If power or the browser stops mid-request, the next Script visit explains that the saved work is safe and offers a clean retry.
- Provider deadlines are stage-aware: Script Draft, Script Recheck and Visual planning allow up to six minutes per request; Research and Voiceover allow five; shorter stages allow three. Long-form stages use fewer bounded attempts, and a client-side timeout never launches a hidden duplicate request. Recheck never enables live search.
- Exact rendered audio length will be confirmed in Voiceover. Script runtime is only an automatic estimate and never a production gate.

### Voiceover

- Voiceover receives only the saved **Final Script** whose Recheck status is approved. Arrival never sends an AI request.
- The handoff shows the selected documentary, spoken preview, source length and **View full Script**.
- The user chooses exactly one of two simple preparation modes. In both modes, clicking the button sends the complete Final Script to the selected text AI and returns one complete copy-ready Voiceover:
  - **Normal:** removes titles, headings, status metadata, Claim IDs (`[C1]`, `[C01]`, etc.), citations and Editorial handoff; uses only natural punctuation, paragraph spacing and sentence grouping. Full stops, commas, colons, paragraph breaks, em dashes and ellipses each have constrained semantic roles so punctuation does not manufacture drama. The whole output can be pasted into almost any TTS tool.
  - **Advanced:** performs the same cleaning and preservation, then inserts a restrained approved vocabulary of inline cues where useful, including `[short pause]`, `[medium pause]`, `[long pause]`, `[thoughtful]`, `[reflective]`, `[curious]`, `[serious]`, `[warm]`, `[softly]`, `[whispers]`, `[sighs]` and related supported directions. The complete output is meant for a bracket-cue-compatible voice model.
- Before either request, the browser extracts the complete spoken narration from the approved Final Script. Raw headings, Claim IDs and Editorial handoff are not sent to the AI. The prompt still instructs the AI to preserve the narration, but harmless model wording/formatting differences no longer trigger a hard blocking error.
- Advanced output must contain a meaningful minimum number of approved cues based on Script length. An almost-plain Advanced response is rejected so Normal and Advanced cannot silently become identical. The hidden prompt first maps the complete documentary arc, treats punctuation as the primary performance layer, limits cue stacking, and keeps nonverbal reactions rare.
- Unknown bracket tags are removed, all Claim IDs are removed, Markdown emphasis symbols are removed, and the final response contains no headings, reports, JSON, timelines, adapters or separate direction panels.
- The page displays only one read-only Voiceover result with **Copy complete Voiceover** and `.txt` download. No manual mid-Script editing is required.
- Switching modes or changing the Final Script makes earlier output non-current. The earlier result and its warning are hidden; the page simply asks the user to click Prepare Voiceover. Visuals remains disabled until the selected mode is prepared from the current approved Script.
- The abandoned provider-neutral Expression Master V2 interface, performance timeline and multiple output adapters were removed because they made the creator workflow unnecessarily complex.

### Visuals

- Visuals receives the approved Final Script as the factual/story source and the current prepared Voiceover only as the spoken-order and timing source. Arrival never starts an AI request.
- The page shows the selected documentary, a Script preview, **View full Script**, the source word count, estimated visual timeline and planned clip count.
- Before requesting AI, the browser removes Voiceover performance tags and deterministically divides the complete spoken narration into fixed manifest items. **Automatic** (recommended/default) uses 6–8 second documentary beats; **Custom** accepts a creator-selected maximum of 3–120 seconds supported by their chosen generation model. Each item has a fixed ID, estimated timecode, duration and exact narration excerpt.
- Clicking **Build Visual Plan** makes one provider request. The AI may direct visuals but cannot rewrite narration, change clip order, merge clips, omit clips or invent new clip IDs.
- The episode uses a hybrid evidence-led visual language: grounded cinematic reconstruction for supportable lived moments; authentic artifacts/documents/archive when they explain the truth better; maps/diagrams for geography or systems; stock for timeless landscape/weather/craft texture; controlled AI still-motion when generated motion would be unstable or misleading. Cartoon is not the default channel look.
- Duration is a maximum production window, not a padding target. Automatic remains safest for current short-generation models. A long Custom window produces fewer blocks and instructs AI to design one coherent internal progression; the creator should select it only when their visual model genuinely supports that length.
- Asset choice remains automatic and quality-led at every duration: AI video, generated/historical image with pan/parallax/overlays, archive/artifact, map/diagram or responsibly licensed stock. The system never forces every block to be AI video, and it prefers a strong truthful still or real asset over weak generation.
- The output begins with one episode visual bible covering colour/texture, camera language, archive/reconstruction separation, continuity rules and YouTube synthetic-content disclosure.
- A recurring-character reference pack appears only when a recognizable person genuinely recurs. It provides stable IDs, immutable identity descriptions and copy-ready reference prompts to create before dependent clips.
- Visual Plan V2 uses one-request **Scene Library + Timeline Map** architecture. Each unique production asset has one numbered `SCENE-###` card containing asset type, shot purpose, one copy-ready provider-neutral prompt, exactly two archive/stock queries and one concise continuity/evidence/rights note. Full prompts are never repeated in the timeline.
- The compact timeline covers every narration block at the selected duration. Each card clearly says **CREATE SCENE ##** on first use or **USE SCENE ##** on a later use, plus an executable first-use or alternate-treatment direction.
- Scene reuse is quality-gated, not quota-driven: no scene can be adjacent to itself or appear more than three times. Reuse is reserved for truthful establishing geography, objects/processes, maps/diagrams, archive items or deliberate motifs; unique reveals, evolving action and emotional turns require new scenes.
- Eight Scene Library cards and ten Timeline cards are shown initially, then progressively revealed. Individual prompts/searches, the complete plan and a JSON download remain available without manual editing.
- The application accepts a response only when every fixed clip appears exactly once and in order, every Timeline scene ID exists, every saved scene is usable, directions are present and reuse limits pass. A partial, duplicated, malformed, truncated or repetitive response never replaces a previously saved good Visual Plan.
- Visuals requests one simple JSON object with plain single-line strings and concise Timeline directions. Gemini uses its official JSON response mode with a safe plain-text fallback for incompatible models. All providers pass through syntax-only JSON repair for harmless punctuation/escaping mistakes, then the full semantic coverage validator; repair can never invent or approve missing production content.
- Each new valid Visual Plan is stored locally with its exact Script and Voiceover timestamps and clears outdated downstream Audio/packaging records. Audio remains disabled until the current complete Visual Plan is saved.
## Current handoff

The Visuals section implementation and local validation are complete. Prepare one current Voiceover, open Visuals, review the Script handoff, choose a saved text model and click **Build Visual Plan**. The first real provider result must still be creator-reviewed for historical suitability and prompt usefulness because automated validation intentionally consumed no API credit. After one complete Visual Plan is saved and checked, continue to Audio.
## Provider and storage notes

- Provider/model selections, Visuals duration preference and keys are managed locally in the browser.
- Models are fetched after a valid key is supplied; the interface should not invent provider models or endpoints.
- Generated workflow records, saved idea memory and user preferences currently rely on local storage, so export/import remains important before moving computers or clearing browser data.

## Vercel deployment notes

- Production build uses the Nitro Vercel preset via `NITRO_PRESET=vercel npm run vercel-build`. `vite.config.ts` now sets `vercel.functionRules['/api/**'].maxDuration` from `VERCEL_MAX_DURATION`, defaulting to 60 and clamped between 10 and 300.
- Root cause of "some options don't work after GitHub → Vercel": Vercel serverless functions default to a 10-second timeout, which silently killed long generation stages (Research, Script, Visuals, Voiceover) while short stages appeared to work locally. Raising `maxDuration` fixes it.
- On Vercel Hobby (60-second cap) leave `VERCEL_MAX_DURATION` unset or set `60`. On Pro, add project environment variable `VERCEL_MAX_DURATION=300` so the longest stages can finish.
- No server-side secrets are required: provider API keys live in browser local storage and are sent in the request body to the same-origin `/api/*` routes, which proxy to the providers.

## Validation record

On 2026-08-25, the interruption recovery, evidence-bound Recheck/timeout improvements and natural-length UI simplification passed targeted linting, TypeScript checking and complete production builds. The local Script route returned HTTP 200, and the `script_review` API stage correctly stopped at missing-model validation without contacting an external AI provider or consuming credits.

On 2026-08-25, the dedicated Voiceover files passed targeted linting, the whole project passed TypeScript checking, and the complete production build succeeded. The local Voiceover route returned HTTP 200, while a no-key Voiceover API request stopped at HTTP 400 before contacting any provider or consuming credits.
On 2026-08-25, the Voiceover V2 redesign passed focused ESLint checks, full TypeScript validation, two local Expression-contract tests (valid master/adapters and Script-only rejection), and a complete production build. The local Voiceover route returned HTTP 200 and the refreshed server serves the new compiled client bundle. The project-wide lint command still reports unrelated pre-existing Ideas/Memory/Stage hook errors; no changed Voiceover file has a lint error.
On 2026-08-25, the Expression Master V2 UI and its three obsolete source/style files were removed and replaced by the requested two-mode copy-ready Voiceover workflow. Separate Normal/Advanced prompt-contract tests, focused ESLint, full TypeScript validation, production build and the local Voiceover HTTP health check passed. No provider credit was consumed during validation.

On 2026-08-25, the confusing stale-output warning and exact-word rejection gate were removed. Voiceover now sends pre-cleaned complete spoken narration, hides non-current output, and blocks only empty output or an Advanced response with too few approved cues. Focused lint, TypeScript, production build and localhost health check passed.

On 2026-08-25, the final Voiceover prompt audit incorporated current official TTS guidance without changing the simple UI: Normal now has semantic punctuation rules; Advanced first maps the complete story arc, uses punctuation before tags, supports current pause/delivery cues, limits stacking and restrains nonverbal reactions. Prompt tests, focused lint, TypeScript and production build passed.

On 2026-08-27, fixed the Vercel hosting issue where Studio and generation stages failed on live deployment:
- Resolved Node.js 24 vs Vercel Serverless runtime mismatch: updated `package.json` engines to `>=20.0.0` and explicitly configured Nitro Vercel functions to use `runtime: 'nodejs22.x'` with `maxDuration` applied to both base serverless functions and `/api/**` route handlers.
- Hardened `app/layout.tsx` `metadataBase` to safely normalize protocol headers when `NEXT_PUBLIC_SITE_URL` or `VERCEL_URL` is set without `https://`.
- Full TypeScript validation (`tsc --noEmit`), build verification (`NITRO_PRESET=vercel npm run vercel-build`), and function config inspection (`.vc-config.json`) passed cleanly.

