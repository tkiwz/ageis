import { requireAuth } from "@/lib/auth-helpers";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { AlertSound } from "@/components/layout/alert-sound";
import { VoiceCommandButton } from "@/components/voice/VoiceCommandButton";
import { AutonomyHeartbeat } from "@/components/autonomy/heartbeat";
import { LangProvider } from "@/lib/lang-context";

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAuth();

  return (
    <LangProvider>
    <div className="flex h-screen overflow-hidden bg-background">
      <AlertSound />
      <Sidebar role={user.role} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header
          user={{
            id: user.id,
            name: user.name ?? null,
            email: user.email ?? null,
            role: user.role,
            department: user.department,
          }}
        />
        <main className="flex-1 overflow-y-auto bg-grid">
          {children}
        </main>
      </div>
      {/* Floating voice command button — works on all pages */}
      <VoiceCommandButton />
      {/* Autonomous monitoring heartbeat — silent in prod, badge in dev */}
      <AutonomyHeartbeat />
    </div>
    </LangProvider>
  );
}