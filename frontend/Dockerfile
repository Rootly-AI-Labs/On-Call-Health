# Frontend Dockerfile
# Use pre-built base image with dependencies from Docker Hub
ARG BASE_IMAGE=rootlyio/on-call-health:frontend-base
FROM ${BASE_IMAGE} AS deps

# Rebuild the source code only when needed
FROM deps AS builder
WORKDIR /app
COPY . .

# Build the application
RUN bun run build

# Production image, copy all the files and run next
FROM oven/bun:1.4.3 AS runner
WORKDIR /app

ENV NODE_ENV production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built application
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

CMD ["bun", "run", "start"]
