export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-black px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-white">
            tryvex<span className="text-[#E8352A]">.</span>
          </h1>
          <p className="text-sm text-white/50 mt-1">Sistema operativo interno</p>
        </div>
        {children}
      </div>
    </div>
  )
}
