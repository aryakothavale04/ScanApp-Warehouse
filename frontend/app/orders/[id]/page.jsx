import PackingScreen from "@/components/PackingScreen";

export default async function OrderPage({ params }) {
  const { id } = await params;
  return <PackingScreen orderId={id} />;
}
