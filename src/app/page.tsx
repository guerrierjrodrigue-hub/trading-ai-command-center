import { redirect } from "next/navigation";

// Middleware handles auth; land the user on the dashboard.
export default function Home() {
  redirect("/dashboard");
}
