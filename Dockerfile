FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build
EXPOSE 3000
ENV TRANSPORT=http
CMD ["node", "dist/index.js"]
