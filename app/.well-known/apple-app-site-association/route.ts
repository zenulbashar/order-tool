export const dynamic = "force-dynamic";

/**
 * Apple Universal Links association, served at
 * `/.well-known/apple-app-site-association` (no extension, application/json).
 * With this in place, tapping a magic-link on the owner's iPhone opens the
 * native app instead of Safari, so sign-in can complete in-app.
 *
 * Configure `IOS_APP_ID` = "<TEAM_ID>.au.com.zaleit.prompt2eat.owner". The
 * associated paths cover auth + dashboard ONLY — the storefront (`/{slug}`) is
 * deliberately excluded so "view storefront" still opens in the browser.
 * Returns 404 until configured.
 */
export async function GET(): Promise<Response> {
  const appId = process.env.IOS_APP_ID;
  if (!appId) return new Response("Not found", { status: 404 });

  const body = {
    applinks: {
      apps: [],
      details: [
        {
          appID: appId,
          paths: [
            "/api/auth/*",
            "/signin",
            "/signin/*",
            "/dashboard",
            "/dashboard/*",
          ],
        },
      ],
    },
  };

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
