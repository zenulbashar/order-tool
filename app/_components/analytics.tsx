import Script from "next/script";

/**
 * Google Analytics 4 — env-gated, zero-dependency. Renders the gtag snippet
 * ONLY when NEXT_PUBLIC_GA_ID is set, so dev/preview deployments stay
 * untracked and no consent surface is triggered where analytics is off. The
 * id is deploy-controlled config (never user input) and shape-checked anyway
 * before being inlined.
 */
export function Analytics() {
  const gaId = process.env.NEXT_PUBLIC_GA_ID;
  if (!gaId || !/^[A-Za-z0-9-]+$/.test(gaId)) return null;
  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
        strategy="afterInteractive"
      />
      <Script id="ga4-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${gaId}');`}
      </Script>
    </>
  );
}
