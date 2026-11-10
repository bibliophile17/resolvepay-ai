import CaptureRunner from "@/components/CaptureRunner";

export default async function PaymentReturn({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">Payment return</h1>
      {token ? <CaptureRunner orderId={token} /> : <p className="text-sm text-red-700">Missing PayPal order token in the URL.</p>}
    </div>
  );
}