import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { appName } from "@/config";
import { currentUser } from "@/server/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await currentUser()) redirect("/");
  return (
    <main id="main" className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <h1 className="mb-1 text-2xl font-semibold text-accent dark:text-red-300">{appName}</h1>
      <p className="mb-6 text-gray-600 dark:text-gray-300">Sign in with your school account.</p>
      <LoginForm />
    </main>
  );
}
