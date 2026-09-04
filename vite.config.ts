import { sites } from '@openai/sites-vite-plugin';
import tailwindcss from '@tailwindcss/postcss';
import vinext from 'vinext';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite';
import hostingConfig from './.openai/hosting.json';

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  '00000000-0000-4000-8000-000000000000';

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === 'seatbelt';
const isVercelBuild = process.env.VERCEL === '1' || process.env.NITRO_PRESET === 'vercel';

const localBindingConfig = {
  main: 'vinext/server/app-router-entry',
  compatibility_flags: ['nodejs_compat'],
  // Node env vars do not reach the workerd runtime automatically; forward the
  // optional access-gate code as a wrangler var so local dev can lock too.
  vars: { ARCLANE_ACCESS_CODE: process.env.ARCLANE_ACCESS_CODE ?? '' },
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: 'site-creator-d1',
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: 'site-creator-r2',
        },
      ]
    : [],
};

export default defineConfig(async () => {
  if (isVercelBuild) {
    // Vercel kills functions that exceed their configured maxDuration, which
    // silently drops long AI generation stages (Research/Script/Visuals/
    // Voiceover) before the provider answers. Fluid compute allows 300s on
    // every plan, so default to 300s and stay within it. Override per
    // deployment with VERCEL_MAX_DURATION in the Vercel project environment.
    // The value is clamped so an unsafe choice never produces a
    // build-breaking config.
    const vercelMaxDuration = Math.min(
      300,
      Math.max(10, Number(process.env.VERCEL_MAX_DURATION) || 300),
    );
    return {
      css: { postcss: { plugins: [tailwindcss()] } },
      plugins: [
        vinext(),
        ...nitro({
          preset: 'vercel',
          vercel: {
            functions: {
              runtime: 'nodejs22.x',
              maxDuration: vercelMaxDuration,
            },
            functionRules: {
              '/api/**': { maxDuration: vercelMaxDuration },
            },
          },
        }),
      ],
    };
  }
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= 'false';
  process.env.WRANGLER_LOG_PATH ??= '.wrangler/logs';
  process.env.MINIFLARE_REGISTRY_PATH ??= '.wrangler/registry';

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import('@cloudflare/vite-plugin');

  return {
    css: { postcss: { plugins: [tailwindcss()] } },
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
        config: localBindingConfig,
      }),
    ],
  };
});
