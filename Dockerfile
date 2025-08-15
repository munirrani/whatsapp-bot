FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci --omit=dev --legacy-peer-deps

FROM node:22-alpine AS build 
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci --legacy-peer-deps
COPY . .
RUN npm run build

FROM node:22-alpine AS production
WORKDIR /app
COPY --from=deps  /app/node_modules ./node_modules
COPY --from=build /app/dist        ./dist
COPY --from=deps  /app/package.json ./package.json
EXPOSE 8016
CMD ["node", "dist/app.js"]