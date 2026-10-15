"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";

export type LoginState = { error?: string };

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/",
    });
    return {};
  } catch (err) {
    if (err instanceof AuthError) {
      const code = (err as AuthError & { code?: string }).code;
      if (code === "rate_limited") {
        return { error: "Too many failed attempts. Wait 15 minutes, then try again." };
      }
      return { error: "That email and password do not match an active account." };
    }
    throw err; // includes the redirect on success
  }
}
