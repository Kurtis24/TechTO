export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <header className="mb-10">
          <h1 className="text-3xl font-semibold tracking-tight">Kin</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Your household&apos;s financial guardian.
          </p>
        </header>
        <section className="rounded-2xl border border-zinc-200 bg-white p-8 text-center">
          <p className="text-sm text-zinc-500">
            All quiet. Kin is watching across your accounts.
          </p>
        </section>
      </div>
    </main>
  );
}
