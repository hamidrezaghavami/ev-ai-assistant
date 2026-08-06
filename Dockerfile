# 1. Start with a clean, lightweight Node.js environment
FROM node:20-slim

# 2. Install the system-level dependencies (SoX) for your audio streams
RUN apt-get update && apt-get install -y sox libsox-fmt-all

# 3. Set up your working directory inside the container
WORKDIR /app

# 4. Copy your package files FIRST and install JS dependencies
# (Doing this first makes rebuilding much faster!)
COPY package*.json ./
RUN npm install

# 5. Copy the rest of your massive 500-line client and files!
COPY . .

# 6. Fire up E.V.
CMD ["npm", "start"]