FROM node:lts-alpine3.21
WORKDIR /app
ENV TOKEN pig
RUN apk add  --no-cache --update ca-certificates tzdata
COPY index.js index.js
COPY panel.html panel.html
COPY package.json package.json
RUN npm install
EXPOSE 3000
CMD ["npm", "run", "start"]
