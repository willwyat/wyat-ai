use anyhow::Result;
use dotenvy::dotenv;
use mongodb::{Client, bson::doc};
use wyat_ai_backend::capital::Transaction;

#[tokio::main]
async fn main() -> Result<()> {
    dotenv().ok();
    let mongo_uri = std::env::var("MONGODB_URI").expect("MONGODB_URI must be set");
    let client = Client::with_uri_str(&mongo_uri).await?;
    let db = client.database("wyat");
    let collection = db.collection::<Transaction>("capital_ledger");

    // First, let's count how many transactions match our criteria
    let count_with_cat_on_leg0 = collection
        .count_documents(
            doc! {
                "legs.0.category_id": { "$ne": null }
            },
            None,
        )
        .await?;

    println!(
        "Found {} transactions with category_id on legs[0]",
        count_with_cat_on_leg0
    );

    let count_with_cat_on_leg1_null = collection
        .count_documents(
            doc! {
                "legs.0.category_id": { "$ne": null },
                "legs.1.category_id": null
            },
            None,
        )
        .await?;

    println!(
        "Found {} transactions with category_id on legs[0] AND null on legs[1]",
        count_with_cat_on_leg1_null
    );

    // Delete transactions where legs[0].category_id is not null AND legs[1].category_id is null
    // These are the incorrect ones - the correct structure has category_id on the P&L leg
    let result = collection
        .delete_many(
            doc! {
                "legs.0.category_id": { "$ne": null },
                "legs.1.category_id": null
            },
            None,
        )
        .await?;

    println!(
        "✅ Deleted {} transactions with incorrect structure",
        result.deleted_count
    );
    Ok(())
}
