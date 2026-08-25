import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { ThemePreference } from "@prisma/client";
import PhotoUpload from "@/components/PhotoUpload";
import { deletePhotoIfUnused, photoUrl, storePhoto } from "@/lib/photos";

// Screen readers announce the title first; without one every page in the
// app reads as the same document (WCAG 2.4.2).
export const metadata = { title: "My profile" };

export const dynamic = "force-dynamic";

export default async function StaffProfilePage({
  searchParams,
}: {
  searchParams: { saved?: string; error?: string; password?: string; photoError?: string };
}) {
  const session = await auth();
  if (!session?.user || session.user.userType !== "staff") redirect("/login?type=staff");

  const staff = await prisma.staff.findUnique({ where: { id: session.user.id } });
  if (!staff) redirect("/login?type=staff");

  async function updateProfile(formData: FormData) {
    "use server";
    const current = await auth();
    if (!current?.user || current.user.userType !== "staff") redirect("/login?type=staff");
    const name = (formData.get("name") as string | null)?.trim();
    const themePreference = formData.get("themePreference");
    if (!name) redirect("/staff/profile?error=name");

    await prisma.staff.update({
      where: { id: current.user.id },
      data: {
        name,
        themePreference: themePreference === ThemePreference.DARK ? ThemePreference.DARK : ThemePreference.LIGHT,
      },
    });
    redirect("/staff/profile?saved=1");
  }

  async function changePassword(formData: FormData) {
    "use server";
    const current = await auth();
    if (!current?.user || current.user.userType !== "staff") redirect("/login?type=staff");
    const currentPassword = formData.get("currentPassword") as string;
    const newPassword = formData.get("newPassword") as string;
    const confirmPassword = formData.get("confirmPassword") as string;
    const account = await prisma.staff.findUnique({ where: { id: current.user.id } });
    if (!account || !(await bcrypt.compare(currentPassword, account.passwordHash))) {
      redirect("/staff/profile?password=wrong");
    }
    if (newPassword.length < 8 || newPassword !== confirmPassword) {
      redirect("/staff/profile?password=invalid");
    }
    await prisma.staff.update({
      where: { id: current.user.id },
      data: { passwordHash: await bcrypt.hash(newPassword, 12) },
    });
    redirect("/staff/profile?password=saved");
  }

  async function updatePhoto(formData: FormData) {
    "use server";
    const current = await auth();
    if (!current?.user || current.user.userType !== "staff") redirect("/login?type=staff");
    const account = await prisma.staff.findUnique({
      where: { id: current.user.id },
      select: { photoId: true },
    });
    if (!account) redirect("/login?type=staff");

    const oldPhotoId = account.photoId;
    const result = formData.get("remove") === "1" ? null : await storePhoto(formData.get("photo"));
    if (result && "error" in result) redirect(`/staff/profile?photoError=${result.error}`);
    await prisma.staff.update({
      where: { id: current.user.id },
      data: { photoId: result?.id ?? null },
    });
    if (oldPhotoId) await deletePhotoIfUnused(oldPhotoId);
    redirect("/staff/profile?photoSaved=1");
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-brand-text">Account</p>
        <h1 className="text-2xl font-black text-stone-900 mt-1">Your profile</h1>
        <p className="text-sm text-stone-500 mt-1">Manage your account details and workspace appearance.</p>
      </div>
      {searchParams.saved === "1" && <p className="bg-green-50 border border-green-200 text-green-800 rounded-lg px-3 py-2 text-sm">Profile saved.</p>}
      {searchParams.password === "saved" && <p className="bg-green-50 border border-green-200 text-green-800 rounded-lg px-3 py-2 text-sm">Password changed.</p>}
      {searchParams.password === "wrong" && <p className="bg-red-50 border border-red-200 text-red-800 rounded-lg px-3 py-2 text-sm">Current password is incorrect.</p>}
      {searchParams.password === "invalid" && <p className="bg-red-50 border border-red-200 text-red-800 rounded-lg px-3 py-2 text-sm">New passwords must match and be at least 8 characters.</p>}
      {searchParams.photoError && <p className="bg-red-50 border border-red-200 text-red-800 rounded-lg px-3 py-2 text-sm">Profile photo must be a JPG, PNG, or WebP image up to 2 MB.</p>}

      <section className="bg-white border border-stone-200 rounded-xl p-5 space-y-4">
        <h2 className="font-bold text-stone-800">Profile details</h2>
        <form action={updateProfile} className="space-y-3">
          <div>
            <label htmlFor="name" className="block text-sm font-semibold text-stone-700 mb-1">Name</label>
            <input id="name" name="name" required defaultValue={staff.name} className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <span className="block text-sm font-semibold text-stone-700 mb-1">Email</span>
            <p className="bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-500">{staff.email}</p>
          </div>
          <div>
            <label htmlFor="themePreference" className="block text-sm font-semibold text-stone-700 mb-1">Theme</label>
            <select id="themePreference" name="themePreference" defaultValue={staff.themePreference} className="border border-stone-300 rounded-lg px-3 py-2 text-sm">
              <option value={ThemePreference.LIGHT}>Light</option>
              <option value={ThemePreference.DARK}>Dark</option>
            </select>
          </div>
          <button className="bg-brand-600 hover:bg-brand-700 text-brand-on-600 hover:text-brand-on-700 px-4 py-2 rounded-lg text-sm font-semibold">Save profile</button>
        </form>
      </section>

      <section className="bg-white border border-stone-200 rounded-xl p-5">
        <h2 className="font-bold text-stone-800 mb-3">Profile photo</h2>
        <PhotoUpload
          action={updatePhoto}
          idField="staffId"
          idValue={staff.id}
          currentUrl={photoUrl(staff.photoId)}
          label={staff.name}
        />
      </section>

      <section className="bg-white border border-stone-200 rounded-xl p-5 space-y-4">
        <h2 className="font-bold text-stone-800">Change password</h2>
        <form action={changePassword} className="space-y-3">
          {[["currentPassword", "Current password"], ["newPassword", "New password"], ["confirmPassword", "Confirm new password"]].map(([id, label]) => (
            <div key={id}>
              <label htmlFor={id} className="block text-sm font-semibold text-stone-700 mb-1">{label}</label>
              <input id={id} name={id} type="password" required minLength={id === "currentPassword" ? undefined : 8} className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm" />
            </div>
          ))}
          <button className="bg-stone-800 hover:bg-stone-900 text-white px-4 py-2 rounded-lg text-sm font-semibold">Change password</button>
        </form>
      </section>
    </div>
  );
}