# ---------- build ----------
FROM node:20-alpine AS build
WORKDIR /app
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_STORE_NAME="PrimeStore Ethiopia"
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_STORE_NAME=$NEXT_PUBLIC_STORE_NAME
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---------- runtime (standalone output) ----------
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3001 HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 3001
CMD ["node", "server.js"]
