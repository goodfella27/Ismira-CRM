import type { Metadata } from "next";
import Script from "next/script";

export const metadata: Metadata = {
  title: "Ismira frontpage jobs feed",
  description: "Embed live, frontpage-enabled jobs on ismira.lt without an iframe.",
};

const snippet = `<div id="ismira-jobs"></div>
<script
  defer
  src="https://YOUR_CRM_DOMAIN/embed/jobs/v4/mount.js"
  data-api-base="https://YOUR_CRM_DOMAIN"
  data-target="#ismira-jobs"
  data-refresh-seconds="60"
></script>`;

const snippetWordPress = `add_action('wp_enqueue_scripts', function () {
  if (!is_front_page()) return;

  wp_register_script(
    'ismira-jobs-feed',
    'https://YOUR_CRM_DOMAIN/embed/jobs/v4/mount.js?v=1',
    [],
    null,
    true
  );

  wp_add_inline_script(
    'ismira-jobs-feed',
    'window.IsmiraJobsFeedConfig = { apiBase: "https://YOUR_CRM_DOMAIN", target: "#ismira-jobs", refreshSeconds: 60 };',
    'before'
  );

  wp_enqueue_script('ismira-jobs-feed');
});`;

export default function JobsEmbedPage() {
  return (
    <div className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100 sm:px-6">
      <div className="mx-auto w-full max-w-5xl">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-400">
            Embed
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
            Ismira frontpage jobs
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-300">
            Shows published jobs whose JD type is enabled for the frontpage. The
            feed contains public card data only and refreshes automatically.
          </p>
        </div>

        <div className="mt-8 rounded-3xl border border-white/10 bg-white p-6 text-slate-900 shadow-[0_20px_60px_-40px_rgba(0,0,0,0.8)]">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            HTML / Elementor block
          </div>
          <pre className="mt-3 overflow-auto rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-800">
            <code>{snippet}</code>
          </pre>

          <div className="mt-6 text-xs font-semibold uppercase tracking-wide text-slate-500">
            WordPress enqueue (functions.php)
          </div>
          <pre className="mt-3 overflow-auto rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-800">
            <code>{snippetWordPress}</code>
          </pre>

          <div className="mt-6 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Preview
          </div>
          <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 p-4">
            <Script
              src="/embed/jobs/v4/mount.js"
              data-target="#ismira-jobs-preview"
              strategy="afterInteractive"
            />
            <div id="ismira-jobs-preview" />
          </div>
        </div>
      </div>
    </div>
  );
}
