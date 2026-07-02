import { redirect } from "next/navigation";

export default function DashboardNicheDetailRedirectPage({
  params,
}: {
  params: { id: string };
}) {
  redirect(`/niche/${params.id}`);
}

