export default function DashboardPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="mb-1 text-sm text-[var(--text-secondary)]">
        Dashboard
      </nav>

      {/* Page title */}
      <h1 className="font-display text-display-sm font-semibold text-[var(--text-primary)]">
        Tours
      </h1>

      {/* Placeholder content — tour grid will be implemented in US-023 */}
      <div className="mt-8 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-12 text-center">
        <p className="text-[var(--text-secondary)]">
          Your tours will appear here.
        </p>
      </div>
    </div>
  );
}
