#!/bin/bash

# Master test runner script
# Runs all tests in the tests directory

set -e  # Exit on error (disable with -e flag)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
SKIPPED_TESTS=0

# Check prerequisites
check_prerequisites() {
    echo "🔍 Checking prerequisites..."
    
    # Check if backend is running
    if ! curl -s http://localhost:3001/health > /dev/null 2>&1; then
        echo -e "${YELLOW}⚠️  Backend is not running on localhost:3001${NC}"
        echo "   Start it with: cd backend && cargo run"
        read -p "   Continue anyway? (y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    else
        echo -e "${GREEN}✅ Backend is running${NC}"
    fi
    
    # Check if API key is set
    if [ -z "$WYAT_API_KEY" ]; then
        echo -e "${YELLOW}⚠️  WYAT_API_KEY is not set${NC}"
        echo "   Set it with: export WYAT_API_KEY=your-key"
        read -p "   Continue anyway? (y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    else
        echo -e "${GREEN}✅ WYAT_API_KEY is set${NC}"
    fi
    
    echo ""
}

# Run a single test
run_test() {
    local test_file=$1
    local test_name=$(basename "$test_file")
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Running: $test_name"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    if bash "$test_file"; then
        echo -e "${GREEN}✅ PASSED: $test_name${NC}"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        echo -e "${RED}❌ FAILED: $test_name${NC}"
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi
    
    echo ""
}

# Main execution
main() {
    echo "╔════════════════════════════════════════════════╗"
    echo "║         Wyat AI Test Suite Runner             ║"
    echo "╚════════════════════════════════════════════════╝"
    echo ""
    
    # Check prerequisites
    check_prerequisites
    
    # Run API tests
    echo "📡 Running API Tests..."
    echo "════════════════════════════════════════════════"
    if [ -d "api" ]; then
        for test in api/*.sh; do
            if [ -f "$test" ]; then
                run_test "$test"
            fi
        done
    else
        echo "No API tests found"
    fi
    
    echo ""
    
    # Run integration tests
    echo "🔗 Running Integration Tests..."
    echo "════════════════════════════════════════════════"
    if [ -d "integration" ]; then
        for test in integration/*.sh; do
            if [ -f "$test" ]; then
                run_test "$test"
            fi
        done
    else
        echo "No integration tests found"
    fi
    
    echo ""
    
    # Print summary
    echo "╔════════════════════════════════════════════════╗"
    echo "║              Test Summary                      ║"
    echo "╚════════════════════════════════════════════════╝"
    echo ""
    echo "Total Tests:   $TOTAL_TESTS"
    echo -e "${GREEN}Passed:        $PASSED_TESTS${NC}"
    echo -e "${RED}Failed:        $FAILED_TESTS${NC}"
    echo -e "${YELLOW}Skipped:       $SKIPPED_TESTS${NC}"
    echo ""
    
    if [ $FAILED_TESTS -eq 0 ]; then
        echo -e "${GREEN}🎉 All tests passed!${NC}"
        exit 0
    else
        echo -e "${RED}❌ Some tests failed${NC}"
        exit 1
    fi
}

# Parse arguments
SKIP_CHECKS=false
while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-checks)
            SKIP_CHECKS=true
            shift
            ;;
        --help)
            echo "Usage: ./run_all.sh [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --skip-checks    Skip prerequisite checks"
            echo "  --help           Show this help message"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Run main
if [ "$SKIP_CHECKS" = true ]; then
    echo "⚠️  Skipping prerequisite checks"
    echo ""
fi

main

