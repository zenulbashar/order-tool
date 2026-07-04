import { auth } from "@/lib/auth";
import { registerPushToken } from "@/lib/push";
import { getCurrentVenue } from "@/lib/tenant";

export const runtime = "nodejs";

/**
 * Register a device push token for the signed-in owner's CURRENT venue. Called
 * by the native app's PushRegistrar bridge after it obtains an APNs/FCM token.
 * Auth is the owner session cookie (carried by the app WebView); the venue comes
 * from the session, never the client — the token is stored venue-scoped.
 */
export async function POST(request: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }
  const venue = await getCurrentVenue();
  if (!venue) {
    return new Response("No venue", { status: 400 });
  }

  let body: { token?: unknown; platform?: unknown };
  try {
    body = (await request.json()) as { token?: unknown; platform?: unknown };
  } catch {
    return new Response("Invalid body", { status: 400 });
  }

  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (token.length < 10 || token.length > 4096) {
    return new Response("Invalid token", { status: 400 });
  }
  const platform =
    body.platform === "ios" || body.platform === "android"
      ? body.platform
      : "web";

  try {
    await registerPushToken(venue.id, token, platform);
  } catch {
    return new Response("Error", { status: 500 });
  }
  return new Response("ok", { status: 200 });
}
