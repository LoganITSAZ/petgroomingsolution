"use client";

import { useState, type FormEvent } from "react";
import styles from "@/app/(public)/contact/contact.module.css";

export default function ContactForm({ enabled, requirePhone }: { enabled: boolean; requirePhone: boolean }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    setPending(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error || "Unable to send. Please try again.");
      } else {
        setSuccess(result.message);
        form.reset();
      }
    } catch {
      setError("Unable to connect. Please try again or call the shop.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section id="contact-form" className={styles.formSection} aria-labelledby="contact-form-title">
      <p className="public-eyebrow">Drop us a note</p>
      <h2 id="contact-form-title" className={styles.sectionTitle}>How can we help?</h2>
      {enabled ? <form onSubmit={submit} className={styles.contactForm}>
        <div className={styles.formFields}>
          <label htmlFor="contact-name">Your name<input id="contact-name" name="name" autoComplete="name" required maxLength={100} /></label>
          <label htmlFor="contact-email">Your email<input id="contact-email" name="email" type="email" autoComplete="email" required maxLength={254} /></label>
          <label htmlFor="contact-phone">Phone {requirePhone ? "" : "(optional)"}<input id="contact-phone" name="phone" type="tel" autoComplete="tel" required={requirePhone} maxLength={40} /></label>
        </div>
        <label htmlFor="contact-message">Your message<textarea id="contact-message" name="message" required minLength={10} maxLength={5000} rows={5} /></label>
        <div hidden aria-hidden="true"><label htmlFor="contact-website">Website<input id="contact-website" name="website" tabIndex={-1} autoComplete="off" /></label></div>
        <p className={styles.cardHint}>We’ll use your contact details to respond to your message.</p>
        {error && <p role="alert">{error}</p>}
        <p role="status" aria-live="polite">{success}</p>
        <button type="submit" disabled={pending} className={styles.bookingLink}>{pending ? "Sending…" : "Send message"}</button>
      </form> : <p className={styles.visitNote}>Messaging is currently unavailable. Please call the shop.</p>}
    </section>
  );
}
