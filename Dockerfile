FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/common/package.json packages/common/package.json
COPY frontend/package.json frontend/package.json
COPY services/api-gateway/package.json services/api-gateway/package.json
COPY services/appointment-service/package.json services/appointment-service/package.json
COPY services/auth-service/package.json services/auth-service/package.json
COPY services/patient-service/package.json services/patient-service/package.json
COPY services/staff-service/package.json services/staff-service/package.json
COPY services/analytics-service/package.json services/analytics-service/package.json
COPY services/billing-service/package.json services/billing-service/package.json
COPY services/medical-record-service/package.json services/medical-record-service/package.json
COPY services/notification-service/package.json services/notification-service/package.json
COPY services/pharmacy-service/package.json services/pharmacy-service/package.json
RUN npm ci

# One image per service. SERVICE_PKG / SERVICE_DIR are set by docker compose.
FROM deps AS service-build
ARG SERVICE_PKG
ARG SERVICE_DIR
COPY packages/common packages/common
COPY ${SERVICE_DIR} ${SERVICE_DIR}
RUN npm run build -w @qlpk/common && npm run build -w "${SERVICE_PKG}"

FROM node:20-bookworm-slim AS service
WORKDIR /app
ENV NODE_ENV=production
ARG SERVICE_DIR
ENV SERVICE_DIR=${SERVICE_DIR}
COPY --from=service-build /app/package.json /app/package-lock.json ./
COPY --from=service-build /app/node_modules ./node_modules
COPY --from=service-build /app/packages/common ./packages/common
COPY --from=service-build /app/${SERVICE_DIR}/dist ./${SERVICE_DIR}/dist
CMD ["sh", "-c", "node \"$SERVICE_DIR/dist/main.js\""]

FROM deps AS frontend-build
COPY frontend frontend
RUN npm run build -w @qlpk/frontend

FROM nginx:1.27-alpine AS frontend
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=frontend-build /app/frontend/dist /usr/share/nginx/html
