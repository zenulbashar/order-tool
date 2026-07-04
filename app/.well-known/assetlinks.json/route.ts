export const dynamic = "force-dynamic";

/**
 * Android App Links association, served at `/.well-known/assetlinks.json`. With
 * this in place, tapping a magic-link on the owner's Android device opens the
 * native app instead of Chrome, so sign-in can complete in-app.
 *
 * Configure `ANDROID_PACKAGE` = "au.com.zaleit.prompt2eat.owner" and
 * `ANDROID_SHA256` = the app's signing-certificate SHA-256 fingerprint(s),
 * comma-separated (Play App Signing gives you this). Returns 404 until
 * configured.
 */
export async function GET(): Promise<Response> {
  const pkg = process.env.ANDROID_PACKAGE;
  const sha = process.env.ANDROID_SHA256;
  if (!pkg || !sha) return new Response("Not found", { status: 404 });

  const fingerprints = sha
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  const body = [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: pkg,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ];

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
