NAME = transcendance

DOCKER_COMPOSE = docker compose
COMPOSE_FILE = docker-compose.yml

GREEN = \033[0;32m
RESET = \033[0m

.PHONY: all up down build clean fclean re


all: up

up:
	@echo "$(GREEN)🔼 Starting containers...$(RESET)"
	$(DOCKER_COMPOSE) -f $(COMPOSE_FILE) up

down:
	@echo "$(GREEN)🔽 Stopping containers...$(RESET)"
	$(DOCKER_COMPOSE) -f $(COMPOSE_FILE) down

build:
	@echo "$(GREEN)🏗️  Building all images...$(RESET)"
	$(DOCKER_COMPOSE) -f $(COMPOSE_FILE) build

clean:
	@echo "$(GREEN)🧹 Removing containers...$(RESET)"
	$(DOCKER_COMPOSE) -f $(COMPOSE_FILE) down --remove-orphans

fclean: clean
	@echo "$(GREEN)🧨 Removing images...$(RESET)"
	docker image prune -af
	@echo "$(GREEN)🧨 Removing volumes...$(RESET)"
	docker volume prune -f

re: fclean build up