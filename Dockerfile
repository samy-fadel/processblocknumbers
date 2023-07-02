# Use Node.js as the base image
FROM node:14

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the JavaScript code to the working directory
COPY index.js .

# Run the JavaScript code when the container starts
CMD [ "node", "index.js" ]