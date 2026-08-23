export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-stone-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <a href="/" className="text-2xl font-black text-stone-900">🐾 Gentle Groomer</a>
        </div>
        {children}
      </div>
    </div>
  );
}
