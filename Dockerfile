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
RUN pnpm build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma7.config.ts ./
COPY next.config.ts ./
COPY prisma ./prisma
RUN pnpm install --prod --frozen-lockfile
COPY --from=build /app/.next ./.next
COPY public ./public
EXPOSE 3000
# Apply pending migrations, then start the server.
CMD ["sh", "-c", "pnpm prisma:deploy && pnpm start"]
