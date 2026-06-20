import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { getCurrentVenue } from "@/lib/tenant";

export default async function Home() {
  const session = await auth();
  if (!session?.user) {
    redirect("/signin");
  }
  const venue = await getCurrentVenue();
  redirect(venue ? "/dashboard" : "/onboarding");
}
