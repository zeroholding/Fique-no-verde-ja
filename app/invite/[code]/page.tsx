import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { InviteSignup } from "../InviteSignup";

const getAllowedCodes = () => {
  const raw =
    process.env.ALLOWED_SIGNUP_CODES || process.env.NEXT_ALLOWED_SIGNUP_CODES || "";

  return raw
    .split(",")
    .map((code) => code.trim())
    .filter(Boolean);
};

export default async function InvitePage({ params }: { params: { code: string } }) {
  const headerList = await headers();
  const cookieHeader = headerList.get("cookie") || "";
  const token = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("token="))
    ?.split("=")[1];

  if (token) redirect("/dashboard");

  const allowedCodes = getAllowedCodes();
  const codesRequired = allowedCodes.length > 0;
  const isAllowed = !codesRequired || allowedCodes.includes(params.code);

  if (!isAllowed) {
    redirect("/login");
  }

  return <InviteSignup inviteCode={params.code} />;
}
