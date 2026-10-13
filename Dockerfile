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

FROM deps AS services
COPY packages/common packages/common
COPY services/api-gateway services/api-gateway
COPY services/auth-service services/auth-service
COPY services/patient-service services/patient-service
COPY services/staff-service services/staff-service
COPY services/appointment-service services/appointment-service
COPY services/medical-record-service services/medical-record-service
COPY services/notification-service services/notification-service
RUN npm run build -w @qlpk/common \
 && npm run build -w @qlpk/auth-service \
 && npm run build -w @qlpk/patient-service \
 && npm run build -w @qlpk/staff-service \
 && npm run build -w @qlpk/appointment-service \
 && npm run build -w @qlpk/medical-record-service \
 && npm run build -w @qlpk/notification-service \
 && npm run build -w @qlpk/api-gateway

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=services /app/package.json /app/package-lock.json ./
COPY --from=services /app/node_modules ./node_modules
COPY --from=services /app/packages/common ./packages/common
COPY --from=services /app/services/auth-service/dist ./services/auth-service/dist
COPY --from=services /app/services/patient-service/dist ./services/patient-service/dist
COPY --from=services /app/services/staff-service/dist ./services/staff-service/dist
COPY --from=services /app/services/appointment-service/dist ./services/appointment-service/dist
COPY --from=services /app/services/medical-record-service/dist ./services/medical-record-service/dist
COPY --from=services /app/services/notification-service/dist ./services/notification-service/dist
COPY --from=services /app/services/api-gateway/dist ./services/api-gateway/dist

FROM deps AS frontend-build
COPY frontend frontend
RUN npm run build -w @qlpk/frontend

FROM nginx:1.27-alpine AS frontend
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=frontend-build /app/frontend/dist /usr/share/nginx/html
