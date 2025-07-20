#!/bin/bash

API_KEY="2ef1076ebf724d5d36320a219693075c5d8db3ea619fd11c663e67dbcb7f5a71"
BASE_URL="http://localhost:3001"
START_DATE="2025-05-31"
END_DATE="2025-07-20"

echo "🧪 Testing All Oura Endpoints..."
echo "=================================="

endpoints=(
    "daily-resilience"
    "daily-readiness" 
    "daily-activity"
    "daily-cardiovascular-age"
    "daily-sleep"
    "daily-stress"
    "heartrate"
)

for endpoint in "${endpoints[@]}"; do
    echo ""
    echo "📡 Testing: $endpoint"
    echo "--------------------------------"
    
    response=$(curl -s -X GET "$BASE_URL/oura/$endpoint/sync?start_date=$START_DATE&end_date=$END_DATE" \
        -H "x-wyat-api-key: $API_KEY")
    
    echo "Status: $response"
    echo ""
done

echo "✅ All endpoints tested!"
