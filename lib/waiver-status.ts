import { prisma } from "@/lib/prisma";
import { getConfig } from "@/lib/config";

/**
 * Whether a customer still owes a waiver signature.
 *
 * Acceptance is per version: bumping the waiver version is what re-prompts
 * everyone, so this is checked before booking, not only at registration.
 */
export async function waiverOutstanding(customerId: string): Promise<{
  required: boolean;
  version: string | null;
  text: string | null;
}> {
  const config = await getConfig();

  if (!config.featureWaiverRequired || !config.waiverText || !config.waiverVersion) {
    return { required: false, version: config.waiverVersion, text: config.waiverText };
  }

  const accepted = await prisma.waiverAcceptance.findUnique({
    where: {
      customerId_waiverVersion: { customerId, waiverVersion: config.waiverVersion },
    },
    select: { id: true },
  });

  return {
    required: !accepted,
    version: config.waiverVersion,
    text: config.waiverText,
  };
}

/** Record a signature for the version currently published. */
export async function acceptWaiver(
  customerId: string,
  meta: { ipAddress?: string | null; userAgent?: string | null } = {}
): Promise<void> {
  const config = await getConfig();
  if (!config.waiverVersion) return;

  await prisma.waiverAcceptance.upsert({
    where: {
      customerId_waiverVersion: { customerId, waiverVersion: config.waiverVersion },
    },
    update: {},
    create: {
      customerId,
      waiverVersion: config.waiverVersion,
      ipAddress: meta.ipAddress ?? null,
      userAgent: meta.userAgent ?? null,
    },
  });
}
