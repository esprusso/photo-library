FROM node:18-alpine as builder

WORKDIR /app

# Copy package files
COPY frontend/package*.json ./
RUN npm install

# Copy source and build
COPY frontend/ .
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY docker/frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
