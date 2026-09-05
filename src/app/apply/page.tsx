import type { Metadata } from "next";
import ApplicationForm from "./application-form";
export const metadata: Metadata = {
  title: "Apply for a cruise career | Ismira",
  description: "Start your application with Ismira. Tell us about your experience and find your place on board.",
  alternates: { canonical: "/apply" },
};
export default function ApplyPage() { return <ApplicationForm />; }
