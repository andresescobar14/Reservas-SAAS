import type { Metadata } from "next";
import { AccountWorkspace } from "@/components/dashboard/account-workspace";
import { requireActiveCompany } from "@/lib/tenant";
import { getOptionalEmailVerification } from "@/lib/email-verification";
import { requestEmailCode, confirmEmailCode } from "@/app/actions/email-verification";

export const metadata: Metadata = { title: "Mi cuenta" };
export default async function AccountPage() {
  const { company, user } = await requireActiveCompany();
  const email = user.email || "";
  const state = await getOptionalEmailVerification({ userId: user.id, email });
  return (
    <AccountWorkspace
      companyName={company.name}
      email={email}
      available={state.available && Boolean(email)}
      verifiedAt={state.verifiedAt}
      requestCodeAction={requestEmailCode}
      confirmCodeAction={confirmEmailCode}
    />
  );
}
