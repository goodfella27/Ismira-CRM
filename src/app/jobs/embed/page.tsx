import type { Metadata } from "next";
import Script from "next/script";

export const metadata: Metadata = {
  title: "Embed jobs widget",
  description: "Copy/paste snippet to embed the jobs board without an iframe.",
};

const snippet = `<script defer src="https://YOUR_DOMAIN/embed/jobs/v2/widget.js" data-api-base="https://YOUR_DOMAIN"></script>
<linas-jobs-board api-base="https://YOUR_DOMAIN"></linas-jobs-board>`;

const snippetCompat = `<div id="linas-jobs"></div>
<script defer src="https://YOUR_DOMAIN/embed/jobs/v3/mount.js" data-api-base="https://YOUR_DOMAIN" data-debug="1"></script>`;

const snippetWordPress = `add_action('wp_enqueue_scripts', function () {
  if (!is_page('testing-api-localhost')) return;

  wp_register_script(
    'linas-jobs',
    'https://YOUR_DOMAIN/embed/jobs/v3/mount.js?v=1',
    [],
    null,
    true
  );

  wp_add_inline_script(
    'linas-jobs',
    'window.LinasJobsEmbedConfig = { apiBase: "https://YOUR_DOMAIN", target: "#linas-jobs", debug: true };',
    'before'
  );

  wp_enqueue_script('linas-jobs');
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
            Jobs widget
          </h1>
          <p className="mt-2 text-sm text-slate-300">
            Use this snippet to embed the jobs board on any website without an
            iframe.
          </p>
        </div>

        <div className="mt-8 rounded-3xl border border-white/10 bg-white p-6 text-slate-900 shadow-[0_20px_60px_-40px_rgba(0,0,0,0.8)]">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Copy/paste
          </div>
          <pre className="mt-3 overflow-auto rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-800">
            <code>{snippet}</code>
          </pre>

          <div className="mt-6 text-xs font-semibold uppercase tracking-wide text-slate-500">
            WordPress-safe (no custom elements)
          </div>
          <pre className="mt-3 overflow-auto rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-800">
            <code>{snippetCompat}</code>
          </pre>

          <div className="mt-6 text-xs font-semibold uppercase tracking-wide text-slate-500">
            WordPress enqueue
          </div>
          <pre className="mt-3 overflow-auto rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-800">
            <code>{snippetWordPress}</code>
          </pre>

          <div className="mt-6 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Preview
          </div>
          <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200">
            <Script src="/embed/jobs/v2/widget.js" strategy="afterInteractive" />
            <linas-jobs-board />
          </div>

          <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200">
            <Script src="/embed/jobs/v3/mount.js" strategy="afterInteractive" />
            <div data-linas-jobs-board />
          </div>
        </div>
      </div>
    </div>
  );
}
