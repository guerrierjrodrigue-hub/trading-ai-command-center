import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { CommandPalette } from "@/components/layout/CommandPalette";
import { AlertNotifier } from "@/components/alerts/AlertNotifier";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const name = user.name ?? user.email.split("@")[0];

  return (
    <div className="flex min-h-screen">
      <CommandPalette />
      <AlertNotifier />
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar userName={name} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="mx-auto max-w-7xl animate-fade-in">{children}</div>
        </main>
      </div>
    </div>
  );
}
