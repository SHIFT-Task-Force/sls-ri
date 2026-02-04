# FHIR Security Labeling Service - Docker Deployment

This guide covers deploying the FHIR SLS as a containerized service using Docker.

## Prerequisites

- Docker Desktop (Windows/Mac) or Docker Engine (Linux)
- Docker Compose (included with Docker Desktop)
- 2GB free disk space
- Port 3000 available

## Quick Start

### 1. Build and Start the Service

```bash
# From the project root directory
docker-compose up -d
```

This will:
- Build the backend API container
- Create a persistent volume for the database
- Start the service on port 3000
- Mount the frontend files

### 2. Verify the Service

```bash
# Check service health
curl http://localhost:3000/health

# View logs
docker-compose logs -f

# Check container status
docker-compose ps
```

### 3. Access the Application

Open your browser to: **http://localhost:3000**

## Architecture

```
┌─────────────────────────────────────┐
│         Docker Container            │
├─────────────────────────────────────┤
│  Node.js/Express Server (Port 3000) │
│    ├─ API Endpoints (/api/v1/...)  │
│    ├─ Static Frontend Files        │
│    └─ SQLite Database (Volume)     │
└─────────────────────────────────────┘
         ↑
         │ HTTP
         ↓
    Your Browser
```

## API Endpoints

### Base URL
```
http://localhost:3000
```

### Endpoints

#### Health Check
```bash
GET /health
```

#### API 1: Process ValueSets
```bash
POST /api/v1/valuesets
Content-Type: application/json

# Body: FHIR Bundle with ValueSet resources
```

#### API 2: Analyze Resources
```bash
POST /api/v1/analyze
Content-Type: application/json

# Body: FHIR Bundle with clinical resources
```

#### Get Status
```bash
GET /api/v1/status
```

#### Clear Data
```bash
DELETE /api/v1/data
```

## Docker Commands

### Start Services
```bash
docker-compose up -d
```

### Stop Services
```bash
docker-compose down
```

### Stop and Remove Data
```bash
docker-compose down -v
```

### Rebuild After Code Changes
```bash
docker-compose up -d --build
```

### View Logs
```bash
# All logs
docker-compose logs -f

# Backend only
docker-compose logs -f sls-backend
```

### Execute Commands in Container
```bash
# Open shell
docker-compose exec sls-backend sh

# Check Node version
docker-compose exec sls-backend node --version
```

## Database Persistence

The SQLite database is stored in a Docker volume:

```bash
# View volume details
docker volume inspect sls-ri_sls-data

# Backup database
docker-compose exec sls-backend cp /app/data/sls.db /app/data/backup.db

# Copy database to host
docker cp fhir-sls-backend:/app/data/sls.db ./sls-backup.db
```

## Environment Variables

You can customize the service by setting environment variables in `docker-compose.yml`:

```yaml
environment:
  - NODE_ENV=production
  - PORT=3000
  - DB_PATH=/app/data/sls.db
```

Or create a `.env` file:

```bash
NODE_ENV=production
PORT=3000
DB_PATH=/app/data/sls.db
```

## Using Different Ports

To run on a different port, edit `docker-compose.yml`:

```yaml
ports:
  - "8080:3000"  # Host:Container
```

Then access at: http://localhost:8080

## Development Mode

For development with auto-reload:

1. Install dependencies locally:
```bash
cd backend
npm install
```

2. Run without Docker:
```bash
cd backend
npm run dev
```

3. Frontend will be served from `../frontend`

## Production Deployment

### Cloud Deployment Options

#### AWS (Elastic Container Service)
1. Push image to ECR
2. Create ECS task definition
3. Deploy to ECS Fargate or EC2

#### Azure (Container Instances)
1. Push image to ACR
2. Create container instance
3. Configure networking

#### Google Cloud (Cloud Run)
1. Push image to GCR
2. Deploy to Cloud Run
3. Configure autoscaling

### Security Considerations

For production deployment:

1. **Use HTTPS**: Add reverse proxy (nginx/Traefik) with SSL
2. **Authentication**: Implement OAuth2/JWT authentication
3. **Rate Limiting**: Add rate limiting middleware
4. **CORS**: Configure appropriate CORS policies
5. **Monitoring**: Add logging and monitoring (Prometheus, Grafana)
6. **Backup**: Implement automated database backups
7. **Environment**: Use secrets management for sensitive data

### Example nginx Configuration

```nginx
server {
    listen 443 ssl;
    server_name sls.yourdomain.com;

    ssl_certificate /etc/ssl/certs/your-cert.pem;
    ssl_certificate_key /etc/ssl/private/your-key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Troubleshooting

### Container Won't Start
```bash
# Check logs
docker-compose logs sls-backend

# Check if port is in use
netstat -an | findstr :3000  # Windows
lsof -i :3000                # Mac/Linux
```

### Database Issues
```bash
# Reset database
docker-compose down -v
docker-compose up -d
```

### Frontend Not Loading
```bash
# Verify frontend files are mounted
docker-compose exec sls-backend ls -la /app/frontend
```

### Performance Issues
```bash
# Check resource usage
docker stats fhir-sls-backend

# Increase resources in Docker Desktop settings
```

## Testing the API with curl

### Process ValueSets
```bash
curl -X POST http://localhost:3000/api/v1/valuesets \
  -H "Content-Type: application/json" \
  -d @sample-valuesets.json
```

### Analyze Resources
```bash
curl -X POST http://localhost:3000/api/v1/analyze \
  -H "Content-Type: application/json" \
  -d @sample-resources.json
```

### Get Status
```bash
curl http://localhost:3000/api/v1/status | jq
```

## Monitoring

### Health Checks

Docker Compose includes health checks:
```bash
# View health status
docker-compose ps
```

### Logs

Structured logging is available:
```bash
# Follow logs with timestamps
docker-compose logs -f --timestamps

# Last 100 lines
docker-compose logs --tail=100
```

## Scaling

To run multiple instances:

```yaml
services:
  sls-backend:
    # ... other config ...
    deploy:
      replicas: 3
```

Note: With multiple instances, consider:
- Shared database (PostgreSQL instead of SQLite)
- Load balancer
- Session management

## Backup and Restore

### Backup
```bash
# Create backup
docker-compose exec sls-backend sqlite3 /app/data/sls.db ".backup '/app/data/backup.db'"

# Copy to host
docker cp fhir-sls-backend:/app/data/backup.db ./backup-$(date +%Y%m%d).db
```

### Restore
```bash
# Copy backup to container
docker cp backup-20260204.db fhir-sls-backend:/app/data/restore.db

# Restore
docker-compose exec sls-backend cp /app/data/restore.db /app/data/sls.db

# Restart service
docker-compose restart sls-backend
```

## Uninstalling

To completely remove the service:

```bash
# Stop and remove containers, networks, volumes
docker-compose down -v

# Remove images
docker rmi sls-ri_sls-backend

# Clean up unused Docker resources
docker system prune -a
```

## Support

For issues or questions:
- GitHub Issues: https://github.com/SHIFT-Task-Force/sls-ri/issues
- Documentation: See README.md
