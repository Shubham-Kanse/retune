#!/bin/bash

# Production deployment script for Retune
set -e

echo "🚀 Starting Retune production deployment..."

# Check prerequisites
command -v docker >/dev/null 2>&1 || { echo "❌ Docker is required but not installed. Aborting." >&2; exit 1; }
command -v docker-compose >/dev/null 2>&1 || { echo "❌ Docker Compose is required but not installed. Aborting." >&2; exit 1; }

# Check environment file
if [ ! -f .env ]; then
    echo "❌ .env file not found. Please copy .env.production to .env and configure it."
    exit 1
fi

# Validate required environment variables
source .env
if [ -z "$ANTHROPIC_API_KEY" ] || [ "$ANTHROPIC_API_KEY" = "sk-ant-api03-placeholder-key-for-development-testing-only" ]; then
    echo "❌ ANTHROPIC_API_KEY must be set to a valid API key"
    exit 1
fi

if [ -z "$JWT_SECRET" ] || [ ${#JWT_SECRET} -lt 32 ]; then
    echo "❌ JWT_SECRET must be at least 32 characters long"
    exit 1
fi

echo "✅ Environment validation passed"

# Build and start services
echo "🔨 Building Docker images..."
docker-compose build --no-cache

echo "🚀 Starting services..."
docker-compose up -d

# Wait for services to be ready
echo "⏳ Waiting for services to start..."
sleep 10

# Health check
echo "🏥 Performing health check..."
for i in {1..30}; do
    if curl -f http://localhost:3000/api/health >/dev/null 2>&1; then
        echo "✅ Health check passed"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "❌ Health check failed after 30 attempts"
        docker-compose logs
        exit 1
    fi
    sleep 2
done

# Show status
echo "📊 Deployment status:"
docker-compose ps

echo "🎉 Retune is now running at http://localhost:3000"
echo "📊 Health endpoint: http://localhost:3000/api/health"
echo "📈 Metrics endpoint: http://localhost:3000/api/admin/metrics"

echo ""
echo "📝 Next steps:"
echo "1. Configure your domain and SSL certificate"
echo "2. Set up monitoring and alerting"
echo "3. Configure backups for the data volume"
echo "4. Review logs: docker-compose logs -f"
