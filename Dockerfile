FROM node:lts-alpine
WORKDIR /app
ENV TOKEN pig
RUN wget https://github.com/sgerrand/alpine-pkg-glibc/releases/download/2.35-r1/glibc-2.35-r1.apk \
    && apk add --allow-untrusted glibc-2.35-r1.apk
RUN apk add gcompat
COPY index.js index.js
COPY panel.html panel.html
COPY package.json package.json
RUN npm install
EXPOSE 3000
CMD ["npm", "run", "start"]
