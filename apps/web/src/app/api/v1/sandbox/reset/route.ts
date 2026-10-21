import { resetPublicApiSandbox } from "@/services/public-api.service";

export const runtime = "nodejs";

export async function POST() {
  const result = resetPublicApiSandbox();
  return Response.json({
    data: result,
    message: "Sandbox environment state has been reset to defaults.",
  });
}
