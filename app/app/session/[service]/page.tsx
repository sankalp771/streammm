export default function SessionPage({ params }: { params: { service: string } }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-2xl font-bold">Session: {params.service}</h1>
      <p className="text-neutral-400 mt-2">Live session view scaffolded - Phase P0</p>
    </div>
  );
}