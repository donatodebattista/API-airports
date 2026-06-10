FROM nginx:alpine

# Reemplazar config default de nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copiar archivos del frontend
COPY index.html /usr/share/nginx/html/index.html
COPY css/ /usr/share/nginx/html/css/
COPY js/ /usr/share/nginx/html/js/
COPY assets/ /usr/share/nginx/html/assets/

EXPOSE 80
