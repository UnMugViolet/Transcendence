APP_NAME 	= Transcendance
IP 			= localhost
PORT 		= 8080
BACK_PORT 	= 3000

DOCKER_COMPOSE = docker compose

RESET = \033[0m
WHITE = \033[1;37m
BOLD = \033[1m
GREEN = \033[0;92m
YELLOW = \033[0;93m
CYAN = \033[0;96m

all: up

help: ## Outputs this help screen
	@grep -E '(^[a-zA-Z0-9_-]+:.*?##.*$$)|(^##)' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}{printf "\033[32m%-30s$(CLR_RESET) %s\n", $$1, $$2}' | sed -e 's/\[32m##/[33m/'

## —— App handling ——————————————————————————————————————————————————————————————

up: ## Launch the docker services
	@echo "$(YELLOW) $(BOLD) Starting up containers...$(RESET)"
	$(DOCKER_COMPOSE) up -d 
	@echo "$(GREEN)$(APP_NAME) available at $(RESET) $(WHITE) http://$(IP):$(PORT) $(RESET)"
	@echo "$(GREEN)Backend API available at $(RESET) $(WHITE) http://$(IP):$(BACK_PORT) $(RESET)"

down: ## Stop the docker services
	@echo "$(CYAN) $(BOLD) Stopping containers...$(RESET)"
	$(DOCKER_COMPOSE) down

build: ## Build all docker images 
	@echo "$(YELLOW) $(BOLD)  Building all images...$(RESET)"
	$(DOCKER_COMPOSE) build --no-cache

push: ## Push all docker images to the registry
	@echo "$(BOLD) Pushing all images...$(RESET)"
	$(DOCKER_COMPOSE) push


## —— Dev utils ——————————————————————————————————————————————————————————————

logs: ## Show the logs of all containers
	@$(DOCKER_COMPOSE) logs -f

install: ## Install project dependencies
	@echo "$(GREEN) Installing backend dependencies...$(RESET)"
	@cd backend && npm install
	@echo "$(GREEN) Installing frontend dependencies...$(RESET)"
	@cd frontend && npm install

## —— Cleaning up ——————————————————————————————————————————————————————————————

clean: ## Remove all containers
	@echo "$(GREEN)🧹 Removing containers...$(RESET)"
	@$(DOCKER_COMPOSE) down --remove-orphans
	

fclean: clean ## Remove all containers, images and volumes
	@echo "$(RED) Removing all related images and volumes...$(RESET)"
	@$(DOCKER_COMPOSE) down --volumes --rmi all

## —— Rebuild ————————————————————————————————————————————————————————————————

re: fclean build all ## Rebuild the whole project

.PHONY: all help up down build push clean fclean re 
