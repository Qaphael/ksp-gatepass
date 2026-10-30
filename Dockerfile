# KSP GatePass production image.
# Build:  docker build -t ksp-gatepass .
# The image includes the Prisma CLI so migrations can run at container start.
FROM node:24-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

FROM base AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma7.config.ts ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile
COPY . .
# Next.js imports database-backed route modules during build-time analysis.
# This placeholder is never used by the runtime image; Compose supplies the
# real DATABASE_URL from the private server-side .env file.
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build
RUN pnpm build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma7.config.ts ./
COPY next.config.ts ./
COPY tsconfig.json ./
COPY prisma ./prisma
RUN pnpm install --prod --frozen-lockfile
COPY --from=build /app/.next ./.next
COPY public ./public
# Include the one-time, interactive admin bootstrap and its minimal source
# dependencies. `tsx` is a production dependency so this command works in the
# production image without shipping the rest of the development toolchain.
COPY scripts/setup-admin.ts ./scripts/setup-admin.ts
COPY src/lib/auth/password.ts ./src/lib/auth/password.ts
COPY src/lib/db/client.ts ./src/lib/db/client.ts
COPY src/lib/validation/auth.ts ./src/lib/validation/auth.ts
EXPOSE 3000
# Apply pending migrations, then start the server.
CMD ["sh", "-c", "pnpm prisma:deploy && pnpm start"]
