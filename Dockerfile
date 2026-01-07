# Use Node.js LTS as the base image
FROM node:18-alpine

# Set the working directory
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application
COPY src ./src

# Compile TypeScript and copy public files
RUN npm run build

# Expose ports: TCP for devices, HTTP for web interface
EXPOSE 8833
EXPOSE 3000

# Set the command to run your application
CMD [ "node", "out/index.js" ]