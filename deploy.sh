#!/bin/bash

# Deployment script for course server
# Usage: ./deploy.sh <PORT>

PORT=${1:-8000}

echo "========================================="
echo "Healthcare Email Defense - Deployment"
echo "========================================="
echo ""
echo "Port: $PORT"
echo ""

# Check if we're on the course server
if [[ ! $(hostname) == *"is-info492"* ]]; then
    echo "⚠️  Warning: This script is designed for the course server"
    echo "   Current hostname: $(hostname)"
    echo ""
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env file..."
    echo "PORT=$PORT" > .env
    echo "✅ Created .env with PORT=$PORT"
else
    echo "📝 Updating .env file..."
    if grep -q "PORT=" .env; then
        sed -i "s/PORT=.*/PORT=$PORT/" .env
    else
        echo "PORT=$PORT" >> .env
    fi
    echo "✅ Updated .env with PORT=$PORT"
fi

echo ""
echo "========================================="
echo "✅ Setup complete!"
echo "========================================="
echo ""
echo "To start the server, run:"
echo "  npm start"
echo ""
echo "Or with specific port:"
echo "  PORT=$PORT npm start"
echo ""
echo "Server will be accessible at:"
echo "  http://is-info492.ischool.uw.edu:$PORT"
echo ""
echo "Test credentials:"
echo "  - Nurse: Smart Card + MFA (code shown on screen)"
echo "  - IT Admin: Smart Card + PIN: 123456 + MFA (code shown on screen)"
echo "  - Department Lead: Smart Card + MFA (code shown on screen)"
echo ""

