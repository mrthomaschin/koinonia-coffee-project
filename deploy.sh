#!/bin/bash

# Deployment script for Koinonia Coffee Project
# Usage: ./deploy.sh [frontend|functions|all]
# Note: Run with bash (./deploy.sh) or bash deploy.sh, not sh deploy.sh

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

# Function to verify Firebase authentication and project
verify_firebase_config() {
    print_info "Checking Firebase authentication..."
    if ! firebase projects:list &> /dev/null; then
        print_warning "Not authenticated with Firebase. Running firebase login..."
        firebase login
    fi
    
    print_info "Verifying Firebase project configuration..."
    CURRENT_PROJECT=$(firebase use 2>&1)
    if echo "$CURRENT_PROJECT" | grep -q "No active project"; then
        print_error "No Firebase project selected. Run: firebase use --add"
        exit 1
    fi
    
    # Extract project name from output
    PROJECT_NAME=$(echo "$CURRENT_PROJECT" | grep -oE '\([^)]+\)' | tr -d '()' | head -1)
    if [ -n "$PROJECT_NAME" ]; then
        print_info "Using Firebase project: $PROJECT_NAME"
    else
        print_info "Firebase project configured"
    fi
}

# Function to check production environment variables
check_env_file() {
    if [ ! -f ".env" ]; then
        print_warning ".env file not found!"
        print_info "For production deployment, create .env with production values"
        print_info "Run: cp .env.example .env"
        print_warning "Continuing without .env file - ensure environment is configured correctly"
        return 1
    fi
    
    # Check if .env has production backend URL
    if grep -q "127.0.0.1" .env 2>/dev/null || grep -q "localhost" .env 2>/dev/null; then
        print_warning "⚠️  .env file contains local development URLs!"
        print_warning "Make sure REACT_APP_BACKEND_URL points to production Firebase Functions"
        print_info "Expected format: https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/api"
    fi
    
    return 0
}

# Function to verify required secrets are set (for functions deployment)
verify_secrets() {
    print_info "Verifying Firebase secrets for Stripe..."
    
    SECRETS_OUTPUT=$(firebase functions:secrets:access STRIPE_SECRET_KEY 2>&1 || echo "")
    if [[ "$SECRETS_OUTPUT" == *"does not exist"* ]] || [ -z "$SECRETS_OUTPUT" ]; then
        print_error "STRIPE_SECRET_KEY secret not set!"
        print_info "Set it with: firebase functions:secrets:set STRIPE_SECRET_KEY"
        exit 1
    fi
    
    SECRETS_OUTPUT=$(firebase functions:secrets:access STRIPE_WEBHOOK_SECRET 2>&1 || echo "")
    if [[ "$SECRETS_OUTPUT" == *"does not exist"* ]] || [ -z "$SECRETS_OUTPUT" ]; then
        print_error "STRIPE_WEBHOOK_SECRET secret not set!"
        print_info "Set it with: firebase functions:secrets:set STRIPE_WEBHOOK_SECRET"
        exit 1
    fi
    
    print_info "All required secrets are configured ✓"
}

# Determine what to deploy
DEPLOY_TARGET=${1:-all}

deploy_frontend() {
    print_section "Deploying Frontend to Firebase Hosting"
    
    # Check environment configuration
    check_env_file
    
    # Install dependencies if needed
    if [ ! -d "node_modules" ]; then
        print_info "Installing frontend dependencies..."
        npm install
    fi
    
    print_info "Building React app for production..."
    npm run build
    
    print_info "Deploying to Firebase Hosting..."
    firebase deploy --only hosting
    
    # Get the hosting URL
    HOSTING_URL=$(firebase hosting:channel:list 2>/dev/null | grep -o 'https://[^ ]*' | head -1 || echo "")
    
    print_info "✅ Frontend deployment complete!"
    if [ -n "$HOSTING_URL" ]; then
        print_info "🌐 Live at: $HOSTING_URL"
    fi
}

deploy_functions() {
    print_section "Deploying Firebase Functions (Stripe Payment Server)"
    
    # Verify secrets before deploying functions
    verify_secrets
    
    # Install dependencies if needed
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
    
    print_info "Deploying to Firebase Functions..."
    firebase deploy --only functions
    
    print_info "✅ Functions deployment complete!"
    print_info "💳 Stripe payment endpoints are now live"
}

deploy_all() {
    print_section "Full Deployment - Website & Stripe Payment Server"
    print_info ""
    print_info "🚀 Deploying complete application:"
    print_info "   • Frontend (React app) → Firebase Hosting"
    print_info "   • Backend (Stripe API) → Firebase Functions"
    print_info ""
    
    # Verify Firebase configuration once for both deployments
    verify_firebase_config
    
    # Check environment configuration
    check_env_file
    
    # Install all dependencies
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
    
    # Build functions first
    print_info "Building TypeScript functions..."
    cd functions
    npm run build
    cd ..
    
    # Verify secrets before deployment
    verify_secrets
    
    # Build frontend
    print_info "Building React app for production..."
    npm run build
    
    print_info ""
    print_section "Deploying to Firebase"
    
    # Deploy both at once
    print_info "Deploying frontend and functions..."
    firebase deploy
    
    print_info ""
    print_section "Deployment Summary"
    print_info "✅ All components deployed successfully!"
    print_info ""
    print_info "🌐 Your application is now live!"
    print_info "   • Website: Check Firebase Hosting console"
    print_info "   • API: Check Firebase Functions console"
    print_info ""
    print_info "📝 Next steps:"
    print_info "   1. Test the live application"
    print_info "   2. Verify Stripe webhook endpoint in Stripe Dashboard"
    print_info "   3. Test a payment flow end-to-end"
}

# Main deployment logic
case $DEPLOY_TARGET in
    frontend)
        verify_firebase_config
        deploy_frontend
        ;;
    functions)
        verify_firebase_config
        deploy_functions
        ;;
    all)
        deploy_all
        ;;
    *)
        print_error "Invalid deployment target: $DEPLOY_TARGET"
        echo "Usage: ./deploy.sh [frontend|functions|all]"
        exit 1
        ;;
esac
