FROM node:14-alpine

WORKDIR /build
COPY . .

RUN yarn install
RUN yarn build

ENV NODE_ENV production

RUN npx pkg . --output app

WORKDIR /app

RUN cp /build/app .
RUN mkdir ./config
RUN cp -rf /build/config/production.json ./config/
RUN rm -rf /build

CMD ["./app"]
