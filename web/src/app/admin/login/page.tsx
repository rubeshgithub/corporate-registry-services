import { Suspense } from "react";
import LoginForm from "./LoginForm";

export const metadata = {
  title: "Admin — CRS",
  robots: { index: false, follow: false },
};

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "var(--bg-deep)" }} />}>
      <LoginForm />
    </Suspense>
  );
}
