export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <section className="relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute -left-32 top-10 h-72 w-72 rounded-full bg-brand-100 blur-3xl animate-blob" />
      <div aria-hidden className="pointer-events-none absolute -right-24 bottom-0 h-80 w-80 rounded-full bg-brand-200/60 blur-3xl animate-blob" style={{ animationDelay: "-6s" }} />
      <div className="container-x relative flex min-h-[70vh] items-center justify-center py-12">
        <div className="card w-full max-w-md p-6 sm:p-8">{children}</div>
      </div>
    </section>
  );
}
