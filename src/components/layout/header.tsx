import { signOut } from "@/app/(dashboard)/actions";

export function Header({ email }: { email: string }) {
  return (
    <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
      <span className="text-sm text-gray-600">{email}</span>
      <form action={signOut}>
        <button
          type="submit"
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
        >
          Sign out
        </button>
      </form>
    </header>
  );
}
