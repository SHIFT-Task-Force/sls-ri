# FHIR Security Labeling Service - Docker Deployment

This guide covers deploying the FHIR SLS as a containerized service using Docker.

## Prerequisites

- Docker Desktop (Windows/Mac) or Docker Engine (Linux)
- Docker Compose (included with Docker Desktop)
- 2GB free disk space
- Port 3000 available

### Windows-Specific Requirements

**Important for Windows Users:**
- **Ensure Docker Desktop is running** (check system tray for Docker icon)
- Enable WSL 2 backend in Docker Desktop settings (recommended)
- Make sure the project folder is in a location accessible to Docker (usually C:\Users\<username>\...)
- Git should be configured with `core.autocrlf=false` to avoid line ending issues

**Starting Docker Desktop:**
1. Open Docker Desktop from Start Menu
2. Wait for "Docker Desktop is running" status
3. Verify by running: `docker --version`

## Quick Start

### 1. Build and Start the Service

**Windows PowerShell:**
```powershell
# From the project root directory
docker-compose up -d

# Or use Docker Compose V2 command
docker compose up -d
```

**Linux/Mac:**
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
│    ├─ FHIR Operations             │
│    ├─ Static Frontend Files        │
│    └─ SQLite Database (Volume)     │
└─────────────────────────────────────┘
         ↑
         │ HTTP/FHIR
         ↓
    Your Browser
```

## FHIR Operations

### Base URL
```
http://localhost:3000
```

### Operations

#### CapabilityStatement (Metadata)
```bash
GET /metadata
Accept: application/fhir+json
```

#### OperationDefinitions
```bash
GET /OperationDefinition/sls-load-valuesets
GET /OperationDefinition/sls-tag
```

#### Load ValueSets ($sls-load-valuesets)
```bash
POST /$sls-load-valuesets
Content-Type: application/fhir+json

# Body: FHIR Bundle with ValueSet resources
```

#### Analyze Resources ($sls-tag)
```bash
POST /$sls-tag?mode=batch
Content-Type: application/fhir+json

# Body: FHIR Bundle with clinical resources
# mode parameter: batch (default) or full
```

#### Status Dashboard
View system status, loaded ValueSets, and processing statistics:
```bash
# JSON endpoint
GET /status

# HTML dashboard (view in browser)
GET /status.html
```

Open in browser: **http://localhost:3000/status.html**

#### Health Check
```bash
GET /health
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

### Resetting All Stored Data

Restarting the container (`docker-compose restart`) does **not** clear data because the database is persisted in the `sls-data` volume.

Use one of these options instead:

```bash
# Option 1: Clear from the UI button (calls POST /admin/clear-data)
# Open http://localhost:3000 and click "Clear all valueSets"

# Option 2: Remove container and volume (full reset)
docker-compose down -v
docker-compose up -d --build
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

### Windows-Specific Issues

#### Docker Compose Not Found
```powershell
# Docker Desktop uses Docker Compose V2
# Use this command instead:
docker compose up -d

# Or install standalone docker-compose
```

#### Line Ending Issues (CRLF/LF)
```powershell
# Configure git to avoid line ending conversion
git config --global core.autocrlf false

# Re-clone or reset files
git rm --cached -r .
git reset --hard
```

#### Volume Mount Issues
```powershell
# Ensure project is in accessible location (not on network drive)
# Preferred: C:\Users\<username>\...

# Check Docker Desktop settings:
# Settings > Resources > File Sharing
# Ensure C:\ drive is shared
```

#### Port Already in Use
```powershell
# Check what's using port 3000
netstat -ano | findstr :3000

# Kill the process (replace PID)
taskkill /PID <PID> /F

# Or change port in docker-compose.yml
# ports:
#   - "8080:3000"
```

### General Issues

#### Container Won't Start
```bash
# Check logs
docker-compose logs sls-backend

# Or with V2
docker compose logs sls-backend

# Check if port is in use (Windows)
netstat -an | findstr :3000

# Check if port is in use (Mac/Linux)
lsof -i :3000
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

## Testing with curl

### Load ValueSets
```bash
curl -X POST http://localhost:3000/\$sls-load-valuesets \
  -H "Content-Type: application/fhir+json" \
  -d @sample-valuesets.json
```

### Analyze Resources
```bash
curl -X POST http://localhost:3000/\$sls-tag?mode=full \
  -H "Content-Type: application/fhir+json" \
  -d @sample-resources.json
```

### Get Metadata
```bash
curl http://localhost:3000/metadata | jq
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
