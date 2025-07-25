# WYAT AI

Personal super app that tracks health, finances, time, and more.

## Structure

- `frontend/`: Next.js dashboard
- `backend/`: Rust API using Axum

## Dev Commands

- `npm run dev` (in `frontend/`)
- `cargo run` (in `backend/`)

## Oura Integration

WYAT AI integrates with Oura Ring to sync health data including sleep, heart rate, activity, and more. The integration supports both OAuth and Personal Access Token (PAT) authentication mechanisms.

### Authentication Setup

#### OAuth Flow (Recommended)

1. **Create Oura App**: Register your application at [Oura Cloud](https://cloud.ouraring.com/)
2. **Configure Environment Variables**:
   ```bash
   OURA_CLIENT_ID=your_oura_client_id
   OURA_CLIENT_SECRET=your_oura_client_secret
   BACKEND_URL=http://localhost:3001
   FRONTEND_ORIGIN=http://localhost:3000
   ```
3. **OAuth Scopes**: The app requests the following scopes:
   - `email`: User email access
   - `personal`: Personal data access
   - `daily`: Daily summary data
   - `heartrate`: Heart rate data
   - `workout`: Workout data
   - `session`: Session data
   - `spo2Daily`: SpO2 daily data
   - `tag`: Tag data
   - `User`: User profile data

#### Personal Access Token (Fallback)

For endpoints not accessible via OAuth, the app uses a personal access token:

```bash
OURA_TOKEN=your_personal_access_token
```

### Environment Variables

| Variable             | Description                   | Required                                       |
| -------------------- | ----------------------------- | ---------------------------------------------- |
| `OURA_CLIENT_ID`     | Oura OAuth client ID          | Yes (for OAuth)                                |
| `OURA_CLIENT_SECRET` | Oura OAuth client secret      | Yes (for OAuth)                                |
| `OURA_TOKEN`         | Personal access token         | Yes (for PAT fallback)                         |
| `OURA_API_URL`       | Oura API base URL             | No (defaults to `https://api.ouraring.com/v2`) |
| `BACKEND_URL`        | Backend server URL            | Yes                                            |
| `FRONTEND_ORIGIN`    | Frontend origin URL           | Yes                                            |
| `MONGODB_URI`        | MongoDB connection string     | Yes                                            |
| `WYAT_API_KEY`       | API key for internal requests | Yes                                            |

### API Endpoints

#### OAuth Endpoints

- `GET /api/oura/auth` - Generate OAuth authorization URL
- `GET /api/oura/callback` - Handle OAuth callback

#### Data Sync Endpoints

All sync endpoints support incremental syncing and automatically handle date ranges:

**OAuth + PAT Fallback Endpoints:**

- `GET /oura/daily-readiness/sync` - Daily readiness scores
- `GET /oura/daily-stress/sync` - Daily stress scores
- `GET /oura/daily-sleep/sync` - Daily sleep summaries
- `GET /oura/sleep/sync` - Detailed sleep data
- `GET /oura/heartrate/sync` - Heart rate data
- `GET /oura/historical-sync` - One-time historical sync

**PAT-Only Endpoints:**

- `GET /oura/daily-activity/sync` - Daily activity data
- `GET /oura/daily-resilience/sync` - Daily resilience scores
- `GET /oura/daily-spo2/sync` - Daily SpO2 data
- `GET /oura/daily-cardiovascular-age/sync` - Cardiovascular age data
- `GET /oura/vo2-max/sync` - VO2 max data (⚠️ 404 - endpoint may not exist)

### Data Storage

All Oura data is stored in MongoDB collections:

- `oura_tokens` - OAuth tokens and refresh tokens
- `oura_sync_status` - Sync status tracking
- `oura_daily_readiness` - Daily readiness data
- `oura_daily_stress` - Daily stress data
- `oura_daily_sleep` - Daily sleep summaries
- `oura_sleep` - Detailed sleep data
- `oura_heartrate` - Heart rate data
- `oura_daily_activity` - Daily activity data
- `oura_daily_resilience` - Daily resilience data
- `oura_daily_spo2` - Daily SpO2 data
- `oura_daily_cardiovascular_age` - Cardiovascular age data

### Token Management

The system automatically handles:

- **Token Refresh**: OAuth tokens are refreshed before expiration
- **Fallback Logic**: OAuth tokens with fallback to personal tokens
- **Scope Limitations**: Some endpoints require personal tokens due to OAuth scope restrictions
- **Error Handling**: Graceful degradation when tokens fail

### Frontend Integration

The frontend provides:

- Connection status monitoring
- One-click data synchronization
- OAuth flow initiation
- Real-time sync status updates

### Troubleshooting

#### Common Issues

1. **401 Unauthorized Errors**

   - Check token validity and expiration
   - Verify OAuth scopes include required permissions
   - Ensure personal token is valid for PAT-only endpoints

2. **404 Not Found (VO2 Max)**

   - The VO2 max endpoint may not be available for all accounts
   - Check Oura API documentation for endpoint availability

3. **JSON Parsing Errors**

   - Fixed: Daily activity `interval` field now accepts `f32` instead of `i32`
   - Check API response structure against Rust structs

4. **OAuth Scope Limitations**
   - Some endpoints (SpO2, resilience, cardiovascular age) require personal tokens
   - This is expected behavior due to Oura API limitations

#### Debug Information

Enable debug logging by checking console output for:

- Token refresh attempts
- API request/response details
- Sync status updates
- Error messages with context

### Security Considerations

- OAuth tokens are stored securely in MongoDB
- Personal tokens should be kept secure and rotated regularly
- All API requests use HTTPS
- Token refresh happens automatically with 5-minute buffer
- Failed token operations fall back gracefully to personal tokens

### Development Notes

- The system uses a single-user model (`default_user`)
- All endpoints support incremental syncing from last sync date
- Historical sync endpoint available for one-time data migration
- Comprehensive error handling and logging throughout
