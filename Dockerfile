FROM node:lts-alpine
WORKDIR /app
ENV TOKEN pig
RUN apk add wget
    wget -q -O /etc/apk/keys/sgerrand.rsa.pub https://alpine-pkgs.sgerrand.com/sgerrand.rsa.pub
    wget https://github.com/sgerrand/alpine-pkg-glibc/releases/download/2.35-r1/glibc-2.35-r1.apk
    apk add glibc-2.35-r1.apk
RUN apk add --no-cache --update ca-certificates gcompat
COPY index.js index.js
COPY panel.html panel.html
COPY package.json package.json
RUN npm install
EXPOSE 3000
CMD ["npm", "run", "start"]
