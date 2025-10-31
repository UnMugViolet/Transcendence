NAME = transcendance

DOCKER_COMPOSE = docker compose

GREEN = \033[0;32m
RESET = \033[0m

.PHONY: all up down build clean fclean re


all: up

up:
	@echo "$(GREEN)🔼 Starting containers...$(RESET)"
	$(DOCKER_COMPOSE) up 

down:
	@echo "$(GREEN)🔽 Stopping containers...$(RESET)"
	$(DOCKER_COMPOSE) down

build:
	@echo "$(GREEN)🏗️  Building all images...$(RESET)"
	$(DOCKER_COMPOSE) build

clean:
	@echo "$(GREEN)🧹 Removing containers...$(RESET)"
	$(DOCKER_COMPOSE) down --remove-orphans

fclean: clean
	@echo "$(GREEN)🧨 Removing images...$(RESET)"
	docker image prune -af
	@echo "$(GREEN)🧨 Removing volumes...$(RESET)"
	docker volume prune -f

re: fclean build up