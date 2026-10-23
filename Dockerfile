FROM node:24.22.1-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS builder
COPY . /usr/src/app
WORKDIR /usr/src/app
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm run -r build

FROM base AS app
COPY --from=builder /usr/src/app /app
WORKDIR /app
EXPOSE 8000
CMD [ "pnpm", "start" ]

# docker build . --target app --tag app:latest
