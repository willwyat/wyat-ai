use bytes::Bytes;

#[cfg(feature = "pdfium")]
pub fn extract_text_from_pdf(bytes: &Bytes) -> anyhow::Result<String> {
    use pdfium_render::prelude::*;

    let bindings = Pdfium::bind_to_system_library()
        .or_else(|_| Pdfium::bind_to_library(Pdfium::pdfium_platform_library_name()))?;
    let pdfium = Pdfium::new(bindings);

    // keep a Vec alive while the doc is in scope; no leak
    let buf = bytes.to_vec();
    let doc = pdfium.load_pdf_from_byte_slice(&buf, None)?;

    let mut out = String::new();
    for page in doc.pages().iter() {
        let textpage = page.text()?; // this returns a Result
        let s: String = textpage.all(); // in your version, this returns String (no `?`)
        out.push_str(&s); // push_str needs &str / &String
        out.push('\n');
    }
    Ok(out)
}

// Fallback when pdfium feature is off
#[cfg(not(feature = "pdfium"))]
pub fn extract_text_from_pdf(_bytes: &Bytes) -> anyhow::Result<String> {
    // TODO: Add lopdf to Cargo.toml or use alternative PDF extraction
    anyhow::bail!(
        "PDF extraction requires 'pdfium' feature or lopdf dependency. Run with --features pdfium"
    )
}
