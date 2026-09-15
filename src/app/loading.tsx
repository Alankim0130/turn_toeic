export default function Loading() {
  return (
    <div className="container-x py-16" aria-busy="true" aria-live="polite">
      <div className="h-8 w-48 rounded-lg bg-brand-100 shimmer-bar" />
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-36 rounded-xl2 bg-brand-50 shimmer-bar" />
        ))}
      </div>
      <span className="sr-only">불러오는 중</span>
    </div>
  );
}
