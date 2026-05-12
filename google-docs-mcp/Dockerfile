FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Build if necessary (e.g., TypeScript)
# RUN npm run build

EXPOSE 3000

CMD ["node", "index.js"]
