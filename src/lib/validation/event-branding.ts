import { z } from "zod";

export const eventBrandingKindSchema = z.enum(["POSTER", "LOGO"]);

export const eventBrandingUploadMetadataSchema = z.object({
  kind: eventBrandingKindSchema,
  altText: z.string().trim().min(1, "Alt text is required.").max(200, "Alt text must be 200 characters or fewer."),
});

export const eventBrandingRemoveQuerySchema = z.object({
  kind: eventBrandingKindSchema,
});

export const eventBrandingVariantSchema = z.enum(["thumbnail", "display"]).default("display");
