# =====================================================================
# ATOMX ENGAGE — PRODUCTION DOCKER CONTAINER
# Runs the unified Node.js API backend and serves the luxury web app
# =====================================================================

FROM node:24-alpine AS runner

WORKDIR /app

# Install runtime dependencies
ENV NODE_ENV=production
ENV PORT=5000

# Copy package specs and install production node_modules
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --only=production

# Copy backend source code
COPY backend ./backend

# Copy web frontend static application
COPY index.html style.css app.js ./

# Copy Chrome extension package for direct download / distribution
COPY chrome-extension ./chrome-extension

EXPOSE 5000

# Start server
CMD ["node", "backend/server.js"]
