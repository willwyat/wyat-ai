use bytes::Bytes;

pub fn extract_text_from_pdf(bytes: &Bytes) -> anyhow::Result<String> {
    println!("=== extract_text_from_pdf START ===");
    println!("Input bytes length: {}", bytes.len());

    use lopdf::Document;

    println!("Loading PDF with lopdf...");
    let doc = Document::load_mem(bytes)?;
    println!("PDF document loaded successfully");

    let page_count = doc.get_pages().len();
    println!("Processing {} pages", page_count);

    // lopdf::Document::extract_text expects **page numbers** (1-based), not the internal page IDs.
    let mut out = String::new();
    for page_num in 1..=page_count as u32 {
        println!("Processing page {}", page_num);
        let text = doc.extract_text(&[page_num])?;
        println!("Page {} text length: {} chars", page_num, text.len());
        out.push_str(&text);
        out.push('\n');
    }

    println!("Total extracted text length: {} chars", out.len());
    println!("=== extract_text_from_pdf SUCCESS ===");
    Ok(out)
}
