export default function DashboardLoading() {
  return (
    <div role="status" aria-label="Cargando tu espacio" className="animate-pulse space-y-6">
      <div className="h-8 w-52 rounded-lg bg-slate-200" />
      <div className="grid grid-cols-3 gap-5">
        {[1, 2, 3].map((item) => (
          <div key={item} className="h-28 rounded-xl bg-slate-200/60" />
        ))}
      </div>
      <div className="h-[550px] rounded-xl bg-slate-200/50" />
    </div>
  );
}
