#!/bin/bash

# Development environment script for Koinonia Coffee Project
# Usage: ./dev.sh [frontend|functions|all]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_section() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
}

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    print_error "Firebase CLI is not installed. Install it with: npm install -g firebase-tools"
    exit 1
fi

# Check for .env.local file
if [ ! -f ".env.local" ]; then
    print_warning ".env.local file not found!"
    print_info "Creating .env.local for local development..."
    cat > .env.local << 'EOF'
# Local Development Environment Variables
# This file overrides .env for local development

# Stripe Publishable Key (use test key for local dev)
REACT_APP_STRIPE_PUBLISHABLE_KEY=pk_test_your_test_key_here

# Backend URL - Local Firebase Functions Emulator
REACT_APP_BACKEND_URL=http://127.0.0.1:5001/koinonia-coffee-project/us-central1/api
EOF
    print_warning "Please update .env.local with your Stripe test key!"
fi

# Check for functions/.env.local file (used by emulator)
if [ ! -f "functions/.env.local" ]; then
    print_warning "functions/.env.local file not found!"
    if [ -f "functions/.env.example" ]; then
        print_info "Copying functions/.env.example to functions/.env.local..."
        cp functions/.env.example functions/.env.local
        print_info "✓ Created functions/.env.local with test Stripe keys"
    else
        print_error "functions/.env.example not found!"
        exit 1
    fi
fi

# Determine what to run
DEV_TARGET=${1:-all}

# Cleanup function to kill background processes
cleanup() {
    print_warning "Shutting down development servers..."
    jobs -p | xargs -r kill 2>/dev/null
    exit 0
}

trap cleanup SIGINT SIGTERM

start_frontend() {
    print_section "Starting Frontend Development Server"
    
    if [ ! -d "node_modules" ]; then
        print_info "Installing frontend dependencies..."
        npm install
    fi
    
    print_info "Starting React development server on http://localhost:3000"
    npm start
}

start_functions() {
    print_section "Starting Firebase Functions Emulator"
    
    if [ ! -d "functions/node_modules" ]; then
        print_info "Installing functions dependencies..."
        cd functions
        npm install
        cd ..
    fi
    
    print_info "Building TypeScript functions..."
    cd functions
    npm run build
    cd ..
    
    print_info "Starting Firebase emulators with UI..."
    print_info "Functions will be available at: http://127.0.0.1:5001/koinonia-coffee-project/us-central1/api"
    print_info "Emulator UI will be available at: http://127.0.0.1:4000"
    firebase emulators:start
}

start_all() {
    print_section "Starting Full Development Environment"
    
    # Install dependencies if needed
    if [ ! -d "node_modules" ]; then
        print_info "Installing frontend dependencies..."
        npm install
    fi
    
    if [ ! -d "functions/node_modules" ]; then
        print_info "Installing functions dependencies..."
        cd functions
        npm install
        cd ..
    fi
    
    # Build functions
    print_info "Building TypeScript functions..."
    cd functions
    npm run build
    cd ..
    
    print_info "Starting Firebase emulators with UI in background..."
    firebase emulators:start &
    EMULATOR_PID=$!
    
    # Wait a bit for emulators to start
    print_info "Waiting for emulators to initialize..."
    sleep 5
    
    print_info "Starting React development server..."
    print_info ""
    print_info "🚀 Development servers starting:"
    print_info "   Frontend:     http://localhost:3000"
    print_info "   Functions:    http://127.0.0.1:5001/koinonia-coffee-project/us-central1/api"
    print_info "   Emulator UI:  http://127.0.0.1:4000"
    print_info ""
    print_info "📝 Using .env.local for local development configuration"
    print_info "💡 Tip: Use Emulator UI to manually trigger scheduled functions"
    print_info "Press Ctrl+C to stop all servers"
    print_info ""
    
    npm start
    
    # This will be reached when npm start is killed
    wait $EMULATOR_PID
}

# Main logic
case $DEV_TARGET in
    frontend)
        start_frontend
        ;;
    functions)
        start_functions
        ;;
    all)
        start_all
        ;;
    *)
        print_error "Invalid target: $DEV_TARGET"
        echo "Usage: ./dev.sh [frontend|functions|all]"
        exit 1
        ;;
esac
