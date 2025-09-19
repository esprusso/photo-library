FROM node:18 as builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies with force refresh
RUN npm cache clean --force && \
    npm install

# Copy source code
COPY . ./

# Ensure photo-logo asset exists (fallback to ai-logo if custom not provided)
RUN if [ -f public/ai-logo.png ] && [ ! -f public/photo-logo.png ]; then \
      cp public/ai-logo.png public/photo-logo.png; \
    fi

# Build the application
RUN npm run build

FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
