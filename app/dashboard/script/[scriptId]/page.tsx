import ScriptDetailClientPage from "./ScriptDetailClientPage";

export default function ScriptDetailPage({
  params,
}: {
  params: { scriptId: string };
}) {
  return <ScriptDetailClientPage scriptId={params.scriptId} />;
}
