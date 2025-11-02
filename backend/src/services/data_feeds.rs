use std::env;

use chrono::{DateTime, Duration, Utc};
use futures::TryStreamExt;
use mongodb::Database;
use mongodb::bson::{self, Document, doc, oid::ObjectId};
use mongodb::options::{FindOptions, UpdateOptions};
use reqwest::StatusCode;
use rust_decimal::Decimal;
use rust_decimal::prelude::FromPrimitive;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;
use utoipa::ToSchema;

use super::coingecko::CoingeckoClient;

#[derive(Clone, Debug, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum DataFeedProvider {
    YahooFinance,
    Coingecko,
}

#[derive(Clone, Debug, Serialize, Deserialize, ToSchema)]
pub struct DataFeedSource {
    pub provider: DataFeedProvider,
    pub publisher: Option<String>,
    pub publish_url: String,
    pub fetch_method: String,
    pub format: Option<String>,
    pub parser: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, ToSchema)]
pub struct DataFeed {
    pub name: String,
    pub symbol: String,
    pub categories: Vec<String>,
    pub source: DataFeedSource,
    #[schema(value_type = Option<i64>)]
    pub last_fetch: Option<DateTime<Utc>>,
    #[serde(default)]
    pub metadata: Option<Document>,
}

#[derive(Clone, Debug, Serialize, Deserialize, ToSchema)]
pub struct DataSnapshotData {
    pub r#type: String,
    pub feed_symbol: String,
    pub source: Option<DataFeedSource>,
    pub symbol: Option<String>,
    pub pair: Option<String>,
    pub value: Decimal,
    pub unit: Option<String>,
    pub label: Option<String>,
    #[serde(default)]
    pub metadata: Option<Document>,
}

#[derive(Clone, Debug, Serialize, Deserialize, ToSchema)]
pub struct DataSnapshot {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    #[schema(value_type = Option<String>)]
    pub id: Option<ObjectId>,
    pub feed_symbol: String,
    #[schema(value_type = i64)]
    pub fetch_time: DateTime<Utc>,
    #[schema(value_type = Option<i64>)]
    pub source_time: Option<DateTime<Utc>>,
    pub data: Vec<DataSnapshotData>,
    #[serde(default)]
    pub metadata: Option<Document>,
}

#[derive(Debug, Error)]
pub enum DataFeedError {
    #[error("missing configuration: {0}")]
    MissingConfig(&'static str),
    #[error("unsupported data feed provider")]
    UnsupportedProvider,
    #[error("http error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("database error: {0}")]
    Database(#[from] mongodb::error::Error),
    #[error("serialization error: {0}")]
    Serialization(#[from] bson::ser::Error),
    #[error("deserialization error: {0}")]
    Deserialization(#[from] bson::de::Error),
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("failed to parse upstream response: {0}")]
    Parse(String),
    #[error("decimal conversion error")]
    Decimal,
    #[error("invalid datetime in upstream response")]
    InvalidDateTime,
}

pub struct DataFeedService {
    client: reqwest::Client,
    yahoo_url: String,
    yahoo_api_key: Option<String>,
    yahoo_api_header: String,
    coingecko_client: CoingeckoClient,
    staleness: Duration,
}

impl DataFeedService {
    pub fn new() -> Result<Self, DataFeedError> {
        let yahoo_url = env::var("YAHOO_FINANCE_API_URL")
            .map_err(|_| DataFeedError::MissingConfig("YAHOO_FINANCE_API_URL"))?;
        let yahoo_api_key = env::var("YAHOO_FINANCE_API_KEY").ok();
        let yahoo_api_header =
            env::var("YAHOO_FINANCE_API_KEY_HEADER").unwrap_or_else(|_| "x-api-key".to_string());

        let coingecko_url = env::var("COINGECKO_API_URL")
            .map_err(|_| DataFeedError::MissingConfig("COINGECKO_API_URL"))?;
        let coingecko_api_key = env::var("COINGECKO_API_KEY").ok();
        let coingecko_api_header = env::var("COINGECKO_API_KEY_HEADER")
            .unwrap_or_else(|_| "x-cg-demo-api-key".to_string());

        let staleness_minutes: i64 = env::var("DATA_FEED_MAX_STALENESS_MINUTES")
            .ok()
            .and_then(|val| val.parse::<i64>().ok())
            .filter(|minutes| *minutes > 0)
            .unwrap_or(5);

        let client = reqwest::Client::new();
        let coingecko_client = CoingeckoClient::new(
            client.clone(),
            coingecko_url,
            coingecko_api_key,
            coingecko_api_header,
        );

        Ok(Self {
            client,
            yahoo_url,
            yahoo_api_key,
            yahoo_api_header,
            coingecko_client,
            staleness: Duration::minutes(staleness_minutes),
        })
    }

    pub fn source_for(&self, provider: &DataFeedProvider, symbol: &str) -> DataFeedSource {
        match provider {
            DataFeedProvider::YahooFinance => DataFeedSource {
                provider: DataFeedProvider::YahooFinance,
                publisher: Some("Yahoo Finance".to_string()),
                publish_url: self.interpolate_url(&self.yahoo_url, symbol),
                fetch_method: "GET".to_string(),
                format: Some("json".to_string()),
                parser: Some("yahoo_quote".to_string()),
            },
            DataFeedProvider::Coingecko => DataFeedSource {
                provider: DataFeedProvider::Coingecko,
                publisher: Some("Coingecko".to_string()),
                publish_url: self.coingecko_client.get_source_url(symbol),
                fetch_method: "GET".to_string(),
                format: Some("json".to_string()),
                parser: Some("coingecko_market".to_string()),
            },
        }
    }

    pub fn staleness_threshold(&self) -> Duration {
        self.staleness
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

    pub async fn fetch_and_store_snapshot(
        &self,
        db: &Database,
        feed: &mut DataFeed,
        pair: Option<String>,
        unit: Option<String>,
    ) -> Result<DataSnapshot, DataFeedError> {
        let snapshot = match feed.source.provider {
            DataFeedProvider::YahooFinance => {
                self.fetch_yahoo_snapshot(feed, pair.clone(), unit.clone())
                    .await?
            }
            DataFeedProvider::Coingecko => {
                self.coingecko_client
                    .fetch_price_snapshot(feed, pair.clone(), unit.clone())
                    .await?
            }
        };

        let snapshots = db.collection::<DataSnapshot>("capital_data_snapshots");
        snapshots.insert_one(&snapshot, None).await?;

        feed.last_fetch = Some(snapshot.fetch_time);
        let feeds = db.collection::<DataFeed>("capital_data_feeds");
        let feed_doc = bson::to_document(feed)?;
        feeds
            .update_one(
                doc! { "symbol": &feed.symbol },
                doc! {"$set": feed_doc},
                UpdateOptions::builder().upsert(true).build(),
            )
            .await?;

        Ok(snapshot)
    }

    pub async fn get_latest_snapshot(
        &self,
        db: &Database,
        feed_symbol: &str,
    ) -> Result<Option<DataSnapshot>, DataFeedError> {
        let snapshots = db.collection::<DataSnapshot>("capital_data_snapshots");
        let options = FindOptions::builder()
            .sort(doc! { "fetch_time": -1 })
            .limit(1)
            .build();

        let mut cursor = snapshots
            .find(doc! { "feed_symbol": feed_symbol }, options)
            .await?;

        if let Some(snapshot) = cursor.try_next().await? {
            Ok(Some(snapshot))
        } else {
            Ok(None)
        }
    }

    pub fn needs_refresh(&self, feed: &DataFeed) -> bool {
        match feed.last_fetch {
            Some(last_fetch) => Utc::now() - last_fetch > self.staleness,
            None => true,
        }
    }

    async fn fetch_yahoo_snapshot(
        &self,
        feed: &DataFeed,
        pair: Option<String>,
        unit: Option<String>,
    ) -> Result<DataSnapshot, DataFeedError> {
        let url = self.interpolate_url(&self.yahoo_url, &feed.symbol);
        let mut request = self.client.get(&url).header(
            "User-Agent",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        );
        if let Some(key) = &self.yahoo_api_key {
            request = request.header(&self.yahoo_api_header, key);
        }

        let response = request.send().await?;
        if response.status() == StatusCode::UNAUTHORIZED
            || response.status() == StatusCode::FORBIDDEN
        {
            return Err(DataFeedError::Http(
                response.error_for_status().unwrap_err(),
            ));
        }
        let payload: Value = response.error_for_status()?.json().await?;

        let result = payload
            .pointer("/quoteResponse/result/0")
            .ok_or_else(|| DataFeedError::Parse("missing quote result".to_string()))?;

        let price = result
            .get("regularMarketPrice")
            .and_then(|v| v.as_f64())
            .ok_or_else(|| DataFeedError::Parse("missing regular market price".to_string()))?;
        let value = Decimal::from_f64(price).ok_or(DataFeedError::Decimal)?;

        let source_time = result
            .get("regularMarketTime")
            .and_then(|v| v.as_i64())
            .and_then(|ts| DateTime::from_timestamp(ts, 0))
            .ok_or(DataFeedError::InvalidDateTime)
            .ok();

        let mut metadata = Document::new();
        if let Some(exchange) = result.get("fullExchangeName").and_then(|v| v.as_str()) {
            metadata.insert("exchange", exchange);
        }
        if let Some(currency) = result.get("currency").and_then(|v| v.as_str()) {
            metadata.insert("currency", currency);
        }

        let data = DataSnapshotData {
            r#type: "price".to_string(),
            feed_symbol: feed.symbol.clone(),
            source: Some(feed.source.clone()),
            symbol: Some(feed.symbol.clone()),
            pair: pair.or_else(|| Some(format!("{}/USD", feed.symbol))),
            value,
            unit: unit.or_else(|| Some("USD".to_string())),
            label: Some("regular_market".to_string()),
            metadata: if metadata.is_empty() {
                None
            } else {
                Some(metadata)
            },
        };

        Ok(DataSnapshot {
            id: None,
            feed_symbol: feed.symbol.clone(),
            fetch_time: Utc::now(),
            source_time,
            data: vec![data],
            metadata: None,
        })
    }
}
