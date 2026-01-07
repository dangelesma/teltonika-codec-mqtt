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

# Compile TypeScript to JavaScript
RUN npx tsc

# Expose the TCP port for Teltonika devices
EXPOSE 8833

# Set the command to run your application
CMD [ "node", "out/index.js" ]