FROM node:lts-alpine
WORKDIR /app
ENV TOKEN pig
ENV ALPINE_GLIBC_REPO=https://github.com/sgerrand/alpine-pkg-glibc
ENV GLIBC_VERSION=2.35-r0  
RUN wget -q -O /etc/apk/keys/sgerrand.rsa.pub https://alpine-pkgs.sgerrand.com/sgerrand.rsa.pub
RUN wget https://github.com/sgerrand/alpine-pkg-glibc/releases/download/${GLIBC_VERSION}/glibc-${GLIBC_VERSION}.apk
RUN apk add glibc-${GLIBC_VERSION}.apk
RUN apk add --no-cache --update ca-certificates gcompat
COPY index.js index.js
COPY panel.html panel.html
COPY package.json package.json
RUN npm install
EXPOSE 3000
CMD ["npm", "run", "start"]
