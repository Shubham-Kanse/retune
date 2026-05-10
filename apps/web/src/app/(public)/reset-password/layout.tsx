import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Reset Password",
  robots: { index: true, follow: true },
};

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
