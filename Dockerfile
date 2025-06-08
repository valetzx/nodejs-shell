FROM node:current-bullseye-slim
WORKDIR /app
ENV TOKEN pig
RUN apt update && apt upgrade -y
RUN apt install -y --no-install-recommends curl \
    && apt install -y --no-install-recommends procps \
    && apt install -y --no-install-recommends net-tools && apt install -y --no-install-recommends sudo
COPY index.js index.js
COPY panel.html panel.html
COPY package.json package.json
RUN npm install
EXPOSE 3000
CMD ["npm", "run", "start"]
