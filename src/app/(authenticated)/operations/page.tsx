import { redirect } from "next/navigation";

// Module root → first section (page RBAC runs in middleware).
export default function Page() {
  redirect("/operations/sites");
}
