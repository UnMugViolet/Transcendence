FROM node:20

WORKDIR /app

COPY package*.json ./

RUN npm install && \
	npm install -g nodemon && \
	npm cache clean --force && \
	apt update && apt install -y sqlite3 libsqlite3-dev && \
	rm -rf /var/lib/apt/lists/*

COPY . .

COPY languages /app/languages

RUN npm rebuild better-sqlite3

EXPOSE 3000

CMD ["nodemon", "srcs/server.js"]
