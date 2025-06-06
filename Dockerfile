FROM node:lts-alpine
WORKDIR /app
ENV TOKEN pig
RUN apk add  --no-cache --update ca-certificates tzdata
COPY index.js index.js
COPY panel.index panel.index
COPY package.json package.json
RUN npm install
EXPOSE 3000
CMD ["npm", "run", "start"]
