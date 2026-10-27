import { Navigate } from "@tanstack/react-router";

import { AuthForm } from "@/components/auth-form";
import { CentreCard, Splash } from "@/components/page-parts";
import { useAuth } from "@/lib/auth";

export function SignInPage() {
  const { user, loading } = useAuth();
  if (loading) return <Splash />;
  if (user) return <Navigate to="/" />;
  return (
    <CentreCard title="Welcome to Luex Life" subtitle="One simple place to run your family's week.">
      <AuthForm />
    </CentreCard>
  );
}
