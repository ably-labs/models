FROM node:18

WORKDIR /app
RUN curl -f https://get.pnpm.io/v6.16.js | node - add --global pnpm
COPY . .
RUN pnpm install
RUN pnpm build
EXPOSE 3002

CMD pnpm start -- -p 3002
