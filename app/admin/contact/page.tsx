import { saveContactSettings } from "./actions";
import Link from "next/link";
import { getConfig } from "@/lib/config";
import { requireAdmin } from "@/lib/auth-guards";
import { PageShell, PageSection } from "@/components/ui";
import SaveToast from "@/components/SaveToast";

export const metadata = { title: "Contact Form" };
const field = "block w-full rounded-lg border border-stone-300 px-3 py-2 mt-1 text-stone-900 bg-white";


export default async function ContactSettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  await requireAdmin();
  const config = await getConfig();
  const params = await searchParams;
  return <PageShell title="Contact Form" subtitle="Manage messages sent from your public contact page.">
    {params.saved === "1" && <SaveToast>Contact form settings saved.</SaveToast>}
    {params.error && <p role="alert" className="mb-4 text-red-700">{params.error}</p>}
    <PageSection bodyClassName="space-y-5">
      <form action={saveContactSettings} className="space-y-5">
        <label className="flex items-center gap-2"><input type="checkbox" name="contactFormEnabled" defaultChecked={config.contactFormEnabled} />Enable contact form</label>
        <label className="block text-sm font-medium" htmlFor="contactRecipient">Send messages to
          <input className={field} type="email" id="contactRecipient" name="contactRecipient" maxLength={254} defaultValue={config.contactRecipient ?? ""} />
          <span className="block mt-1 text-xs text-stone-500">This address stays private. Replying to a message emails the customer directly.</span>
        </label>
        <label className="flex items-center gap-2"><input type="checkbox" name="contactRequirePhone" defaultChecked={config.contactRequirePhone} />Require a phone number</label>
        <label className="block text-sm font-medium" htmlFor="contactSuccessMessage">Confirmation message
          <textarea className={field} id="contactSuccessMessage" name="contactSuccessMessage" required maxLength={500} rows={3} defaultValue={config.contactSuccessMessage} />
        </label>
        <p className="text-sm text-stone-600">Delivery uses your <Link className="underline" href="/admin/notifications">email sender settings</Link> and works independently of appointment notification settings. Messages are delivered by email; this page does not store an inbox.</p>
        {!process.env.RESEND_API_KEY && <p role="status" className="text-sm text-amber-800">Email delivery needs RESEND_API_KEY configured on the server before messages can be sent.</p>}
        {!config.contactRecipient && <p className="text-sm text-amber-800">Set a recipient email to start receiving messages.</p>}
        <button type="submit" className="rounded-lg bg-stone-900 px-4 py-2 text-white">Save settings</button>
      </form>
    </PageSection>
  </PageShell>;
}
