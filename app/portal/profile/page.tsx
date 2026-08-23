import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";

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

    if (!firstName || !lastName) return;

    await prisma.customer.update({
      where: { id: customerId },
      data: {
        firstName,
        lastName,
        phone: phone || null,
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

  return (
    <div className="max-w-xl space-y-8">
      <div>
        <h1 className="text-2xl font-black text-stone-900">My Profile</h1>
        <p className="text-stone-500 text-sm mt-0.5">Manage your account details.</p>
      </div>

      {/* Profile form */}
      <section className="bg-white border border-stone-200 rounded-xl p-6 space-y-5">
        <h2 className="font-bold text-stone-800">Personal Information</h2>

        <form action={updateProfile} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
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

          <button
            type="submit"
            className="bg-amber-600 hover:bg-amber-700 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors"
          >
            Save Changes
          </button>
        </form>
      </section>

      {/* Change password */}
      <section className="bg-white border border-stone-200 rounded-xl p-6 space-y-5">
        <h2 className="font-bold text-stone-800">Change Password</h2>

        <form action={changePassword} className="space-y-4">
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
