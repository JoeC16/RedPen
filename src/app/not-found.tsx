import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main" className="mx-auto max-w-xl px-4 py-16">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="mt-2 text-gray-600 dark:text-gray-300">It does not exist, or your account does not have access to it.</p>
      <p className="mt-4">
        <Link href="/" className="underline">
          Go to the home page
        </Link>
      </p>
    </main>
  );
}
