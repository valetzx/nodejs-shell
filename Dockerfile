FROM node:lts-alpine3.22
WORKDIR /app
ENV TOKEN pig
RUN apk add  --no-cache --update ca-certificates tzdata
COPY . .
RUN npm install
EXPOSE 3000
CMD ["node", "index.js"]
