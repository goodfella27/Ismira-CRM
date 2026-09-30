import type { Metadata } from "next";
import Script from "next/script";

export const metadata: Metadata = {
  title: "Ismira frontpage jobs feed",
  description: "Embed live, frontpage-enabled jobs on ismira.lt without an iframe.",
};

const snippet = `<div id="ismira-jobs"></div>
<script
  defer
  src="https://jobs.ismira.com/embed/jobs/v4/mount.js"
  data-api-base="https://jobs.ismira.com"
  data-portal-url="https://jobs.ismira.com/"
  data-target="#ismira-jobs"
  data-refresh-seconds="60"
></script>`;

const snippetWordPress = `add_action('wp_enqueue_scripts', function () {
  if (!is_front_page()) return;

  wp_register_script(
    'ismira-jobs-feed',
    'https://jobs.ismira.com/embed/jobs/v4/mount.js?v=1',
    [],
    null,
    true
  );

  wp_add_inline_script(
    'ismira-jobs-feed',
    'window.IsmiraJobsFeedConfig = { apiBase: "https://jobs.ismira.com", portalUrl: "https://jobs.ismira.com/", target: "#ismira-jobs", refreshSeconds: 60 };',
    'before'
  );

  wp_enqueue_script('ismira-jobs-feed');
});`;

export default function JobsEmbedPage() {
  return (
    <div className="min-h-screen bg-background px-4 py-10 text-muted-foreground sm:px-6">
      <div className="mx-auto w-full max-w-5xl">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Embed
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
            Ismira frontpage jobs
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Shows published jobs whose JD type is enabled for the frontpage. The
            feed contains public card data only and refreshes automatically.
          </p>
        </div>

        <div className="mt-8 rounded-panel border border-border bg-card p-6 text-foreground shadow-overlay">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            HTML / Elementor block
          </div>
          <pre className="mt-3 overflow-auto rounded-panel border border-border bg-muted p-4 text-xs text-foreground">
            <code>{snippet}</code>
          </pre>

          <div className="mt-6 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            WordPress enqueue (functions.php)
          </div>
          <pre className="mt-3 overflow-auto rounded-panel border border-border bg-muted p-4 text-xs text-foreground">
            <code>{snippetWordPress}</code>
          </pre>

          <div className="mt-6 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Preview
          </div>
          <div className="mt-3 overflow-hidden rounded-panel border border-border p-4">
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
