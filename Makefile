APP_NAME 	= Transcendance
IP 			= localhost
PORT_DEV 	= 8080
PORT_PROD 	= 8443
BACK_PORT 	= 3000

DOCKER_COMPOSE = docker compose

RESET = \033[0m
WHITE = \033[1;37m
BOLD = \033[1m
GREEN = \033[0;92m
YELLOW = \033[0;93m
CYAN = \033[0;96m

all: prod

help: ## Outputs this help screen
	@grep -E '(^[a-zA-Z0-9_-]+:.*?##.*$$)|(^##)' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}{printf "\033[32m%-30s$(CLR_RESET) %s\n", $$1, $$2}' | sed -e 's/\[32m##/[33m/'

## —— Dev app handling ——————————————————————————————————————————————————————————————

dev: ## Launch development environment with live reload
	@echo "$(YELLOW) $(BOLD) Starting development environment...$(RESET)"
	@$(DOCKER_COMPOSE) -f docker-compose.dev.yml up -d
	@echo "$(GREEN)Development server available at $(RESET) $(WHITE) http://$(IP):$(PORT_DEV) $(RESET)"
	@echo "$(GREEN)Backend API available at $(RESET) $(WHITE) http://$(IP):$(BACK_PORT) $(RESET)"

dev-down: ## Stop development environment
	@echo "$(CYAN) $(BOLD) Stopping development containers...$(RESET)"
	$(DOCKER_COMPOSE) -f docker-compose.dev.yml down

build-dev: ## Build development docker images 
	@echo "$(YELLOW) $(BOLD)  Building development images...$(RESET)"
	$(DOCKER_COMPOSE) -f docker-compose.dev.yml build --no-cache

## —— Prod app handling ——————————————————————————————————————————————————————————————

prod: ## Launch the docker services (production)
	@echo "$(YELLOW) $(BOLD) Starting up production containers...$(RESET)"
	$(DOCKER_COMPOSE) up -d 
	@echo "$(GREEN)$(APP_NAME) available at $(RESET) $(WHITE) https://$(IP):$(PORT_PROD) $(RESET)"
	@echo "$(GREEN)Backend API available at $(RESET) $(WHITE) https://$(IP):$(BACK_PORT) $(RESET)"

down: ## Stop the docker services
	@echo "$(CYAN) $(BOLD) Stopping containers...$(RESET)"
	$(DOCKER_COMPOSE) down

build: ## Build all docker images 
	@echo "$(YELLOW) $(BOLD)  Building all images...$(RESET)"
	$(DOCKER_COMPOSE) build --no-cache

push: ## Push all docker images to the registry
	@echo "$(BOLD) Pushing all images...$(RESET)"
	$(DOCKER_COMPOSE) push


## —— Utils ——————————————————————————————————————————————————————————————

prod-logs: ## Show the logs of all containers
	@$(DOCKER_COMPOSE) logs 

dev-logs: ## Show development logs
	@$(DOCKER_COMPOSE) -f docker-compose.dev.yml logs -f

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
	@rm -rf backend/data/* || true
	@rm -rf backend/database/* || true
	@$(DOCKER_COMPOSE) down --volumes --rmi all

## —— Rebuild ————————————————————————————————————————————————————————————————

re: fclean build all ## Rebuild the whole production environment
re-dev: fclean build-dev dev ## Rebuild the whole development environment

.PHONY: all help up down dev dev-down dev-logs build push clean fclean re install logs 
