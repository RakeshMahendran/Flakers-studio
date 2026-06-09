import { redirect } from "next/navigation";

// The Dashboard already shows the assistant grid + KPIs. The sidebar's
// "Assistants" item points at `/assistant` (matchPrefix true so child
// routes like `/assistant/[id]` still highlight it), but the index path
// itself had no page and 404'd. Redirect to the dashboard until a
// dedicated assistants list view is built.
export default function AssistantIndex() {
  redirect("/dashboard");
}
