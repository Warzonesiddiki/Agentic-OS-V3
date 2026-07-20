#!/bin/bash

# NEXUS 2.0 Health Check Script

set -e

echo "========================================="
echo "  NEXUS 2.0 Health Check"
echo "========================================="
echo ""

# Check Node.js version
echo "Node.js version: $(node --version)"

# Check PostgreSQL connection
echo -n "PostgreSQL connection: "
if command -v psql &> /dev/null; then
    psql -c "SELECT 1" -d postgres &> /dev/null && echo "✓ OK" || echo "✗ FAILED"
else
    echo "⊘ (psql not installed)"
fi

# Check Redis connection
echo -n "Redis connection: "
if command -v redis-cli &> /dev/null; then
    redis-cli ping &> /dev/null && echo "✓ OK" || echo "✗ FAILED"
else
    echo "⊘ (redis-cli not installed)"
fi

# Check server health endpoint
echo -n "Server health endpoint: "
if curl -s http://localhost:9900/api/v1/health &> /dev/null; then
    echo "✓ OK"
else
    echo "✗ FAILED (server not running?)"
fi

# Check disk space
echo ""
echo "Disk space:"
df -h . | tail -1 | awk '{print "  Used: " $5 " (" $3 " / " $2 ")"}'

# Check memory usage
echo ""
echo "Memory usage:"
free -h | grep Mem | awk '{print "  " $3 " / " $2}'

echo ""
echo "========================================="
echo "  Health check complete"
echo "========================================="
