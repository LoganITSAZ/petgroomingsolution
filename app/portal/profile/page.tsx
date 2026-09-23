import { auth } from "@/lib/auth";
import AddressMap from "@/components/AddressMap";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import PhotoUpload from "@/components/PhotoUpload";
import ThemeSwitch from "@/components/ThemeSwitch";
import { readTheme } from "@/lib/theme-preference";
import { deletePhotoIfUnused, photoUrl, storePhoto } from "@/lib/photos";
import { PageShell, PageSection } from "@/components/ui";
import { getConfig } from "@/lib/config";
import { isEnabled } from "@/lib/features";

// Screen readers announce the title first; without one every page in the
// app reads as the same document (WCAG 2.4.2).
export const metadata = { title: "My profile" };

export default async function PortalProfilePage() {
  const session = await auth();
  if (!session?.user || session.user.userType !== "customer") redirect("/login?type=customer");

  const customerId = session.user.id;

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
  });

  if (!customer) redirect("/login?type=customer");

  // Off is silence: a shop that does not ring people does not ask about it.
  const callsLive = isEnabled(await getConfig(), "featureVoiceCalls");

  // Server action: update profile info
  async function updateProfile(formData: FormData) {
    "use server";

    const session = await auth();
    if (!session?.user || session.user.userType !== "customer") redirect("/login?type=customer");
    const customerId = session.user.id;

    // Two forms post to this one action — the details form and the appearance
    // form — so a field the submitted form did not carry must not be written.
    // `phone` used to be written unconditionally, which meant saving a theme
    // from the appearance form silently cleared the customer's phone number.
    const posted = (field: string): string | undefined => {
      const value = formData.get(field);
      return typeof value === "string" ? value.trim() : undefined;
    };

    const firstName = posted("firstName");
    const lastName = posted("lastName");
    const phone = posted("phone");
    const address = posted("address");
    const themePreference = formData.get("themePreference");
    // The checkbox reads as an opt-*in* to the customer and is stored as an
    // opt-out, so the marker decides whether it is being edited and the box
    // itself decides which way.
    const smsPosted = formData.get("smsPrefPosted") !== null;

    // A form that carries the name must carry a usable one; a form that does
    // not carry it at all is not editing it.
    const namesPosted = firstName !== undefined || lastName !== undefined;
    if (namesPosted && (!firstName || !lastName)) return;

    await prisma.customer.update({
      where: { id: customerId },
      data: {
        ...(namesPosted && { firstName, lastName }),
        ...(phone !== undefined && { phone: phone || null }),
        ...(address !== undefined && { address: address || null }),
        ...(smsPosted && {
          smsOptOut: formData.get("smsNotify") === null,
          voiceOptOut: formData.get("voiceNotify") === null,
        }),
        // A form that does not carry the theme is not editing it.
        ...(themePreference !== null && { themePreference: readTheme(themePreference) }),
      },
    });

    redirect("/portal/profile?saved=1");
  }

  // Server action: change password
  async function changePassword(formData: FormData) {
    "use server";

    const session = await auth();
    if (!session?.user || session.user.userType !== "customer") redirect("/login?type=customer");
    const customerId = session.user.id;

    const currentPassword = formData.get("currentPassword") as string;
    const newPassword = formData.get("newPassword") as string;
    const confirmPassword = formData.get("confirmPassword") as string;

    if (!currentPassword || !newPassword || !confirmPassword) {
      redirect("/portal/profile?pwError=missing");
    }

    if (newPassword !== confirmPassword) {
      redirect("/portal/profile?pwError=mismatch");
    }

    if (newPassword.length < 8) {
      redirect("/portal/profile?pwError=short");
    }

    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) redirect("/login?type=customer");

    const valid = await bcrypt.compare(currentPassword, customer.passwordHash);
    if (!valid) {
      redirect("/portal/profile?pwError=wrong");
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.customer.update({
      where: { id: customerId },
      data: { passwordHash },
    });

    redirect("/portal/profile?pwSaved=1");
  }

  async function updatePhoto(formData: FormData) {
    "use server";
    const session = await auth();
    if (!session?.user || session.user.userType !== "customer") redirect("/login?type=customer");
    const current = await prisma.customer.findUnique({
      where: { id: session.user.id },
      select: { photoId: true },
    });
    if (!current) redirect("/login?type=customer");

    const oldPhotoId = current.photoId;
    const result = formData.get("remove") === "1" ? null : await storePhoto(formData.get("photo"));
    if (result && "error" in result) redirect(`/portal/profile?photoError=${result.error}`);
    await prisma.customer.update({
      where: { id: session.user.id },
      data: { photoId: result?.id ?? null },
    });
    if (oldPhotoId) await deletePhotoIfUnused(oldPhotoId);
    redirect("/portal/profile?photoSaved=1");
  }

  return (
    <PageShell title="My Profile" subtitle="Your account details." className="max-w-xl">
      <PageSection title="Profile photo">
        <PhotoUpload
          action={updatePhoto}
          idField="customerId"
          idValue={customer.id}
          currentUrl={photoUrl(customer.photoId)}
          label={`${customer.firstName} ${customer.lastName}`}
        />
      </PageSection>

      <PageSection title="Personal information">
        <form action={updateProfile} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="firstName" className="block text-sm font-semibold text-stone-700 mb-1">
                First Name
              </label>
              <input
                id="firstName"
                name="firstName"
                type="text"
                required
                defaultValue={customer.firstName}
                className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm text-stone-800"
              />
            </div>
            <div>
              <label htmlFor="lastName" className="block text-sm font-semibold text-stone-700 mb-1">
                Last Name
              </label>
              <input
                id="lastName"
                name="lastName"
                type="text"
                required
                defaultValue={customer.lastName}
                className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm text-stone-800"
              />
            </div>
          </div>

          {/* Email (read-only) */}
          <div>
            {/* Read-only text, not a control — a <label> here names nothing. */}
            <p className="block text-sm font-semibold text-stone-700 mb-1">Email</p>
            <p className="text-sm text-stone-500 bg-well border border-well-line rounded-lg px-3 py-2">
              {customer.email}
            </p>
            <p className="text-xs text-stone-400 mt-1">Email cannot be changed here. Contact us if needed.</p>
          </div>

          {/* Phone */}
          <div>
            <label htmlFor="phone" className="block text-sm font-semibold text-stone-700 mb-1">
              Phone <span className="text-stone-400 font-normal">(optional)</span>
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              defaultValue={customer.phone ?? ""}
              placeholder="e.g. (555) 867-5309"
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm text-stone-800"
            />

            {/* An unchecked box posts nothing, so a marker says the form carried
                the preference at all — same reason `phone` is read with
                `posted()` above. */}
            <input type="hidden" name="smsPrefPosted" value="1" />
            <label className="mt-2 flex items-start gap-2 text-sm text-stone-700">
              <input
                type="checkbox"
                name="smsNotify"
                defaultChecked={!customer.smsOptOut}
                className="mt-0.5 accent-amber-700"
              />
              <span>
                Text me when my pet is ready
                <span className="block text-xs text-stone-400">
                  Visit updates only — never marketing. You can also reply STOP to any message.
                </span>
              </span>
            </label>
            {callsLive && (
              <label className="mt-2 flex items-start gap-2 text-sm text-stone-700">
                <input
                  type="checkbox"
                  name="voiceNotify"
                  defaultChecked={!customer.voiceOptOut}
                  className="mt-0.5 accent-amber-700"
                />
                <span>
                  Call me when my pet is ready
                  <span className="block text-xs text-stone-400">
                    An automated call, separate from texts — switch off either one.
                  </span>
                </span>
              </label>
            )}
          </div>

          <div>
            <label htmlFor="address" className="block text-sm font-semibold text-stone-700 mb-1">
              Address <span className="text-stone-400 font-normal">(optional)</span>
            </label>
            <textarea
              id="address"
              name="address"
              rows={2}
              defaultValue={customer.address ?? ""}
              placeholder="123 Main St, Phoenix, AZ 85020"
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm text-stone-800 resize-none"
            />
            {customer.address && (
              <div className="mt-2">
                <AddressMap address={customer.address} title="Map showing your address" height={160} compact />
              </div>
            )}
          </div>

          <button
            type="submit"
            className="bg-brand-600 hover:bg-brand-700 text-brand-on-600 hover:text-brand-on-700 px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors"
          >
            Save changes
          </button>
        </form>
      </PageSection>

      <PageSection title="Appearance" hint="Saves as soon as you flip it." tone="muted">
        <form action={updateProfile} className="flex items-center gap-3">
          <input type="hidden" name="phone" value={customer.phone ?? ""} />
          <ThemeSwitch value={customer.themePreference} />
        </form>
      </PageSection>

      {/* Set once and rarely touched, so it is closed until it is wanted. */}
      <PageSection>
        <details className="disclosure">
          <summary className="font-display text-[0.8125rem] font-bold tracking-tight text-stone-600">
            Change password
          </summary>
        <form action={changePassword} className="mt-3 space-y-3">
          <div>
            <label htmlFor="currentPassword" className="block text-sm font-semibold text-stone-700 mb-1">
              Current Password
            </label>
            <input
              id="currentPassword"
              name="currentPassword"
              type="password"
              required
              autoComplete="current-password"
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm text-stone-800"
            />
          </div>

          <div>
            <label htmlFor="newPassword" className="block text-sm font-semibold text-stone-700 mb-1">
              New Password
            </label>
            <input
              id="newPassword"
              name="newPassword"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm text-stone-800"
            />
            <p className="text-xs text-stone-400 mt-1">Minimum 8 characters.</p>
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-semibold text-stone-700 mb-1">
              Confirm New Password
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              required
              autoComplete="new-password"
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm text-stone-800"
            />
          </div>

          <button
            type="submit"
            className="bg-stone-700 hover:bg-stone-800 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors"
          >
            Change password
          </button>
        </form>
        </details>
      </PageSection>
    </PageShell>
  );
}
