FROM node:current-bullseye-slim
WORKDIR /app
ENV TOKEN pig
RUN apt update && apt upgrade -y
RUN apt install -y --no-install-recommends curl \
    && apt install -y --no-install-recommends procps \
    && apt install -y --no-install-recommends net-tools \
    && curl https://pkg.cloudflareclient.com/pubkey.gpg | sudo gpg --yes --dearmor --output /usr/share/keyrings/cloudflare-warp-archive-keyring.gpg \
    && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/cloudflare-warp-archive-keyring.gpg] https://pkg.cloudflareclient.com/ $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/cloudflare-client.list \
    && sudo apt-get update && sudo apt-get install -y --no-install-recommends cloudflare-warp
COPY index.js index.js
COPY panel.html panel.html
COPY package.json package.json
RUN npm install
EXPOSE 3000
CMD ["npm", "run", "start"]
