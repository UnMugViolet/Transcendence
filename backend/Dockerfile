FROM node:20

WORKDIR /app

COPY package*.json ./

RUN npm install
RUN npm install -g nodemon

# DEBUG
RUN apt-get update && apt-get install -y sqlite3 libsqlite3-dev 

COPY . .

COPY languages /app/languages

RUN npm rebuild better-sqlite3


EXPOSE 3000

CMD ["nodemon", "srcs/server.js"]
