# Docker Swarm - Frontend/Backend com Réplicas e Balanceamento

Este projeto demonstra um cluster Docker Swarm com dois serviços:
- Frontend HTTP (Node/Express) publicado externamente
- Backend API (Node/Express) acessível somente via rede overlay

Ambos exibem o hostname do container para mostrar o balanceamento. O frontend chama o backend e retorna no payload seu próprio hostname e o do backend que respondeu.

## Topologia
- Serviços: `frontend` (porta 8080 publicada), `backend` (somente rede interna)
- Rede: overlay `app_net` (compartilhada entre os serviços)
- Porta exposta: 8080/TCP no `frontend` via ingress do Swarm
- Configs: `frontend_message` e `backend_message` (demonstração de Configs)

## Pré-requisitos
- Docker instalado e Docker Swarm disponível
- Permissão administrativa para inicializar o Swarm

## Passo a Passo Completo

### 1. Inicializar o Swarm
```bash
# Inicializar Swarm (execute no nó manager)
docker swarm init

# (Opcional) Obter token para adicionar nós workers
# docker swarm join-token worker
```

### 2. Build e Deploy do Stack
No diretório raiz do projeto:
```bash
# Build das imagens locais (o deploy do stack usa imagens já existentes)
docker build -t swarm-backend:latest ./backend

docker build -t swarm-frontend:latest ./frontend

# Deploy do stack (cria serviços, rede overlay, configs)
docker stack deploy -c stack.yml swardemo

# Verificar serviços e réplicas
docker stack services swardemo
```

### 3. Configurar Portainer (Opcional)
```bash
# Criar volume para persistir dados
docker volume create portainer_data

# Criar serviço Portainer no Swarm
docker service create --name portainer \
  --publish 9000:9000 --publish 9443:9443 \
  --constraint 'node.role == manager' \
  --mount type=bind,src=/var/run/docker.sock,dst=/var/run/docker.sock \
  --mount type=volume,src=portainer_data,dst=/data \
  portainer/portainer-ce:latest
```

### 4. Testar o Balanceamento

**Via navegador (UI simples):**
- Abra: `http://localhost:8080/ui`
- Clique em "Testar (10 requisições)" ou ative "Auto (ligar)" para ver a alternância dos hostnames do frontend e backend.

**Via CLI (curl):**
```bash
# Substitua <MANAGER_IP> se acessando remotamente
curl http://localhost:8080/ | jq
```

**Via Portainer (logs):**
- Acesse: `https://localhost:9443`
- **Services** → `frontend` → **Logs** → **Follow logs**
- Em outro terminal, gere tráfego:
```bash
# PowerShell
for ($i=0; $i -lt 50; $i++) { curl http://localhost:8080/ >$null }

# Linux/Mac
for i in {1..50}; do curl http://localhost:8080/ >/dev/null; done
```
- Observe nos logs: `host=<hostname>` alternando entre réplicas

### 5. Escalonar (Scaling)
Aumente ou reduza réplicas e observe o efeito no balanceamento:
```bash
# Escalar frontend para 5 réplicas
docker service scale swardemo_frontend=5

# Escalar backend para 6 réplicas
docker service scale swardemo_backend=6

# Verificar
docker stack services swardemo
```

As requisições permanecem acessíveis durante updates e mudanças de réplicas, graças ao roteamento ingress do Swarm e à política de update.

### Dicas para ver mais alternância rapidamente
- Navegador costuma reutilizar conexão. O frontend envia `Connection: close` para abrir novas conexões e favorecer alternância.
- Use a UI com "Auto (ligar)" e/ou aumente N em `/fanout?n=30`.
- Aumente réplicas (ex.: `frontend=5`, `backend=6`).
- Limite recursos por réplica para forçar distribuição:
```bash
docker service update --limit-cpu 0.10 --limit-memory 64M swardemo_frontend
docker service update --limit-cpu 0.10 --limit-memory 64M swardemo_backend
```

## Atualizações sem indisponibilidade
Os serviços usam `update_config` com `order: start-first`, iniciando um novo container antes de encerrar o antigo.

## Portainer (visualização)
1) Rodar Portainer como serviço do Swarm:
```bash
# Criar volume para persistir dados
docker volume create portainer_data

# Criar serviço Portainer no Swarm
docker service create --name portainer \
  --publish 9000:9000 --publish 9443:9443 \
  --constraint 'node.role == manager' \
  --mount type=bind,src=/var/run/docker.sock,dst=/var/run/docker.sock \
  --mount type=volume,src=portainer_data,dst=/data \
  portainer/portainer-ce:latest
```

2) Acessar e configurar:
- Abra: `https://localhost:9443` (ou `http://localhost:9000`)
- Crie usuário admin e senha
- Escolha "Get started" e conecte ao ambiente local (Docker/Swarm)

3) Visualizar balanceamento:
- **Stacks** → `swardemo` → veja serviços `frontend` e `backend`
- **Services** → `frontend` → **Logs** → **Follow logs**
- Em outro terminal, gere tráfego:
```bash
# PowerShell
for ($i=0; $i -lt 50; $i++) { curl http://localhost:8080/ >$null }

# Linux/Mac
for i in {1..50}; do curl http://localhost:8080/ >/dev/null; done
```
- Observe nos logs: `host=<hostname>` alternando entre réplicas
- Repita em **Services** → `backend` → **Logs** para ver chamadas internas

4) Escalar via Portainer:
- **Services** → `frontend` → **Scale** → defina 5 réplicas
- **Services** → `backend` → **Scale** → defina 6 réplicas
- Gere tráfego novamente e veja mais alternância

5) Rede overlay:
- **Networks** → `swardemo_app_net` → veja containers conectados

## Limpeza
```bash
docker stack rm swardemo
# Aguarde serviços pararem
# (Opcional) docker swarm leave --force
```

## Estrutura
```
backend/
  Dockerfile
  package.json
  server.js
frontend/
  Dockerfile
  package.json
  server.js
configs/
  backend_message.txt
  frontend_message.txt
stack.yml
```

## Notas
- O `stack.yml` publica somente o `frontend` na porta 8080 via ingress. O `backend` só é acessível na overlay `app_net`.
- As mensagens podem ser parametrizadas via Configs e variáveis de ambiente.
 - O `stack.yml` define placement em `node.role == manager` para facilitar o demo em um único nó.
 - Após editar o código, é necessário rebuildar e aplicar update do serviço:
```bash
docker build -t swarm-frontend:latest ./frontend
docker service update --image swarm-frontend:latest swardemo_frontend

docker build -t swarm-backend:latest ./backend
docker service update --image swarm-backend:latest swardemo_backend
```
