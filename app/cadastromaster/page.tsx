import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { InviteSignup } from "../invite/InviteSignup";

const getFirstAllowedCode = () => {
  const raw =
    process.env.ALLOWED_SIGNUP_CODES || process.env.NEXT_ALLOWED_SIGNUP_CODES || "";

  return raw
    .split(",")
    .map((code) => code.trim())
    .filter(Boolean)[0];
};

export default async function MasterSignupPage() {
  const headerList = await headers();
  const cookieHeader = headerList.get("cookie") || "";
  const token = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("token="))
    ?.split("=")[1];

  if (token) redirect("/dashboard");

  const inviteCode = getFirstAllowedCode();

  return <InviteSignup inviteCode={inviteCode || ""} />;
}
