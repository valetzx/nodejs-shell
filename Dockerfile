FROM node:current-bullseye-slim
WORKDIR /app
ENV TOKEN pig
ENV TZ=Asia/Shanghai
RUN apt update && apt upgrade -y
RUN apt install -y --no-install-recommends curl wget unzip\
    && apt install -y --no-install-recommends procps tzdata\
    && apt install -y --no-install-recommends net-tools && apt install -y --no-install-recommends sudo
COPY index.js index.js
COPY package.json package.json
RUN npm install
EXPOSE 3000
CMD ["npm", "run", "start"]
