export default function Loading() {
  return (
    <div className="h-full w-full p-[22px] flex flex-col gap-4" aria-busy="true" aria-label="Cargando">
      <div className="h-7 w-56 rounded-lg bg-white/[0.06] animate-pulse" />
      <div className="h-4 w-80 rounded-md bg-white/[0.04] animate-pulse" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 rounded-2xl border border-white/[0.06] bg-white/[0.03] animate-pulse" />
        ))}
      </div>
      <div className="flex-1 rounded-2xl border border-white/[0.06] bg-white/[0.02] animate-pulse mt-2" />
    </div>
  )
}
