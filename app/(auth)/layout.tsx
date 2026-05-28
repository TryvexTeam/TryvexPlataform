export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Tryvex</h1>
          <p className="text-sm text-neutral-500 mt-1">Sistema operativo interno</p>
        </div>
        {children}
      </div>
    </div>
  )
}
