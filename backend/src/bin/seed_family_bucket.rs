//! Seed the capital_envelopes collection with family_bucket_example() data.
//!
//! Usage: cargo run --bin seed_family_bucket

use anyhow::Result;
use backend::capital::{Envelope, family_bucket_example};
use mongodb::Client;

#[tokio::main]
async fn main() -> Result<()> {
    // Load environment variables from .env
    dotenvy::dotenv().ok();

    // 1. Connect to MongoDB using URI from environment
    let mongo_uri = std::env::var("MONGODB_URI").expect("Missing MONGODB_URI in .env");
    let client = Client::with_uri_str(&mongo_uri).await?;

    // 2. Get the wyat database
    let db = client.database("wyat");

    // 3. Get the capital_envelopes collection
    let collection = db.collection::<Envelope>("capital_envelopes");

    // 4. Call family_bucket_example()
    let bucket = family_bucket_example();

    // 5. Loop through each envelope and insert
    let mut inserted_count = 0;
    let mut skipped_count = 0;

    for (id, envelope) in bucket.envelopes {
        match collection.insert_one(&envelope, None).await {
            Ok(_) => {
                inserted_count += 1;
                println!("✓ Inserted envelope: {}", envelope.name);
            }
            Err(e) => {
                // Check if it's a duplicate key error (code 11000)
                let error_string = e.to_string();
                if error_string.contains("E11000") || error_string.contains("duplicate key") {
                    println!(
                        "⚠️  Skipped duplicate envelope: {} (id: {})",
                        envelope.name, id
                    );
                    skipped_count += 1;
                    continue;
                }
                // If it's not a duplicate key error, propagate it
                return Err(e.into());
            }
        }
    }

    // 6. Print completion message
    println!(
        "\n✅ Inserted {} envelopes into capital_envelopes.",
        inserted_count
    );
    if skipped_count > 0 {
        println!("⚠️  Skipped {} duplicate envelopes.", skipped_count);
    }

    Ok(())
}
