import ScriptDetailClientPage from "@/app/dashboard/script/[scriptId]/ScriptDetailClientPage";

export default function ScriptDetailPage({
  params,
}: {
  params: { scriptId: string };
}) {
  return <ScriptDetailClientPage scriptId={params.scriptId} />;
}
