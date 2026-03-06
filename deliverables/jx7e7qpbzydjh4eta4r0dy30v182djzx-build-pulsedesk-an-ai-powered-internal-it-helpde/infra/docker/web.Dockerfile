FROM node:22-alpine as build
WORKDIR /app
COPY package*.json ./
COPY apps/web/package*.json apps/web/
RUN npm install
COPY . .
WORKDIR /app/apps/web
RUN npm run build
FROM nginx:alpine
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
