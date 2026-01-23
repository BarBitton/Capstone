require("dotenv").config();
const fs = require("fs");
const path = require("path");
const pdf = require("pdf-parse");

/**
 * build_knowledge_base_text.js (short documentation)
 * -------------------------------------------------
 * Utility script that builds a simple "knowledge base" JSON file from PDF articles.
 *
 * Goal:
 * - Read all PDF files from ../articles
 * - Extract text from each PDF (using pdf-parse)
 * - Clean/normalize the text (whitespace)
 * - Split the text into overlapping chunks
 * - Save all chunks into ../knowledge_base_text.json
 *
 * Output file format (knowledge_base_text.json):
 * {
 *   createdAt: "ISO date",
 *   items: [
 *     { id, source, chunkIndex, text }
 *   ]
 * }
 *
 * Why chunking?
 * - Makes long PDFs easier to search/use later (e.g., retrieval for AI context).
 * - Overlap helps avoid losing context between chunk boundaries.
 */

function listPdfFiles(dir) {
  // Returns a list of absolute paths to PDF files in the given directory
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith(".pdf"))
    .map((f) => path.join(dir, f));
}

function normalizeWhitespace(s) {
  /**
   * Cleans extracted PDF text so it is easier to chunk and read:
   * - normalizes line endings
   * - removes trailing spaces before newline
   * - reduces many blank lines
   * - reduces long sequences of spaces/tabs
   */
  return (s || "")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function chunkText(text, maxWords = 300, overlapWords = 40) {
  /**
   * Splits text into chunks by word count.
   *
   * Parameters:
   * - maxWords: max words per chunk
   * - overlapWords: overlap between chunks to keep context
   *
   * Returns:
   * - array of chunk strings
   */
  const words = text.split(/\s+/).filter(Boolean);
  const chunks = [];
  let i = 0;

  while (i < words.length) {
    const slice = words.slice(i, i + maxWords);
    const chunk = slice.join(" ").trim();
    if (chunk.length > 0) chunks.push(chunk);

    // Move forward with overlap (maxWords - overlapWords)
    i += Math.max(1, maxWords - overlapWords);
  }

  return chunks;
}

async function main() {
  /**
   * Main script flow:
   * 1) Locate ../articles directory
   * 2) Find PDFs
   * 3) For each PDF:
   *    - extract text
   *    - normalize text
   *    - chunk text
   *    - push chunks into items array
   * 4) Save items as JSON to ../knowledge_base_text.json
   */
  const articlesDir = path.join(__dirname, "..", "articles");
  const outPath = path.join(__dirname, "..", "knowledge_base_text.json");

  const pdfFiles = listPdfFiles(articlesDir);
  if (pdfFiles.length === 0) {
    console.error(`ERROR: No PDFs found in ${articlesDir}`);
    process.exit(1);
  }

  const items = [];
  let id = 0;

  for (const filePath of pdfFiles) {
    const filename = path.basename(filePath);
    console.log("Reading:", filename);

    const buffer = fs.readFileSync(filePath);
    const parsed = await pdf(buffer);
    const text = normalizeWhitespace(parsed.text);

    const chunks = chunkText(text, 300, 40);
    console.log("  chunks:", chunks.length);

    for (let i = 0; i < chunks.length; i++) {
      items.push({
        id: `tchunk_${id++}`,
        source: filename,
        chunkIndex: i,
        text: chunks[i],
      });
    }
  }

  // Save final JSON output for later use (search / retrieval / AI context)
  fs.writeFileSync(
    outPath,
    JSON.stringify({ createdAt: new Date().toISOString(), items }, null, 2)
  );

  console.log("\n✅ Saved:", outPath, "total chunks:", items.length);
}

main().catch((e) => {
  // Catch any unexpected failure (e.g., broken PDF) and exit with error code
  console.error("FATAL:", e);
  process.exit(1);
});
