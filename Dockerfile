FROM node:14

WORKDIR /app
COPY . .

RUN yarn install

ENV NODE_ENV production

CMD ["yarn", "start"]
