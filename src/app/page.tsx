import { redirect } from "next/navigation";
import { auth } from "@/auth";

// Internal platform: no public landing page.
export default async function HomePage() {
  const session = await auth();
  redirect(session?.user ? "/dashboard" : "/login");
}
