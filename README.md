# Transcendence


## How to use

### Development

That will create a dev image on your machine an launch a tiny web server to compile typescript and serve all the files<a href="https://www.npmjs.com/package/lite-server">lite-server</a>
The backend stays the same no matter the version `dev` or `prod`.

#### Start services

```bash
make dev
```

#### Stop services

To stop the docker containers : 

```bash 
make down
```

#### Rebuild images

You have modified the dev stage of Dockerfile and want them to be taken into account. 2 options: 

1. Clean all rebuild and serve
```bash
make re-dev
```

2. Build the images and serve

```bash
make build-dev
```

You want to know what commands are available and what they are doing `make help` will list all the availables commands in the Makefile and will allow you to use them !

```bash
make help
```

## Install locally 

This project has dependencies in order to make it work on your machine you will have to install them. 
Normally everything works using Docker but it could be usefull to check if they are working. 

Please make sure to have a node version >= 20. otherwise you will have some troubles with them.
To check use the command : 

```bash
node -v
```

To install all the dependencies simply use : 

```bash 
make install
```

### Production

This will create a production ready image, no server web just the compiled `ts` `css` and `tailwind`. That's it ! Everything is served from the nginx image used for frontend. 
The backend stays the same no matter the version `dev` or `prod`.

#### Start services

To build and launch the project simply use 

```bash
make prod 
```

#### Stop services

To stop the docker containers : 

```bash 
make down
```

#### Modify the image

You have modified the dev stage of Dockerfile and want them to be taken into account. 2 options: 

1. Clean all rebuild and serve
```bash
make re
```

2. Build the images and serve

```bash
make build
```


Ce qu'il y a déjà à peu près (mais tout fonctionne pas comme il faut)
- Standard authentication
- Remote players
- Live chat
- JWT (pas complet)
- Backend (en cours)
- Frontend (en cours)
- DB (en cours)
- Multiple languages (fait à l'arrache mais ca a l'air de fonctionner)

==> Beaucoup de choses sont loin d'être parfaites, vous pouvez tout réduire à néant.
