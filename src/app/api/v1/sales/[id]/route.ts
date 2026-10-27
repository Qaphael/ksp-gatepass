import { apiHandler, jsonOk } from "@/lib/api";
import { getSale } from "@/server/services/sales.service";

export const GET = apiHandler(async (ctx, _req, { id }: { id: string }) =>
  jsonOk(await getSale(ctx, id)),
);
