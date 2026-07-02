# Base image
FROM node:22-alpine AS builder

# Create app directory
WORKDIR /app

# A wildcard is used to ensure both package.json AND package-lock.json are copied
COPY package*.json ./
COPY prisma ./prisma/

# Install app dependencies
RUN npm ci

# Generate Prisma client
RUN npx prisma generate

# Bundle app source
COPY . .

# Build the application
RUN npm run build

# Second stage: production environment
FROM node:22-alpine

WORKDIR /app

# Copy the bundled code from the builder stage
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# Expose port
EXPOSE 3000

# Start the server
CMD ["npm", "run", "start:prod"]
