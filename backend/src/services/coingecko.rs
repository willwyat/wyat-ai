use crate::services::data_feeds::{DataFeed, DataFeedError, DataSnapshot, DataSnapshotData};
use chrono::Utc;
use reqwest::{Client, StatusCode};
use rust_decimal::Decimal;
use rust_decimal::prelude::FromPrimitive;
use serde_json::Value;

pub struct CoingeckoClient {
    client: Client,
    base_url: String,
    api_key: Option<String>,
    api_header: String,
}

impl CoingeckoClient {
    pub fn new(
        client: Client,
        base_url: String,
        api_key: Option<String>,
        api_header: String,
    ) -> Self {
        Self {
            client,
            base_url,
            api_key,
            api_header,
        }
    }

    /// Ping CoinGecko API to check server status
    /// Returns Ok(()) if API is reachable and healthy
    pub async fn ping(&self) -> Result<(), DataFeedError> {
        println!("=== COINGECKO PING START ===");

        // CoinGecko ping endpoint: https://api.coingecko.com/api/v3/ping
        // Extract base API URL (remove endpoint-specific paths)
        let base_url = self
            .base_url
            .trim_end_matches("/simple/price")
            .trim_end_matches("/coins/{id}")
            .trim_end_matches('/');
        let ping_url = format!("{}/ping", base_url);

        println!("Ping URL: {}", ping_url);
        println!("API Key present: {}", self.api_key.is_some());

        let mut request = self.client.get(&ping_url);
        if let Some(key) = &self.api_key {
            println!("Adding API key header: {}", self.api_header);
            request = request.header(&self.api_header, key);
        }

        println!("Sending ping request...");
        let response = request.send().await?;
        println!("Ping response status: {}", response.status());

        if !response.status().is_success() {
            eprintln!("❌ Ping failed with status: {}", response.status());
            return Err(DataFeedError::Http(
                response.error_for_status().unwrap_err(),
            ));
        }

        // Parse response to verify it's valid
        let payload: Value = response.json().await?;
        println!("Ping response payload: {}", payload);

        // CoinGecko ping returns: {"gecko_says":"(V3) To the Moon!"}
        if payload.get("gecko_says").is_some() {
            println!("✅ CoinGecko ping successful");
            println!("=== COINGECKO PING END ===");
            Ok(())
        } else {
            eprintln!("❌ Invalid ping response structure");
            Err(DataFeedError::Parse(
                "Invalid ping response from CoinGecko".to_string(),
            ))
        }
    }

    /// Fetch price snapshot using CoinGecko's simple/price endpoint
    /// Example: https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd
    pub async fn fetch_price_snapshot(
        &self,
        feed: &DataFeed,
        pair: Option<String>,
        unit: Option<String>,
    ) -> Result<DataSnapshot, DataFeedError> {
        println!("=== COINGECKO FETCH PRICE START ===");
        println!("Feed symbol: {}", feed.symbol);
        println!("Pair: {:?}", pair);
        println!("Unit: {:?}", unit);

        // Ping CoinGecko API first to check if it's available
        self.ping().await?;

        // Use CoinGecko's simple/price endpoint
        let vs_currency = unit.as_deref().unwrap_or("usd").to_lowercase();

        // If base_url already includes /simple/price, use it directly
        // Otherwise, construct the full URL
        // Include 24h change data in the request
        let url = if self.base_url.contains("/simple/price") {
            format!(
                "{}?ids={}&vs_currencies={}&include_24hr_change=true",
                self.base_url, feed.symbol, vs_currency
            )
        } else {
            let base_url = self
                .base_url
                .trim_end_matches("/coins/{id}")
                .trim_end_matches('/');
            format!(
                "{}/simple/price?ids={}&vs_currencies={}&include_24hr_change=true",
                base_url, feed.symbol, vs_currency
            )
        };

        println!("Price fetch URL: {}", url);
        println!("VS Currency: {}", vs_currency);

        let mut request = self.client.get(&url);
        if let Some(key) = &self.api_key {
            println!("Adding API key header for price fetch");
            request = request.header(&self.api_header, key);
        }

        println!("Sending price request...");
        let response = request.send().await?;
        println!("Price response status: {}", response.status());

        if response.status() == StatusCode::UNAUTHORIZED
            || response.status() == StatusCode::FORBIDDEN
        {
            eprintln!("❌ Authentication failed: {}", response.status());
            return Err(DataFeedError::Http(
                response.error_for_status().unwrap_err(),
            ));
        }

        let payload: Value = response.error_for_status()?.json().await?;
        println!("Price response payload: {}", payload);

        // Response format: {"bitcoin": {"usd": 50000.0}}
        let coin_data = payload.get(&feed.symbol).ok_or_else(|| {
            eprintln!("❌ Coin '{}' not found in response", feed.symbol);
            DataFeedError::Parse(format!("Coin '{}' not found in response", feed.symbol))
        })?;

        println!("Coin data: {}", coin_data);

        let price = coin_data
            .get(&vs_currency)
            .and_then(|v| v.as_f64())
            .ok_or_else(|| {
                eprintln!("❌ Price in '{}' not found", vs_currency);
                DataFeedError::Parse(format!("Price in '{}' not found", vs_currency))
            })?;

        println!("Extracted price: {}", price);

        // Extract 24h change percentage
        let change_24h = coin_data
            .get(&format!("{}_24h_change", vs_currency))
            .and_then(|v| v.as_f64());

        if let Some(change) = change_24h {
            println!("Extracted 24h change: {}%", change);
        } else {
            println!("No 24h change data available");
        }

        let value = Decimal::from_f64(price).ok_or(DataFeedError::Decimal)?;
        println!("Decimal value: {}", value);

        // simple/price doesn't include timestamps, use current time
        let source_time = Some(Utc::now());

        let asset_symbol = feed.symbol.to_uppercase();
        println!("Asset symbol (uppercase): {}", asset_symbol);

        // Store 24h change in metadata if available
        let mut metadata_doc = mongodb::bson::Document::new();
        if let Some(change) = change_24h {
            metadata_doc.insert("change_24h_pct", change);
        }

        let data = DataSnapshotData {
            r#type: "price".to_string(),
            feed_symbol: feed.symbol.clone(),
            source: Some(feed.source.clone()),
            symbol: Some(asset_symbol.clone()),
            pair: pair.or_else(|| Some(format!("{}/{}", asset_symbol, vs_currency.to_uppercase()))),
            value,
            unit: Some(vs_currency.to_uppercase()),
            label: Some("spot".to_string()),
            metadata: if metadata_doc.is_empty() {
                None
            } else {
                Some(metadata_doc)
            },
        };

        let snapshot = DataSnapshot {
            id: None,
            feed_symbol: feed.symbol.clone(),
            fetch_time: Utc::now(),
            source_time,
            data: vec![data],
            metadata: None,
        };

        println!("✅ Successfully created snapshot for {}", feed.symbol);
        println!("=== COINGECKO FETCH PRICE END ===");

        Ok(snapshot)
    }

    pub fn get_source_url(&self, symbol: &str) -> String {
        self.interpolate_url(&self.base_url, symbol)
    }

    fn interpolate_url(&self, base: &str, symbol: &str) -> String {
        if base.contains("{symbol}") {
            base.replace("{symbol}", symbol)
        } else if base.contains("{id}") {
            base.replace("{id}", symbol)
        } else if base.ends_with('/') {
            format!("{}{}", base, symbol)
        } else {
            format!("{}/{}", base, symbol)
        }
    }
}
