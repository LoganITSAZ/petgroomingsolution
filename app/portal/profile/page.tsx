import { auth } from "@/lib/auth";
import AddressMap from "@/components/AddressMap";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { ThemePreference } from "@prisma/client";
import PhotoUpload from "@/components/PhotoUpload";
import { deletePhotoIfUnused, photoUrl, storePhoto } from "@/lib/photos";

// Screen readers announce the title first; without one every page in the
// app reads as the same document (WCAG 2.4.2).
export const metadata = { title: "My profile" };

export default async function PortalProfilePage() {
  const session = await auth();
  if (!session?.user) redirect("/login?type=customer");

  const customerId = session.user.id;

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
  });

  if (!customer) redirect("/login?type=customer");

  // Server action: update profile info
  async function updateProfile(formData: FormData) {
    "use server";

    const session = await auth();
    if (!session?.user) redirect("/login?type=customer");
    const customerId = session.user.id;

    const firstName = (formData.get("firstName") as string)?.trim();
    const lastName = (formData.get("lastName") as string)?.trim();
    const phone = (formData.get("phone") as string)?.trim();
    const address = (formData.get("address") as string | null)?.trim();
    const themePreference = formData.get("themePreference");

    if (!firstName || !lastName) return;

    await prisma.customer.update({
      where: { id: customerId },
      data: {
        firstName,
        lastName,
        phone: phone || null,
        // A field the submitted form did not carry must not be overwritten:
        // the appearance form posts no address, the details form no theme.
        ...(address !== undefined && { address: address || null }),
        ...(themePreference !== null && {
          themePreference:
            themePreference === ThemePreference.DARK ? ThemePreference.DARK : ThemePreference.LIGHT,
        }),
      },
    });

    redirect("/portal/profile?saved=1");
  }

  // Server action: change password
  async function changePassword(formData: FormData) {
    "use server";

    const session = await auth();
    if (!session?.user) redirect("/login?type=customer");
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
    <div className="max-w-xl space-y-8">
      <div>
        <h1 className="text-xl font-black text-stone-900">My Profile</h1>
        <p className="text-stone-500 text-sm mt-0.5">Manage your account details.</p>
      </div>

      <section className="bg-white border border-stone-200 rounded-xl p-4">
        <h2 className="font-bold text-stone-800 mb-3">Profile photo</h2>
        <PhotoUpload
          action={updatePhoto}
          idField="customerId"
          idValue={customer.id}
          currentUrl={photoUrl(customer.photoId)}
          label={`${customer.firstName} ${customer.lastName}`}
        />
      </section>

      {/* Profile form */}
      <section className="bg-white border border-stone-200 rounded-xl p-4 space-y-5">
        <h2 className="font-bold text-stone-800">Personal Information</h2>

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
                className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
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
                className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
          </div>

          {/* Email (read-only) */}
          <div>
            <label className="block text-sm font-semibold text-stone-700 mb-1">Email</label>
            <p className="text-sm text-stone-500 bg-stone-50 border border-stone-200 rounded-lg px-3 py-2">
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
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
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
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
            />
            {customer.address && (
              <div className="mt-2">
                <AddressMap address={customer.address} title="Map showing your address" height={160} compact />
              </div>
            )}
          </div>

          <button
            type="submit"
            className="bg-amber-700 hover:bg-amber-800 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors"
          >
            Save Changes
          </button>
        </form>
      </section>

      <section className="bg-white border border-stone-200 rounded-xl p-4 space-y-3">
        <div>
          <h2 className="font-bold text-stone-800">Appearance</h2>
          <p className="text-sm text-stone-500 mt-0.5">Choose the display style for your account.</p>
        </div>
        <form action={updateProfile} className="flex items-center gap-3">
          <input type="hidden" name="firstName" value={customer.firstName} />
          <input type="hidden" name="lastName" value={customer.lastName} />
          <input type="hidden" name="phone" value={customer.phone ?? ""} />
          <label htmlFor="themePreference" className="text-sm font-semibold text-stone-700">Theme</label>
          <select
            id="themePreference"
            name="themePreference"
            defaultValue={customer.themePreference}
            className="border border-stone-300 rounded-lg px-3 py-2 text-sm text-stone-800 bg-white"
          >
            <option value={ThemePreference.LIGHT}>Light</option>
            <option value={ThemePreference.DARK}>Dark</option>
          </select>
          <button type="submit" className="bg-brand-600 hover:bg-brand-700 text-brand-on-600 hover:text-brand-on-700 px-4 py-2 rounded-lg text-sm font-semibold">
            Save theme
          </button>
        </form>
      </section>

      {/* Change password */}
      <section className="bg-white border border-stone-200 rounded-xl p-4 space-y-5">
        <h2 className="font-bold text-stone-800">Change Password</h2>

        <form action={changePassword} className="space-y-3">
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
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
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
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
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
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>

          <button
            type="submit"
            className="bg-stone-700 hover:bg-stone-800 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors"
          >
            Change Password
          </button>
        </form>
      </section>
    </div>
  );
}
