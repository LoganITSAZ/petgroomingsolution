import "./station.css";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";

export const metadata = { title: "Station display" };

export default async function StationLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user || session.user.userType !== "staff") redirect("/login?type=staff");
  const { id } = await params;
  if (!await prisma.station.findUnique({ where: { id }, select: { id: true } })) notFound();
  return <>{children}</>;
}
