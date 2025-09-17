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

## Iniciar o Swarm
```bash
# Inicializar Swarm (execute no nó manager)
docker swarm init

# (Opcional) Obter token para adicionar nós workers
# docker swarm join-token worker
```

## Build e Deploy do Stack
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

## Testar o Balanceamento
- Via navegador (UI simples):
  - Abra: `http://localhost:8080/ui`
  - Clique em "Testar (10 requisições)" ou ative "Auto (ligar)" para ver a alternância dos hostnames do frontend e backend.
  - Endpoints úteis (podem ser acessados diretamente):
    - `GET /` → JSON com `hostname` do frontend e `backend.hostname`
    - `GET /id` → JSON com `hostname` desta réplica do frontend
    - `GET /fanout?n=10` → servidor faz N chamadas internas e retorna a lista de hostnames percorridos
- Via CLI (curl):
```bash
# Substitua <MANAGER_IP> se acessando remotamente
curl http://localhost:8080/ | jq
```
- Você verá alternância do `hostname` do `frontend` e, dentro do campo `backend.hostname`, alternância entre as réplicas do backend.

Exemplo de resposta resumida:
```json
{
  "role": "frontend",
  "hostname": "frontend-xyz",
  "backend": {
    "role": "backend",
    "hostname": "backend-abc"
  }
}
```

## Escalonar (Scaling)
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
1) Rodar Portainer (modo Swarm):
```bash
docker volume create portainer_data

docker run -d -p 9000:9000 -p 9443:9443 \
  --name portainer --restart=always \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v portainer_data:/data \
  portainer/portainer-ce:latest
```
2) Acesse `https://<IP>:9443` ou `http://<IP>:9000`, finalize o setup e conecte no ambiente local.
3) Visualize o stack `swardemo`, serviços, réplicas e logs.

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
