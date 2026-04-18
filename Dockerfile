FROM nginx:alpine

# Copy custom Nginx configuration
COPY default.conf /etc/nginx/conf.d/default.conf

# Copy the static website files into the container
COPY . /usr/share/nginx/html

# Nginx needs to listen on the dynamic $PORT assigned by Cloud Run.
# We substitute the $PORT variable into default.conf right before starting.
CMD sed -i -e 's/$PORT/'"$PORT"'/g' /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'
