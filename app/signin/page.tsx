import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";

import { SignInForm } from "./signin-form";

export default async function SignInPage() {
  const session = await auth();
  if (session?.user) {
    redirect("/");
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-12">
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Sign in to Prompt2Eat</h1>
          <p className="text-sm text-gray-600">
            Enter your email and we&apos;ll send you a magic link to sign in.
          </p>
        </div>
        <SignInForm />
      </div>
    </main>
  );
}
