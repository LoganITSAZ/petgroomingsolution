// The sign-in page is a client component and cannot export metadata itself,
// so the title that screen readers announce lives here (WCAG 2.4.2).
export const metadata = { title: "Sign in" };

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
