FROM nginx:alpine

# Copy all static assets to the Nginx web root
COPY . /usr/share/nginx/html

# Replace the default configuration with our custom one (port 8080)
COPY default.conf /etc/nginx/conf.d/default.conf

# Expose the Cloud Run default port
EXPOSE 8080

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]
